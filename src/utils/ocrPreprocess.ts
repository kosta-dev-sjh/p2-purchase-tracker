/**
 * 역할: Tesseract.js로 넘기기 직전 이미지를 OCR 친화적으로 다듬는 전처리 유틸입니다.
 *       카카오톡 캡쳐·모바일 스크린샷 같은 저해상도 입력에서 한글/숫자의 획이 뭉개져
 *       Tesseract가 "가"를 "가ㅣ"로, "0"을 "O"로 읽는 문제를 줄이는 목적입니다.
 *
 * 적용 정책:
 *   - 업스케일: 긴 변이 1800px 미만이면 2배로 올립니다. 텍스트 렌더 해상도가 오르면
 *     Tesseract가 기대하는 x-height(대략 20~30px)에 쉽게 도달해 인식률이 현저히 개선됩니다.
 *     너무 큰 이미지는 워커 처리 시간이 급격히 늘어 3000px 한도를 둡니다.
 *   - 그레이스케일 + 라이트 컨트라스트: 채도/RGB 잡음을 제거하면 엣지 감지가 쉬워져 필기체
 *     가까운 UI 폰트도 또렷하게 잡힙니다. 바이너라이즈는 의도적으로 넣지 않았습니다 —
 *     스크린샷은 안티앨리어싱이 걸려 있어 순수 이진화하면 오히려 획이 깨집니다.
 *   - PNG 인코딩: JPEG로 내보내면 블록킹 아티팩트가 폰트에 올라 Tesseract가 헷갈립니다.
 *
 * 이 유틸은 browser-only(canvas 의존)입니다. 서버 환경에서 쓰려면 sharp 같은 이미지
 * 라이브러리로 동등한 파이프라인을 다시 짜야 합니다.
 *
 * 위치: src/utils/ocrPreprocess.ts
 */

/**
 * 목표 긴 변 해상도(px).
 *
 * 1차 설계(1800)는 대부분의 웹 스크린샷에 충분했지만, 모바일 캡쳐(특히 쿠팡)에서
 * 🚀 아이콘 + "로켓 내일" 배지가 인접해 붙어 있을 때 획이 뭉개져 "AED 는 프…"
 * 같은 심각한 오인식이 관찰됐습니다. Tesseract 가 기대하는 x-height(대략 20~30px)에
 * 더 여유 있게 도달하도록 2400 까지 끌어올렸습니다. 상한(3000)은 워커 처리 시간이
 * 급격히 느려지는 지점으로 유지합니다.
 */
const MIN_LONG_EDGE = 2400;
const MAX_LONG_EDGE = 3200;

/**
 * OCR 정확도를 끌어올리기 위한 경량 전처리.
 *
 * 입력 파일을 받아 canvas에서 업스케일 + 그레이스케일 + 약한 컨트라스트 조정 후
 * PNG Blob으로 돌려줍니다. 실패(브라우저 환경이 아니거나 decode 실패)하면 원본을
 * 그대로 돌려줘 호출부가 분기 없이 계속 진행할 수 있게 합니다.
 */
