import type { TxRow } from "../pages/Transactions/components/TransactionTable";
import type { CsvRow } from "./csvParse";

type CardImport = NonNullable<NonNullable<TxRow["detail"]>["cardImport"]>;

export type CardInstallmentKind =
  | "lump_sum"
  | "installment_approval"
  | "installment_billing"
  | "unknown";

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

export function getCardInstallmentKind(
  cardImport?: CardImport | null,
): CardInstallmentKind {
  if (!cardImport) return "unknown";
  if (cardImport.recordKind === "billing") return "installment_billing";
  if (cardImport.paymentMode === "installment") return "installment_approval";
  if (cardImport.paymentMode === "lump_sum") return "lump_sum";
  return "unknown";
}

export function getCardInstallmentLabel(
  cardImport?: CardImport | null,
): string | null {
  if (!cardImport) return null;
  const kind = getCardInstallmentKind(cardImport);
  if (kind === "installment_billing") {
    return "할부";
  }
  if (kind === "installment_approval") {
    return "할부";
  }
  if (kind === "lump_sum") {
    return "일시불";
  }
  return null;
}
