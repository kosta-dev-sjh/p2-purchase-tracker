import type { TxRow } from "../pages/Transactions/components/TransactionTable";

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    if (!cleaned) return undefined;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeCardImport(detail: TxRow["detail"]): TxRow["detail"] {
  if (!detail?.cardImport) return detail;

  const raw = detail.cardImport;
  const paymentMode =
    raw.paymentMode === "installment" || raw.paymentMode === "lump_sum"
      ? raw.paymentMode
      : raw.installmentMonths && raw.installmentMonths > 1
        ? "installment"
        : "unknown";

  const installmentCurrentCycle = normalizeNumber(raw.installmentCurrentCycle);
  const installmentCycleTotal = normalizeNumber(raw.installmentCycleTotal);
  const approvedAmount = normalizeNumber(raw.approvedAmount);
  const billedAmount = normalizeNumber(raw.billedAmount);
  const remainingBalance = normalizeNumber(raw.remainingBalance);
  const installmentMonths = normalizeNumber(raw.installmentMonths);

  const cardImport: NonNullable<TxRow["detail"]>["cardImport"] = {
    recordKind: raw.recordKind === "billing" ? "billing" : "approval",
    paymentMode,
    ...(installmentMonths !== undefined ? { installmentMonths } : {}),
    ...(installmentCurrentCycle !== undefined
      ? { installmentCurrentCycle }
      : {}),
    ...(installmentCycleTotal !== undefined ? { installmentCycleTotal } : {}),
    ...(approvedAmount !== undefined ? { approvedAmount } : {}),
    ...(billedAmount !== undefined ? { billedAmount } : {}),
    ...(remainingBalance !== undefined ? { remainingBalance } : {}),
    ...(normalizeString(raw.approvalNumber)
      ? { approvalNumber: normalizeString(raw.approvalNumber) }
      : {}),
    ...(normalizeString(raw.cardLabel)
      ? { cardLabel: normalizeString(raw.cardLabel) }
      : {}),
    ...(normalizeString(raw.dueDate)
      ? { dueDate: normalizeString(raw.dueDate) }
      : {}),
    ...(normalizeString(raw.sourceSheet)
      ? { sourceSheet: normalizeString(raw.sourceSheet) }
      : {}),
    ...(normalizeString(raw.rawRowFingerprint)
      ? { rawRowFingerprint: normalizeString(raw.rawRowFingerprint) }
      : {}),
  };

  return {
    ...detail,
    cardImport,
  };
}

export function normalizeTransactionRow(row: TxRow): TxRow {
  const detail = normalizeCardImport(row.detail);
  return {
    ...row,
    categories:
      Array.isArray(row.categories) && row.categories.length > 0
        ? row.categories.filter(Boolean)
        : ["etc"],
    ...(detail ? { detail } : {}),
  };
}

export function normalizeTransactionRows(rows: TxRow[]): TxRow[] {
  return rows.map(normalizeTransactionRow);
}
