/**
 * 역할: 카드 XLSX 파일을 CsvRow[] 형태로 변환합니다.
 * 위치: src\utils\xlsxImport.ts
 */
import { rowsToCsvRows, type CsvRow } from "./csvParse";
import { findHeaderRowIndex } from "./importHeaders";

export async function readXlsxAsRows(file: File): Promise<CsvRow[]> {
  // xlsx는 업로드 시점에만 동적으로 불러와 초기 번들을 가볍게 유지합니다.
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  // cellDates: 날짜 셀을 일련번호(serial)가 아니라 JS Date 객체로 읽어오게 합니다.
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const sheet = workbook.Sheets[firstSheetName];
  // dateNF: sheet_to_json이 Date 셀을 ISO 형태 문자열로 포맷해서 내려주도록 지정합니다.
  //         이 옵션이 없으면 Excel 일련번호("46131.375" 등)가 그대로 내려와 날짜 파서가 오인식합니다.
  const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    dateNF: "yyyy-mm-dd",
    blankrows: false,
  });

  if (aoa.length === 0) return [];

  const matrix = aoa.map((cells) => cells.map((cell) => String(cell ?? "").trim()));
  return rowsToCsvRows(matrix, findHeaderRowIndex(matrix));
}
