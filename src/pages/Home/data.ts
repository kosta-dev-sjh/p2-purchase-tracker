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

function sumSpend(rows: TxRow[]): number {
  return rows
    .filter((row) => row.type === "expense" && row.status !== "cancel")
    .reduce((sum, row) => sum + Math.abs(row.amount), 0);
}

function sumByPlatform(rows: TxRow[]): Record<TxPlatform, { value: number; count: number }> {
  // "unspecified"도 하나의 버킷으로 유지합니다. 수동 입력에서 플랫폼을 고르지 않은 거래를
  // 어딘가에 담아야 합계/퍼센트가 일관되게 계산돼서, 도넛이나 랭크 카드에 "미지정"으로 등장할 수 있게 합니다.
  const seed: Record<TxPlatform, { value: number; count: number }> = {
    coupang: { value: 0, count: 0 },
    naver: { value: 0, count: 0 },
    unspecified: { value: 0, count: 0 },
  };
  for (const row of rows) {
    if (row.type !== "expense" || row.status === "cancel") continue;
    seed[row.platform].value += Math.abs(row.amount);
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
  const byDay = new Map<number, number>();
  for (const row of thisMonth) {
    const day = parseDay(row.date);
    byDay.set(day, (byDay.get(day) ?? 0) + Math.abs(row.amount));
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
    const spend = sumSpend(rows.filter((row) => toMonthKey(row.date) === key));
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
  const platforms = sumByPlatform(thisMonth);
  const top = pickTopPlatform(platforms);
  const totalSpend = sumSpend(thisMonth);
  const prevSpend = sumSpend(
    rows.filter((row) => toMonthKey(row.date) === getPrevMonthKey(monthKey))
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
  const CATEGORY_LABEL: Record<string, string> = {
    living: "생활용품",
    fashion: "패션/의류",
    digital: "전자기기",
    food: "식품/음료",
    etc: "기타",
  };

  const insights: InsightItem[] = [];

  if (top) {
    insights.push({
      id: "i1",
      kind: "warn",
      title: `${PLATFORM_LABELS[top.platform]} 비중이 가장 높아요.`,
      body: `이번 달 전체 지출의 약 ${top.share}%가 ${PLATFORM_LABELS[top.platform]}에서 발생했어요.`,
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
      body: "수동 입력이나 OCR 업로드로 거래를 추가하면 인사이트가 생성됩니다.",
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

  const totalSpend = sumSpend(thisMonth);
  const prevSpend = sumSpend(prevMonth);

  const purchaseCount = thisMonth.filter(
    (row) => row.type === "expense" && row.status !== "cancel"
  ).length;
  const avgOrder = purchaseCount > 0 ? Math.round(totalSpend / purchaseCount) : 0;
  const prevPurchaseCount = prevMonth.filter(
    (row) => row.type === "expense" && row.status !== "cancel"
  ).length;
  const prevAvg = prevPurchaseCount > 0 ? Math.round(prevSpend / prevPurchaseCount) : 0;

  // "총 수입 · 환불"은 순수입 지표라서 취소는 제외합니다. 취소는 의미상 수입 흐름이지만
  // "진짜 번 돈"이 아니기 때문에, 별도의 "취소 금액" KPI에서만 집계해 지표를 분리합니다.
  const incomeRefund = thisMonth
    .filter((row) => row.type === "income" && row.status !== "cancel")
    .reduce((sum, row) => sum + Math.max(0, row.amount), 0);
  const refundCount = thisMonth.filter((row) => row.status === "refund").length;

  // 취소 행은 저장 경로에 따라 부호가 다를 수 있어(수동 입력은 +, 과거 OCR은 -)
  // Math.abs로 금액만 추출해 독립 카드에 보여줍니다.
  const cancelRows = thisMonth.filter((row) => row.status === "cancel");
  const cancelAmount = cancelRows.reduce((sum, row) => sum + Math.abs(row.amount), 0);

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
      sub: purchaseCount === 0 ? `${periodLabel} 지출이 없어요.` : `쇼핑 ${purchaseCount}건 기준`,
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
      label: "총 수입 · 환불",
      value: incomeRefund,
      dotColor: tokens.color.pos,
      valueColor: tokens.color.pos,
      valuePrefix: "+",
      sub: refundCount > 0 ? `환불 ${refundCount}건 포함` : "수입 · 환불 내역 없음",
    },
    {
      key: "cancel",
      label: "취소 금액",
      value: cancelAmount,
      dotColor: tokens.color.neg,
      sub:
        cancelRows.length === 0
          ? `${periodLabel} 취소 내역 없음`
          : cancelRows.length === 1
            ? `취소 1건 · ${cancelRows[0].title}`
            : `취소 ${cancelRows.length}건`,
    },
  ];

  // 플랫폼 도넛 데이터
  const platformTotals = sumByPlatform(thisMonth);
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
