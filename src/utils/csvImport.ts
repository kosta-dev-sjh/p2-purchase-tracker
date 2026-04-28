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
  APPROVAL_NUMBER_HEADERS,
  BILLING_AMOUNT_HEADERS,
  CANCELLATION_HEADERS,
  CARD_LABEL_HEADERS,
  CATEGORY_HEADERS,
  DATE_HEADERS,
  INSTALLMENT_CYCLE_HEADERS,
  INSTALLMENT_MONTHS_HEADERS,
  MERCHANT_HEADERS,
  PAYMENT_DUE_DATE_HEADERS,
  PAYMENT_MODE_HEADERS,
  REMAINING_BALANCE_HEADERS,
  STATUS_HEADERS,
} from "./importHeaders";
import { type CsvRow } from "./csvParse";
import { normalizeMerchant } from "./merchantNormalize";
import { inferCardRecordKind } from "./cardInstallment";
import { MAX_IMPORT_ROW_COUNT } from "../constants/inputLimits";

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
  // 가계부 흐름 카테고리(2026-04-28). 카드사가 업종을 이런 키워드로 내려주면 자동 매핑.
  공과금: "utility",
  공공요금: "utility",
  전기요금: "utility",
  가스요금: "utility",
  수도요금: "utility",
  관리비: "maintenance",
  아파트관리비: "maintenance",
  교육: "education",
  교육비: "education",
  학원: "education",
  도서: "education",
  서적: "education",
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

