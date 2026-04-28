/**
 * 역할: Home 화면에 필요한 KPI·도넛·트렌드·최근거래·인사이트를
 *       실시간 거래 데이터(transactionsStore) 로부터 파생시키는 빌더 모듈.
 *       Firestore 연동 이후에도 입력만 원격 rows로 바꾸면 되도록 순수 함수로 유지합니다.
 * 위치: src\pages\Home\data.ts
 */
import type { KpiItem } from "./components/KpiStrip";
import type { DonutItem } from "./components/PlatformDonut";
import type { RecentItem } from "./components/RecentTransactions";
import type { InsightItem } from "./components/InsightCards";
import type {
  TxPlatform,
  TxRow,
} from "../Transactions/components/TransactionTable";
import { tokens } from "../../styles/tokens";
import { PLATFORM_LABELS } from "../../constants/labels";
import { getCurrentMonthKey, getPrevMonthKey } from "../../constants/months";
import { objectParticle } from "../../utils/koreanParticle";
import {
  countInstallmentApprovalEstimates,
  effectiveMonthlyAmount,
  findApprovalsCoveredByBilling,
  sumActualMonthlyExpense,
  sumInstallmentEstimateAmount,
} from "../../utils/expenseAccounting";
import { formatKRW } from "../../utils/format";

export interface HomeMockData {
  kpis: KpiItem[];
  platformDonut: { total: number; items: DonutItem[] };
  trend: { points: { label: string; value: number }[] };
  recent: RecentItem[];
  insights: InsightItem[];
  /**
   * 사용자가 보고 있는 월에 따라 동적으로 바뀌는 라벨. 현재 월이면 "이번 달", 과거/미래 월이면
   * "YYYY년 M월". 화면 곳곳의 카피("이번 달 …")가 헤더 월에 맞춰 같이 변하도록 빌더에서 한 번 만들어
   * UI로 전달합니다.
   */
  periodLabel: string;
}

/** "2026.04.19" → "2026-04" */
function toMonthKey(dateStr: string): string {
  const match = dateStr.match(/(\d{4})[./-](\d{1,2})/);
  if (!match) return "";
  const [, year, month] = match;
  return `${year}-${month.padStart(2, "0")}`;
}

function parseDay(dateStr: string): number {
  const match = dateStr.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  return match ? Number(match[3]) : 0;
}

