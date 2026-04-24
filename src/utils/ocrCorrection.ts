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
 * 가격의 천 단위 `,` 가 `.` 로 오인식된 케이스를 복구합니다.
 *   예) "17.900 원" → "17,900 원", "20.470 원" → "20,470 원",
 *        "1.234.567 원" → "1,234,567 원"
 *
 * Tesseract 가 폰트/DPI 에 따라 콤마 `,` 를 마침표 `.` 로 잘못 읽는 실측 패턴이며, 수정하지
 * 않으면 가격 라인 regex `\d{1,3}(?:,\d{3})+` 에 안 걸려 파서가 뒤쪽 "900" 같은 부분만
 * 잡아 **가격이 1/100~1/1000 로 뭉개지는** 치명적 회귀가 발생합니다 (실제 케이스:
 * "17,900 원" → "900 원" 파싱).
 *
 * 매칭 조건(false-positive 방지):
 *   - 숫자 + `.` + 3자리 숫자 + 이후 숫자/`,`/`.` 연쇄의 끝이 `원` 이어야 함.
 *   - 즉 "가격 문맥" 이 확실한 경우에만 동작하며, 일반 텍스트의 소수점·버전 번호
 *     ("v1.234", "파이 3.141592") 는 `원` 룩어헤드 때문에 매치되지 않습니다.
 *
 * 구현: 한 매치 안의 **모든** `.` 를 `,` 로 치환해 "1.234.567 원" 도 한 번에 복구.
 *
 * 멱등: 이미 "17,900 원" 인 입력에는 동작하지 않습니다 (매치 안에 `.` 가 없으면 no-op).
 */