export async function preprocessImageForOcr(file: File): Promise<Blob | File> {
  try {
    // 브라우저 전용. SSR/노드 환경에서는 canvas/HTMLImageElement가 없어 스킵합니다.
    if (typeof document === "undefined") return file;

    const imgUrl = URL.createObjectURL(file);
    const img = new Image();
    img.src = imgUrl;

    // decode()는 최신 브라우저에서 load 이벤트 기다리지 않고 준비 완료 시점을 약속합니다.
    try {
      await img.decode();
    } catch {
      URL.revokeObjectURL(imgUrl);
      return file;
    }

    const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
    if (longEdge === 0) {
      URL.revokeObjectURL(imgUrl);
      return file;
    }

    // 업스케일 비율. 이미 충분히 크면 1배(원본 유지), 작으면 목표 해상도까지 2배 이하로 확장합니다.
    let scale = 1;
    if (longEdge < MIN_LONG_EDGE) {
      scale = Math.min(2, MIN_LONG_EDGE / longEdge);
    }
    if (longEdge * scale > MAX_LONG_EDGE) {
      scale = MAX_LONG_EDGE / longEdge;
    }

    const targetW = Math.round(img.naturalWidth * scale);
    const targetH = Math.round(img.naturalHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(imgUrl);
      return file;
    }

    // 업스케일 시 품질을 최대로 — 저해상도 스크린샷의 획 보간을 부드럽게 합니다.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // 그레이스케일 + 컨트라스트. 범위 [0, 255]에서 중앙값 128을 기준으로 어두운 픽셀은
    // 더 어둡게, 밝은 픽셀은 더 밝게 밀어 폰트 엣지를 뚜렷이 만듭니다. 과하게 하면 획 내부의
    // 그라데이션이 끊겨 한글이 깨지므로 amount=42 정도로 보수적으로 올렸습니다(기존 30).
    //
    // 쿠팡의 🚀 배지처럼 채도가 높은 픽셀이 그레이스케일 후 중간 톤으로 뭉개져 "AED/AEs"
    // 같은 영문 가비지로 오인식되는 케이스가 관찰됐습니다. 컨트라스트를 살짝 더 강하게
    // 주면 배지의 실루엣이 아예 흰/검으로 밀리기 때문에 문자 디코더가 짧은 영문 조각을
    // 생성할 여지가 줄어듭니다. 다만 44 이상으로 가면 한글 획이 끊어지기 시작해 42 로 캡.
    const imageData = ctx.getImageData(0, 0, targetW, targetH);
    const grayBuffer = new Uint8ClampedArray(targetW * targetH);
    const d = imageData.data;
    const amount = 42;
    for (let i = 0, j = 0; i < d.length; i += 4, j += 1) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const c = g < 128 ? Math.max(0, g - amount) : Math.min(255, g + amount);
      grayBuffer[j] = c;
    }

    // Unsharp mask: 3x3 커널 [0,-1,0 / -1,5,-1 / 0,-1,0] 을 그레이스케일 버퍼에 적용해
    // 획 엣지를 한 번 더 선명하게 만듭니다. 저해상도 원본을 업스케일할 때 필연적으로
    // 생기는 블러를 보정하는 역할로, 한글의 세리프/받침 구분이 또렷해져 Tesseract
    // LSTM 모델의 디코딩 정확도가 측정 가능한 수준으로 올라갑니다.
    //
    // 구현 주의: 커널 계수 합이 1 이 되도록 5 + (-1)*4 = 1 로 맞췄습니다. 가장자리(테두리 1픽셀)
    // 는 원본을 그대로 쓰고, 내부만 돌립니다. 과도한 샤픈은 픽셀 노이즈를 증폭시키므로
    // 한 번만 적용하고 끝냅니다.
    const sharpened = new Uint8ClampedArray(grayBuffer.length);
    sharpened.set(grayBuffer);
    for (let y = 1; y < targetH - 1; y += 1) {
      for (let x = 1; x < targetW - 1; x += 1) {
        const idx = y * targetW + x;
        const center = grayBuffer[idx];
        const up = grayBuffer[idx - targetW];
        const down = grayBuffer[idx + targetW];
        const left = grayBuffer[idx - 1];
        const right = grayBuffer[idx + 1];
        const value = 5 * center - up - down - left - right;
        sharpened[idx] = value < 0 ? 0 : value > 255 ? 255 : value;
      }
    }

    for (let i = 0, j = 0; i < d.length; i += 4, j += 1) {
      d[i] = d[i + 1] = d[i + 2] = sharpened[j];
      // alpha 채널은 그대로.
    }
    ctx.putImageData(imageData, 0, 0);

    URL.revokeObjectURL(imgUrl);

    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/png");
    });

    return blob ?? file;
  } catch {
    return file;
  }
}
