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
 *   - 3+ 연속 자모: ㅋㅋㅋ 같은 합법 패턴 제외를 위해 `ㅋ` 은 반복 허용하되 일반 자모는 2+ 만 있어도
 *     OCR 파편으로 간주 (별도 카운트에서 처리).
 */
const NAME_HARD_GARBAGE_CHARS_REGEX = /】【|__|\\/;

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
    badReasons.push("하드 가비지 문자(】【, __, \\)");
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
