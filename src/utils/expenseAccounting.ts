/**
 * 역할: "한 달의 실제 빠지는 돈" 을 계산하는 단일 진실원.
 *       거래 데이터(TxRow.amount) 자체는 절대 수정하지 않고, KPI/도넛/트렌드 등
 *       월별 합산이 필요한 모든 곳이 이 모듈을 거쳐서 합산하도록 일원화합니다.
 * 위치: src\utils\expenseAccounting.ts
 *
 * 배경: 이전에는 각 페이지(Home/Analysis/Transactions) 의 `sumSpend` 가 모두
 *       `Math.abs(row.amount)` 를 그대로 더해서, 60만원짜리 6개월 할부 승인이
 *       총 지출 KPI 에 60만원으로 들어가던 부풀림 문제가 있었습니다. 본 모듈은
 *       할부 승인 거래의 경우 amount ÷ installmentMonths 로 그 달의 분할분만
 *       기여하도록 추정합니다(원본 거래 amount 는 보존).
 *
 * 정책:
 *   - 일시불 / non-card           → amount 그대로
 *   - 할부 승인(approval)          → amount ÷ installmentMonths
 *                                    (installmentMonths 가 없거나 0 이면 fallback 으로 amount)
 *   - 할부 청구(billing)           → amount 그대로 (이미 그 달 청구액이라 분할 불필요)
 *   - 환불/취소(cancel)            → 호출부 필터에서 제외 (기존 정책 유지)
 *
 * Phase 4 예정: 같은 결제의 approval 행과 billing 행이 동시에 있으면 approval 을
 * 합산에서 제외하는 페어 매칭(이중 카운트 방지). 현재는 둘 다 들어와도 그대로 합산되므로
 * import 단계에서 두 종류가 섞이지 않도록 주의해야 합니다.
 */
import type { TxRow } from "../pages/Transactions/components/TransactionTable";
import { getCardInstallmentKind } from "./cardInstallment";

/**
 * 한 거래 행이 "그 달의 실제 빠지는 돈" 으로 얼마나 기여하는지 계산.
 * 부호는 항상 양수(절대값) 로 반환. 부호 처리는 호출부의 type/status 필터에 맡깁니다.
 */
export function effectiveMonthlyAmount(row: TxRow): number {
  const amount = Math.abs(row.amount);
  const cardImport = row.detail?.cardImport;
  if (!cardImport) return amount;

  // amount 를 같이 넘겨 5만원 미만 자동 일시불 폴백을 적용. 5만원 미만 거래는
  // 한국 카드사 정책상 할부 불가이므로 분할 추정 자체가 무의미.
  const kind = getCardInstallmentKind(cardImport, row.amount);
  if (kind === "installment_approval") {
    const months = cardImport.installmentMonths ?? 0;
    if (months > 0) {
      // Math.round 로 1원 단위 잡음 정도는 흡수합니다. 회차 합계가 원본과 ±몇 원 차이 날 수
      // 있지만, 합계 KPI 에서는 시각적으로 의미 없는 오차이므로 허용.
      return Math.round(amount / months);
    }
    // 할부인데 개월수 정보가 없으면 분할 추정 불가 — 보수적으로 amount 그대로 합산.
    return amount;
  }
  // installment_billing, lump_sum, unknown 모두 그대로
  return amount;
}

/**
 * 한 행이 "할부 승인 분할 추정" 으로 합산됐는지 여부.
 * KPI 보조 라인("할부 분할 추정 ₩X 포함")에서 식별용으로 사용.
 */
export function isInstallmentApprovalEstimate(row: TxRow): boolean {
  const cardImport = row.detail?.cardImport;
  if (!cardImport) return false;
  return (
    getCardInstallmentKind(cardImport, row.amount) === "installment_approval" &&
    (cardImport.installmentMonths ?? 0) > 0
  );
}