function recoverCommaAsPeriodInPrice(input: string): string {
  return input.replace(
    /\d+(?:\.\d{3})+(?=\s*원)/g,
    (match) => match.replace(/\./g, ","),
  );
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
 * Tesseract 가 한글 글자 사이에 공백을 삽입해 "배 송 완 료" 처럼 **글자 단위로 쪼갠**
 * 아티팩트를 원상 복구합니다.
 *
 * 이 아티팩트는 쿠팡·네이버 등 한글 UI 캡쳐의 Tesseract 결과에서 가장 흔하게 관찰되며,
 * 복구하지 않으면 파서의 다음 축들이 연쇄로 깨집니다:
 *   - 상태 라벨(`배송완료`/`취소완료`/`반품완료`) 매칭 실패 → 취소·환불 분기 무너짐
 *   - 분리배송 마커(`일부 상품이 분리되어 배송됩니다`) 매칭 실패 → 중복 카드 3→1 병합 실패
 *   - 상품명 prefix 가비지 컷 실패 → 이름이 "배송완료 4/17 도착" 꼬리표까지 끌고 들어감
 *
 * ### 적용 대상: **단일 한글 글자가 2개 이상** 공백으로 끊어진 런(run)만 재결합
 *
 * 대상 패턴 예: `배 송 완 료`, `취 소 완 료`, `반 품 신 청`, `무 료 선 물 포 장`,
 *              `로 켓`(=로켓 배지), `컬 레`(=켤레), `내 일`(=내일 배지)
 * 대상 아닌 예: `루디크 루브르`, `체리 블라썸`, `로켓 내일` — 각 토큰이 **2글자 이상 덩어리**로
 *              연속된 한글이라 Tesseract 분할 아티팩트가 아니고, UI에서 띄어쓰기로 분리된
 *              **정상 다단어**입니다. 이 패턴에선 단어 내부 글자들이 공백 없이 붙어 있어
 *              `(?<![가-힣])` 룩비하인드·`(?![가-힣])` 룩어헤드 조건으로 자연스럽게 제외됩니다.
 *
 * 정규식 설계:
 *   - `(?<![가-힣])` / `(?![가-힣])` : 런 양끝이 한글 경계 밖(공백·영문·숫자·줄 시작/끝)
 *   - `[가-힣](?:[\t ]+[가-힣]){1,}` : 단일 한글 + `공백 + 단일 한글` 을 최소 1회 반복
 *     → 최소 2개의 단일 한글이 공백으로 끊어진 런만 잡힙니다. 각 `[가-힣]` 은 **한 글자**만
 *     소비하므로 "루디크" 같은 다글자 블록은 첫 글자 뒤에 곧바로 공백이 없어 런에 들어가지
 *     못합니다 — 즉 "루 디 크" 처럼 띄어쓴 경우에만 매치됩니다.
 *   - 매치 전체에서 `[\t ]+` 만 골라 제거하면 "배송완료" 로 합쳐집니다.
 *
 * ⚠ 줄바꿈은 **절대** 삼키지 않습니다. 파서가 라인 단위 상태머신으로 동작해 상태 라인 / 이름
 * 라인 / 가격 라인을 **줄 단위로** 구분하기 때문입니다. 초기 구현에서 `\s+` (줄바꿈 포함) 로
 * 매칭해 `"…로켓 내일\n벨로티손톱이…"` 가 `"…로켓내일벨로티손톱이…"` 한 줄로 뭉쳐 상태
 * 라인이 상품명까지 먹어 버리고 모든 상품이 `itemName=null` 로 찍히는 회귀가 harness 에서
 * 발견됐습니다. 그래서 공백 클래스를 `[\t ]+` 로 좁혔습니다 (줄바꿈/`\u2028`/`\u2029` 제외).
 *
 * 멱등: 두 번 태워도 같은 결과(매치된 런은 공백이 사라져 더 이상 매치되지 않음).
 */
function rejoinSplitKoreanWords(input: string): string {
  return input.replace(
    /(?<![가-힣])[가-힣](?:[\t ]+[가-힣]){1,}(?![가-힣])/g,
    (match) => match.replace(/[\t ]+/g, ""),
  );
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
 * 쿠팡 주문 카드 앞에 독립 라인으로 끼어드는 "로켓배송 리본 OCR 찌꺼기"를 제거합니다.
 *
 * 실측 패턴:
 *   - `wsws ie) 도적`
 *   - `월) 도차 :`
 *   - `uses 30 <2개`
 *   - `wssa a = |`
 *
 * 공통점:
 *   - 길이가 짧고(대체로 20자 이하) 카드 본문 라인과 분리된 **단독 라인**
 *   - 라틴/숫자/기호가 대부분이고, 한글이 있더라도 2~4자 짧은 토막에 그침
 *   - 바로 앞이 주문 헤더/상태/버튼 라인이거나, 바로 뒤가 상품 본문처럼 보이는 라인
 *
 * 안전장치:
 *   - 가격/날짜/상태 키워드가 있는 라인은 건드리지 않음
 *   - "LG 프라엘", "BFL 빅사이즈" 같은 짧은 영문 브랜드+상품명은 punctuation 부족으로 제외
 *   - **문맥(앞/뒤 라인)** 이 상품 카드 주변일 때만 제거
 *
 * 목표는 상품명 철자 교정이 아니라, nameBuffer 로 흘러 들어가 `도적오리온...` 같은 prefix 를
 * 만드는 독립 노이즈 라인만 조용히 없애는 것입니다.
 */
function dropStandaloneRibbonNoiseLines(input: string): string {
  const lines = input.split("\n");

  const isProtectedLine = (line: string): boolean =>
    /(?:20\d{2}\s*[.\-]\s*\d{1,2}\s*[.\-]\s*\d{1,2}|\d[\d,]*\s*원|배송\s*완료|상품\s*준비\s*중|결제\s*완료|주문\s*완료|반품\s*완료|환불\s*완료|취소\s*완료|주문\s*상세보기|반품\s*상세\s*보기)/.test(
      line,
    );

  const looksLikeStandaloneRibbonNoise = (line: string): boolean => {
    const t = line.trim();
    if (!t || t.length > 20 || isProtectedLine(t)) return false;

    const hangulCount = (t.match(/[가-힣]/g) ?? []).length;
    const latinDigitCount = (t.match(/[A-Za-z0-9]/g) ?? []).length;
    const punctCount = (t.match(/[()[\]{}:;=<>|+*#@©._~/-]/g) ?? []).length;
    const hangulChunks = t.match(/[가-힣]{2,}/g) ?? [];
    const hasOnlyShortHangulChunks =
      hangulChunks.length === 0 || hangulChunks.every((chunk) => chunk.length <= 2);

    // `wsws ie) 도적`, `wens vi) 도적 :` 류: 앞쪽에 라틴/숫자 찌꺼기가 길게 있고 끝에 2~4자
    // 한글 토막만 남는 경우.
    if (
      hangulCount >= 2 &&
      hangulCount <= 4 &&
      latinDigitCount >= 4 &&
      punctCount >= 1 &&
      /[가-힣]{2,4}\s*[:)]?\s*$/.test(t)
    ) {
      return true;
    }

    // `월) 도차 :` 류: 라틴은 없지만 구두점 사이에 짧은 한글 토막만 남은 경우.
    if (
      hangulCount >= 2 &&
      hangulCount <= 4 &&
      latinDigitCount === 0 &&
      punctCount >= 2 &&
      !/[가-힣]{3,}\s+[가-힣]{3,}/.test(t)
    ) {
      return true;
    }

    // `uses 30 <2개`, `wssa a = |` 류: 대부분 라틴/숫자/기호이고 한글이 없거나 1자 수준.
    if (
      hasOnlyShortHangulChunks &&
      hangulCount <= 1 &&
      latinDigitCount + punctCount >= 4 &&
      (/^[^가-힣]+/.test(t) || /[^가-힣]+$/.test(t))
    ) {
      return true;
    }

    return false;
  };

  const survivesContext = (line: string, index: number): boolean => {
    const prev = lines[index - 1]?.trim() ?? "";
    const next = lines[index + 1]?.trim() ?? "";
    const prevLooksCardBoundary =
      /(?:주문\s*상세보기|반품\s*상세\s*보기|배송\s*완료|상품\s*준비\s*중|결제\s*완료|반품\s*완료|환불\s*완료|취소\s*완료|장바구니\s*담기|리뷰\s*작성하기|판매자\s*문의)/.test(
        prev,
      );
    const nextLooksProductish =
      !isProtectedLine(next) &&
      /(?:[가-힣]{2,}|[A-Za-z]{3,})/.test(next);
    return prevLooksCardBoundary || nextLooksProductish;
  };

  return lines
    .filter((line, index) => {
      if (!looksLikeStandaloneRibbonNoise(line)) return true;
      return !survivesContext(line, index);
    })
    .join("\n");
}

/**
 * 쇼핑몰 OCR 텍스트에 공통으로 걸만한 "안전한" 치환을 모두 적용합니다.
 * 호출부는 파서에 넘기기 직전에 한 번만 태우면 됩니다.
 *
 * 순서 주의:
 *   1. NFC → 이후 모든 regex 가 완성형 글자로 매칭되도록 **가장 먼저**.
 *   2. 보이지 않는 문자 → regex에서 짜증나는 zero-width 류 제거.
 *   3. 전각→반각 / 가운데점 / 하이픈 / 따옴표 → 글자 모양 통일.
 *   4. 한글-한글 공백 rejoin → "배 송 완 료" → "배송완료". 상태 라벨·분리배송 마커·
 *      상품명 prefix 가 연쇄로 깨지는 걸 막기 위해 낱글자/숫자 복구 전에 먼저 돌립니다.
 *      한글-숫자/영문/기호 경계는 건드리지 않아 "6,900 원" 같은 토큰 경계는 보존.
 *   5. 자모 복구 → "ㅣ" 외톨이 제거 등 낱글자 수준 교정. 원/개 복구 전에 돌려야
 *      "16,900 윤" 같은 패턴이 공백 축약에 먼저 먹히지 않습니다.
 *   6. 숫자 / 원 / 개 복구 → 형식 정규화.
 *   7. 공백 축약 → 마지막에 돌려 위의 치환이 만든 미세한 공백 차이도 함께 정리.
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
  text = rejoinSplitKoreanWords(text);
  text = dropStandaloneRibbonNoiseLines(text);
  text = removeOrphanJamoI(text);
  text = recoverCommaAsPeriodInPrice(text);
  text = mergeThousandSeparator(text);
  text = recoverWonUnit(text);
  text = recoverTrailingGaeUnit(text);
  text = spaceBeforeWon(text);
  text = collapseInlineSpaces(text);
  text = trimLineEnds(text);
  return text;
}
