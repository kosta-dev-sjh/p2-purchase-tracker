/**
 * 역할: Tesseract.js로 넘기기 직전 이미지를 OCR 친화적으로 다듬는 전처리 유틸입니다.
 *       카카오톡 캡쳐·모바일 스크린샷 같은 저해상도 입력에서 한글/숫자의 획이 뭉개져
 *       Tesseract가 "가"를 "가ㅣ"로, "0"을 "O"로 읽는 문제를 줄이는 목적입니다.
 *
 * 적용 정책:
 *   - 업스케일: 긴 변이 1800px 미만이면 2배로 올립니다. 텍스트 렌더 해상도가 오르면
 *     Tesseract가 기대하는 x-height(대략 20~30px)에 쉽게 도달해 인식률이 현저히 개선됩니다.
 *     너무 큰 이미지는 워커 처리 시간이 급격히 늘어 3000px 한도를 둡니다 (네이버는 4000px 까지 허용).
 *   - 그레이스케일 + 라이트 컨트라스트: 채도/RGB 잡음을 제거하면 엣지 감지가 쉬워져 필기체
 *     가까운 UI 폰트도 또렷하게 잡힙니다. 바이너라이즈는 의도적으로 넣지 않았습니다 —
 *     스크린샷은 안티앨리어싱이 걸려 있어 순수 이진화하면 오히려 획이 깨집니다.
 *   - PNG 인코딩: JPEG로 내보내면 블록킹 아티팩트가 폰트에 올라 Tesseract가 헷갈립니다.
 *   - 네이버 강화 (2026-04-27): 모바일 캡쳐 비중이 높고 OCR 정확도 ceiling 이 쿠팡보다 낮아,
 *     `platform === "naver"` 일 때만 (a) 강한 컨트라스트(amount=55) (b) 3x3 unsharp mask
 *     (c) 더 큰 max edge (4000px) 를 추가 적용. 쿠팡은 회귀 대응 모드 (CLAUDE.md §9.1)
 *     라 손대지 않음.
 *
 * 이 유틸은 browser-only(canvas 의존)입니다. 서버 환경에서 쓰려면 sharp 같은 이미지
 * 라이브러리로 동등한 파이프라인을 다시 짜야 합니다.
 *
 * 위치: src/utils/ocrPreprocess.ts
 */

const MIN_LONG_EDGE = 1800;
const MAX_LONG_EDGE = 3000;
const MAX_LONG_EDGE_NAVER = 4000;

export interface PreprocessOptions {
  /** "naver" 일 때 모바일 캡쳐 친화 강화 파이프라인 (강 컨트라스트 + unsharp mask) 적용. */
  platform?: "coupang" | "naver" | string;
}

/**
 * OCR 정확도를 끌어올리기 위한 경량 전처리.
 *
 * 입력 파일을 받아 canvas에서 업스케일 + 그레이스케일 + 약한 컨트라스트 조정 후
 * PNG Blob으로 돌려줍니다. 실패(브라우저 환경이 아니거나 decode 실패)하면 원본을
 * 그대로 돌려줘 호출부가 분기 없이 계속 진행할 수 있게 합니다.
 */
export async function preprocessImageForOcr(
  file: File,
  options: PreprocessOptions = {},
): Promise<Blob | File> {
  const aggressive = options.platform === "naver";
  const maxLongEdge = aggressive ? MAX_LONG_EDGE_NAVER : MAX_LONG_EDGE;
  const contrastAmount = aggressive ? 55 : 30;
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
    if (longEdge * scale > maxLongEdge) {
      scale = maxLongEdge / longEdge;
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
    // 그라데이션이 끊겨 한글이 깨집니다. 네이버는 모바일/저DPI 비중이 높아 amount=55,
    // 쿠팡은 amount=30 (회귀 대응 모드 §9.1) 으로 차등 적용.
    const imageData = ctx.getImageData(0, 0, targetW, targetH);
    const d = imageData.data;
    // 1단계: 그레이스케일 변환만 먼저 (unsharp mask 가 그레이 채널 기준이므로).
    const gray = new Uint8ClampedArray(targetW * targetH);
    for (let i = 0, j = 0; i < d.length; i += 4, j += 1) {
      gray[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }

    // 2단계 (네이버 한정): 3x3 box-blur → unsharp mask. 텍스트 엣지를 강화해 획이 뭉개진
    // 모바일 캡쳐의 한글/숫자 인식률을 끌어올림. amount=0.6 은 보수적 값 (1.0 이상이면 텍스트
    // 외곽이 깨져 오히려 OCR 이 헷갈림).
    let working = gray;
    if (aggressive) {
      const blurred = new Uint8ClampedArray(targetW * targetH);
      for (let y = 1; y < targetH - 1; y += 1) {
        for (let x = 1; x < targetW - 1; x += 1) {
          const o = y * targetW + x;
          // 3x3 평균
          blurred[o] =
            (gray[o - targetW - 1] + gray[o - targetW] + gray[o - targetW + 1] +
              gray[o - 1] + gray[o] + gray[o + 1] +
              gray[o + targetW - 1] + gray[o + targetW] + gray[o + targetW + 1]) /
            9;
        }
      }
      const sharpAmount = 0.6;
      const sharp = new Uint8ClampedArray(targetW * targetH);
      for (let i = 0; i < gray.length; i += 1) {
        const detail = gray[i] - blurred[i];
        const v = gray[i] + sharpAmount * detail;
        sharp[i] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
      working = sharp;
    }

    // 3단계: 컨트라스트 조정 후 RGBA 로 다시 쓰기.
    for (let i = 0, j = 0; i < d.length; i += 4, j += 1) {
      const g = working[j];
      const c = g < 128 ? Math.max(0, g - contrastAmount) : Math.min(255, g + contrastAmount);
      d[i] = d[i + 1] = d[i + 2] = c;
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
