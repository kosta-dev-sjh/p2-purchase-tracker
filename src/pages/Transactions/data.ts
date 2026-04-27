/**
 * 역할: Transactions 화면에서 공용으로 쓰는 파생 함수 모음입니다.
 *       과거에는 "데이터가 쌓여 있는 것처럼" 보이도록 월별 시드 거래를 랜덤 생성하는
 *       코드(TITLE_POOLS / SUBSCRIPTIONS / generateRows / getTransactionsMockData 등)가
 *       여기 같이 있었지만, 이제는 실제 사용자 입력(수동/OCR/CSV)만 저장/표시하기로 해서
 *       가짜 데이터 생성 경로를 전부 제거했습니다. 남은 것은 저장소 rows(TxRow[])로부터
 *       요약·월 키를 뽑는 순수 함수들뿐입니다.
 * 위치: src\pages\Transactions\data.ts
 */
import type { SummaryData } from "./components/SummaryStrip";
import type { TxRow } from "./components/TransactionTable";

function sumSpend(rows: TxRow[]): number {
  return rows
    .filter((row) => row.type === "expense")
    .reduce((sum, row) => sum + Math.abs(Math.min(row.amount, 0)), 0);
}

/**
 * 저장된 rows로부터 Transactions 상단의 요약 스트립 데이터를 계산합니다.
 * prevRows가 주어지면 전월 대비 증감률도 함께 만들어 줍니다.
 */
export const buildTransactionSummary = (
  rows: TxRow[],
  prevRows?: TxRow[],
): SummaryData => {
  const total = rows.length;
  const spendRows = rows.filter((row) => row.type === "expense");
  const incomeRows = rows.filter((row) => row.type === "income");
  const totalSpend = spendRows.reduce((sum, row) => sum + Math.abs(Math.min(row.amount, 0)), 0);
  const incomeAndRefund = incomeRows.reduce((sum, row) => sum + Math.max(row.amount, 0), 0);
  const refundCount = rows.filter((row) => row.status === "refund").length;

  let spendDelta: SummaryData["spendDelta"];
  if (prevRows && prevRows.length > 0) {
    const prevSpend = sumSpend(prevRows);
    if (prevSpend > 0) {
      const ratio = (totalSpend - prevSpend) / prevSpend;
      const percent = Math.round(ratio * 100);
      spendDelta = {
        percent,
        direction: percent > 0 ? "up" : percent < 0 ? "down" : "flat",
      };
    }
  }

  return {
    total,
    spendCount: spendRows.length,
    incomeCount: incomeRows.length,
    totalSpend,
    incomeAndRefund,
    refundCount,
    netSpend: totalSpend - incomeAndRefund,
    countLabel: `총 ${total}건 · 지출 ${spendRows.length}건 · 수입 ${incomeRows.length}건`,
    spendDelta,
  };
};