function shiftMonthKey(monthKey: string, delta: number): string {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month) return monthKey;
  const totalMonths = year * 12 + (month - 1) + delta;
  const y = Math.floor(totalMonths / 12);
  const m = (totalMonths % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/**
 * 월별 실제 지출 합계. 할부 승인 거래는 분할 추정(amount ÷ installmentMonths)으로
 * 그 달의 분할분만 합산. 자세한 정책은 src/utils/expenseAccounting.ts 참고.
 *
 * (Phase 1 변경: 이전엔 `Math.abs(row.amount)` 그대로 더해 60만원 할부가 통째로 KPI 에
 * 들어가 부풀려졌습니다. 단일 진실원으로 통일.)
 */
const sumSpend = sumActualMonthlyExpense;

function sumByPlatform(
  rows: TxRow[],
  allRows: TxRow[],
): Record<TxPlatform, { value: number; count: number }> {
  // "unspecified"도 하나의 버킷으로 유지합니다. 수동 입력에서 플랫폼을 고르지 않은 거래를
  // 어딘가에 담아야 합계/퍼센트가 일관되게 계산돼서, 도넛이나 랭크 카드에 "미지정"으로 등장할 수 있게 합니다.
  const seed: Record<TxPlatform, { value: number; count: number }> = {
    coupang: { value: 0, count: 0 },
    naver: { value: 0, count: 0 },
    unspecified: { value: 0, count: 0 },
  };
  // 페어 매칭된 approval 은 합산에서 빼야 KPI 총 지출과 합이 일치.
  // allRows 를 같이 넘겨 cross-month 패턴 매칭(다른 달 billing 으로 이 달 approval 매칭) 까지 처리.
  const skip = findApprovalsCoveredByBilling(rows, allRows);
  for (const row of rows) {
    if (row.type !== "expense" || row.status === "cancel") continue;
    if (skip.has(row.id)) continue;
    seed[row.platform].value += effectiveMonthlyAmount(row);
    seed[row.platform].count += 1;
  }
  return seed;
}

/**
 * 월 스파크라인용. 당월 일자별 누적 지출을 6개 구간으로 샘플링해
 * 자잘한 일일 변동을 매끈한 선으로 요약합니다.
 */
function monthSpark(rows: TxRow[], monthKey: string): number[] {
  const thisMonth = rows.filter(
    (row) =>
      toMonthKey(row.date) === monthKey &&
      row.type === "expense" &&
      row.status !== "cancel"
  );
  if (thisMonth.length === 0) return [0, 0, 0, 0, 0, 0];
  // cross-month 매칭을 위해 allRows(=rows) 를 같이 전달.
  const skip = findApprovalsCoveredByBilling(thisMonth, rows);
  const byDay = new Map<number, number>();
  for (const row of thisMonth) {
    if (skip.has(row.id)) continue;
    const day = parseDay(row.date);
    // 스파크라인 누적도 KPI 총 지출과 같은 정의로 묶어, 마지막 누적값이 KPI 총 지출과 일치하게 합니다.
    byDay.set(day, (byDay.get(day) ?? 0) + effectiveMonthlyAmount(row));
  }
  const sortedDays = Array.from(byDay.keys()).sort((a, b) => a - b);
  const cumulative: number[] = [];
  let running = 0;
  for (const day of sortedDays) {
    running += byDay.get(day) ?? 0;
    cumulative.push(Math.round(running / 1000)); // 천 단위로 축약해서 AreaChart 노이즈 감소
  }
  if (cumulative.length <= 6) {
    // 6개보다 적으면 보간 없이 그대로 돌려줘 시작이 납작하게 보이지 않도록 처음 값을 채워 넣습니다.
    while (cumulative.length < 6) cumulative.unshift(cumulative[0] ?? 0);
    return cumulative;
  }
  const step = cumulative.length / 6;
  return Array.from({ length: 6 }, (_, i) => cumulative[Math.min(cumulative.length - 1, Math.floor(i * step))]);
}

function pickTopPlatform(
  totals: Record<TxPlatform, { value: number; count: number }>
): { platform: TxPlatform; share: number } | null {
  const total = Object.values(totals).reduce((sum, entry) => sum + entry.value, 0);
  if (total === 0) return null;
  // 인사이트 카드는 "어느 플랫폼에서 많이 쓰고 있나요"를 안내하는 게 목적이라,
  // "미지정" 버킷은 최상위 후보에서 제외합니다("미지정 비중이 가장 높아요"는 도움이 안 됩니다).
  const entries = (Object.entries(totals) as Array<[TxPlatform, { value: number; count: number }]>)
    .filter(([platform]) => platform !== "unspecified");
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1].value - a[1].value);
  const [platform, { value }] = entries[0];
  if (value === 0) return null;
  return { platform, share: Math.round((value / total) * 100) };
}

const MONTH_LABEL = (monthKey: string): string => {
  const month = Number(monthKey.split("-")[1] ?? 0);
  return month > 0 ? `${month}월` : monthKey;
};

/**
 * 최근 12개월 지출 라인. 비어 있는 달은 0으로 채워 라인이 이어지게 합니다.
 */
function buildTrendPoints(rows: TxRow[], monthKey: string) {
  const points = [] as { label: string; value: number }[];
  for (let i = 11; i >= 0; i -= 1) {
    const key = shiftMonthKey(monthKey, -i);
    const slice = rows.filter((row) => toMonthKey(row.date) === key);
    // cross-month 패턴 매칭 dedup 을 위해 allRows(=rows) 같이 전달.
    const spend = sumSpend(slice, rows);
    points.push({ label: MONTH_LABEL(key), value: spend });
  }
  return points;
}

function buildRecent(rows: TxRow[], monthKey: string): RecentItem[] {
  const thisMonth = rows.filter(
    (row) => toMonthKey(row.date) === monthKey && row.type === "expense" && row.status !== "cancel"
  );
  // 최근 거래는 날짜 내림차순 상위 3건. 같은 날짜면 id 역순으로 타이브레이크.
  const sorted = [...thisMonth].sort((a, b) => {
    if (a.date === b.date) return a.id < b.id ? 1 : -1;
    return a.date < b.date ? 1 : -1;
  });
  return sorted.slice(0, 3).map((row) => ({
    id: row.id,
    initial: PLATFORM_LABELS[row.platform]?.charAt(0) ?? row.platform.charAt(0).toUpperCase(),
    platform: row.platform,
    title: row.title,
    date: row.date,
    amount: row.amount,
  }));
}

