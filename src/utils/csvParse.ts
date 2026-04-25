/**
 * 역할: CSV 텍스트를 헤더 기반 객체 배열로 파싱합니다.
 *       Excel/카드사 CSV에서 흔한 BOM과 따옴표로 감싼 셀을 처리할 수 있게 만들었습니다.
 * 위치: src\utils\csvParse.ts
 */
import { findHeaderRowIndex } from "./importHeaders";

export type CsvRow = Record<string, string>;

/**
 * 줄 단위로 텍스트를 쪼개되, 따옴표로 감싸진 구분자는 무시합니다.
 */
function splitCsvLine(line: string, separator = ","): string[] {
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
    } else if (ch === separator && !inQuotes) {
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
  // UTF-8로 읽었을 때 깨진 문자가 발견되면 EUC-KR로 재시도합니다.
  if (!utf8.includes("\uFFFD")) return utf8;

  try {
    return new TextDecoder("euc-kr").decode(buffer);
  } catch {
    return utf8;
  }
}

/**
 * 텍스트를 분석해 가장 적절한 구분자(쉼표 또는 탭)를 선택합니다.
 * 국내 금융사 CSV는 실제로는 탭으로 구분된(TSV) 경우가 매우 많습니다.
 */
function detectSeparator(text: string): string {
  const lines = text.split(/\r?\n/).slice(0, 5);
  let commaCount = 0;
  let tabCount = 0;

  lines.forEach((line) => {
    commaCount += (line.match(/,/g) || []).length;
    tabCount += (line.match(/\t/g) || []).length;
  });

  return tabCount > commaCount ? "\t" : ",";
}

export function parseCsvMatrix(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, "");
  const separator = detectSeparator(cleaned);

  // CSV RFC 4180: 따옴표로 감싸진 필드 안에는 줄바꿈이 포함될 수 있음
  const rows: string[][] = [];
  let currentLine = "";
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const nextChar = cleaned[i + 1];

    if (char === '"') {
      // 연속된 따옴표("")는 이스케이프된 따옴표
      if (inQuotes && nextChar === '"') {
        currentLine += '""';
        i++; // 다음 따옴표 건너뛰기
      } else {
        inQuotes = !inQuotes;
        currentLine += char;
      }
    } else if ((char === '\n' || (char === '\r' && nextChar === '\n')) && !inQuotes) {
      // 따옴표 밖의 줄바꿈 = 행 구분자
      if (currentLine.trim() !== "") {
        rows.push(splitCsvLine(currentLine, separator).map((cell) => cell.trim()));
      }
      currentLine = "";
      // \r\n인 경우 \n 건너뛰기
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
    } else {
      currentLine += char;
    }
  }

  // 마지막 행 처리
  if (currentLine.trim() !== "") {
    rows.push(splitCsvLine(currentLine, separator).map((cell) => cell.trim()));
  }

  return rows;
}

export function rowsToCsvRows(rows: string[][], headerIndex = 0): CsvRow[] {
  if (rows.length <= headerIndex + 1) return [];

  // 헤더의 줄바꿈을 제거합니다 (NH카드 등 멀티라인 헤더 처리)
  const headers = (rows[headerIndex] ?? []).map((header) =>
    header.replace(/[\r\n]+/g, '').trim()
  );
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