/**
 * 같은 결제(approvalNumber 기준) 의 approval 행과 billing 행이 함께 들어왔을 때
 * approval 을 합산에서 제외할 row.id 집합을 반환. 이중 카운트 방지.
 *
 * 카드사 CSV 가 "이용내역(approval)" 과 "청구내역(billing)" 을 모두 보내는 경우 같은
 * 구매가 두 행으로 들어옵니다. 두 행 다 effectiveMonthlyAmount 를 통과시키면 같은
 * 분할분(예: 10만원) 이 두 번 합산돼 KPI 가 부풀려져요. billing 행이 더 정확한
 * "그 달 실제 청구액" 이라 우선시하고, 페어 매칭된 approval 은 합산에서 빼냅니다.
 *
 * 매칭 키: cardImport.approvalNumber 가 가장 신뢰. 없으면 매칭 시도 안 함(보수적).
 *
 * @param rows 합산 대상 슬라이스(보통 한 달치). 같은 슬라이스 안에서만 매칭 — 다른 달의
 * billing 으로 다른 달 approval 을 dedup 하면 그 approval 이 속한 달이 undercount 되므로.
 */
export function findApprovalsCoveredByBilling(rows: TxRow[]): Set<string> {
  // 1) 슬라이스 안의 billing 행들이 가진 approvalNumber 수집
  const billingApprovalNumbers = new Set<string>();
  for (const row of rows) {
    if (row.type !== "expense" || row.status === "cancel") continue;
    const ci = row.detail?.cardImport;
    if (!ci || !ci.approvalNumber) continue;
    if (getCardInstallmentKind(ci, row.amount) === "installment_billing") {
      billingApprovalNumbers.add(ci.approvalNumber);
    }
  }

  // 2) 같은 approvalNumber 를 가진 approval 행은 합산 제외
  const skip = new Set<string>();
  if (billingApprovalNumbers.size === 0) return skip;
  for (const row of rows) {
    if (row.type !== "expense" || row.status === "cancel") continue;
    const ci = row.detail?.cardImport;
    if (!ci || !ci.approvalNumber) continue;
    if (
      getCardInstallmentKind(ci, row.amount) === "installment_approval" &&
      billingApprovalNumbers.has(ci.approvalNumber)
    ) {
      skip.add(row.id);
    }
  }
  return skip;
}

/**
 * 월별 실제 지출 합계.
 * - type === "expense" 만, status === "cancel" 제외
 * - 같은 결제의 approval+billing 페어는 dedup (billing 우선)
 * - 각 행마다 effectiveMonthlyAmount 적용
 *
 * Home/Analysis/Transactions 의 기존 `sumSpend` 들을 이 함수로 통일합니다.
 */
export function sumActualMonthlyExpense(rows: TxRow[]): number {
  const skip = findApprovalsCoveredByBilling(rows);
  return rows
    .filter((row) => row.type === "expense" && row.status !== "cancel")
    .filter((row) => !skip.has(row.id))
    .reduce((sum, row) => sum + effectiveMonthlyAmount(row), 0);
}

/**
 * "할부 승인 분할 추정" 으로 합산된 분만 별도 합계.
 * KPI 보조 라인 ("할부 분할 추정 ₩X 포함") 표시용.
 * billing 페어로 dedup 된 approval 은 제외(어차피 합산에 안 들어가므로).
 */
export function sumInstallmentEstimateAmount(rows: TxRow[]): number {
  const skip = findApprovalsCoveredByBilling(rows);
  return rows
    .filter((row) => row.type === "expense" && row.status !== "cancel")
    .filter((row) => !skip.has(row.id))
    .filter(isInstallmentApprovalEstimate)
    .reduce((sum, row) => sum + effectiveMonthlyAmount(row), 0);
}

/**
 * 그 달에 분할 추정으로 합산된 할부 승인 거래의 "원본 총액" 합계.
 * 툴팁/도움말에 "60만원 × 1건 = ÷6개월로 10만원 합산" 같은 설명을 보여줄 때 사용.
 */
export function sumInstallmentApprovalOriginalAmount(rows: TxRow[]): number {
  const skip = findApprovalsCoveredByBilling(rows);
  return rows
    .filter((row) => row.type === "expense" && row.status !== "cancel")
    .filter((row) => !skip.has(row.id))
    .filter(isInstallmentApprovalEstimate)
    .reduce((sum, row) => sum + Math.abs(row.amount), 0);
}

/**
 * 그 달에 분할 추정이 적용된 할부 승인 거래 건수.
 * "할부 N건의 분할분 포함" 같은 보조 텍스트에 사용.
 */
export function countInstallmentApprovalEstimates(rows: TxRow[]): number {
  const skip = findApprovalsCoveredByBilling(rows);
  return rows
    .filter((row) => row.type === "expense" && row.status !== "cancel")
    .filter((row) => !skip.has(row.id))
    .filter(isInstallmentApprovalEstimate).length;
}