function buildInsights(rows: TxRow[], monthKey: string): InsightItem[] {
  const thisMonth = rows.filter((row) => toMonthKey(row.date) === monthKey);
  const platforms = sumByPlatform(thisMonth, rows);
  const top = pickTopPlatform(platforms);
  const totalSpend = sumSpend(thisMonth, rows);
  const prevSpend = sumSpend(
    rows.filter((row) => toMonthKey(row.date) === getPrevMonthKey(monthKey)),
    rows,
  );
  const changePct = prevSpend > 0 ? Math.round(((totalSpend - prevSpend) / prevSpend) * 100) : 0;

  // 최빈 카테고리 찾기 — 다중 카테고리 거래는 Analysis와 같은 중복 카운트 정책을 적용해
  // 거래 1건이 N개 카테고리에 속하면 N개 모두에 +1씩 더합니다.
  const categoryCount: Record<string, number> = {};
  for (const row of thisMonth) {
    if (row.type !== "expense" || row.status === "cancel") continue;
    for (const cat of row.categories) {
      categoryCount[cat] = (categoryCount[cat] ?? 0) + 1;
    }
  }
  const topCategory = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0]?.[0];
  const repeatCount: Record<string, { count: number; title: string }> = {};
  for (const row of thisMonth) {
    if (row.type !== "expense" || row.status === "cancel") continue;
    const key = (row.detail?.cardImport?.originalMerchant || row.title).trim();
    if (!key) continue;
    const existing = repeatCount[key];
    if (existing) existing.count += 1;
    else repeatCount[key] = { count: 1, title: row.title };
  }
  const topRepeat = Object.values(repeatCount).sort((a, b) => b.count - a.count)[0];
  const CATEGORY_LABEL: Record<string, string> = {
    living: "생활용품",
    fashion: "패션/의류",
    digital: "전자기기",
    food: "식품/음료",
    etc: "기타",
  };

  const insights: InsightItem[] = [];

  if (top) {
    const platformLabel = PLATFORM_LABELS[top.platform];
    // "쿠팡이/네이버쇼핑이" 등 주격 조사도 받침 유무로 분기. 이전에는 "비중이"로 둘러서 회피했는데
    // 본문 쪽 "쿠팡에서/네이버쇼핑에서" 처럼 부사격 조사는 받침 영향이 없어 안전합니다.
    insights.push({
      id: "i1",
      kind: "warn",
      title: `${platformLabel} 비중이 가장 높아요.`,
      body: `이번 달 전체 지출의 약 ${top.share}%가 ${platformLabel}에서 발생했어요.`,
    });
  }

  if (topCategory) {
    insights.push({
      id: "i2",
      kind: "category",
      title: `${CATEGORY_LABEL[topCategory] ?? topCategory} 구매가 가장 잦았어요.`,
      body: `이 카테고리에서 ${categoryCount[topCategory]}건의 지출이 있었어요. 비슷한 주문이 반복되고 있는지 점검해 보세요.`,
    });
  }

  if (topRepeat && topRepeat.count >= 2) {
    // 거래명에 따라 "쿠팡을 사셨어요" / "네이버를 사셨어요" 가 자연스럽게 갈리도록 조사를 자동 선택합니다.
    // 이전에는 무조건 `${title}를` 이어서 "쿠팡를 사셨어요" 같은 어색한 출력 회귀가 있었습니다(QA Findings v1, ISSUE-02).
    insights.push({
      id: "i-repeat",
      kind: "repeat",
      title: `주로 ${topRepeat.title}${objectParticle(topRepeat.title)} 사셨어요.`,
      body: `이번 달에 같은 결제가 ${topRepeat.count}번 반복됐어요. 반복 구매나 고정지출인지 확인해 보세요.`,
    });
  }

  if (prevSpend > 0) {
    insights.push({
      id: "i3",
      kind: "repeat",
      title:
        changePct > 0
          ? `전월 대비 지출이 ${changePct}% 늘었어요.`
          : changePct < 0
            ? `전월 대비 지출이 ${Math.abs(changePct)}% 줄었어요.`
            : "전월과 비슷한 지출 흐름이에요.",
      body:
        changePct > 0
          ? "최근 고가 결제가 있었는지, 정기 결제가 겹치지 않았는지 확인해 보세요."
          : changePct < 0
            ? "생활비 루틴이 잘 유지되고 있어요. 이 흐름을 다음 달에도 이어가 보세요."
            : "소비 패턴이 안정적이에요. 큰 이벤트가 없으면 다음 달도 비슷한 수준으로 예상돼요.",
    });
  }

  // 최소 3장을 보장해 레이아웃이 무너지지 않게 합니다.
  if (insights.length === 0) {
    insights.push({
      id: "i0",
      kind: "category",
      title: "아직 이번 달 거래가 없어요.",
      body: "수동 입력이나 주문 캡처로 거래를 추가하면 인사이트가 생성됩니다.",
    });
  }
  return insights.slice(0, 3);
}

