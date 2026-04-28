/**
 * 역할: 카드 내역 파일(CSV/XLSX)을 확장자에 따라 적절한 파서로 라우팅하는 통합 진입점입니다.
 *       CsvUpload 화면은 이 함수 하나만 호출하면 되도록 단순화했습니다.
 * 위치: src\utils\fileImport.ts
 */
import { importRows, type CsvImportResult } from "./csvImport";
import { type CsvRow, decodeCsvBuffer, parseCsv } from "./csvParse";
import { readXlsxAsRows } from "./xlsxImport";
import {
  AMOUNT_HEADERS,
  BILLING_AMOUNT_HEADERS,
  DATE_HEADERS,
  INSTALLMENT_CYCLE_HEADERS,
  INSTALLMENT_MONTHS_HEADERS,
  MERCHANT_HEADERS,
  PAYMENT_MODE_HEADERS,
} from "./importHeaders";
import { classifyCardRows, type ClassifyCardRowSnippet } from "./aiService";
import { MAX_IMPORT_FILE_BYTES } from "../constants/inputLimits";

export type SupportedFileKind = "csv" | "xlsx";

export class UnsupportedFileTypeError extends Error {
  constructor(fileName: string) {
    super(`지원하지 않는 파일 형식입니다 (${fileName}). CSV, XLSX 또는 XLS 파일을 올려주세요.`);
    this.name = "UnsupportedFileTypeError";
  }
}

export class OversizedFileError extends Error {
  constructor(fileName: string, sizeBytes: number) {
    const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(1);
    const limitMb = MAX_IMPORT_FILE_BYTES / (1024 * 1024);
    super(`파일 크기(${sizeMb}MB)가 한도(${limitMb}MB) 를 넘었습니다 — ${fileName}`);
    this.name = "OversizedFileError";
  }
}

export function detectFileKind(fileName: string): SupportedFileKind | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "xlsx";
  return null;
}

/*
 * AI 폴백 게이트(2026-04-28).
 *
 * 새 카드사 양식(미지의 헤더, 영문 헤더, 3행 병합 등) 으로 일시불/할부 컬럼이
 * 시트 안에서 단 하나도 매핑되지 않을 때, "그냥 일시불로 떠넘기기" 대신 AI 에
 * 시트당 1회 분류 요청을 보내는 안전망입니다. 이 게이트는 의도적으로 보수적입니다 —
 *  · 한 행이라도 PAYMENT_MODE / INSTALLMENT_MONTHS / INSTALLMENT_CYCLE 헤더에
 *    값이 들어오면 게이트 OFF (정식 파서 신뢰).
 *  · 0건일 때만 ON. 그 시트의 모든 행이 함께 한 호출로 나갑니다.
 * 비용·rate limit 영향: 정상 카드사 파일은 항상 OFF 라 호출 0회. 미지의 양식이
 * 들어왔을 때만 시트당 1회 — 사용자 1명/업로드 1회당 보통 1~2회 이하.
 *
 * 측정 지표(콘솔 로그) — CLAUDE.md 9.4 의 OCR 지표와 같은 결을 따릅니다:
 *   · sheets gated ON / total sheets (= 게이트 발동율)
 *   · rows AI-applied / rows in gated sheet (= 행 레벨 실효율)
 */
const INSTALLMENT_HINT_HEADERS = [
  ...PAYMENT_MODE_HEADERS,
  ...INSTALLMENT_MONTHS_HEADERS,
  ...INSTALLMENT_CYCLE_HEADERS,
] as const;

function rowHasInstallmentHint(row: CsvRow): boolean {
  for (const key of Object.keys(row)) {
    if (key.startsWith("__")) continue; // 메타키(__sheetName 등) 제외
    if (!INSTALLMENT_HINT_HEADERS.some((h) => key.includes(h))) continue;
    const value = String(row[key] ?? "").trim();
    if (value && value !== "-" && value !== "--") return true;
  }
  return false;
}

function sheetKey(row: CsvRow): string {
  return String(row.__sheetName ?? row.__sheetIndex ?? "_default");
}

function rowIdFor(row: CsvRow): string {
  return `${sheetKey(row)}::${row.__rowIndex ?? Math.random().toString(36).slice(2)}`;
}

