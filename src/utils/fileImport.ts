/**
 * 역할: 카드 내역 파일(CSV/XLSX)을 확장자에 따라 적절한 파서로 라우팅하는 통합 진입점입니다.
 *       CsvUpload 화면은 이 함수 하나만 호출하면 되도록 단순화했습니다.
 * 위치: src\utils\fileImport.ts
 */
import { importRows, type CsvImportResult } from "./csvImport";
import { decodeCsvBuffer, parseCsv } from "./csvParse";
import { readXlsxAsRows } from "./xlsxImport";

export type SupportedFileKind = "csv" | "xlsx";

export class UnsupportedFileTypeError extends Error {
  constructor(fileName: string) {
    super(`지원하지 않는 파일 형식입니다 (${fileName}). CSV, XLSX 또는 XLS 파일을 올려주세요.`);
    this.name = "UnsupportedFileTypeError";
  }
}

export function detectFileKind(fileName: string): SupportedFileKind | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "xlsx";
  return null;
}

export async function importFile(file: File): Promise<CsvImportResult> {
  const kind = detectFileKind(file.name);
  if (kind === "csv") {
    const text = decodeCsvBuffer(await file.arrayBuffer());
    return importRows(parseCsv(text));
  }
  if (kind === "xlsx") {
    const rows = await readXlsxAsRows(file);
    return importRows(rows);
  }
  throw new UnsupportedFileTypeError(file.name);
}
