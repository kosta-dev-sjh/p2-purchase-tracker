/**
 * 역할: 여러 화면이 함께 참조하는 상수 데이터를 정의합니다.
 * 위치: src\constants\labels.ts
 */
export const PLATFORM_LABELS = {
  coupang: "쿠팡",
  naver: "네이버쇼핑",
  // 플랫폼을 지정하지 않았거나 오프라인 결제처럼 플랫폼이 없는 거래의 라벨입니다.
  // 입력 폼의 "미지정" 선택지와 동일한 텍스트를 써서 사용자 멘탈 모델을 일치시킵니다.
  unspecified: "미지정",
} as const;

/**
 * 입력 폼(드롭다운)에 노출되는 사용자 선택 가능한 플랫폼 옵션 목록.
 * "미지정"(unspecified)을 맨 앞에 두어, 플랫폼을 고르지 않고 넘어가는 흐름이
 * 가장 부담 없이 보이도록 합니다.
 */
export const PLATFORM_OPTIONS = [
  { key: "unspecified", label: "미지정" },
  { key: "coupang", label: "쿠팡" },
  { key: "naver", label: "네이버쇼핑" },
] as const;

export const STATUS_LABELS = {
  purchase: "구매",
  cancel: "취소",
  refund: "환불",
  sub: "정기결제",
  // "기타"는 지출·수입 어느 쪽에도 넣을 수 있는 폴백 상태로, 정해진 라벨(구매/환불 등)에
  // 깔끔히 들어맞지 않는 거래를 위한 탈출구입니다.
  etc: "기타",
} as const;

export const TYPE_LABELS = {
  expense: "지출",
  income: "수입",
} as const;

export const SOURCE_LABELS = {
  // 사용자 피드백: "OCR" 이라는 약어가 직관적이지 않다는 피드백을 받아, 화면에 노출되는 모든 곳에서
  // "주문 캡처" 라는 표현으로 통일합니다. 내부 코드 식별자(detail.source: "OCR")는 그대로 유지되어
  // 기존 저장된 거래 데이터·라우트와 호환됩니다(2026-04-28).
  OCR: "주문 캡처",
  MANUAL: "수동 입력",
} as const;

export const CATEGORY_LABELS = {
  living: "생활용품",
  fashion: "패션/의류",
  digital: "전자기기",
  food: "식품/음료",
  // "기타"는 사용자가 카테고리를 지정하지 않았을 때 자동으로 적용되는 폴백 카테고리입니다.
  // 어떤 경로(수동 입력, CSV 업로드, OCR 저장)를 타더라도 미지정이면 이 값으로 수렴됩니다.
  etc: "기타",
} as const;

/**
 * 카테고리를 지정하지 않은 거래에 자동으로 붙는 기본값 키입니다.
 * TxCategory와 타입이 같도록 const assertion으로 좁혀둡니다.
 */
export const DEFAULT_CATEGORY_KEY = "etc" as const;

/**
 * 표준 카테고리의 표시 순서. 모든 화면(설정·카테고리 목록, 수동입력 칩, 내역 필터)이 이 순서를
 * 공유해 페이지마다 정렬이 다르던 일관성 이슈(QA #26)를 해소합니다.
 *
 * 정책: 일상 빈도가 높은 순으로 living → fashion → digital → food, 마지막에 폴백 etc. 커스텀
 * 카테고리는 이 표 뒤에 사용자가 추가한 순으로 이어 붙입니다.
 */
export const STANDARD_CATEGORY_ORDER = [
  "living",
  "fashion",
  "digital",
  "food",
  "etc",
] as const;

/**
 * categoryEntries(또는 동등한 {id, name}[])를 STANDARD_CATEGORY_ORDER에 맞춰 안정적으로 정렬합니다.
 * 표준 키는 위 표 순서로, 그 외(custom_*)는 입력된 순서를 그대로 유지해 사용자 정의 순서가 뒤섞이지 않습니다.
 */
export function sortCategoriesByStandard<T extends { id: string }>(items: ReadonlyArray<T>): T[] {
  const standardIndex = new Map<string, number>(
    STANDARD_CATEGORY_ORDER.map((key, idx) => [key, idx])
  );
  const standard: T[] = [];
  const custom: T[] = [];
  for (const item of items) {
    if (standardIndex.has(item.id)) standard.push(item);
    else custom.push(item);
  }
  standard.sort(
    (a, b) =>
      (standardIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (standardIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER)
  );
  return [...standard, ...custom];
}

/**
 * 한 거래(영수증)가 가질 수 있는 카테고리 최대 개수.
 * - 대부분의 거래는 1개로 충분하지만 대형몰(이마트·쿠팡 종합)처럼 2~3개가 자연스러운 케이스가 있어 3으로 열어둡니다.
 * - 4개 이상은 실질적으로 "여러 상품의 묶음 영수증"이라 UI/분석을 위해서는 상품(items) 단위로 쪼개는 편이 맞고,
 *   그래서 이 값을 넘기지 못하도록 수동 입력/OCR 편집 UI에서 체크박스를 비활성화합니다.
 */
export const MAX_CATEGORIES_PER_TX = 3;
