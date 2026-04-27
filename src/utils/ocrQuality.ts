/**
 * 역할: OCR 파싱 결과 품질을 3단계(Tier 0/1/2) 로 분류해 "AI OCR fallback" 을 언제 권유할지
 *       판단하는 순수 유틸. 실제 AI 호출은 별도 모듈(#47 보류) 에서 담당하고, 여기서는 *언제*
 *       넘길지만 결정합니다.
 *
 * 위치: src\utils\ocrQuality.ts
 *
 * Tier 설계 (2026-04-24, 23장 샘플 실측 기반):
 *
 *   Tier 0 "clean"    — 파서 결과가 깨끗. AI 호출 **절대 안 함** (저비용 유지 목표).
 *                       요건: 이름 길이 ≥ 10, 한글 글자 ≥ 4, 가격 > 0 (또는 취소/환불 상태의 0원),
 *                       하드 가비지 마커 0개.
 *
 *   Tier 1 "bad"      — 파서가 복구 불가. **자동으로 AI 후보로 마킹**. 구체 조건은 아래 OR 리스트.
 *                       샘플 86 카드 기준 7~8장 (~8%) 정도가 여기 해당합니다.
 *
 *   Tier 2 "borderline" — 의심스럽지만 확증 X. UI 에 "🤖 AI 로 재분석" 버튼만 활성화, 사용자 선택.
 *                         오-승급(Tier 0 → 2) 이 오-강등(Tier 2 → 0) 보다 안전한 쪽으로 기울입니다.
 *
 * 원칙:
 *   - 분류는 **파싱 결과 필드만** 보고 결정. rawText 를 다시 스캔해 들어가면 파서 책임 경계가
 *     모호해지므로 name/price/quantity 표면으로 족합니다.
 *   - 특정 OCR 변형(`고환` 같은) 을 하드코딩하지 않고, 구조적 신호(한글 비율, 자모 잔류,
 *     마커 단어) 만 사용해 샘플 확장 시 과적합 리스크 최소화.
 *   - `reasons` 배열을 돌려주어 디버깅/로깅 시 "왜 이 tier 로 분류됐는지" 추적 가능.
 */


export type OcrCardTier = "clean" | "borderline" | "bad";

export interface OcrCardQuality {
  tier: OcrCardTier;
  reasons: string[];
}

/**
 * 파서가 남기면 "해석 불가" 신호로 볼 문자열 토큰. 상품명에 등장할 리 없는 쿠팡 UI 구간/
 * split marker 잔류/하드 가비지 문자. 각 항목은 카드 이름 문자열에 includes 로 찾으면 됩니다.
 */
const NAME_HARD_GARBAGE_SUBSTRINGS = [
  // split-marker 잔류
  "일부상품이분리",
  "분리배송된상품",
  // 화면/버튼 잔류
  "상세보기",
  "장바구니",
  "배송완료",
  "배송조회",
  "주문관리",
  "판매자문의",
];

/**
 * 하드 가비지 문자 마커. 정상 상품명에 거의 안 나오는 문자 조합을 골랐습니다.
 *   - `】【` : 쿠팡 태그 OCR 잔류
 *   - `__`  : 구분선 OCR 잔류 (코멧 분리배송 실측)
 *   - `\`   : 백슬래시 잔류
 *   - `` ` ``: 백틱 잔류 (코펫 순백 케이스에서 `\`줏` 처럼 섞임)
 *   - `---` : 연속 대시 (구분선 OCR 잔류)
 */
const NAME_HARD_GARBAGE_CHARS_REGEX = /】【|__|\\|`|---/;

/**
 * 정상 한국 상품명에 거의 안 등장하는 기호들. 단독으로 1~2개는 허용하지만, 3개 이상 섞여
 * 나오면 OCR 노이즈로 간주. `[`, `]` 는 `[최신형]` 같은 정상 프로모 태그에 쓰이므로 제외.
 * `_`, backtick, `<>{}|=~` 는 쇼핑몰 UI/OCR 환각 외에는 사실상 나오지 않습니다.
 */
const WEIRD_SYMBOLS_REGEX = /[<>{}|=~`_']/g;

/**
 * 선두 OCR 환각 prefix 감지: "짧은 한글 1~3자" + "구두점·기호" + "공백 또는 한글" 구조가
 * 이름 맨 앞에 있고, 뒤에 충분히 긴 한글 본문이 이어지면 OCR 환각으로 판정.
 * 실측: "촨뜸므. 헬펙 코멋오리지널...", "훌:' 유한양행...", "[ 잘아눌 덴티본..." 등.
 * 정상 상품명은 구두점이 선두 바로 뒤에 붙는 구조가 거의 없어 오탐 낮음.
 */