function summarizeExtras(row: CsvRow): Record<string, string> {
  // AI 단서로 가치 있는 값만 추려 보냅니다(전체 row 를 그대로 보내면 토큰 낭비 + 노이즈).
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(row)) {
    if (key.startsWith("__")) continue;
    const value = String(raw ?? "").trim();
    if (!value) continue;
    // 이미 메인 필드(date/merchant/amount) 로 분리한 컬럼은 extras 에서 제외해 중복 줄임.
    if (
      DATE_HEADERS.some((h) => key.includes(h)) ||
      MERCHANT_HEADERS.some((h) => key.includes(h)) ||
      AMOUNT_HEADERS.some((h) => key.includes(h)) ||
      BILLING_AMOUNT_HEADERS.some((h) => key.includes(h))
    ) {
      continue;
    }
    out[key] = value.length > 60 ? value.slice(0, 60) + "..." : value;
  }
  return out;
}

function pickFirst(row: CsvRow, headers: readonly string[]): string {
  for (const h of headers) {
    if (row[h] !== undefined && row[h] !== "") return row[h];
  }
  for (const h of headers) {
    const k = Object.keys(row).find((key) => !key.startsWith("__") && key.includes(h));
    if (k && row[k]) return row[k];
  }
  return "";
}

/**
 * 시트 단위 게이트 + AI 호출 + 결과 주입. CsvRow[] 를 in-place 로 enrich 합니다.
 * AI 에 가지 않는 시트는 그대로 두고, 가는 시트만 결과를 합성 키에 박아 csvImport 가
 * 폴백으로 읽도록 합니다(`__ai_paymentMode`, `__ai_installmentMonths`).
 */
async function applyAiInstallmentFallback(rows: CsvRow[]): Promise<void> {
  if (rows.length === 0) return;

  // 시트별로 묶어 게이트 판정.
  const bySheet = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const k = sheetKey(row);
    const arr = bySheet.get(k) ?? [];
    arr.push(row);
    bySheet.set(k, arr);
  }

  let totalSheets = 0;
  let gatedSheets = 0;
  let totalAiApplied = 0;
  let totalGatedRows = 0;

  for (const [, sheetRows] of bySheet) {
    totalSheets += 1;
    const anyHint = sheetRows.some(rowHasInstallmentHint);
    if (anyHint) continue; // 헤더 매칭 1건이라도 있으면 정식 파서 신뢰.

    gatedSheets += 1;
    totalGatedRows += sheetRows.length;

    const snippets: ClassifyCardRowSnippet[] = sheetRows.map((row) => ({
      id: rowIdFor(row),
      date: pickFirst(row, DATE_HEADERS),
      merchant: pickFirst(row, MERCHANT_HEADERS),
      amount: pickFirst(row, AMOUNT_HEADERS) || pickFirst(row, BILLING_AMOUNT_HEADERS),
      extras: summarizeExtras(row),
    }));

    // 시트당 1회 호출.
    const result = await classifyCardRows(snippets);
    if (result.length === 0) continue;

    const byId = new Map(result.map((r) => [r.id, r]));
    for (const row of sheetRows) {
      const cls = byId.get(rowIdFor(row));
      if (!cls) continue;
      // installment 인 경우만 의미 있게 라벨 채움(lump_sum 은 csvImport 의 기본값과 같아 noise).
      if (cls.paymentMode === "installment") {
        row.__ai_paymentMode = "할부"; // parsePaymentMode 의 /할부/ 정규식과 매칭
        if (cls.installmentMonths && cls.installmentMonths >= 2) {
          row.__ai_installmentMonths = String(cls.installmentMonths);
        }
        totalAiApplied += 1;
      }
    }
  }

  if (gatedSheets > 0) {
    // CLAUDE.md 9.4 의 측정 지표와 같은 결: 게이트 발동율 + 행 실효율.
    console.info(
      `[card-import] AI gate fired: ${gatedSheets}/${totalSheets} sheets, ` +
        `applied to ${totalAiApplied}/${totalGatedRows} rows`,
    );
  }
}

export async function importFile(file: File): Promise<CsvImportResult> {
  // 사이즈 상한 검증 — 파싱 전 차단해 비정상적으로 큰 파일이 메모리에 풀리지 않도록 보호.
  // 일반적인 카드 한 달 이용내역은 100KB 미만이므로 5MB 한도는 사실상 모든 정상 사용을 통과시킵니다.
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new OversizedFileError(file.name, file.size);
  }
  const kind = detectFileKind(file.name);
  let rows: CsvRow[];
  if (kind === "csv") {
    const text = decodeCsvBuffer(await file.arrayBuffer());
    rows = parseCsv(text);
  } else if (kind === "xlsx") {
    rows = await readXlsxAsRows(file);
  } else {
    throw new UnsupportedFileTypeError(file.name);
  }

  // 미지의 카드사 양식 안전망 — 헤더 매칭 0건 시트만 AI 분류로 폴백.
  await applyAiInstallmentFallback(rows);

  return importRows(rows);
}
