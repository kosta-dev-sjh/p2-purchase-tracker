/**
 * 역할: Tesseract가 한글 쇼핑몰 스크린샷에서 뱉는 공통 오인식을 한 번에 정리하는 전역
 *       후처리(post-OCR) 유틸입니다. 이미지 전처리(ocrPreprocess)나 상태 감지(ocrParse)와
 *       달리 "이미 뽑힌 텍스트를 파서 친화적으로 다듬는" 역할만 합니다.
 *
 *       적용 지점:
 *         OcrUpload/index.tsx의 runAnalysis에서 worker.recognize() 직후 rawText에 한 번
 *         태운 뒤, 각 플랫폼 파서(parseCoupangOrderText 등)로 넘깁니다. 따라서 여기 추가한
 *         규칙은 쿠팡/네이버/테무 모두가 동시에 이득을 받습니다.
 *
 *       설계 원칙:
 *         1) "거의 부작용 없는" 형식 정규화만 한다. 한글 철자 교정(예: "대일" → "내일")처럼
 *            문맥 의존적인 치환은 해당 플랫폼 파서에 남긴다 — 상호명·일반 단어에 잘못 걸리면
 *            회귀가 크고, 여기서 고치면 어느 파서에서 깨졌는지 추적이 어려워진다.
 *         2) 모든 치환은 **멱등**이어야 한다. 여러 번 적용해도 같은 결과가 나와야 테스트가 쉽다.
 *         3) 새 패턴이 관찰될 때마다 이 파일에만 규칙을 추가한다. 파서 내부에 같은 정규화를
 *            이중 작성하지 않는다.
 *
 * 위치: src/utils/ocrCorrection.ts
 */

/**
 * 보이지 않는 문자 제거.
 * - \u200B~\u200F: ZWSP/ZWNJ/ZWJ/LRM/RLM
 * - \u202A~\u202E: 방향 제어
 * - \u2060~\u206F: 단어 결합 문자
 * - \uFEFF: BOM
 * 쇼핑몰 페이지 HTML이 렌더된 픽셀에는 이런 문자가 있을 리 없지만, Tesseract가 가끔 여백을
 * 잘못 읽어 ZWSP로 뱉는 경우가 있어 라인 길이/공백 비교를 쉬운 방향으로 정리해 둡니다.
 */
const INVISIBLE_CHARS = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;

/**
 * 전각(full-width) ASCII → 반각.
 * "１，２００원" → "1,200원" 처럼 한글 폰트 렌더 특성상 Tesseract가 전각 숫자/콤마로
 * 뱉어 파서의 숫자 regex에 걸리지 않는 케이스를 방지합니다. 한글/한자(\u3000 이외)는
 * 건드리지 않습니다.
 */
function toHalfWidth(input: string): string {
  return input
    .replace(/[\uFF01-\uFF5E]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    )
    // 전각 스페이스만 반각 스페이스로(일반 한글 조판에 섞여 들어오는 경우 있음).
    .replace(/\u3000/g, " ");
}

/**
 * 쇼핑 UI에서 자주 보이는 가운데점(·) 계열을 한 글자로 통일합니다.
 * Tesseract는 같은 디자인 요소를 `・`/`•`/`‧`/`∙`/`·` 등 폰트마다 다르게 판독해
 * 파서 regex가 케이스별로 분기하게 만듭니다. 한 글자로 맞추면 파서가 깔끔해집니다.
 */
function normalizeMiddleDot(input: string): string {
  return input.replace(/[・•‧∙]/g, "·");
}

/**
 * 천 단위 콤마 뒤에 공백이 낀 가격을 복구합니다.
 *   예) "1, 200 원" → "1,200 원"
 * Tesseract가 폭이 좁은 콤마 뒤를 공백으로 오인식하는 경우를 교정합니다.
 * 콤마 뒤 3자리가 확실한 숫자 그룹일 때만 합쳐, "1, 2(오인식 뒤 무관 숫자)"에는 손대지 않습니다.
 */
function mergeThousandSeparator(input: string): string {
  return input.replace(/(\d),\s+(\d{3})(?=\D|$)/g, "$1,$2");
}

/**
 * "6,900원" 처럼 '원' 앞 공백이 누락된 경우에 한 칸을 끼워 "6,900 원"으로 통일합니다.
 * 파서가 모두 "원" 앞 공백을 가정해도 되도록 만들어, priceLineRegex의 허용 폭을
 * 점진적으로 좁힐 수 있는 여지를 둡니다. 이미 공백이 있으면 no-op.
 */
function spaceBeforeWon(input: string): string {
  return input.replace(/(\d)원(?=$|[\s·•,.\-*)])/g, "$1 원");
}

/**
 * 라인 끝 trailing 공백/탭 정리. 진짜 공백은 손대지 않고, 라인 말미만 깎아
 * 비교·진단 시 눈에 거슬리는 꼬리를 줄입니다.
 */
function trimLineEnds(input: string): string {
  return input
    .split("\n")
    .map((line) => line.replace(/[\t ]+$/, ""))
    .join("\n");
}

/**
 * 쇼핑몰 OCR 텍스트에 공통으로 걸만한 "안전한" 치환을 모두 적용합니다.
 * 호출부는 파서에 넘기기 직전에 한 번만 태우면 됩니다.
 */
export function applyOcrCorrections(rawText: string): string {
  if (!rawText) return rawText;
  let text = rawText;
  text = text.replace(INVISIBLE_CHARS, "");
  text = toHalfWidth(text);
  text = normalizeMiddleDot(text);
  text = mergeThousandSeparator(text);
  text = spaceBeforeWon(text);
  text = trimLineEnds(text);
  return text;
}
