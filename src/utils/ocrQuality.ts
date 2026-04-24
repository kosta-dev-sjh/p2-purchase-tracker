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

import type { OcrProduct, OcrOrder, OcrImageItem } from "../pages/OcrEdit/data";

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
const PREFIX_OCR_NOISE_REGEX = /^([가-힣]{1,3})[.:;'"_·`\[\]\-]+(?=\s|[가-힣])/;

/**
 * 단위 한글 어휘 — 1~2자 한글 청크 카운트에서 제외할 "정상" 단어. OCR 분리 흔적 판정 시
 * 이들이 있으면 신호가 약해지므로 필터링합니다. 상품명에서 수량·사이즈 표시로 자주 쓰임.
 */
const UNIT_SUFFIX_HANGUL = new Set([
  "개", "장", "세트", "종", "병", "통", "팩", "권", "회", "매", "벌",
  "소", "중", "대",
]);

/**
 * 단일 자모(ㄱ-ㅎ·ㅏ-ㅣ, ㆍ)는 정상 상품명에 등장하지 않습니다. 개수를 세어 품질 신호로 사용.
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
  const isCancelLike =
    card.statusTag === "cancel" || card.statusTag === "refund";

  const badReasons: string[] = [];

  // --- Tier 1 조건 (OR 만족 시 즉시 bad) ---

  // B0. Tesseract 가 가격을 아예 못 읽음 — 진짜 0원(사은품/쿠폰) 과 구분해서 무조건 AI 호출.
  if (card.priceOcrFailed) {
    badReasons.push("Tesseract 가 가격 라인 인식 실패");
  }

  // B1. 이름이 비었거나 한글 3 글자 미만 → 사람이 이해 못 함.
  if (nameLen === 0) {
    badReasons.push("이름 비어 있음");
  } else if (hangulCount < 3) {
    badReasons.push(`한글 글자 < 3 (실제 ${hangulCount})`);
  }

  // B2. 화면/버튼/split-marker 잔류.
  for (const g of NAME_HARD_GARBAGE_SUBSTRINGS) {
    if (name.includes(g)) {
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

  // B3c. 공백으로 분리된 1~2자 한글 청크(단위 어휘 제외) 가 3개 이상이면 rejoin 실패 흔적.
  //   예: "및음스모르맥세 이프 솔 리드 라인..." → "이프", "솔", "리드" = 3개.
  //   "코지엔비 곱창머리끈 5 세트" 같은 정상은 단위(세트)를 제외해 카운트 0.
  const shortHangulChunks =
    (name.match(/(?:^|[\s(])([가-힣]{1,2})(?=$|[\s),])/g) ?? [])
      .map((c) => c.replace(/^[\s(]/, "").trim())
      .filter((c) => c.length > 0 && !UNIT_SUFFIX_HANGUL.has(c));
  if (shortHangulChunks.length >= 3) {
    badReasons.push(
      `공백 분리 한글 파편 ${shortHangulChunks.length}개 (rejoin 실패 의심)`,
    );
  }

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
  quantity?: number;
  priceOcrFailed?: boolean;
  aiApplied?: boolean;
}>(
  products: T[],
  statusTag?: "purchase" | "sub" | "cancel" | "refund",
): T[] {
  return products.filter((p) => {
    if (p.aiApplied) return false; // 이미 AI 가 손댄 건 재시도 X
    return classifyOcrCardQuality({ ...p, statusTag }).tier === "bad";
  });
}

/**
 * 주문 하나의 품질 요약. 카드별 tier 를 집계해 "이 주문에 AI 후보가 몇 개 있나" 를 보여줍니다.
 */
export function summarizeOrderQuality(order: OcrOrder) {
  const per = order.products.map((p) =>
    classifyOcrCardQuality({
      name: p.name,
      price: p.price,
      quantity: p.quantity,
      statusTag: order.statusTag,
    }),
  );
  const counts = { clean: 0, borderline: 0, bad: 0 } as Record<OcrCardTier, number>;
  per.forEach((q) => {
    counts[q.tier] += 1;
  });
  return { per, counts, total: per.length };
}

/**
 * 이미지 전체 품질 요약. "이미지를 AI 로 재분석" 배너 트리거 여부를 계산합니다.
 *
 * 기준 (2026-04-24, 실측 기반):
 *   - 카드 중 bad 비율 ≥ 30% 이면 배너 노출.
 *   - 단, 카드가 1 장뿐일 때는 1/1 = 100% 가 되어 민감하게 배너가 뜨므로 최소 카드 수 3 조건 병합.
 */
export function summarizeImageQuality(image: OcrImageItem) {
  const allProducts = image.orders.flatMap((o) =>
    o.products.map((p) => ({ order: o, product: p })),
  );
  const per = allProducts.map(({ order, product }) =>
    classifyOcrCardQuality({
      name: product.name,
      price: product.price,
      quantity: product.quantity,
      statusTag: order.statusTag,
    }),
  );
  const counts = { clean: 0, borderline: 0, bad: 0 } as Record<OcrCardTier, number>;
  per.forEach((q) => counts[q.tier] += 1);
  const total = per.length;
  const badRatio = total > 0 ? counts.bad / total : 0;
  const shouldShowImageBanner = total >= 3 && badRatio >= 0.3;
  return { counts, total, badRatio, shouldShowImageBanner };
}
