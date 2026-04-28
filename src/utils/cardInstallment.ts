import type { TxRow } from "../pages/Transactions/components/TransactionTable";
import type { CsvRow } from "./csvParse";

type CardImport = NonNullable<NonNullable<TxRow["detail"]>["cardImport"]>;

export type CardInstallmentKind =
  | "lump_sum"
  | "installment_approval"
  | "installment_billing"
  | "unknown";

/**
 * 한국 신용카드 할부 정책상 최소 결제 금액(5만원). 이 금액 미만은 가맹점에서
 * 할부 결제를 제공하지 않으므로(여신금융협회 공시·토스페이먼츠 문서 기준), CSV 의
 * recordKind/paymentMode 가 installment 로 잘못 분류돼 들어와도 표시·합산 단계에서
 * 안전하게 일시불로 폴백시킵니다.
 *
 * 회귀 배경(2026-04-28): inferCardRecordKind 가 "할부 회차" 헤더 검출 false positive
 * 로 5만원 미만 일시불 행에 installment 분류를 박아넣는 케이스가 있었음.
 */
export const INSTALLMENT_MINIMUM_AMOUNT = 50_000;

function hasFilledHeader(row: CsvRow, headers: readonly string[]): boolean {
  const keys = Object.keys(row);
  return headers.some((header) =>
    keys.some((key) => {
      if (!key.includes(header)) return false;
      const value = String(row[key] ?? "").trim();
      return value !== "" && value !== "-" && value !== "--";
    }),
  );
}

export function inferCardRecordKind(input: {
  raw: CsvRow;
  amount: number | null;
  billedAmount: number | null;
  cycle: { current: number; total: number } | null;
  remainingBalance: number | null;
  paymentMode: "lump_sum" | "installment" | "unknown";
  installmentCycleHeaders: readonly string[];
  remainingBalanceHeaders: readonly string[];
  billingAmountHeaders: readonly string[];
}): "approval" | "billing" {
  if (input.cycle) return "billing";
  if (input.remainingBalance !== null && input.paymentMode === "installment") return "billing";
  if (hasFilledHeader(input.raw, input.installmentCycleHeaders)) return "billing";
  if (
    input.paymentMode === "installment" &&
    hasFilledHeader(input.raw, input.remainingBalanceHeaders)
  ) {
    return "billing";
  }
  if (
    input.paymentMode === "installment" &&
    hasFilledHeader(input.raw, input.billingAmountHeaders) &&
    input.billedAmount !== null &&
    input.amount !== null &&
    input.billedAmount > 0 &&
    input.billedAmount !== input.amount
  ) {
    return "billing";
  }
  return "approval";
}

/**
 * 결제 방식 분류. amount 가 함께 들어오면 5만원 미만일 때 자동으로 lump_sum 폴백.
 *
 * @param amount 거래 금액(부호 무관). 안 넘기면 임계 검사 없이 cardImport 기준으로만 판단.
 */
export function getCardInstallmentKind(
  cardImport?: CardImport | null,
  amount?: number,
): CardInstallmentKind {
  if (!cardImport) return "unknown";
  // 회귀 방지(2026-04-28): inferCardRecordKind 가 "할부 회차/잔금" 헤더에 잡스러운
  // 값(예: "0", 빈 문자열 변형) 이 있으면 lump_sum 인 행까지 recordKind="billing" 으로
  // 분류해 버리는 false positive 가 있었습니다. 표시 단계에서는 paymentMode 가 실제로
  // installment 일 때만 billing 으로 인정해, 일시불·미지정 행이 "할부 청구" 태그로 보이는
  // 회귀를 차단합니다(import 단계의 recordKind 자체는 audit 용으로 그대로 유지).
  let kind: CardInstallmentKind;
  if (
    cardImport.recordKind === "billing" &&
    cardImport.paymentMode === "installment"
  ) {
    kind = "installment_billing";
  } else if (cardImport.paymentMode === "installment") {
    kind = "installment_approval";
  } else if (cardImport.paymentMode === "lump_sum") {
    kind = "lump_sum";
  } else {
    kind = "unknown";
  }

  // 5만원 미만은 할부 불가(한국 카드사 정책) → 일시불로 폴백.
  if (
    typeof amount === "number" &&
    Math.abs(amount) < INSTALLMENT_MINIMUM_AMOUNT &&
    (kind === "installment_approval" || kind === "installment_billing")
  ) {
    return "lump_sum";
  }
  return kind;
}

