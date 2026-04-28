#!/usr/bin/env node
/**
 * 역할: CSV/XLSX 1차 파서(rowsToCsvRows + importRows) 회귀 테스트.
 * 위치: scripts/regression-csv-parse.mjs
 *
 * 실행: `node scripts/regression-csv-parse.mjs`
 *
 * 왜 이렇게 짰나:
 * - 저장소에 vitest/jest 가 들어와 있지 않다. 새 의존성 없이 바로 돌리려고 plain ESM 스크립트로 작성.
 * - csvParse / importHeaders / csvImport / merchantNormalize 네 모듈만 격리해 tsc 로 /tmp 에 컴파일한 뒤
 *   동적 import 로 불러와 합성 fixture 에 대해 검증한다.
 * - 사용자 보유 카드사 실제 파일(국민/롯데/현대/기간별/BC/ChungGu 류) 은 개인 결제 데이터라 저장소엔
 *   없으므로, 각 파일의 헤더 구조를 대표하는 합성 fixture 로 대체한다. 실제 파일을 검증하려면
 *   FIXTURES 와 동일한 구조의 mini.xlsx 를 .local-samples/ 에 넣고 별도 스크립트로 readXlsxAsRows
 *   를 호출하면 된다.
 *
 * 검증 항목 (csvParse.ts: rowsToCsvRows hasContinuation 분기 회귀):
 *   1. 1행 헤더 파일이 hasContinuation=false 로 분기돼 2행 값이 헤더로 흡수되지 않는가
 *   2. 2행 병합헤더(BC/ChungGu) 가 여전히 정상 동작하는가
 *   3. 일시불/할부 mixed 파일에서 할부 회차/잔액이 보존되는가
 *   4. 미국식 단축 날짜(MM/DD/YY, 현대카드) 가 정상 파싱되는가
 *   5. summary sheet 가 섞여도 거래 sheet 의 imported 가 흔들리지 않는가
 *   6. 할부 approval/billing 분류가 의도대로 들어가는가
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");

// ─── 1. tsc 로 4개 모듈을 /tmp 로 컴파일 ─────────────────────────────────────
const buildDir = mkdtempSync(join(tmpdir(), "spendtrack-csvparse-"));
const tsconfigPath = join(buildDir, "tsconfig.json");
writeFileSync(
  tsconfigPath,
  JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
      esModuleInterop: true,
      strict: false,
      skipLibCheck: true,
      outDir: join(buildDir, "out"),
      rootDir: join(REPO_ROOT, "src/utils"),
    },
    include: [
      join(REPO_ROOT, "src/utils/csvParse.ts"),
      join(REPO_ROOT, "src/utils/importHeaders.ts"),
      join(REPO_ROOT, "src/utils/csvImport.ts"),
      join(REPO_ROOT, "src/utils/merchantNormalize.ts"),
    ],
  }),
);

try {
  execFileSync(
    join(REPO_ROOT, "node_modules/.bin/tsc"),
    ["-p", tsconfigPath],
    { stdio: "pipe" },
  );
} catch (err) {
  // tsc 가 TransactionTable.tsx 의 JSX 미설정으로 에러를 뱉지만 .js 는 emit 된다.
  // emit 만 확인하고 진행.
  const stderr = err.stderr?.toString() ?? "";
  const stdout = err.stdout?.toString() ?? "";
  if (!stderr.includes("error TS") && !stdout.includes("error TS")) {
    throw err;
  }
}

// .js 의 import 경로에 .js 확장자를 붙여 ESM 동적 import 가 성공하게 한다.
const outDir = join(buildDir, "out");
for (const file of readdirSync(outDir)) {
  if (!file.endsWith(".js")) continue;
  const path = join(outDir, file);
  const text = readFileSync(path, "utf8");
  const patched = text.replace(/from "(\.\/[^"]+)"/g, 'from "$1.js"');
  writeFileSync(path, patched);
}

const csvParseUrl = pathToFileURL(join(outDir, "csvParse.js")).href;
const importHeadersUrl = pathToFileURL(join(outDir, "importHeaders.js")).href;
const csvImportUrl = pathToFileURL(join(outDir, "csvImport.js")).href;

const { rowsToCsvRows } = await import(csvParseUrl);
const { findHeaderRowIndex } = await import(importHeadersUrl);
const { importRows } = await import(csvImportUrl);

// ─── 2. Fixtures: 5개 실 파일의 헤더 구조를 대표하는 합성 데이터 ─────────────
const FIXTURES = [
  {
    name: "A. 1행 헤더 일시불 (기간별 사용내역_출력용 류)",
    matrix: [
      ["조회기간 : 2026.04.01 ~ 2026.04.23"],
      [""],
      ["이용일자", "이용가맹점", "이용금액", "할부개월", "결제구분"],
      ["2026.04.01", "스타벅스", "5,500", "0", "일시불"],
      ["2026.04.02", "GS25", "12,000", "0", "일시불"],
      ["2026.04.05", "쿠팡", "34,800", "0", "일시불"],
      ["2026.04.10", "이마트", "98,000", "0", "일시불"],
      ["2026.04.20", "스타벅스", "5,500", "0", "일시불"],
    ],
    expect: {
      headerIdx: 2,
      parsed: 5,
      imported: 5,
      installmentCount: 0,
      billingCount: 0,
      // 회귀 핵심: 첫 번째 데이터 행의 값이 헤더로 흡수되지 않아야 함
      firstRowMerchant: "스타벅스",
    },
  },
  {
    name: "B. 일시불+할부 mixed (1행 헤더, 청구 회차 포함)",
    matrix: [
      ["이용일자", "이용가맹점", "이용금액", "할부개월", "할부회차", "결제구분"],
      ["2026.04.01", "스타벅스", "5,500", "0", "", "일시불"],
      ["2026.04.05", "삼성전자스토어", "1,200,000", "3", "1/3", "할부"],
      ["2026.04.05", "삼성전자스토어", "1,200,000", "3", "2/3", "할부"],
      ["2026.04.05", "삼성전자스토어", "1,200,000", "3", "3/3", "할부"],
      ["2026.04.10", "GS25", "12,000", "0", "", "일시불"],
    ],
    expect: {
      headerIdx: 0,
      parsed: 5,
      imported: 5,
      installmentCount: 3,
      // 할부 회차가 있으므로 inferRecordKind 가 billing 으로 분류
      billingCount: 3,
    },
  },
  {
    name: "C. 카드이용내역 2행 병합헤더 (BC/카드이용내역_20260423 류)",
    matrix: [
      ["이용일자", "이용가맹점", "이용금액", "할부", "할부", "잔액"],
      ["", "", "", "할부회차", "결제금액", "결제 후잔액"],
      ["2026.04.01", "스타벅스", "5,500", "0", "5,500", ""],
      ["2026.04.05", "삼성전자스토어", "1,200,000", "1/3", "400,000", "800,000"],
      ["2026.04.10", "GS25", "12,000", "0", "12,000", ""],
    ],
    expect: {
      headerIdx: 0,
      parsed: 3,
      imported: 3,
      // 회귀 핵심: 2행 병합헤더가 살아 있어야 결제금액/잔액 컬럼이 잡힘
      shouldHaveKeys: ["할부회차", "결제금액", "결제 후잔액"],
    },
  },
  {
    name: "D. ChungGu 2행 병합헤더 (수수료/승인번호 포함)",
    matrix: [
      ["이용일자", "가맹점명", "결제정보", "결제정보", "수수료", "승인번호"],
      ["", "", "결제금액", "할부회차", "수수료", "승인번호"],
      ["2026.04.01", "스타벅스", "5,500", "0", "0", "A12345"],
      ["2026.04.05", "삼성전자", "400,000", "1/3", "5000", "A12346"],
    ],
    expect: {
      headerIdx: 0,
      parsed: 2,
      imported: 2,
      shouldHaveKeys: ["결제금액", "할부회차", "승인번호"],
    },
  },
  {
    name: "E. 현대카드 1행 헤더 (MM/DD/YY 단축 날짜)",
    matrix: [
      ["[현대카드 이용내역]"],
      [""],
      ["승인일자", "이용가맹점", "승인금액", "할부개월"],
      ["4/01/26", "STARBUCKS", "5500", "0"],
      ["4/05/26", "쿠팡", "34800", "0"],
      ["4/10/26", "이마트", "98000", "0"],
    ],
    expect: {
      headerIdx: 2,
      parsed: 3,
      imported: 3,
      // MM/DD/YY 가 YYYY.MM.DD 로 정규화되어야 함
      firstRowDate: "2026.04.01",
    },
  },
  {
    name: "F. summary sheet 단독 (사용처구분/합계금액)",
    matrix: [
      ["사용처구분", "합계금액", "건수"],
      ["외식", "150,000", "5"],
      ["쇼핑", "300,000", "3"],
      ["교통", "50,000", "10"],
      ["전체합계", "500,000", "18"],
    ],
    expect: {
      // 모두 거래로 인정되면 안 됨 (현재 구현은 날짜 부재로 skipped, '전체합계' 만 summary 룰로 skip)
      imported: 0,
    },
  },
];

// ─── 3. Run & assert ────────────────────────────────────────────────────────
const results = [];
for (const f of FIXTURES) {
  const headerIdx = findHeaderRowIndex(f.matrix);
  const parsed = rowsToCsvRows(f.matrix, headerIdx);
  const result = importRows(parsed);
  const cardImports = result.imported.map((r) => r.detail?.cardImport ?? {});
  const installmentCount = cardImports.filter((c) => c.paymentMode === "installment").length;
  const billingCount = cardImports.filter((c) => c.recordKind === "billing").length;
  const fails = [];

  const e = f.expect ?? {};
  if (e.headerIdx !== undefined && headerIdx !== e.headerIdx)
    fails.push(`headerIdx ${headerIdx} ≠ ${e.headerIdx}`);
  if (e.parsed !== undefined && parsed.length !== e.parsed)
    fails.push(`parsed ${parsed.length} ≠ ${e.parsed}`);
  if (e.imported !== undefined && result.imported.length !== e.imported)
    fails.push(`imported ${result.imported.length} ≠ ${e.imported}`);
  if (e.installmentCount !== undefined && installmentCount !== e.installmentCount)
    fails.push(`installment ${installmentCount} ≠ ${e.installmentCount}`);
  if (e.billingCount !== undefined && billingCount !== e.billingCount)
    fails.push(`billing ${billingCount} ≠ ${e.billingCount}`);
  if (e.firstRowMerchant !== undefined) {
    const m = result.imported[0]?.title;
    if (m !== e.firstRowMerchant) fails.push(`firstMerchant "${m}" ≠ "${e.firstRowMerchant}"`);
  }
  if (e.firstRowDate !== undefined) {
    const d = result.imported[0]?.date;
    if (d !== e.firstRowDate) fails.push(`firstDate "${d}" ≠ "${e.firstRowDate}"`);
  }
  if (e.shouldHaveKeys) {
    const keys = parsed[0] ? Object.keys(parsed[0]) : [];
    const missing = e.shouldHaveKeys.filter((k) => !keys.includes(k));
    if (missing.length > 0) fails.push(`missing keys: ${missing.join(",")}`);
  }

  results.push({ name: f.name, fails, headerIdx, parsed: parsed.length, imported: result.imported.length, installmentCount, billingCount });
}

let failed = 0;
for (const r of results) {
  const status = r.fails.length === 0 ? "✅ PASS" : "❌ FAIL";
  console.log(`${status}  ${r.name}`);
  console.log(`        headerIdx=${r.headerIdx} parsed=${r.parsed} imported=${r.imported} installment=${r.installmentCount} billing=${r.billingCount}`);
  if (r.fails.length > 0) {
    failed++;
    r.fails.forEach((m) => console.log(`        - ${m}`));
  }
}
console.log(
  `\n${failed === 0 ? `✅ ${results.length}/${results.length} passed` : `❌ ${failed}/${results.length} failed`}`,
);
process.exit(failed === 0 ? 0 : 1);