const PREFIX_OCR_NOISE_REGEX = /^([가-힣]{1,3})[.:;'")\]_·`\[\]\-]+(?=\s|[가-힣])/;

/**
 * 단일 자모(ㄱ-ㅎ·ㅏ-ㅣ, ㆍ)는 정상 상품명에 등장하지 않습니다. 개수를 세어 품질 신호로 사용.
 *
 * ※ 2026-04-24 이전에 있던 UNIT_SUFFIX_HANGUL ("개/장/세트/종/..." Set) 은 B3c 철회와 함께
 *   참조처가 사라져 삭제했습니다. 동일 개념이 필요해지면 OCR 분리 흔적 판정 로직 복원 시 재도입.
 */
const JAMO_CHARS_REGEX = /[ㄱ-ㅎㅏ-ㅣㆍ]/g;
const HANGUL_SYLLABLE_REGEX = /[가-힣]/g;

function countMatches(s: string, re: RegExp): number {
  return (s.match(re) ?? []).length;
}

/**
 * 카드 한 장의 품질을 분류합니다.
 *
 * 순서는 Tier 1 조건을 먼저 확인해 "확실히 나쁜 카드" 를 잡아낸 뒤, 남는 카드에 대해서만
 * Tier 0 (clean) 판정을 시도합니다. Tier 0 요건을 전부 통과하지 못한 나머지는 Tier 2 (borderline).
 */
export function classifyOcrCardQuality(card: {
  name: string | null | undefined;
  price: number;
  date?: string;
  quantity?: number;
  statusTag?: "purchase" | "sub" | "cancel" | "refund";
  /** Tesseract 가 가격을 아예 못 읽었을 때 true. price===0 이어도 AI 자동 호출 대상이 됨. */
  priceOcrFailed?: boolean;
  /** 이미 AI 보정을 거친 카드는 두 번 호출하지 않기 위한 가드. */
  aiApplied?: boolean;
}): OcrCardQuality {
  const name = (card.name ?? "").trim();
  const nameLen = name.length;
  const hangulCount = countMatches(name, HANGUL_SYLLABLE_REGEX);
  const jamoCount = countMatches(name, JAMO_CHARS_REGEX);
  const nonSpaceLen = name.replace(/\s+/g, "").length;
  const hangulRatio =
    nonSpaceLen > 0 ? hangulCount / nonSpaceLen : 0;
  const price = card.price ?? 0;
  const hasDate = !!(card.date ?? "").trim();
  const isCancelLike =
    card.statusTag === "cancel" || card.statusTag === "refund";

  const badReasons: string[] = [];

  // --- Tier 1 조건 (OR 만족 시 즉시 bad) ---

  // B0. Tesseract 가 가격을 아예 못 읽음 — 진짜 0원(사은품/쿠폰) 과 구분해서 무조건 AI 호출.
  if (card.priceOcrFailed) {
    badReasons.push("Tesseract 가 가격 라인 인식 실패");
  }

  // B0a (2026-04-25). 주문내역 캡쳐의 price-line 수량은 거의 항상 1~2개 수준입니다.
  //   OCR 이 `1개` 를 `17개` / `174개` 로 뻥튀기하거나, 버튼 숫자/날짜가 quantity 로 누수되는
  //   케이스가 실측에서 반복되었습니다. quantity >= 10 은 상품명·가격 모두 더럽게 읽혔을
  //   가능성이 높으므로 안전하게 AI 대상으로 올립니다.
  if ((card.quantity ?? 1) >= 10) {
    badReasons.push(`비정상 수량 (qty=${card.quantity})`);
  }

  // B0b (2026-04-27). 지출 추적에서 날짜는 금액만큼 핵심 필드입니다. 현재 파이프라인은 AI 가
  // 날짜를 회복할 수 있으므로, 이름/가격이 있는데 날짜가 비면 자동 보정 대상으로 올립니다.
  if (!hasDate && nameLen > 0 && (price > 0 || card.priceOcrFailed)) {
    badReasons.push("주문/결제 날짜 누락");
  }

  // B1. 이름이 비었거나 한글 3 글자 미만 → 사람이 이해 못 함.
  if (nameLen === 0) {
    badReasons.push("이름 비어 있음");
  } else if (hangulCount < 3) {
    badReasons.push(`한글 글자 < 3 (실제 ${hangulCount})`);
  }

  // B2. 화면/버튼/split-marker 잔류.
  //   2026-04-25: 공백 정규화 후 매칭. Tesseract 가 `판매자 문의` 처럼 버튼을 공백 섞어
  //   뱉는 실사용 케이스에서 substring 리스트(공백 없음) 와 매칭 실패하던 이슈 수정.
  const nameNoSpace = name.replace(/\s+/g, "");
  for (const g of NAME_HARD_GARBAGE_SUBSTRINGS) {
    if (nameNoSpace.includes(g)) {
      badReasons.push(`마커 잔류: "${g}"`);
      break;
    }
  }

  // B3. 하드 가비지 문자.
  if (NAME_HARD_GARBAGE_CHARS_REGEX.test(name)) {
    badReasons.push("하드 가비지 문자(】【, __, \\, ` 등)");
  }

  // B3a. 비정상 기호 혼재 — `<>{}|=~`_'` 중 3개 이상이면 OCR 환각/UI 잔류로 간주.
  //   예: "싫구<_랗_ ] 사빌루쥬..." ← `<`, `_`, `_` = 3개.
  //   정상 상품명은 이 기호들이 거의 나오지 않음(프로모 태그 `[...]` 는 제외 클래스).
  const weirdSymCount = (name.match(WEIRD_SYMBOLS_REGEX) ?? []).length;
  if (weirdSymCount >= 3) {
    badReasons.push(`비정상 기호 혼재 (${weirdSymCount}개)`);
  }

  // B3b. 선두 OCR 환각 prefix. "촨뜸므.", "훌:'", "[ 잘아눌" 같은 짧은 한글+구두점 패턴.
  //   뒤에 8자 이상의 한글 본문이 있을 때만 prefix 로 간주 (오탐 방지).
  const prefixMatch = PREFIX_OCR_NOISE_REGEX.exec(name);
  if (prefixMatch) {
    const rest = name.slice(prefixMatch[0].length);
    const restHangul = (rest.match(HANGUL_SYLLABLE_REGEX) ?? []).length;
    if (restHangul >= 8) {
      badReasons.push(`선두 OCR 환각 의심 ("${prefixMatch[0]}")`);
    }
  }

  // B3d. 선두 latin+digit+latin 파편 (2026-04-25): OCR 이 원본 상품명 앞에 `ns 7 EAE` 같은
  //   잡문자를 붙여 내뱉는 실사용 케이스. 일반 상품명의 영문 브랜드(`BFL`, `LG`) 는 digit 이
  //   섞이지 않으므로, **latin + 공백 + digit + 공백 + latin** 의 3단 구조가 선두에 오면
  //   OCR 환각으로 거의 확정.
  //   예: "ns 7 EAE 에프에이 EA, 100개입, 4개" → bad.
  //   대비: "BFL 빅사이즈", "LG 홈베이킹", "[최신형] 차이슨" → 모두 미매치.
  if (/^[a-zA-Z]+\s+\d+\s+[a-zA-Z]/.test(name)) {
    badReasons.push("선두 latin+digit+latin 파편");
  }

  // B3e. 선두 기호+라틴 파편: `+ wy 하우스오브허...` 처럼 상품명 앞에 기호 + 공백 + 짧은 라틴
  //   글자가 붙는 케이스. 정상 상품명은 `[...]`/`(...)` 대괄호/괄호로 프로모 태그를 두르고,
  //   `+` / `-` / `*` / `=` 같은 기호 뒤에 공백+라틴이 오는 조합은 OCR 버튼·아이콘 잔류.
  if (/^[+\-*/=<>~]\s+[a-zA-Z]/.test(name)) {
    badReasons.push("선두 기호+라틴 파편");
  }

  // B3f. 꼬리 `, 숫자` 파편: "끈끈이 트랩, 674" 처럼 이름 끝이 `쉼표 + 숫자` 로 끝나는 케이스.
  //   가격·수량 파편이 상품명으로 누수된 전형적 신호. 정상 상품명은 `, 5개` / `, 100g` 처럼
  //   숫자 뒤에 단위가 오므로 "숫자로만" 끝나는 경우만 잡음.
  if (/,\s*\d+\s*\.?\s*$/.test(name)) {
    badReasons.push("꼬리 숫자 파편 (단위 없음)");
  }

  // B3g. 꼬리 `, 단일 라틴 글자` 파편: "..., 17, i." 처럼 쉼표 + 1~2자 라틴 + 선택 온점으로
  //   끝나는 케이스. OCR 이 상품명 꼬리를 단일 글자로 잘라 뱉은 전형.
  if (/,\s*[a-zA-Z]{1,2}\.?\s*$/.test(name)) {
    badReasons.push("꼬리 단일 라틴 파편");
  }

  // B3h (2026-04-24). 선두 `짧은 한글(1~3자) + 공백? + 숫자 + 공백 + 한글 본문` 환각.
  //   쿠팡 "로켓배송" / "배송예정일" 같은 배송 마커가 OCR 로 깨져 상품명 앞에 붙어 들어간 전형.
  //   예:
  //     "로케배 0 코못오리지널유아용아기물티슈캠형"      ← "로케배 0" prefix
  //     "로캐 9 닥터포헤어탈모증상완화..."                ← "로캐 9" prefix
  //     "흐흐1000개 !": 템포 오리지널탐폰"                ← "흐흐1000" prefix
  //   오탐 방지: prefix match 뒤 **본문 한글 ≥ 8** 일 때만 확정. 그래야 "프로틴 5 종" (본문
  //   거의 없음) 같은 정상 상품 앞부분을 잡지 않음.
  //   B3b 와 비슷한 결이지만 B3b 는 `prefix + 구두점` 필수이고, B3h 는 구두점 없이 **공백만**
  //   있는 숫자 삽입 케이스를 커버.
  // 공백 허용 범위를 넓혀 "흐흐1000개 !": 템포..." 처럼 digit 뒤 공백 없는 환각 케이스도 포섭.
  const prefixDigitMatch = /^([가-힣]{1,3})\s*\d+\s*([가-힣])/.exec(name);
  if (prefixDigitMatch) {
    const rest = name.slice(prefixDigitMatch[0].length - 1);
    const restHangul = (rest.match(HANGUL_SYLLABLE_REGEX) ?? []).length;
    if (restHangul >= 8) {
      badReasons.push(`선두 한글+digit 파편 ("${prefixDigitMatch[0]}")`);
    }
  }

  // B3i (2026-04-24). 단위 자리에 `%` 또는 `/` 가 **숫자 사이** 에 끼거나, `/` 바로 뒤에
  //   연산자(+/-/*) 가 오는 패턴. 정상 상품명에서 `%` 는 "50%" 처럼 할인 표시로 숫자+한글/공백
  //   뒤에 오지, 숫자 사이에 끼지 않음.
  //   예:
  //     "슬라이드 지퍼백중형 30%4001/ 10 개..."        ← `30%4001/`
  //     "삼성전자 (- 타입초고속충 전기 254/ + 케이블..." ← `254/` 뒤 `+`
  //   안전 케이스:
  //     "500g/1개"  → `\d\/\d` 는 매칭되나, 실 상품명에서는 드물며 오탐 시 AI 가 원복 가능.
  //     이 규칙은 공격적이되 AI 보정 레이어가 최종 방어.
  if (/\d%\d/.test(name) || /\d\/\s*[+\-*]/.test(name)) {
    badReasons.push("단위 자리 %·/ 파편");
  }

  // B3j (2026-04-24). 이름이 너무 짧고 한글 총량도 적은 카드.
  //   OCR 이 상품명을 거의 완전히 잃었을 때의 마지막 그물. 정상 상품은 쿠팡 목록에서
  //   한글 ≥ 6 이 거의 보장되므로 (짧은 브랜드도 "코지엔비 곱창머리끈" = 한글 7 이상) 이 임계 이하는
  //   OCR 파손 확정에 가깝습니다.
  //   예: "8티 구브 게" (nameLen=7, hangulCount=4) → ground-truth 는 "하우스오브허 미드나잇 수딩 클렌징밤".
  //   cancel/refund 는 0원 정상 상태라 price>0 조건을 함께 걸어 오탐 방지.
  if (price > 0 && !isCancelLike && nameLen < 12 && hangulCount < 6) {
    badReasons.push(`짧은 이름 + 한글 부족 (len=${nameLen}, 한글=${hangulCount})`);
  }

  // B3k (2026-04-24). 선두 10자 내 한글 글자 수가 3 미만이면 bad. 이름 전체는 어느 정도
  //   길지만(nameLen >= 10) 앞부분이 라틴·숫자·기호·단일 한글로 채워진 "OCR 이 UI/라벨을
  //   상품명 앞에 덧붙인" 전형적 환각을 잡습니다. 짧은 이름은 B3j 가 이미 커버하므로 겹치지
  //   않도록 `nameLen >= 10` 조건을 병합.
  //   예:
  //     "ER Sm 도자A 220UY 메이드조이 보풀제거기..." first 10 = "ER Sm 도자A" (한글 2) → bad.
  //     "님 교환, 반품 신정..." first 10 = "님 교환, 반품" (한글 4) → 미매치 (다른 규칙이 덮음).
  //   안전: "KURUA 학생 대용량 책가방" first 10 = "KURUA 학생 대" (한글 3) → 통과.
  //        "BFL 빅사이즈 남여공용" first 10 = "BFL 빅사이즈 남" (한글 4) → 통과.
  //        "센스베이직 여성 편한 노라인..." first 10 = "센스베이직 여성 편" (한글 8) → 통과.
  if (nameLen >= 10) {
    const head10Hangul = (name.slice(0, 10).match(HANGUL_SYLLABLE_REGEX) ?? []).length;
    if (head10Hangul < 3) {
      badReasons.push(`선두 10자 내 한글 < 3 (${head10Hangul})`);
    }
  }

  // B3l (2026-04-24). 선두에 `라틴 토큰 + 공백 + 라틴 토큰 + (선택) 닫는괄호/대괄호 +
  //   (선택) 공백 + 한글` 구조가 오면 bad. 쿠팡 상품명의 정상 브랜드는 거의 항상 단일
  //   라틴 토큰("LG", "BFL", "KURUA", "CHERRY" 등) 이고, 라틴 토큰 2개가 연속으로 나오면
  //   OCR 이 UI 라벨/배송 마커/가격 파편을 상품명 앞에 붙인 환각 신호.
  //   예:
  //     "AEE UE 비벤디오 고양이 보안등..." → `AEE` / `UE` 두 토큰 뒤 `비` → bad.
  //     "wg FEE 탈부착가능 침대 자석..." → bad.
  //     "Asan me에비크..." → `Asan` / `me` 뒤 `\s*` 0 공백, 바로 `에` → bad (\s* 0 허용).
  //     "Aria ug) 누븐..." → `Aria` / `ug` + `)` + 공백 + `누` → bad (닫는괄호 허용).
  //   안전: "BFL 빅사이즈..." (토큰 1개, 두 번째 토큰 라틴 아님) → 통과.
  //        "LG 프라엘...", "KURUA 학생..." → 통과.
  //        "CHERRY PBT 키캡" 류는 매칭되지만 실사용 빈도가 낮고, 매칭되어도 AI 보정이 원복.
  //   B3k 와 상보적: B3k 는 총량 기반, B3l 은 구조 기반.
  if (/^[a-zA-Z]+\s+[a-zA-Z]+[)\]]*\s*[가-힣]/.test(name)) {
    badReasons.push("선두 latin 2+ 토큰 + 한글");
  }

  // B3m (2026-04-24). 쿠팡 "교환, 반품 신청" / "반품 신청" / "교환 신청" 버튼 텍스트가
  //   상품명 중간/꼬리에 섞여 들어온 케이스. **공백 + 쉼표** 를 제거한 후 합성어 3종을
  //   substring 으로 검사. comma 를 함께 벗겨내는 이유는 쿠팡 UI 가 "교환, 반품" 처럼
  //   쉼표로 두 버튼을 묶어 표시하기 때문 — whitespace 만 제거하면 "교환,반품" 이 남아
  //   "교환반품" 매칭이 깨짐.
  //   예:
  //     "...교환, 반품 신정TUR..." → `/[\s,]+/g` 제거 후 "...교환반품신정TUR..." → bad.
  //       (뒤 "신정/신청" 은 OCR 변형으로 달라져도 앞 "교환반품" 만 있어도 확정.)
  //     "...신 반품 신청 메이드조이..." → "반품신청" → bad.
  //   안전: 정상 상품명에서 "교환반품" / "반품신청" / "교환신청" 합성어가 등장할 일 거의 없음.
  //        "교환식" / "반품가능" 같은 단독 단어는 일반 상품명에서도 드물고, compound 로 붙을
  //        확률은 훨씬 낮음. comma 를 벗겨도 상품명 안에서 `, ` 로 구분된 단위·수량 표기
  //        ("1개, 민트색") 가 합성어 3개 중 하나와 정확히 붙어 만들어질 확률은 거의 0.
  const nameNoSep = name.replace(/[\s,]+/g, "");
  if (
    nameNoSep.includes("교환반품") ||
    nameNoSep.includes("고환반품") ||
    nameNoSep.includes("반품신청") ||
    nameNoSep.includes("교환신청")
  ) {
    badReasons.push("버튼 키워드 잔류 (교환/반품/신청)");
  }

  // B3n (2026-04-24). 이름 꼬리가 `공백 + 라틴 1~3자 + (선택) 온점` 으로 끝나면 bad.
  //   기존 B3g (`,\s*[a-zA-Z]{1,2}\.?\s*$`) 는 comma 필수였지만, 실제 OCR 은 comma 없이
  //   공백만으로 상품명 끝을 자르고 라틴 파편을 남기는 경우가 많음.
  //   예:
  //     "...헤어 드라이어 ew" → " ew" → bad.
  //     "...1개 TEE" → " TEE" → bad.
  //     "...드라이어 ew." → " ew." → bad (온점 허용).
  //   안전: 정상 쿠팡 상품명 꼬리는 `2개`, `250g`, `혼합색상` 처럼 한글 또는 숫자+한글로 끝남.
  //        단위 라틴(`ml`, `L`, `cm`) 은 보통 `250ml` 처럼 숫자 바로 뒤 공백 없이 붙으므로
  //        `\s[a-zA-Z]` 와 충돌하지 않음. 극소수 `250 ml` 공백 형태가 있으면 false positive
  //        가능 — AI 보정이 원복.
  if (/\s[a-zA-Z]{1,3}\.?\s*$/.test(name)) {
    badReasons.push("꼬리 공백+라틴 파편");
  }

  // B3o (2026-04-24). 버튼 잔류의 변형으로 `짧은 라틴 1~3자 + 신청` 이 이름 중간/꼬리에
  //   붙는 경우. 실측:
  //     "...헤어 드라이어 ew 신청혼합색상" → ` ew 신청`
  //     "...1개 ew 신청" / "...특대형 ew 신청" 류
  //   쿠팡 상품명에서 단독 동사 "신청" 이 등장할 일 자체가 드물고, 그 앞에 1~3자 라틴 파편이
  //   붙는 구조는 버튼/배지 OCR 잔류 외에는 사실상 없습니다.
  if (/\s[a-zA-Z]{1,3}\s*신청/.test(name)) {
    badReasons.push("짧은 라틴 + 신청 버튼 잔류");
  }

  // B3p (2026-04-24). 쉼표 뒤에 `4자리 이상 숫자 + 단일 라틴` 이 오고 바로 한글 본문이
  //   이어지면 OCR 이 모델명/상품코드를 뭉개 만든 파편으로 간주.
  //   예:
  //     "USB Of Ef, 06500a 혼합색상, 1개" → 실제는 "UB500"
  //   안전:
  //     정상 상품명의 모델 코드는 보통 `UB500`, `PD-H4300` 처럼 **쉼표 없이** 붙거나 하이픈을
  //     동반합니다. `, 06500a 혼합색상` 같이 쉼표 직후 0으로 시작하는 긴 숫자 파편은 OCR 노이즈에 가깝습니다.
  if (/,\s*\d{4,}[a-zA-Z](?=\s*[가-힣])/.test(name)) {
    badReasons.push("모델 코드 숫자+라틴 파편");
  }

  // B3q (2026-04-25). 한글 단어 사이에 `라틴 4자+` 토큰이 홀로 끼는 패턴.
  //   실측:
  //     "깨끗한 HABE 키친타월" → 실제는 "코멧 깨끗한 천연펄프 키친타월"
  //     OCR 이 로켓배지/브랜드/상품 설명을 섞어 읽으며 한글 사이에 의미 없는 영문 덩어리를
  //     끼워 넣는 경우가 있습니다.
  //   안전장치:
  //     - 토큰 길이 4자 이상만 대상 (`USB`, `LED`, `IPS`, `ANC` 같은 짧은 기술 약어는 제외)
  //     - 앞뒤 모두 한글 단어여야 함 → 선두 영문 브랜드/모델명은 미매치
  if (/[가-힣]{2,}\s+[A-Za-z]{4,}\s+[가-힣]{2,}/.test(name)) {
    badReasons.push("한글 사이 긴 라틴 파편");
  }

  // B3r (2026-04-25). 이름 꼬리에 `-영문 4자+` 같은 하이픈 라틴 부스러기가 남는 경우.
  //   예:
  //     "딩동펫 노즈워크담요 중형, 블루, 1개 -meres)"
  //   정상 상품명 끝에 이런 형태가 올 일은 거의 없어 AI 보정 대상으로 올립니다.
  if (/\s-\s*[A-Za-z]{4,}\)?\s*$/.test(name)) {
    badReasons.push("꼬리 하이픈+라틴 파편");
  }

  // B3s (2026-04-25). 길이/치수 표기가 `45 ×` 처럼 **곱 기호만 남기고 잘린** 케이스.
  //   실측: "반려동물 블랙라벨 이동가방, 블랙, 45 ×"
  //   정상 상품명에서는 `45 x 29 cm`, `45×29cm` 처럼 곱 기호 뒤 숫자/단위가 이어져야 하므로,
  //   줄 끝이 곱 기호로 끝나면 OCR 절단으로 간주합니다.
  if (/[0-9]\s*[×xX*]\s*$/.test(name)) {
    badReasons.push("잘린 치수 표기 (곱 기호만 남음)");
  }

  // B3t (2026-04-25). 이름 꼬리/중간에 `w= Lig 17H`, `AB = foo 12X` 같은
  //   라틴+기호+라틴+숫자 뭉치가 남는 경우. 가격/버튼/스펙 일부가 상품명으로 누수된 전형.
  //   정상 상품명의 모델명은 보통 하이픈/붙여쓰기 형태(`PD-H4300`, `UB500`) 이고,
  //   공백으로 분리된 `Lig 17H` 류 파편은 드뭅니다.
  if (/[A-Za-z]\s*=\s*[A-Za-z]{2,}\s*\d+[A-Za-z]?/.test(name)) {
    badReasons.push("라틴+기호+숫자 파편");
  }

  // B3u (2026-04-25). 한글 바로 뒤에 라틴 토막이 붙고, 한 번 더 라틴 토큰 뒤에 한글이
  //   이어지는 `똥al LM 암모니아` 류 패턴. 정상 영문 브랜드 선두나 `USB-C` 같은 규칙적
  //   모델명과 달리, 한글 단어 내부에 라틴 두 토막이 끼는 구조는 OCR 잔류 가능성이 높습니다.
  if (/[가-힣][A-Za-z]{2,}\s+[A-Za-z]{2,}\s+[가-힣]/.test(name)) {
    badReasons.push("한글 내부 라틴 토막 잔류");
  }

  // B3v (2026-04-25). 이름 중간에 `삼성전자 ㅇ 5 입초고속충...` 처럼 단일 자모가 공백으로
  //   분리돼 토큰처럼 끼는 경우. 정상 상품명은 `ㄱ`, `ㅇ` 같은 자모 단독 토큰을 쓰지 않고,
  //   실측에서는 모바일 취소 카드에서 버튼/아이콘 잔류와 함께 반복되었습니다.
  //   안전: 상품명 끝의 옵션 기호가 아니라 **공백으로 둘러싸인 단일 자모 토큰**만 잡습니다.
  if (/\s[ㄱ-ㅎㅏ-ㅣ]\s/.test(name)) {
    badReasons.push("공백 분리 단일 자모 토큰");
  }

  // B3w (2026-04-25). `25//+`, `500//`, `W//-` 처럼 slash 가 2번 이상 연속으로 붙는 경우.
  //   정상 상품명/모델명은 `/` 한 번 정도만 쓰고, 연속 slash 는 모바일 OCR 이 버튼/단위/아이콘을
  //   겹쳐 읽은 흔적에 가깝습니다.
  if (/\/{2,}/.test(name)) {
    badReasons.push("연속 slash 파편");
  }

  // B3x (2026-04-27). 선두 조사/단일 음절 찌꺼기 + 공백 + 본문.
  //   예: "개 체크미...", "을 띠테르..." 처럼 상품명 앞에 한 글자 토막이 남아있는 케이스.
  //   정상 상품명에서 선두가 조사 1글자로 시작하는 경우는 매우 드물어 AI 승격 신호로 사용.
  if (/^(?:개|을|를|의|이|가)\s+[가-힣]/.test(name) && nameLen >= 12) {
    badReasons.push("선두 조사 1글자 파편");
  }

  // B3c (2026-04-24 철회): "공백 분리 1~2자 한글 청크 3+" 규칙은 false positive 가 많아 제거.
  //   `박스 심플`, `이는` 같은 정상 한국 상품명의 내부 공백까지 OCR 분리로 오인해, 샘플 23장 중
  //   52% 가 AI 트리거로 올라가면서 "1차 필터" 의 비용 절약 목적이 희석됐습니다.
  //   OCR 분리 흔적은 대부분 rejoinSplitKoreanWords 단계에서 이미 정리되므로 여기서 다시 잡지
  //   않고, 진짜 중대한 파손(priceOcrFailed, 하드 가비지, marker 잔류, 선두 환각 prefix) 만
  //   bad 로 남깁니다.

  // B4. 가격이 살아있는 유료 상품(> 0 원) 인데 한글 비율이 너무 낮음.
  //   cancel/refund 는 0원이어도 정상(취소 완료 상태), 사은품 0원도 delivered 유효 → price>0 조건을
  //   따로 둡니다. 30% 임계는 샘플 기반으로 Tier 0/2 가 ≥ 50% 에 분포하고 bad 는 < 20% 에 몰려 있어
  //   중간 지점 30% 로 잡았습니다. 확장 시 튜닝 여지 있음.
  if (price > 0 && nonSpaceLen >= 6 && hangulRatio < 0.3) {
    badReasons.push(`한글 비율 낮음 (${(hangulRatio * 100).toFixed(0)}%)`);
  }

  if (badReasons.length > 0) {
    return { tier: "bad", reasons: badReasons };
  }

  // --- Tier 0 조건 (AND 전부 만족해야 clean) ---

  // Tier 0 "clean" 요건.
  //   - 이름 길이 ≥ 10 && 한글 ≥ 4 → 사람이 대충 알아볼 수 있는 수준
  //   - price > 0 OR 취소/환불 (priceOcrFailed 는 이미 위에서 bad 처리됐음)
  //   - 자모 잔류 < 2 개
  //
  // ※ 2026-04-24: 이전에 borderline 이었던 약한 신호(짧은 이름, 자모 1 개 등) 는 사용자에게
  //   배지를 띄워 신뢰도를 떨어뜨리기보다 "그대로 저장" 쪽이 UX 상 낫다는 피드백을 반영해
  //   borderline 기준을 강하게 조였습니다. 실제 UI 에서 borderline 배지는 노출 안 함.
  const cleanChecks: string[] = [];
  if (nameLen < 10) cleanChecks.push(`이름 짧음 (${nameLen})`);
  if (hangulCount < 4) cleanChecks.push(`한글 < 4 (${hangulCount})`);
  if (price <= 0 && !isCancelLike) {
    cleanChecks.push("price 0 인데 취소/환불 아님");
  }
  if (jamoCount >= 2) cleanChecks.push(`자모 ${jamoCount}개 잔류`);

  if (cleanChecks.length === 0) {
    return { tier: "clean", reasons: [] };
  }

  return { tier: "borderline", reasons: cleanChecks };
}

