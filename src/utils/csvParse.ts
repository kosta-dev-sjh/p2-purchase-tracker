/**
 * 역할: CSV 텍스트를 헤더 기반 객체 배열로 파싱합니다.
 *       Excel/카드사 CSV에서 흔한 BOM과 따옴표로 감싼 셀을 처리할 수 있게 만들었습니다.
 * 위치: src\utils\csvParse.ts
 */
import { findHeaderRowIndex } from "./importHeaders";

export type CsvRow = Record<string, string>;

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

export function decodeCsvBuffer(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  if (!utf8.includes("\uFFFD")) return utf8;

  try {
    return new TextDecoder("euc-kr").decode(buffer);
  } catch {
    return utf8;
  }
}

export function parseCsvMatrix(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, "");
  return cleaned
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => splitCsvLine(line).map((cell) => cell.trim()));
}

export function rowsToCsvRows(rows: string[][], headerIndex = 0): CsvRow[] {
  if (rows.length <= headerIndex + 1) return [];

  const headers = (rows[headerIndex] ?? []).map((header) => header.trim());
  return rows.slice(headerIndex + 1).reduce<CsvRow[]>((acc, cells) => {
    const row: CsvRow = {};
    let hasValue = false;

    headers.forEach((header, index) => {
      if (!header) return;
      const value = (cells[index] ?? "").trim();
      row[header] = value;
      if (value !== "") hasValue = true;
    });

    if (hasValue) acc.push(row);
    return acc;
  }, []);
}

export function parseCsv(text: string): CsvRow[] {
  const matrix = parseCsvMatrix(text);
  if (matrix.length < 2) return [];
  return rowsToCsvRows(matrix, findHeaderRowIndex(matrix));
}