function parseAmount(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const rawStr = String(raw ?? "").trim();
  // 숫자, 마이너스 부호, 점(소수점)만 남기고 제거
  const cleaned = rawStr.replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;

  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function normalizeDate(raw: unknown): string | null {
  const rawStr = String(raw ?? "").trim();
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

  // 미국식 단축 날짜(MM/DD/YY). 현대카드 엑셀처럼 "4/20/26"으로 내려오는 경우를 지원합니다.
  if (
    year.length !== 4 &&
    digits[2].length <= 2 &&
    rawStr.includes("/") &&
    Number(digits[0]) >= 1 &&
    Number(digits[0]) <= 12 &&
    Number(digits[1]) >= 1 &&
    Number(digits[1]) <= 31
  ) {
    year = String(2000 + Number(digits[2]));
    month = digits[0];
    day = digits[1];
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

/**
 * status 추론.
 *
 * 입력은 statusRaw + cancellationRaw 를 합친 한 문자열입니다(현재 호출부 형태 유지).
 * 추가 회귀(2026-04-28): 롯데카드 "취소여부" 컬럼은 명시적 Y/N 토글로 내려옵니다.
 *   취소여부 = "Y" → cancel
 *   취소여부 = "N" → 일반 구매
 * 기존 정규식 `/취소|거절/` 는 한국어 문자열만 매치해 Y/N 을 놓쳤고, 결과적으로
 * 실제 취소된 거래가 일반 구매로 import 되어 합계가 어긋나는 회귀가 있었습니다.
 * 단어 경계로 isolated "Y" 만 잡고, "Yummy" 같이 다른 셀에 우연히 들어간 Y 와는
 * 구분합니다(공백·구분자 양쪽으로 둘러싸인 단독 Y/y).
 */
function inferStatus(statusRaw: string, amount: number): TxStatus {
  if (/취소|거절/.test(statusRaw)) return "cancel";
  if (/(^|\s)[Yy](\s|$)/.test(statusRaw)) return "cancel";
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

type CardPaymentMode = "lump_sum" | "installment" | "unknown";

function parsePositiveInteger(raw: string): number | null {
  const digits = String(raw || "").match(/\d+/g);
  if (!digits || digits.length === 0) return null;
  const value = Number(digits[0]);
  return Number.isFinite(value) ? value : null;
}

function parseInstallmentCycle(raw: string): { current: number; total: number } | null {
  const match = String(raw || "").match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;

  const current = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(current) || !Number.isFinite(total) || current <= 0 || total <= 0) {
    return null;
  }

  return { current, total };
}

function parsePaymentMode(
  raw: string,
  months: number | null,
  cycle: { current: number; total: number } | null,
): CardPaymentMode {
  const normalized = String(raw || "").replace(/\s+/g, "");
  if (/할부/.test(normalized) || (months !== null && months > 1) || cycle) {
    return "installment";
  }
  /*
   * 한국 카드사 CSV 는 할부일 때 "할부"·할부개월·회차 중 하나가 항상 붙습니다.
   * 그 신호가 없으면 일시불로 보는 게 합리적 — 사용자 결정(2026-04-28). 이전엔 모호한
   * 입력이 "unknown" 으로 떨어져 거래 상세에 "미기록" 으로 보여서 혼란을 줬어요.
   */
  return "lump_sum";
}

function looksLikeSummaryRow(raw: CsvRow, merchantRaw: string, dateRaw: string): boolean {
  const joined = Object.values(raw).join(" ");
  if (/총\s*합계|합계|소계|누계|건수합계/.test(joined)) return true;
  if (!Object.keys(raw).some((key) => MERCHANT_HEADERS.some((header) => key.includes(header)))) return true;
  if (String(dateRaw || "").includes("~")) return true;
  if (!merchantRaw && !dateRaw) return true;
  return false;
}

export function importRows(parsed: CsvRow[]): CsvImportResult {
  const imported: TxRow[] = [];
  const skipped: CsvImportSkipped[] = [];
  const now = Date.now();

  // 행 수 상한 보호. 정상 카드 한 달 이용내역은 200행 이하라 10K 한도는 사실상 무한대로
  // 잡혀 있으나, 악의적 입력(거대 CSV)이 메모리에서 풀리는 것을 방지합니다.
  // 한도 초과 시 앞쪽 행만 처리하고 나머지는 한 건의 skip 항목으로 요약 보고합니다.
  const truncated = parsed.length > MAX_IMPORT_ROW_COUNT;
  const rows = truncated ? parsed.slice(0, MAX_IMPORT_ROW_COUNT) : parsed;
  if (truncated) {
    skipped.push({
      index: MAX_IMPORT_ROW_COUNT,
      reason: `행 수 상한(${MAX_IMPORT_ROW_COUNT}) 초과 — 이후 ${parsed.length - MAX_IMPORT_ROW_COUNT}행은 처리하지 않습니다.`,
      raw: {},
    });
  }

  rows.forEach((raw, index) => {
    const dateRaw = pickFirstValue(raw, DATE_HEADERS);
    const merchantRaw = pickFirstValue(raw, MERCHANT_HEADERS);
    const amountRaw = pickFirstValue(raw, AMOUNT_HEADERS);
    const billedAmountRaw = pickFirstValue(raw, BILLING_AMOUNT_HEADERS);
    const categoryRaw = pickFirstValue(raw, CATEGORY_HEADERS);
    const statusRaw = pickFirstValue(raw, STATUS_HEADERS);
    /*
     * AI 폴백(2026-04-28): 카드사 헤더가 표준 양식과 어긋나 PAYMENT_MODE/INSTALLMENT
     * 헤더가 시트 전체에서 0건 매칭이면, fileImport 의 gate 가 시트의 모든 행에
     * `__ai_paymentMode` / `__ai_installmentMonths` 합성 키를 미리 채워서 옵니다.
     * 정식 헤더가 매칭되면 그 값이 우선이고, 비어 있을 때만 AI 값을 폴백으로 씁니다 —
     * "AI 가 손댄 것처럼 보여주는 거짓말" 회피.
     */
    let paymentModeRaw = pickFirstValue(raw, PAYMENT_MODE_HEADERS);
    let installmentMonthsRaw = pickFirstValue(raw, INSTALLMENT_MONTHS_HEADERS);
    let aiApplied = false;
    if (!paymentModeRaw && raw.__ai_paymentMode) {
      paymentModeRaw = String(raw.__ai_paymentMode);
      aiApplied = true;
    }
    if (!installmentMonthsRaw && raw.__ai_installmentMonths) {
      installmentMonthsRaw = String(raw.__ai_installmentMonths);
      aiApplied = true;
    }
    const installmentCycleRaw = pickFirstValue(raw, INSTALLMENT_CYCLE_HEADERS);
    const approvalNumberRaw = pickFirstValue(raw, APPROVAL_NUMBER_HEADERS);
    const dueDateRaw = pickFirstValue(raw, PAYMENT_DUE_DATE_HEADERS);
    const remainingBalanceRaw = pickFirstValue(raw, REMAINING_BALANCE_HEADERS);
    const cardLabelRaw = pickFirstValue(raw, CARD_LABEL_HEADERS);
    const cancellationRaw = pickFirstValue(raw, CANCELLATION_HEADERS);

    if (looksLikeSummaryRow(raw, merchantRaw, dateRaw)) {
      skipped.push({ index, reason: "요약/합계 행은 건너뜁니다.", raw });
      return;
    }

    const date = normalizeDate(dateRaw);
    const amount = parseAmount(amountRaw);
    const billedAmount = parseAmount(billedAmountRaw);
    const installmentMonthsRawParsed = parsePositiveInteger(installmentMonthsRaw);
    const installmentCycle = parseInstallmentCycle(installmentCycleRaw);
    /*
     * 할부개월 헤더가 없는 카드사 (예: NH 청구내역) 도 회차 표기(예: "5/5") 만으로 총 회차 =
     * 할부 개월수임을 알 수 있습니다(2026-04-28). 헤더 누락 케이스의 회귀 차단 — 이전엔
     * installmentMonths 가 null 이라 거래 상세·편집 모달에서 할부개월이 빈 값으로 보였어요.
     */
    const installmentMonths =
      installmentMonthsRawParsed ??
      (installmentCycle && installmentCycle.total > 0
        ? installmentCycle.total
        : null);
    const remainingBalance = parseAmount(remainingBalanceRaw);
    const paymentMode = parsePaymentMode(paymentModeRaw, installmentMonths, installmentCycle);
    const recordKind = inferCardRecordKind({
      raw,
      amount,
      billedAmount,
      cycle: installmentCycle,
      remainingBalance,
      paymentMode,
      installmentCycleHeaders: INSTALLMENT_CYCLE_HEADERS,
      remainingBalanceHeaders: REMAINING_BALANCE_HEADERS,
      billingAmountHeaders: BILLING_AMOUNT_HEADERS,
    });
    const effectiveAmount =
      recordKind === "billing" ? (billedAmount ?? amount) : (amount ?? billedAmount);
    // 가맹점명이 비면 행을 버리지 않고 "알 수 없음"으로 대체해 import합니다.
    const effectiveMerchantRaw = merchantRaw || "알 수 없음";
    const { platform, cleaned } = normalizeMerchant(effectiveMerchantRaw);

    if (!date) {
      skipped.push({ index, reason: "날짜 형식을 읽을 수 없습니다.", raw });
      return;
    }
    if (effectiveAmount === null) {
      skipped.push({ index, reason: "금액 형식을 읽을 수 없습니다.", raw });
      return;
    }
    
    const resolvedPlatform = platform ?? "unspecified";
    const category = (CATEGORY_MAP[categoryRaw.trim()] ?? "etc") as TxCategory;
    const status = inferStatus(`${statusRaw} ${cancellationRaw}`.trim(), effectiveAmount);
    const txShape = toTxShape(effectiveAmount, status);
    const dueDate = normalizeDate(dueDateRaw);
    const fingerprintParts = [
      date,
      effectiveMerchantRaw,
      approvalNumberRaw,
      String(amount ?? ""),
      String(billedAmount ?? ""),
      String(raw.__sheetName ?? ""),
      String(raw.__rowIndex ?? ""),
    ].filter(Boolean);

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
      detail: {
        items: [],
        // 카드 CSV/XLSX 업로드 경로의 거래는 "CARD" 로 마킹해 DetailPanel 의 입력 방식 태그가
        // "카드내역" 으로 표시되도록 합니다(2026-04-28). 이전에는 "MANUAL" 로 강제되어 사용자
        // 입장에서 "카드로 올렸는데 수동 입력으로 보이는" 표시 회귀가 있었습니다.
        // 레거시 데이터(이미 "MANUAL" 로 저장된 csv 거래) 는 DetailPanel 의 getEffectiveSource
        // 게터가 row.source === "csv" 폴백으로 호환합니다.
        source: "CARD",
        cardImport: {
          recordKind,
          paymentMode,
          ...(installmentMonths !== null ? { installmentMonths } : {}),
          ...(installmentCycle
            ? {
                installmentCurrentCycle: installmentCycle.current,
                installmentCycleTotal: installmentCycle.total,
              }
            : {}),
          ...(amount !== null ? { approvedAmount: amount } : {}),
          ...(billedAmount !== null ? { billedAmount } : {}),
          ...(remainingBalance !== null ? { remainingBalance } : {}),
          ...(approvalNumberRaw ? { approvalNumber: approvalNumberRaw } : {}),
          ...(cardLabelRaw ? { cardLabel: cardLabelRaw } : {}),
          ...(dueDate ? { dueDate } : {}),
          ...(raw.__sheetName ? { sourceSheet: raw.__sheetName } : {}),
          ...(effectiveMerchantRaw ? { originalMerchant: effectiveMerchantRaw } : {}),
          ...(fingerprintParts.length > 0
            ? { rawRowFingerprint: fingerprintParts.join("|") }
            : {}),
          ...(aiApplied ? { aiApplied: true } : {}),
        },
      },
    };

    imported.push(row);
  });

  return { total: parsed.length, imported, skipped };
}