/** 재분류 시 "bad" 인 제품만 필터링하는 헬퍼 — AI 자동 호출 대상. */
export function pickBadProducts<T extends {
  name: string | null | undefined;
  price: number;
  date?: string;
  quantity?: number;
  priceOcrFailed?: boolean;
  aiApplied?: boolean;
}>(
  products: T[],
  statusTag?: "purchase" | "sub" | "cancel" | "refund",
): T[] {
  // G1 (2026-04-25). 모바일 목록형 OCR 에서 공백이 대거 사라진 이미지들은 카드 하나씩 보면
  //   "그럴듯한 한글 문자열" 이어서 gate 를 빠져나가지만, 이미지 전체로 보면 2개 이상 카드가
  //   `유한양행엘레나여성질유산균이너프`, `원더풀피스타치오껄없는피스타치` 처럼 과하게
  //   붙은 상태로 읽히는 패턴이 반복됩니다. 3장 이상 카드 중 **공백 없는 긴 한글 카드가 2장 이상**
  //   보이면 이미지 단위 OCR 압축으로 보고 전체를 AI 대상으로 올립니다.
  //   안전: 웹 카드처럼 보통 띄어쓰기가 어느 정도 살아있는 경우엔 미매치하고, 모바일 실측에서는
  //   gate silent 누락(005)을 안정적으로 끌어올립니다.
  const compressedNoSpaceCards = products.filter((p) => {
    const name = (p.name ?? "").trim();
    const hasSpace = /\s/.test(name);
    const hangulCount = countMatches(name, HANGUL_SYLLABLE_REGEX);
    return !hasSpace && hangulCount >= 12;
  });
  if (products.length >= 3 && compressedNoSpaceCards.length >= 2) {
    return products.filter((p) => !p.aiApplied);
  }

  return products.filter((p) => {
    if (p.aiApplied) return false; // 이미 AI 가 손댄 건 재시도 X
    return classifyOcrCardQuality({ ...p, statusTag }).tier === "bad";
  });
}

