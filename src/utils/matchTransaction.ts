/**
 * 역할: OCR로 추출한 거래와 이미 저장된 거래(예: CSV에서 들어온 결제내역)를
 *       플랫폼·금액·날짜 기준으로 매칭할 후보를 찾습니다.
 *       자동 병합하지 않고 후보만 반환해, 사용자가 모달에서 선택하도록 설계했습니다.
 * 위치: src\utils\matchTransaction.ts
 */
import type { TxPlatform, TxRow } from "../pages/Transactions/components/TransactionTable";

export interface MatchCriteria {
  platform: TxPlatform;
  amount: number;
  date: string; // "YYYY.MM.DD"
  amountTolerance?: number;
  dateToleranceDays?: number;
}

function parseDate(value: string): number {
  const match = value.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (!match) return Number.NaN;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
}

export function findMatches(rows: TxRow[], criteria: MatchCriteria): TxRow[] {
  const amountTolerance = criteria.amountTolerance ?? 0;
  const dateTolerance = criteria.dateToleranceDays ?? 2;
  const targetTs = parseDate(criteria.date);
  if (!Number.isFinite(targetTs)) return [];

  const targetAmount = Math.abs(criteria.amount);

  return rows
    .filter((row) => {
      if (row.platform !== criteria.platform) return false;
      const diffAmount = Math.abs(Math.abs(row.amount) - targetAmount);
      if (diffAmount > amountTolerance) return false;
      const rowTs = parseDate(row.date);
      if (!Number.isFinite(rowTs)) return false;
      const diffDays = Math.abs(rowTs - targetTs) / (1000 * 60 * 60 * 24);
      return diffDays <= dateTolerance;
    })
    .sort((a, b) => {
      const ad = Math.abs(parseDate(a.date) - targetTs);
      const bd = Math.abs(parseDate(b.date) - targetTs);
      return ad - bd;
    });
}
