/**
 * 역할: 카드 내역 파일(CSV/XLSX)을 확장자에 따라 적절한 파서로 라우팅하는 통합 진입점입니다.
 *       CsvUpload 화면은 이 함수 하나만 호출하면 되도록 단순화했습니다.
 * 위치: src\utils\fileImport.ts
 */
import { importRows, type CsvImportResult } from "./csvImport";
import { decodeCsvBuffer, parseCsv } from "./csvParse";
import { readXlsxAsRows } from "./xlsxImport";
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

export async function importFile(file: File): Promise<CsvImportResult> {
  // 사이즈 상한 검증 — 파싱 전 차단해 비정상적으로 큰 파일이 메모리에 풀리지 않도록 보호.
  // 일반적인 카드 한 달 이용내역은 100KB 미만이므로 5MB 한도는 사실상 모든 정상 사용을 통과시킵니다.
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new OversizedFileError(file.name, file.size);
  }
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