export const buildHomeData = (rows: TxRow[], monthKey: string): HomeMockData => {
  const thisMonth = rows.filter((row) => toMonthKey(row.date) === monthKey);
  const prevMonth = rows.filter((row) => toMonthKey(row.date) === getPrevMonthKey(monthKey));

  // 사용자가 보고 있는 월이 "오늘이 속한 월(현재 월)"인지에 따라 라벨이 달라집니다.
  // 현재 월이면 "이번 달", 과거/미래 월이면 "YYYY년 M월" 식으로 동적으로 바꿔서
  // 3월을 보면서 "이번 달 지출이 없어요"라는 어색한 문구가 뜨던 일관성 이슈를 해결합니다.
  const isCurrentMonth = monthKey === getCurrentMonthKey();
  const monthLabel = (() => {
    const [yearStr, mStr] = monthKey.split("-");
    const y = Number(yearStr);
    const m = Number(mStr);
    if (!y || !m) return monthKey;
    return `${y}년 ${m}월`;
  })();
  const periodLabel = isCurrentMonth ? "이번 달" : monthLabel;

  const totalSpend = sumSpend(thisMonth, rows);
  const prevSpend = sumSpend(prevMonth, rows);

  // 할부 승인 분할 추정으로 합산된 분 — KPI 보조 라인에 "할부 분할 추정 ₩X 포함" 으로 안내합니다.
  // 사용자가 "왜 60만원 결제가 KPI 에 10만원밖에 안 잡히지?" 라고 헷갈리지 않도록 명시합니다.
  const installmentEstimateAmount = sumInstallmentEstimateAmount(thisMonth, rows);
  const installmentEstimateCount = countInstallmentApprovalEstimates(thisMonth, rows);

  // approval+billing 페어 dedup — cross-month 매칭 포함.
  const thisMonthSkip = findApprovalsCoveredByBilling(thisMonth, rows);
  const prevMonthSkip = findApprovalsCoveredByBilling(prevMonth, rows);
  const purchaseCount = thisMonth.filter(
    (row) =>
      row.type === "expense" && row.status !== "cancel" && !thisMonthSkip.has(row.id),
  ).length;
  const avgOrder = purchaseCount > 0 ? Math.round(totalSpend / purchaseCount) : 0;
  const prevPurchaseCount = prevMonth.filter(
    (row) =>
      row.type === "expense" && row.status !== "cancel" && !prevMonthSkip.has(row.id),
  ).length;
  const prevAvg = prevPurchaseCount > 0 ? Math.round(prevSpend / prevPurchaseCount) : 0;

  /*
   * 카드 3·4 라벨 통일(2026-04-28):
   *   - "수입" = 순수 income (status not refund / not cancel) — 월급·이체 같은 진짜 들어온 돈
   *   - "환불·취소" = refund + cancel 합산 — 모두 "이미 쓴 돈을 되돌려받음" 성격이라 한 카드로
   * 이전엔 "총 수입·환불"(refund 포함) + "취소 금액"(cancel 만) 으로 분리됐는데, 사용자가
   * "통일성 + 수입은 따로 보고 환불·취소는 합쳐 보고 싶다" 요청.
   */
  const pureIncome = thisMonth
    .filter((row) => row.type === "income" && row.status !== "refund" && row.status !== "cancel")
    .reduce((sum, row) => sum + Math.max(0, row.amount), 0);
  const incomeOnlyCount = thisMonth.filter(
    (row) => row.type === "income" && row.status !== "refund" && row.status !== "cancel",
  ).length;
  const refundRows = thisMonth.filter((row) => row.status === "refund");
  const refundCount = refundRows.length;
  const refundAmount = refundRows.reduce((sum, row) => sum + Math.abs(row.amount), 0);
  // 취소 행 부호가 저장 경로에 따라 다를 수 있어(수동 입력 +, 과거 OCR -) Math.abs 로 안전하게 추출.
  const cancelRows = thisMonth.filter((row) => row.status === "cancel");
  const cancelCount = cancelRows.length;
  const cancelAmount = cancelRows.reduce((sum, row) => sum + Math.abs(row.amount), 0);
  const refundCancelAmount = refundAmount + cancelAmount;

  const spendChangePct = prevSpend > 0 ? Math.round(((totalSpend - prevSpend) / prevSpend) * 100) : 0;
  const avgChangePct = prevAvg > 0 ? Math.round(((avgOrder - prevAvg) / prevAvg) * 100) : 0;

  const kpis: KpiItem[] = [
    {
      key: "spend",
      label: "총 지출",
      value: totalSpend,
      primary: true,
      neuChip: periodLabel,
      ...(prevSpend > 0
        ? {
            delta: {
              tone: spendChangePct >= 0 ? "up" : "down",
              text: `전월 대비 ${spendChangePct >= 0 ? "+" : "−"}${Math.abs(spendChangePct)}%`,
            },
          }
        : {}),
      sub:
        purchaseCount === 0
          ? `${periodLabel} 지출이 없어요.`
          : installmentEstimateCount > 0
            ? `쇼핑 ${purchaseCount}건 · 할부 ${installmentEstimateCount}건 분할 추정 ${formatKRW(installmentEstimateAmount)} 포함`
            : `쇼핑 ${purchaseCount}건 기준`,
      spark: monthSpark(rows, monthKey),
    },
    {
      key: "avg",
      label: "평균 주문금액",
      value: avgOrder,
      ...(prevAvg > 0
        ? {
            delta: {
              tone: avgChangePct >= 0 ? "up" : "down",
              text: `전월 대비 ${avgChangePct >= 0 ? "+" : "−"}${Math.abs(avgChangePct)}%`,
            },
          }
        : {}),
      sub: purchaseCount > 0 ? `쇼핑 ${purchaseCount}건 기준` : `${periodLabel} 주문이 없어요.`,
    },
    {
      key: "income",
      label: "수입",
      value: pureIncome,
      dotColor: tokens.color.pos,
      valueColor: tokens.color.pos,
      valuePrefix: "+",
      sub:
        incomeOnlyCount === 0
          ? `${periodLabel} 수입 내역 없음`
          : `수입 ${incomeOnlyCount}건`,
    },
    {
      key: "refund-cancel",
      label: "환불·취소",
      value: refundCancelAmount,
      dotColor: tokens.color.neg,
      sub:
        refundCount + cancelCount === 0
          ? `${periodLabel} 환불·취소 내역 없음`
          : `환불 ${refundCount}건 · 취소 ${cancelCount}건`,
    },
  ];

  // 플랫폼 도넛 데이터
  const platformTotals = sumByPlatform(thisMonth, rows);
  const donutTotal = Object.values(platformTotals).reduce((sum, entry) => sum + entry.value, 0);
  // "미지정"은 실제 데이터가 있을 때만 도넛 조각으로 추가합니다. 수동 입력에서 플랫폼을 고르지 않은
  // 거래가 없다면 기존 3개 플랫폼 도넛 모양 그대로 유지.
  const donutSegments: Array<{ key: TxPlatform; label: string; color: string }> = [
    { key: "coupang" as const, label: PLATFORM_LABELS.coupang, color: tokens.color.warn },
    { key: "naver" as const, label: PLATFORM_LABELS.naver, color: tokens.color.cat2 },
  ];
  if (platformTotals.unspecified.value > 0) {
    donutSegments.push({
      key: "unspecified" as const,
      label: PLATFORM_LABELS.unspecified,
      color: "#9CA3AF",
    });
  }
  const donutItems: DonutItem[] = donutSegments.map((entry) => {
    const stats = platformTotals[entry.key];
    const percent = donutTotal > 0 ? Math.round((stats.value / donutTotal) * 100) : 0;
    return {
      label: entry.label,
      value: stats.value,
      percent,
      color: entry.color,
      count: stats.count,
    };
  });

  return {
    kpis,
    platformDonut: { total: donutTotal, items: donutItems },
    trend: { points: buildTrendPoints(rows, monthKey) },
    recent: buildRecent(rows, monthKey),
    insights: buildInsights(rows, monthKey),
    periodLabel,
  };
};
