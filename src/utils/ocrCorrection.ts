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
 * 한글 자모 합성(NFC) 정규화.
 * Tesseract가 가끔 `ㄱ + ㅏ + ㅇ` 처럼 조합형 자모로 쪼개 주는 경우가 있는데,
 * 화면 상 글자는 같아 보여도 문자열 비교/regex 매칭에서 한 글자로 안 잡힙니다.
 * NFC는 이걸 `강` 같은 완성형 한 글자로 합성해 주므로, 이후 파서 regex의 [가-힣] 같은
 * 범위 매칭이 의도대로 동작합니다. 부작용: 이미 NFC 인 텍스트에는 no-op.
 */
function toNfc(input: string): string {
  return input.normalize("NFC");
}

/**
 * 라인 내부의 연속 공백(스페이스/탭) 축약.
 * 쿠팡/네이버 캡쳐는 UI 상 인위적인 간격을 많이 쓰고, Tesseract가 그 간격을 2~6개의
 * 스페이스로 뱉을 때가 있어 파서 regex 들이 `\s+`로 대비해야 하는 부담이 커집니다.
 * 여기서 한 번 1칸으로 모아 두면 파서 regex가 단순해집니다.
 * 줄바꿈은 건드리지 않고(상태머신 파서가 줄 단위로 동작), 탭은 스페이스로 바꿉니다.
 */
function collapseInlineSpaces(input: string): string {
  return input
    .split("\n")
    .map((line) => line.replace(/[\t ]{2,}/g, " "))
    .join("\n");
}

/**
 * 하이픈·대시 계열을 ASCII 하이픈(`-`) 하나로 통일합니다.
 * 유니코드에는 `-` 모양 글자가 10개 가까이 있고(전각 하이픈 포함), Tesseract 는 폰트에 따라
 * `‐`(U+2010), `–`(en-dash), `—`(em-dash), `−`(minus) 등을 섞어 뱉습니다. 파서가 가격 구분자나
 * 상품명 내부 하이픈을 단일 문자로 비교하려면 여기서 한 글자로 맞춰 두는 게 안전합니다.
 */
function normalizeHyphens(input: string): string {
  return input.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-");
}

/**
 * 스마트 인용부호(곡선형 따옴표)를 일반 ASCII 따옴표로 통일합니다.
 * `""`, `""`, `「」`, `『』` 같은 짝맞춤 따옴표가 상품명에 섞이면 정규식이
 * 여러 케이스로 분기해야 해서 성가십니다. 상품명 시각 표현에는 영향이 거의 없고,
 * 추후 검색/중복 판정에서 같은 상품으로 묶이는 데에도 이득입니다.
 */
function normalizeQuotes(input: string): string {
  return input
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u301D\u301E]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'");
}

/**
 * "N개" 오인식 복구.
 *
 * Tesseract 가 한글 "개" 의 받침(ㅐ+ㅣ+ㅇ)이 만드는 닫힌 곡선을 괄호/파이프로 오인식해
 * "1개" → "1}", "2개" → "2)", "10개" → "10|" 같이 뱉는 케이스가 자주 나옵니다.
 * 가격 뒤 수량 토큰은 모든 쇼핑 파서가 보는 값이라 여기서 일관되게 복구합니다.
 *
 * 매칭 조건(false-positive 방지):
 *   - 숫자(1~3자리) 바로 뒤에 `}` `)` `|` 중 하나가 오고
 *   - 뒤가 줄 끝이거나 공백/콤마/점/· 이어야 함(연속 숫자 중간에는 붙이지 않음)
 *
 * 예: "200g, 1}" → "200g, 1개", "x 2)" → "x 2개"
 *
 * 안전성: 이 규칙은 이미 인식된 텍스트에만 동작하므로 Tesseract 자체의 인식 정확도엔
 * 영향을 주지 않습니다. 멱등 — 두 번 태워도 "1개" → "1개" 로 유지됩니다.
 */
function recoverTrailingGaeUnit(input: string): string {
  return input.replace(/(\d{1,3})\s*[}\)\|]\s*(?=$|[\s,.·])/gm, "$1개");
}

