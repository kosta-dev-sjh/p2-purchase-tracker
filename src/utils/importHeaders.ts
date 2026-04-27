// 소비 추적 관점에서는 "결제일(카드대금 청구일)"보다 "승인일/이용일(실제 지출이 일어난 시각)"이
// 더 정확합니다. 둘 다 존재하는 카드사 양식이 많으므로 결제일은 fallback으로 뒤에 둡니다.
export const DATE_HEADERS = [
  "이용일자",
  "이용일",
  "이용일시",
  "거래일",
  "거래일자",
  "승인일",
  "승인일자",
  "승인일시",
  "결제일",
  "date",
] as const;

export const MERCHANT_HEADERS = [
  "이용가맹점명",
  "이용가맹점",
  "가맹점명",
  "가맹점",
  "사용처",
  "merchant",
] as const;

export const AMOUNT_HEADERS = [
  "승인금액",
  "국내이용금액",
  "해외이용금액",
  // BC카드: 병합셀 2행 헤더 처리 후 서브헤더 "결제금액"이 실제 컬럼명으로 매핑됩니다.
  "결제금액",
  // 단일 헤더 행에서 "청구금액"이 직접 노출되는 카드사 포맷 폴백.
  "청구금액",
  "이용금액",
  "금액",
  "합계",
  "amount",
] as const;

export const PAYMENT_MODE_HEADERS = [
  "일시불할부구분",
  "일시불/할부",
  "이용구분",
  "할부구분",
  "결제구분",
] as const;

export const INSTALLMENT_MONTHS_HEADERS = [
  "할부개월",
  "할부 개월",
  "할부기간",
] as const;

export const INSTALLMENT_CYCLE_HEADERS = [
  "할부회차",
  "회차",
  "분할회차",
] as const;

export const BILLING_AMOUNT_HEADERS = [
  "결제금액",
  "청구금액",
  "월청구금액",
] as const;

export const APPROVAL_NUMBER_HEADERS = [
  "승인번호",
  "승인No",
  "approval",
] as const;

export const CARD_LABEL_HEADERS = [
  "카드명",
  "카드명(카드뒤4자리)",
  "카드별명",
  "이용카드",
  "카드번호",
] as const;

export const PAYMENT_DUE_DATE_HEADERS = [
  "결제예정일자",
  "결제예정일",
  "결제일",
  "청구일",
] as const;

export const REMAINING_BALANCE_HEADERS = [
  "결제 후잔액",
  "결제 후 잔액",
  "잔액",
] as const;

export const CANCELLATION_HEADERS = [
  "취소여부",
  "정상취소 구분",
  "정상∙취소 구분",
  "정상/취소 구분",
] as const;

export const STATUS_HEADERS = [
  "거래구분",
  "거래상태",
  "매입상태",
  "상태",
] as const;

export const CATEGORY_HEADERS = [
  "카테고리",
  "업종",
  "category",
] as const;

export const HEADER_HINTS = [
  ...DATE_HEADERS,
  ...MERCHANT_HEADERS,
  ...AMOUNT_HEADERS,
  ...PAYMENT_MODE_HEADERS,
  ...INSTALLMENT_MONTHS_HEADERS,
  ...INSTALLMENT_CYCLE_HEADERS,
  ...BILLING_AMOUNT_HEADERS,
  ...APPROVAL_NUMBER_HEADERS,
  ...STATUS_HEADERS,
] as const;

/**
 * 데이터의 시작점(헤더 행)을 찾습니다.
 * 카드사 파일은 상단에 안내 문구가 많으므로, 주요 키워드가 2개 이상 발견되는 행을 헤더로 간주합니다.
 */
export function findHeaderRowIndex(rows: string[][]): number {
  // 농협카드 등 상단 안내가 긴 경우를 대비해 탐색 범위를 20행으로 확대합니다.
  const maxPeek = Math.min(rows.length, 20);
  for (let i = 0; i < maxPeek; i += 1) {
    const cells = (rows[i] ?? []).map((cell) => String(cell ?? "").trim());
    const hits = cells.filter((cell) =>
      HEADER_HINTS.some((hint) => cell.includes(hint))
    );
    // 날짜, 가맹점, 금액 중 최소 2개 이상이 매칭되면 헤더 행으로 판단합니다.
    if (hits.length >= 2) return i;
  }
  return 0;
}