/**
 * 결제 방식 라벨. 회차(installmentCurrentCycle/installmentCycleTotal) 와 개월수
 * (installmentMonths) 는 카드사마다 캡처율이 들쭉날쭉해 같은 데이터셋 안에서도 어떤
 * 행은 보이고 어떤 행은 안 보이는 일관성 문제가 큽니다. 그래서 의도적으로 라벨은
 * "할부" 로 통일합니다(사용자 결정, 2026-04-28 재확인).
 *
 * 만약 회차/개월수 표시를 다시 시도한다면, 카드사 CSV 들의 캡처율 통계를 먼저
 * 확인하고 90%+ 가 안 되면 도입 X.
 *
 * 내부 구분(approval vs billing) 은 KPI 합산 로직에서만 사용합니다(분할 추정 여부).
 */
export function getCardInstallmentLabel(
  cardImport?: CardImport | null,
  amount?: number,
): string | null {
  if (!cardImport) return null;
  const kind = getCardInstallmentKind(cardImport, amount);
  if (kind === "installment_billing" || kind === "installment_approval") {
    return "할부";
  }
  if (kind === "lump_sum") {
    return "일시불";
  }
  return null;
}

/**
 * 결제 방식별로 어떤 Tag kind 를 쓸지 매핑.
 *   - 일시불 → "etc"(회색)
 *   - 할부 (승인/청구 둘 다) → "installment"(인디고) — 사용자에게는 한 가지 "할부" 로 통일
 *
 * approval/billing 색 구분은 의도적으로 안 합니다. 회차/개월수 정보 부족으로 시각 분리가
 * 오히려 혼란만 키웠던 회귀 (2026-04-28). 내부 분류는 KPI 합산 로직에서만 사용.
 */
export function getCardInstallmentTagKind(
  cardImport?: CardImport | null,
  amount?: number,
): "etc" | "installment" | null {
  if (!cardImport) return null;
  const kind = getCardInstallmentKind(cardImport, amount);
  if (kind === "lump_sum") return "etc";
  if (kind === "installment_approval" || kind === "installment_billing") {
    return "installment";
  }
  return null;
}

/**
 * 할부 승인 거래의 "월 분할 추정 금액" 을 라벨 문자열로 반환.
 * 거래 행 보조 텍스트("월 분할 추정 ₩100,000") 표시용. 추정 불가 시 null.
 */
export function getInstallmentMonthlyEstimate(
  cardImport?: CardImport | null,
  totalAmount?: number,
): number | null {
  if (!cardImport || typeof totalAmount !== "number") return null;
  // amount-aware kind 가 installment_approval 일 때만 분할 추정. 5만원 미만은
  // 자동으로 lump_sum 폴백되므로 추정 결과가 null 로 떨어집니다.
  if (getCardInstallmentKind(cardImport, totalAmount) !== "installment_approval") {
    return null;
  }
  const months = cardImport.installmentMonths ?? 0;
  if (months <= 0) return null;
  return Math.round(Math.abs(totalAmount) / months);
}

/**
 * 한 줄 추정 메세지. raw 필드(회차/잔금 등) 노출 대신 사용자가 한국어 문장으로 이해할 수 있는
 * 단일 메세지를 만들어 반환합니다. 카드 거래가 아니거나 일시불이면 null.
 *
 * 정책 (2026-04-28 사용자 결정):
 *   - 회차 정보는 데이터 캡처가 들쭉날쭉해 raw 필드로 노출하지 않습니다.
 *   - 대신 우리가 가진 정보로 한 문장 추정을 만들어 "추정" 임을 명시.
 *   - 카드사가 잘못 분류한 5만원 미만 할부는 일시불로 폴백되어 메세지 없음.
 */
export function getInstallmentInferredMessage(
  cardImport?: CardImport | null,
  amount?: number,
): string | null {
  if (!cardImport) return null;
  const kind = getCardInstallmentKind(cardImport, amount);
  if (kind !== "installment_approval" && kind !== "installment_billing") {
    return null;
  }
  const months = cardImport.installmentMonths ?? 0;
  const monthly =
    typeof amount === "number" && months > 0
      ? Math.round(Math.abs(amount) / months)
      : null;

  if (kind === "installment_approval") {
    if (months > 0 && monthly) {
      return `${months}개월 할부 약정으로 추정 · 매월 약 ${monthly.toLocaleString("ko-KR")}원씩 ${months}달간 빠질 예정이에요.`;
    }
    if (months > 0) {
      return `${months}개월 할부 약정으로 추정 · 매월 분할 청구가 예정돼 있어요.`;
    }
    return "할부 약정으로 추정돼요. 카드사가 개월수를 같이 보내지 않아 분할 금액은 계산할 수 없어요.";
  }

  // installment_billing — 회차 raw 노출 대신 "한 회차 청구분" 으로 표현
  const cur = cardImport.installmentCurrentCycle;
  const tot = cardImport.installmentCycleTotal;
  if (cur && tot) {
    return `할부 ${cur}회차 청구로 추정 (총 ${tot}회 중)`;
  }
  if (months > 0) {
    return `${months}개월 할부의 한 회차 청구로 추정돼요.`;
  }
  return "할부 한 회차 청구로 추정돼요.";
}
