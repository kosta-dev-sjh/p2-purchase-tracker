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
import { normalizeMerchantKey } from "./categoryInference";

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

/** "YYYY.MM.DD" / "YYYY-MM-DD" / "YYYY/MM/DD" → 타임스탬프(ms). 매칭 못 하면 null. */
function dateMs(s: string): number | null {
  const m = s.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

/** 가맹점명 정규화. 이미 cardImport.originalMerchant 가 있으면 그쪽 우선. */
function merchantKeyOf(row: TxRow): string {
  const raw = row.detail?.cardImport?.originalMerchant ?? row.title;
  return normalizeMerchantKey(raw) || row.title;
}

/**
 * approval 행과 billing 행을 패턴 매칭으로 연결할 수 있는지 판정.
 * 카드사 CSV 가 approvalNumber 를 안 주거나 두 종류의 데이터를 따로 import 한 경우라도
 * 다음 세 조건을 모두 만족하면 같은 결제로 봅니다:
 *   1) 같은 가맹점(normalize 후 일치)
 *   2) billing.amount 가 (approval.amount / installmentMonths) 의 ±25% 안 (이자 여유)
 *   3) billing.date 가 approval.date 이후 (installmentMonths + 1) 개월 윈도우 내
 * false positive 차단을 위해 셋 다 동시에 만족해야 합니다.
 */
function isPatternMatch(approval: TxRow, billing: TxRow): boolean {
  const aci = approval.detail?.cardImport;
  if (!aci) return false;
  const months = aci.installmentMonths ?? 0;
  if (months <= 1) return false;
  const aAmount = Math.abs(approval.amount);
  if (aAmount <= 0) return false;
  const expectedMonthly = aAmount / months;
  const minM = expectedMonthly * 0.75;
  const maxM = expectedMonthly * 1.25;
  const bAmount = Math.abs(billing.amount);
  if (bAmount < minM || bAmount > maxM) return false;
  const aMs = dateMs(approval.date);
  const bMs = dateMs(billing.date);
  if (aMs === null || bMs === null) return false;
  if (bMs < aMs) return false;
  // 한 회차당 ~31일이라 (months + 1) 개월까지 허용 — 첫 청구가 다음 달부터 시작하기도.
  const cutoffMs = aMs + (months + 1) * 31 * 24 * 60 * 60 * 1000;
  if (bMs > cutoffMs) return false;
  return merchantKeyOf(approval) === merchantKeyOf(billing);
}

/**
 * 같은 결제의 approval 행과 billing 행이 함께 들어왔을 때 approval 을 합산에서 제외할
 * row.id 집합을 반환. 이중 카운트 방지.
 *
 * Phase 5B (2026-04-28): 매칭 정책 두 가지로 확장:
 *   1) cardImport.approvalNumber 가 같으면 즉시 매칭 (Phase 4 와 동일)
 *   2) approvalNumber 가 없거나 다르면 패턴 매칭(가맹점 + 금액 + 날짜 윈도우)
 *
 * 또한 cross-month 매칭을 위해 `allRows` 를 같이 받습니다. 슬라이스 안에 approval 만
 * 있고 billing 이 다른 달에 있으면, allRows 의 billing 풀에서 패턴 매칭을 시도해
 * 그 approval 도 dedup 합니다(없으면 KPI 가 그 approval 의 분할 추정 + 다른 달 실제
 * billing 합으로 이중 카운트되는 회귀 발생).
 *
 * @param rows      합산 대상 슬라이스(보통 한 달치)
 * @param allRows   매칭에 쓸 전체 row 풀. 미지정이면 rows 만 사용(이전 Phase 4 동작).
 */
export function findApprovalsCoveredByBilling(
  rows: TxRow[],
  allRows?: TxRow[],
): Set<string> {
  const matchPool = allRows ?? rows;

  // 매칭 풀 안의 billing 행 수집(전체).
  const billingPool: TxRow[] = [];
  const billingApprovalNumbers = new Set<string>();
  for (const row of matchPool) {
    if (row.type !== "expense" || row.status === "cancel") continue;
    const ci = row.detail?.cardImport;
    if (!ci) continue;
    if (getCardInstallmentKind(ci, row.amount) === "installment_billing") {
      billingPool.push(row);
      if (ci.approvalNumber) billingApprovalNumbers.add(ci.approvalNumber);
    }
  }

  const skip = new Set<string>();
  if (billingPool.length === 0) return skip;

  // 슬라이스 안의 approval 만 검사 — 다른 달의 approval 은 그 달 KPI 의 책임이라
  // 여기 슬라이스에 영향 없음. (allRows 로 검사하면 cross-month dedup 도 가능하지만
  // 호출부가 슬라이스에 있는 행만 합산하므로 굳이 필요 없음.)
  for (const row of rows) {
    if (row.type !== "expense" || row.status === "cancel") continue;
    const ci = row.detail?.cardImport;
    if (!ci) continue;
    if (getCardInstallmentKind(ci, row.amount) !== "installment_approval") {
      continue;
    }
    // 1) approvalNumber 매칭
    if (ci.approvalNumber && billingApprovalNumbers.has(ci.approvalNumber)) {
      skip.add(row.id);
      continue;
    }
    // 2) 패턴 매칭
    const matched = billingPool.some((b) => isPatternMatch(row, b));
    if (matched) skip.add(row.id);
  }
  return skip;
}

/**
 * 한 approval 행에 패턴 매칭으로 연결된 billing 행 목록 반환.
 * UI 에서 "월 추정" 을 "실제 청구 평균(이자 포함)" 으로 자동 갱신할 때 사용.
 */
export function findBillingsLinkedToApproval(
  approval: TxRow,
  allRows: TxRow[],
): TxRow[] {
  const aci = approval.detail?.cardImport;
  if (!aci) return [];
  if (getCardInstallmentKind(aci, approval.amount) !== "installment_approval") {
    return [];
  }
  const matched: TxRow[] = [];
  for (const row of allRows) {
    if (row.id === approval.id) continue;
    if (row.type !== "expense" || row.status === "cancel") continue;
    const ci = row.detail?.cardImport;
    if (!ci) continue;
    if (getCardInstallmentKind(ci, row.amount) !== "installment_billing") {
      continue;
    }
    if (
      aci.approvalNumber &&
      ci.approvalNumber &&
      aci.approvalNumber === ci.approvalNumber
    ) {
      matched.push(row);
    } else if (isPatternMatch(approval, row)) {
      matched.push(row);
    }
  }
  return matched;
}

/**
 * 한 billing 행이 가리키는 원본 approval 행을 찾아 반환. (역방향 매칭)
 * UI 의 "원 승인 거래로 이동 ↗" 화살표 버튼이 어디로 점프할지 결정할 때 사용.
 *
 * 매칭 규칙은 findBillingsLinkedToApproval 과 대칭:
 *   1) approvalNumber 가 같은 approval (정확)
 *   2) 패턴 매칭(가맹점 + 금액 + 날짜 윈도우)
 * 둘 다 못 찾으면 null.
 */
export function findApprovalLinkedToBilling(
  billing: TxRow,
  allRows: TxRow[],
): TxRow | null {
  const bci = billing.detail?.cardImport;
  if (!bci) return null;
  if (getCardInstallmentKind(bci, billing.amount) !== "installment_billing") {
    return null;
  }
  // 같은 approvalNumber 의 approval 우선
  if (bci.approvalNumber) {
    for (const row of allRows) {
      if (row.id === billing.id) continue;
      if (row.type !== "expense" || row.status === "cancel") continue;
      const ci = row.detail?.cardImport;
      if (!ci) continue;
      if (getCardInstallmentKind(ci, row.amount) !== "installment_approval") {
        continue;
      }
      if (ci.approvalNumber === bci.approvalNumber) return row;
    }
  }
  // 패턴 매칭 — 같은 가맹점 + 날짜 역방향 윈도우(billing 이전의 approval) + 금액 ±25%
  for (const row of allRows) {
    if (row.id === billing.id) continue;
    if (row.type !== "expense" || row.status === "cancel") continue;
    const ci = row.detail?.cardImport;
    if (!ci) continue;
    if (getCardInstallmentKind(ci, row.amount) !== "installment_approval") {
      continue;
    }
    if (isPatternMatch(row, billing)) return row;
  }
  return null;
}

/**
 * 월별 실제 지출 합계.
 * - type === "expense" 만, status === "cancel" 제외
 * - 같은 결제의 approval+billing 페어는 dedup (billing 우선, cross-month 패턴 매칭 포함)
 * - 각 행마다 effectiveMonthlyAmount 적용
 *
 * @param rows    합산할 슬라이스(예: 한 달치)
 * @param allRows 페어 매칭용 전체 풀. 미지정이면 rows 만 사용(같은 슬라이스 안에서만 dedup).
 *                다른 달의 billing 으로 이 달의 approval 을 dedup 하려면 반드시 전체 rows 전달.
 *
 * Home/Analysis/Transactions 의 기존 `sumSpend` 들을 이 함수로 통일합니다.
 */
export function sumActualMonthlyExpense(
  rows: TxRow[],
  allRows?: TxRow[],
): number {
  const skip = findApprovalsCoveredByBilling(rows, allRows);
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
export function sumInstallmentEstimateAmount(
  rows: TxRow[],
  allRows?: TxRow[],
): number {
  const skip = findApprovalsCoveredByBilling(rows, allRows);
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
export function sumInstallmentApprovalOriginalAmount(
  rows: TxRow[],
  allRows?: TxRow[],
): number {
  const skip = findApprovalsCoveredByBilling(rows, allRows);
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
export function countInstallmentApprovalEstimates(
  rows: TxRow[],
  allRows?: TxRow[],
): number {
  const skip = findApprovalsCoveredByBilling(rows, allRows);
  return rows
    .filter((row) => row.type === "expense" && row.status !== "cancel")
    .filter((row) => !skip.has(row.id))
    .filter(isInstallmentApprovalEstimate).length;
}
