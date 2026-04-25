/**
 * 역할: 카드 이용내역(CSV/XLSX)에서 읽은 행 데이터를 SpendTrack TxRow[]로 변환합니다.
 * 위치: src\utils\csvImport.ts
 */
import type {
  TxCategory,
  TxRow,
  TxStatus,
  TxType,
} from "../pages/Transactions/components/TransactionTable";
import {
  AMOUNT_HEADERS,
  CATEGORY_HEADERS,
  DATE_HEADERS,
  MERCHANT_HEADERS,
  STATUS_HEADERS,
} from "./importHeaders";
import { parseCsv, type CsvRow } from "./csvParse";
import { normalizeMerchant } from "./merchantNormalize";

const CATEGORY_MAP: Record<string, TxCategory> = {
  생활용품: "living",
  생활: "living",
  "패션/의류": "fashion",
  패션: "fashion",
  의류: "fashion",
  전자기기: "digital",
  전자: "digital",
  디지털: "digital",
  "식품/음료": "food",
  식품: "food",
  음료: "food",
  // CSV에 "기타"라고 적혀 있거나 카테고리 칸이 비어 있으면 모두 "기타"로 분류합니다.
  기타: "etc",
};

function pickFirstValue(row: CsvRow, headers: readonly string[]): string {
  // 1차: 헤더 이름이 정확히 일치하는 경우.
  for (const header of headers) {
    const value = row[header];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  // 2차: 키에 헤더 힌트가 포함된 경우 (예: "승인금액(원)", "이용일자(승인기준)").
  //       카드사마다 단위·부가 설명이 괄호로 붙어 오는 케이스가 많아 접미사 허용이 필요합니다.
  const keys = Object.keys(row);
  for (const header of headers) {
    const matchedKey = keys.find((key) => key.includes(header));
    if (matchedKey) {
      const value = row[matchedKey];
      if (value !== undefined && value !== null && value !== "") return value;
    }
  }
  return "";
}

function parseAmount(raw: any): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const rawStr = String(raw || "").trim();
  // 숫자, 마이너스 부호, 점(소수점)만 남기고 제거
  const cleaned = rawStr.replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;

  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function normalizeDate(raw: any): string | null {
  const rawStr = String(raw || "").trim();
  // 숫자만 추출 (예: "2026년 4월 20일" -> ["2026", "4", "20"])
  let digits = rawStr.match(/\d+/g);
  if (!digits) return null;

  // YYYYMMDD 포맷(예: "20260526")은 숫자 그룹이 한 덩어리로 잡혀 구분자 없는 8자리가 됩니다.
  // 이 경우 앞 4/2/2로 쪼개 3조각 형태로 맞춰 줍니다.
  if (digits.length === 1 && digits[0].length === 8) {
    const d8 = digits[0];
    digits = [d8.slice(0, 4), d8.slice(4, 6), d8.slice(6, 8)];
  }
  if (digits.length < 3) return null;

  // 카드사에 따라 월, 일이 앞에 오는 경우(MM/DD/YYYY)가 있으나 국내 카드사는 보통 YYYY/MM/DD입니다.
  // 첫 번째 숫자가 4자리면 연도로 간주합니다.
  let year = digits[0];
  let month = digits[1];
  let day = digits[2];

  // 만약 연도가 뒤에 있다면 (예: 23.04.2026) 뒤집어줍니다.
  if (year.length !== 4 && digits[2].length === 4) {
    year = digits[2];
    day = digits[0];
  }

  const y = Number(year);
  const m = Number(month);
  const d = Number(day);

  // 현실적인 날짜 범위 체크
  if (y < 1900 || y > 2100) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;

  return `${year}.${month.padStart(2, "0")}.${day.padStart(2, "0")}`;
}

function inferStatus(statusRaw: string, amount: number): TxStatus {
  if (/취소|거절/.test(statusRaw)) return "cancel";
  if (/환불|반품/.test(statusRaw)) return "refund";
  if (amount < 0) return "refund";
  return "purchase";
}

/**
 * status → (type, 부호)로 변환. 쇼핑 데이터 관점의 규칙:
 * - refund(환불), cancel(취소): 돈이 다시 들어오는 흐름이라 type="income"·양수.
 *   단, 취소는 Home/Analysis의 순수입 집계에서는 status로 따로 걸러 제외합니다(sumIncomeAndRefund 참조).
 * - purchase/sub/etc 등: 돈이 나가는 흐름이라 type="expense"·음수.
 */
function toTxShape(amount: number, status: TxStatus): Pick<TxRow, "amount" | "type" | "status"> {
  if (status === "refund" || status === "cancel") {
    return {
      amount: Math.abs(amount),
      type: "income" as TxType,
      status,
    };
  }

  return {
    amount: -Math.abs(amount),
    type: "expense" as TxType,
    status,
  };
}

export interface CsvImportSkipped {
  index: number;
  reason: string;
  raw: Record<string, string>;
}

export interface CsvImportResult {
  total: number;
  imported: TxRow[];
  skipped: CsvImportSkipped[];
}

export function importRows(parsed: CsvRow[]): CsvImportResult {
  const imported: TxRow[] = [];
  const skipped: CsvImportSkipped[] = [];
  const now = Date.now();

  parsed.forEach((raw, index) => {
    const dateRaw = pickFirstValue(raw, DATE_HEADERS);
    const merchantRaw = pickFirstValue(raw, MERCHANT_HEADERS);
    const amountRaw = pickFirstValue(raw, AMOUNT_HEADERS);
    const categoryRaw = pickFirstValue(raw, CATEGORY_HEADERS);
    const statusRaw = pickFirstValue(raw, STATUS_HEADERS);

    const date = normalizeDate(dateRaw);
    const amount = parseAmount(amountRaw);
    // 가맹점명이 비면 행을 버리지 않고 "알 수 없음"으로 대체해 import합니다.
    const effectiveMerchantRaw = merchantRaw || "알 수 없음";
    const { platform, cleaned } = normalizeMerchant(effectiveMerchantRaw);

    if (!date) {
      skipped.push({ index, reason: "날짜 형식을 읽을 수 없습니다.", raw });
      return;
    }
    if (amount === null) {
      skipped.push({ index, reason: "금액 형식을 읽을 수 없습니다.", raw });
      return;
    }
    
    const resolvedPlatform = platform ?? "unspecified";
    const category = (CATEGORY_MAP[categoryRaw.trim()] ?? "etc") as TxCategory;
    const status = inferStatus(statusRaw, amount);
    const txShape = toTxShape(amount, status);

    const row: TxRow = {
      id: `csv-${now}-${index}`,
      type: txShape.type,
      date,
      platform: resolvedPlatform,
      categories: [category],
      title: cleaned || effectiveMerchantRaw,
      amount: txShape.amount,
      status: txShape.status,
      source: "csv",
    };

    imported.push(row);
  });

  return { total: parsed.length, imported, skipped };
}

export function importCsv(text: string): CsvImportResult {
  return importRows(parseCsv(text));
}
