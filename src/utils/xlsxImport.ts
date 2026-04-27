/**
 * 역할: 카드 XLSX 파일을 CsvRow[] 형태로 변환합니다.
 * 위치: src\utils\xlsxImport.ts
 */
import { rowsToCsvRows, type CsvRow } from "./csvParse";
import { findHeaderRowIndex } from "./importHeaders";

/** 시트가 AI에게 보낼 가치가 있는지(= 거래 데이터가 담겼을 가능성이 있는지) 판정. */
function looksLikeDataSheet(csv: string): boolean {
  if (!csv) return false;
  const nonEmptyLines = csv.split(/\r?\n/).filter((line) => line.trim() !== "");
  // 안내/커버 시트는 보통 5행 이하. 진짜 내역은 수십~수백 행.
  if (nonEmptyLines.length < 3) return false;

  // 숫자 셀의 비중을 대략적으로 체크. 거래 내역은 금액/날짜 때문에 숫자 비중이 높음.
  const digits = (csv.match(/\d/g) || []).length;
  const letters = (csv.match(/[A-Za-z가-힣]/g) || []).length;
  const totalSignal = digits + letters;
  if (totalSignal === 0) return false;
  const digitRatio = digits / totalSignal;
  // "안내문만 가득한" 시트는 digitRatio가 0.05 아래로 뚝 떨어집니다.
  return digitRatio >= 0.1;
}

/** CSV 셀 이스케이프: 쉼표/따옴표/줄바꿈이 있으면 따옴표로 감싸고, 내부 따옴표는 두 배로 */
function escapeCSVCell(cell: unknown): string {
  const str = String(cell ?? "");
  // 쉼표, 따옴표, 줄바꿈이 있으면 따옴표로 감싸고, 내부 따옴표는 ""로 이스케이프
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export async function readXlsxAsCsvText(file: File): Promise<string> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  if (workbook.SheetNames.length === 0) return "";

  const chunks: string[] = [];
  const dropped: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    // readXlsxAsRows와 동일한 옵션으로 날짜를 제대로 포맷합니다.
    const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
      dateNF: "yyyy-mm-dd",
      blankrows: false,
    });
    // 2차원 배열을 CSV 텍스트로 변환 (쉼표 포함 셀은 따옴표로 감싸기)
    const csv = aoa.map((row) => row.map(escapeCSVCell).join(",")).join("\n");
    if (!looksLikeDataSheet(csv)) {
      dropped.push(sheetName);
      continue;
    }
    chunks.push(`--- Sheet: ${sheetName} ---\n${csv}`);
  }

  // 필터링 결과 모든 시트가 사라졌다면(= 판정 기준이 너무 엄격했다면) 전체를 다시 붙여 보냅니다.
  // "AI가 볼 데이터가 아예 없는" 회귀를 막는 안전망입니다.
  if (chunks.length === 0) {
    return workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        defval: "",
        raw: false,
        dateNF: "yyyy-mm-dd",
        blankrows: false,
      });
      const csv = aoa.map((row) => row.map(escapeCSVCell).join(",")).join("\n");
      return `--- Sheet: ${name} ---\n${csv}`;
    }).join("\n\n");
  }

  if (dropped.length > 0) {
    // 디버깅용 로그: 어떤 시트가 제거되었는지 개발 중에 바로 보이도록.
    console.log("[xlsxImport] AI 전달에서 제외한 시트:", dropped);
  }

  return chunks.join("\n\n");
}

export async function readXlsxAsRows(file: File): Promise<CsvRow[]> {
  // xlsx는 업로드 시점에만 동적으로 불러와 초기 번들을 가볍게 유지합니다.
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  // cellDates: 날짜 셀을 일련번호(serial)가 아니라 JS Date 객체로 읽어오게 합니다.
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  if (workbook.SheetNames.length === 0) return [];

  // 카드사 엑셀은 "요약 시트 + 실제 내역 시트"처럼 여러 시트로 나뉘어 오는 경우가 흔합니다.
  // 첫 시트만 읽으면 실제 거래가 다른 탭에 있을 때 전부 놓치므로, 모든 시트를 순회하며
  // 각 시트에서 헤더를 찾아 CsvRow 배열로 변환하고 합칩니다.
  const allRows: CsvRow[] = [];
  workbook.SheetNames.forEach((sheetName, sheetIndex) => {
    const sheet = workbook.Sheets[sheetName];
    // dateNF: sheet_to_json이 Date 셀을 ISO 형태 문자열로 포맷해서 내려주도록 지정합니다.
    //         이 옵션이 없으면 Excel 일련번호("46131.375" 등)가 그대로 내려와 날짜 파서가 오인식합니다.
    const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
      dateNF: "yyyy-mm-dd",
      blankrows: false,
    });
    if (aoa.length === 0) return;

    const matrix = aoa.map((cells) => cells.map((cell) => String(cell ?? "").trim()));
    const sheetRows = rowsToCsvRows(matrix, findHeaderRowIndex(matrix), {
      sheetName,
      sheetIndex,
    });
    if (sheetRows.length > 0) {
      allRows.push(...sheetRows);
    }
  });
  return allRows;
}