/**
 * "원" 오인식 복구.
 *
 * 가격 라벨 "원" 이 Tesseract 에서 "윤"(받침 ㄴ 이 ㅇ 으로 오독) · "웜" · "왠" 으로 튀는
 * 사례가 관찰됐습니다. 이 글자들은 쇼핑 문맥에선 가격 단위 외 쓰임이 사실상 없어, 가격
 * 숫자(콤마 포함) 직후에 올 때만 "원" 으로 돌려도 부작용이 낮습니다.
 *
 * 예: "16,900 윤" → "16,900 원", "3850웜" → "3850 원"
 *
 * 안전성: 매칭 조건이 "숫자 직후" 로 좁아서 일반 텍스트의 "윤/웜/왠" 은 건드리지 않습니다.
 *
 * ⚠ `\b` 금지: 한글은 JS 정규식에서 단어 문자(\w)로 취급되지 않아
 *   "윤" 뒤가 공백이어도 word boundary 로 성립하지 않습니다. 초기 구현에서 `\b` 를 써서
 *   "16,900 윤 · 1개" 같이 뒤가 공백인 케이스가 전혀 매칭되지 않아 파서가 가격 라인을
 *   놓치고 상품 1개가 통째로 드랍되는 회귀가 harness 에서 관찰됐습니다. 대신 뒤에
 *   줄 끝/공백/구분자가 오는지 lookahead 로 명시적으로 확인합니다.
 */
function recoverWonUnit(input: string): string {
  return input.replace(
    /(\d[\d,]*)\s*[윤웜왠](?=$|[\s·•,.\-*)])/gm,
    "$1 원",
  );
}

/**
 * 한글 사이에 외톨이로 끼어 있는 자모 "ㅣ" 를 제거합니다.
 *
 * Tesseract 가 한글 받침의 세로획을 독립된 자모 ㅣ 로 분리해 뱉는 경우가 있습니다.
 * 양옆이 공백인 상태로 한글 완성형 사이에 끼었을 때만 가비지로 판단하고 지웁니다.
 * 실제 단어 내부의 자모는 공백 없이 붙어 있어 이 규칙에 걸리지 않습니다.
 *
 * 예: "원더풀 ㅣ 피스타치오" → "원더풀 피스타치오"
 */
function removeOrphanJamoI(input: string): string {
  return input.replace(/([가-힣])\s+ㅣ\s+([가-힣])/g, "$1 $2");
}

/**
 * 쇼핑몰 OCR 텍스트에 공통으로 걸만한 "안전한" 치환을 모두 적용합니다.
 * 호출부는 파서에 넘기기 직전에 한 번만 태우면 됩니다.
 *
 * 순서 주의:
 *   1. NFC → 이후 모든 regex 가 완성형 글자로 매칭되도록 **가장 먼저**.
 *   2. 보이지 않는 문자 → regex에서 짜증나는 zero-width 류 제거.
 *   3. 전각→반각 / 가운데점 / 하이픈 / 따옴표 → 글자 모양 통일.
 *   4. 자모 복구 → "ㅣ" 외톨이 제거 등 낱글자 수준 교정. 원/개 복구 전에 돌려야
 *      "16,900 윤" 같은 패턴이 공백 축약에 먼저 먹히지 않습니다.
 *   5. 숫자 / 원 / 개 복구 → 형식 정규화.
 *   6. 공백 축약 → 마지막에 돌려 위의 치환이 만든 미세한 공백 차이도 함께 정리.
 */
export function applyOcrCorrections(rawText: string): string {
  if (!rawText) return rawText;
  let text = rawText;
  text = toNfc(text);
  text = text.replace(INVISIBLE_CHARS, "");
  text = toHalfWidth(text);
  text = normalizeMiddleDot(text);
  text = normalizeHyphens(text);
  text = normalizeQuotes(text);
  text = removeOrphanJamoI(text);
  text = mergeThousandSeparator(text);
  text = recoverWonUnit(text);
  text = recoverTrailingGaeUnit(text);
  text = spaceBeforeWon(text);
  text = collapseInlineSpaces(text);
  text = trimLineEnds(text);
  return text;
}
