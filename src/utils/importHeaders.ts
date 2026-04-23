export const DATE_HEADERS = [
  "이용일",
  "이용일자",
  "거래일",
  "결제일",
  "승인일",
  "승인일자",
  "승인일시",
  "이용일시",
  "date",
] as const;

export const MERCHANT_HEADERS = [
  "가맹점명",
  "가맹점",
  "사용처",
  "merchant",
] as const;

export const AMOUNT_HEADERS = [
  "이용금액",
  "승인금액",
  "금액",
  "결제금액",
  "amount",
] as const;

export const STATUS_HEADERS = [
  "거래구분",
  "거래상태",
  "상태",
] as const;

export const CATEGORY_HEADERS = [
  "카테고리",
  "category",
] as const;

export const HEADER_HINTS = [
  ...DATE_HEADERS,
  ...MERCHANT_HEADERS,
  ...AMOUNT_HEADERS,
  ...STATUS_HEADERS,
] as const;

export function findHeaderRowIndex(rows: string[][]): number {
  const maxPeek = Math.min(rows.length, 10);
  for (let i = 0; i < maxPeek; i += 1) {
    const cells = (rows[i] ?? []).map((cell) => String(cell ?? "").trim());
    const hits = cells.filter((cell) =>
      HEADER_HINTS.some((hint) => cell.includes(hint))
    );
    if (hits.length >= 2) return i;
  }
  return 0;
}
