/**
 * 역할: Analysis 화면에 필요한 지표(KPI, 플랫폼/카테고리 비중, 반복구매,
 *       정기결제, 월간 추이, 요일 패턴)를 실시간 거래 데이터로부터 파생시키는 빌더.
 *       Firestore 이관 시 입력 rows만 교체하면 화면 동작이 그대로 유지됩니다.
 * 위치: src\pages\Analysis\data.ts
 */
import type { KpiItem } from "./components/KpiStrip";
import type { PlatformBarItem } from "./components/PlatformBars";
import type { CategoryBarItem } from "./components/CategoryBars";
import type { RepeatItem } from "./components/RepeatTop3";
import type { SubscriptionItem } from "./components/SubscriptionList";
import type { WeeklyDay } from "./components/WeeklyPattern";
import type {
  TxCategory,
  TxPlatform,
  TxRow,
} from "../Transactions/components/TransactionTable";
import { tokens } from "../../styles/tokens";
import { PLATFORM_LABELS, CATEGORY_LABELS } from "../../constants/labels";
import { getCurrentMonthKey, getPrevMonthKey } from "../../constants/months";
import { detectConcept } from "../../data/categoryConcepts";
import { normalizeMerchantKey } from "../../utils/categoryInference";
import { subjectParticle } from "../../utils/koreanParticle";
import {
  countInstallmentApprovalEstimates,
  effectiveMonthlyAmount,
  findApprovalsCoveredByBilling,
  sumActualMonthlyExpense,
  sumInstallmentEstimateAmount,
} from "../../utils/expenseAccounting";
import { formatKRW } from "../../utils/format";

export interface AnalysisMockData {
  summary: string;
  kpis: KpiItem[];
  platform: {
    items: PlatformBarItem[];
    totalSpend: number;
    totalIncome: number;
    netSpend: number;
  };
  category: CategoryBarItem[];
  repeat: RepeatItem[];
  subscriptions: SubscriptionItem[];
  subscriptionTotal: number;
  trend: { points: { label: string; value: number }[]; average: number };
  weekly: { days: WeeklyDay[]; note: string; subtitle: string };
}

function toMonthKey(dateStr: string): string {
  const match = dateStr.match(/(\d{4})[./-](\d{1,2})/);
  if (!match) return "";
  const [, year, month] = match;
  return `${year}-${month.padStart(2, "0")}`;
}

function parseDate(dateStr: string): { year: number; month: number; day: number } | null {
  const match = dateStr.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
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
 * 월별 실제 지출 합계. 할부 승인 거래는 분할 추정으로 그 달 분할분만 합산합니다.
 * 단일 진실원: src/utils/expenseAccounting.ts
 */
const sumSpend = sumActualMonthlyExpense;

function countPurchase(rows: TxRow[]): number {
  // 같은 결제의 approval+billing 페어는 KPI 와 같은 dedup 정책으로 1건으로 셉니다.
  const skip = findApprovalsCoveredByBilling(rows);
  return rows.filter(
    (row) =>
      row.type === "expense" && row.status !== "cancel" && !skip.has(row.id),
  ).length;
}

/**
 * 이름 그대로 '순수입(수입 + 환불)' 합계. 취소(cancel)는 의미상 수입 흐름이지만
 * 실제로 번 돈이 아니므로 이 합계에서는 제외합니다. 대신 sumCancel으로 따로 집계해
 * 별도 KPI(예: "환불·취소")에서 합쳐 보여줍니다.
 */
function sumIncomeAndRefund(rows: TxRow[]): number {
  return rows
    .filter((row) => row.type === "income" && row.status !== "cancel")
    .reduce((sum, row) => sum + Math.max(0, row.amount), 0);
}

function sumCancel(rows: TxRow[]): number {
  return rows
    .filter((row) => row.status === "cancel")
    .reduce((sum, row) => sum + Math.abs(row.amount), 0);
}

function buildPlatform(rows: TxRow[]): {
  items: PlatformBarItem[];
  totalSpend: number;
  totalIncome: number;
  netSpend: number;
} {
  const totals: Record<TxPlatform, { value: number; count: number }> = {
    coupang: { value: 0, count: 0 },
    naver: { value: 0, count: 0 },
    // "미지정"도 하나의 막대로 구분해 보여줍니다. 값이 0이면 아래 filter에서 빠지므로
    // 실제 데이터가 없으면 차트에 등장하지 않습니다.
    unspecified: { value: 0, count: 0 },
  };
  // 같은 결제의 approval+billing 페어는 KPI 합산에서 dedup 되므로 플랫폼 막대도 동일 처리.
  const skip = findApprovalsCoveredByBilling(rows);
  for (const row of rows) {
    if (row.type !== "expense" || row.status === "cancel") continue;
    if (skip.has(row.id)) continue;
    // 플랫폼 막대도 KPI 총 지출과 합이 맞아야 하므로 effectiveMonthlyAmount 통과.
    totals[row.platform].value += effectiveMonthlyAmount(row);
    totals[row.platform].count += 1;
  }
  const totalSpend = Object.values(totals).reduce((sum, entry) => sum + entry.value, 0);
  const entries: Array<{ key: TxPlatform; label: string; color: string }> = [
    { key: "coupang", label: PLATFORM_LABELS.coupang, color: tokens.color.cat3 },
    { key: "naver", label: PLATFORM_LABELS.naver, color: tokens.color.cat2 },
    // "미지정" 버킷은 중립 회색으로 — 브랜드 톤과 충돌하지 않고 "플랫폼 없음"을 시각적으로도 암시합니다.
    { key: "unspecified", label: PLATFORM_LABELS.unspecified, color: "#9CA3AF" },
  ];
  const items: PlatformBarItem[] = entries
    .map((entry) => {
      const stats = totals[entry.key];
      const percent = totalSpend > 0 ? Math.round((stats.value / totalSpend) * 100) : 0;
      return {
        key: entry.key,
        label: entry.label,
        value: stats.value,
        percent,
        count: stats.count,
        color: entry.color,
      };
    })
    // 기존 3개 플랫폼은 항상 노출해 "이 달엔 쿠팡만 써서 나머지는 0이야"가 한눈에 보이게 했습니다.
    // "미지정"은 누락된 입력을 강조할 의도는 없어서, 해당 데이터가 실제로 있을 때만 차트에 등장시킵니다.
    .filter((item) => item.key !== "unspecified" || item.value > 0);
  const totalIncome = sumIncomeAndRefund(rows);
  return { items, totalSpend, totalIncome, netSpend: totalSpend - totalIncome };
}

/**
 * 카테고리별 집계. 색상은 호출부에서 주입받는 colorMap을 그대로 사용해,
 * 설정 화면에서 사용자가 바꾼 색이 분석 차트에 즉시 반영되도록 합니다.
 * colorMap을 전달하지 않으면 기본 팔레트를 폴백으로 사용합니다.
 */
function buildCategory(
  rows: TxRow[],
  colorMap?: Record<string, string>,
  nameMap?: Record<string, string>
): CategoryBarItem[] {
  const DEFAULT_COLORS: Record<string, string> = {
    living: tokens.color.cat2,
    fashion: tokens.color.cat1,
    digital: tokens.color.cat4,
    food: tokens.color.cat3,
    etc: tokens.color.cat5,
  };
  const resolvedColors: Record<string, string> = colorMap ?? DEFAULT_COLORS;
  // 카테고리별 합계를 동적으로 누적. 커스텀 카테고리도 처음 등장 시 0으로 초기화됩니다.
  const totals: Record<string, number> = {};
  const skip = findApprovalsCoveredByBilling(rows);
  for (const row of rows) {
    if (row.type !== "expense" || row.status === "cancel") continue;
    if (skip.has(row.id)) continue;
    // 다중 카테고리 거래는 "중복 카운트" 정책: 카테고리 N개에 속하면 N개 모두에 전액을 더합니다.
    // 합산 단위는 KPI 총 지출과 동일한 effectiveMonthlyAmount(할부 승인은 분할분).
    const monthlyContribution = effectiveMonthlyAmount(row);
    for (const cat of row.categories) {
      totals[cat] = (totals[cat] ?? 0) + monthlyContribution;
    }
  }
  const total = Object.values(totals).reduce((sum, value) => sum + value, 0);
  const entries = Object.entries(totals)
    .map(([key, amount]) => ({
      label: nameMap?.[key]
        ?? CATEGORY_LABELS[key as keyof typeof CATEGORY_LABELS]
        ?? key,
      amount,
      percent: total > 0 ? Math.round((amount / total) * 100) : 0,
      color: resolvedColors[key] ?? tokens.color.cat5,
    }))
    .sort((a, b) => b.amount - a.amount);
  return entries;
}

function buildRepeat(rows: TxRow[], nameMap?: Record<string, string>): RepeatItem[] {
  // 같은 가맹점/상호의 표기 차이("주식회사", "(주)" 등)를 흡수해 반복구매를 조금 더 안정적으로 잡습니다.
  const byTitle = new Map<
    string,
    { title: string; platform: TxPlatform; category: TxCategory; count: number; amount: number }
  >();
  for (const row of rows) {
    if (row.type !== "expense" || row.status === "cancel") continue;
    const merchantKey = normalizeMerchantKey(
      row.detail?.cardImport?.originalMerchant || row.title,
    ) || row.title;
    const existing = byTitle.get(merchantKey);
    if (existing) {
      existing.count += 1;
      existing.amount += Math.abs(row.amount);
    } else {
      byTitle.set(merchantKey, {
        title: row.title,
        platform: row.platform,
        category: row.categories[0] ?? "etc",
        count: 1,
        amount: Math.abs(row.amount),
      });
    }
  }
  return Array.from(byTitle.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.amount - a.amount;
    })
    .slice(0, 3)
    .map((entry, index) => ({
      rank: (index + 1) as 1 | 2 | 3,
      title: entry.title,
      platform: PLATFORM_LABELS[entry.platform],
      category: nameMap?.[entry.category]
        ?? CATEGORY_LABELS[entry.category as keyof typeof CATEGORY_LABELS]
        ?? entry.category,
      count: entry.count,
      amount: entry.amount,
    }));
}

const SUB_COLOR: Record<string, string> = {
  넷플릭스: "#E11D48",
  "유튜브 프리미엄": "#E11D48",
  "쿠팡 와우 멤버십": "#FB923C",
  "네이버플러스 멤버십": tokens.color.cat2,
  "스포티파이 개인": "#22C55E",
  "밀리의 서재": tokens.color.cat4,
};

const FIXED_EXPENSE_CONCEPTS = new Set(["subscription", "telecom", "utility", "insurance"]);

/**
 * 정기결제(고정지출 감지) 집계.
 *
 * `limit` 은 결과 항목 상한. 분석 페이지의 카드는 상위 5개만 보여주는 것이 정책이라
 * 기본값을 5 로 두고, 정기결제 전용 페이지처럼 전체 목록이 필요한 호출자만
 * `limit: Infinity` 를 넘겨 풀 리스트를 받습니다.
 */
export function buildSubscriptions(
  rows: TxRow[],
  monthKey: string,
  limit: number = 5,
): { items: SubscriptionItem[]; total: number } {
  const buckets = new Map<
    string,
    {
      rows: TxRow[];
      months: Set<string>;
      currentMonthRows: TxRow[];
      concept: string | null;
    }
  >();

  for (const row of rows) {
    if (row.type !== "expense" || row.status === "cancel") continue;
    const merchantBase = row.detail?.cardImport?.originalMerchant || row.title;
    const key = normalizeMerchantKey(merchantBase) || row.title;
    const bucket = buckets.get(key) ?? {
      rows: [],
      months: new Set<string>(),
      currentMonthRows: [],
      concept: detectConcept(merchantBase),
    };
    bucket.rows.push(row);
    bucket.months.add(toMonthKey(row.date));
    if (toMonthKey(row.date) === monthKey) {
      bucket.currentMonthRows.push(row);
    }
    if (!bucket.concept) {
      bucket.concept = detectConcept(merchantBase);
    }
    buckets.set(key, bucket);
  }

  const items = Array.from(buckets.values())
    .filter((bucket) => bucket.currentMonthRows.length > 0)
    .filter((bucket) => {
      const hasExplicitSubscription = bucket.rows.some((row) => row.status === "sub");
      const isFixedConcept = bucket.concept ? FIXED_EXPENSE_CONCEPTS.has(bucket.concept) : false;
      const hasMonthlyRepeat =
        bucket.months.size >= 2 &&
        bucket.rows.some((row) => row.detail?.cardImport?.paymentMode !== "installment");
      return hasExplicitSubscription || isFixedConcept || hasMonthlyRepeat;
    })
    .map((bucket) => {
      const latest = [...bucket.currentMonthRows].sort((a, b) => b.date.localeCompare(a.date))[0];
      const parsed = latest ? parseDate(latest.date) : null;
      return {
        name: latest?.title ?? "알 수 없음",
        amount: latest ? Math.abs(latest.amount) : 0,
        nextDate: parsed ? `${parsed.month}.${parsed.day}` : "",
        color:
          SUB_COLOR[latest?.title ?? ""] ??
          (bucket.concept === "utility"
            ? tokens.color.cat2
            : bucket.concept === "insurance"
              ? tokens.color.cat4
              : bucket.concept === "telecom"
                ? tokens.color.cat3
                : tokens.color.accent),
      };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, Number.isFinite(limit) ? limit : undefined)
    .map((sub, index) => ({
      id: `${monthKey}-sub-${index}`,
      name: sub.name,
      color: sub.color,
      nextDate: sub.nextDate,
      amount: sub.amount,
    }));
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  return { items, total };
}

/** JavaScript getDay()는 일요일=0 이라서 월요일=0 기준으로 맞춰 줍니다. */
function weekdayIndex(dateStr: string): number {
  const parsed = parseDate(dateStr);
  if (!parsed) return 0;
  const d = new Date(parsed.year, parsed.month - 1, parsed.day);
  // JS: 일(0)~토(6) → 우리 순서 월(0)~일(6)
  return (d.getDay() + 6) % 7;
}

function buildWeekly(rows: TxRow[]): { days: WeeklyDay[]; note: string; subtitle: string } {
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  const skip = findApprovalsCoveredByBilling(rows);
  for (const row of rows) {
    if (row.type !== "expense" || row.status === "cancel") continue;
    if (skip.has(row.id)) continue;
    // 요일 패턴도 KPI 총 지출과 합이 일치하도록 effectiveMonthlyAmount 통과.
    buckets[weekdayIndex(row.date)] += effectiveMonthlyAmount(row);
  }
  const total = buckets.reduce((sum, v) => sum + v, 0);
  const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
  // 상위 2개 요일에 강조를 부여해서 "피크 요일"을 한눈에 보이게 합니다.
  const sortedIdx = [...buckets.keys()].sort((a, b) => buckets[b] - buckets[a]);
  const emphasizeSet = new Set(sortedIdx.slice(0, 2));
  const days: WeeklyDay[] = buckets.map((amount, index) => ({
    day: DAY_LABELS[index],
    amount,
    ...(amount > 0 && emphasizeSet.has(index) ? { emphasize: true } : {}),
  }));
  const WEEKEND_INDICES = [4, 5, 6]; // 금, 토, 일
  const weekendSum = WEEKEND_INDICES.reduce((sum, i) => sum + buckets[i], 0);
  const weekendShare = total > 0 ? Math.round((weekendSum / total) * 100) : 0;
  // 실제 지출이 있는 주말 요일만 골라 레이블을 동적으로 조합합니다.
  const activeWeekendLabel = WEEKEND_INDICES
    .filter((i) => buckets[i] > 0)
    .map((i) => DAY_LABELS[i])
    .join("·");
  const note =
    total === 0
      ? "요일별 지출을 확인할 거래가 아직 없어요."
      : weekendShare >= 50
        ? `${activeWeekendLabel}에 전체의 **${weekendShare}%**가 집중돼요. 주말 쇼핑 한도를 정하면 지출 조절에 도움이 돼요.`
        : `평일 쪽 지출이 **${100 - weekendShare}%**로 더 많아요. 주말 쇼핑을 의식적으로 덜 하는 흐름이에요.`;
  // 카드 부제는 본문(note)과 같은 분기 기준으로 산출해, 헤더와 본문이 어긋나는 회귀를 차단합니다.
  // 이전에는 "주말에 집중되는 경향" 이 컴포넌트에 하드코딩되어 있어, 평일 비중이 더 큰 달에 정반대
  // 메시지가 동시에 노출되는 회귀가 있었습니다(QA Findings v1, ISSUE-01).
  const subtitle =
    total === 0
      ? "이번 달 요일별 분포"
      : weekendShare >= 50
        ? "주말에 집중되는 경향"
        : "평일에 더 분산된 흐름";
  return { days, note, subtitle };
}

function buildKpis(
  thisMonth: TxRow[],
  prevMonth: TxRow[]
): KpiItem[] {
  const totalSpend = sumSpend(thisMonth);
  const prevSpend = sumSpend(prevMonth);
  const count = countPurchase(thisMonth);
  const prevCount = countPurchase(prevMonth);
  const avg = count > 0 ? Math.round(totalSpend / count) : 0;
  const prevAvg = prevCount > 0 ? Math.round(prevSpend / prevCount) : 0;
  const refundPlusCancel = sumIncomeAndRefund(thisMonth) + sumCancel(thisMonth);
  const refundCount = thisMonth.filter((row) => row.status === "refund").length;
  const cancelCount = thisMonth.filter((row) => row.status === "cancel").length;

  const spendPct = prevSpend > 0 ? ((totalSpend - prevSpend) / prevSpend) * 100 : 0;
  const avgPct = prevAvg > 0 ? ((avg - prevAvg) / prevAvg) * 100 : 0;

  const fmtPct = (pct: number) => {
    const rounded = Math.round(pct * 10) / 10;
    const sign = rounded >= 0 ? "+" : "−";
    return `${sign}${Math.abs(rounded).toFixed(1)}%`;
  };

  const installmentEstimateAmount = sumInstallmentEstimateAmount(thisMonth);
  const installmentEstimateCount = countInstallmentApprovalEstimates(thisMonth);

  return [
    {
      key: "spend",
      label: "총 지출",
      value: totalSpend,
      ...(prevSpend > 0
        ? { delta: { tone: spendPct >= 0 ? "up" : "down", text: fmtPct(spendPct) } }
        : {}),
      ...(installmentEstimateCount > 0
        ? {
            sub: `할부 ${installmentEstimateCount}건 분할 추정 ${formatKRW(installmentEstimateAmount)} 포함`,
          }
        : {}),
    },
    {
      key: "count",
      label: "쇼핑 횟수",
      value: count,
      unit: "건",
      sub: prevCount > 0 ? `지난달 ${prevCount}건` : "주간 평균 수준",
    },
    {
      key: "avg",
      label: "평균 주문금액",
      value: avg,
      ...(prevAvg > 0
        ? { delta: { tone: avgPct >= 0 ? "up" : "down", text: fmtPct(avgPct) } }
        : {}),
    },
    {
      key: "refund",
      label: "환불·취소",
      value: refundPlusCancel,
      sub:
        refundCount + cancelCount === 0
          ? "내역 없음"
          : `환불 ${refundCount}건${cancelCount > 0 ? `, 취소 ${cancelCount}건` : ""}`,
      valueColor: tokens.color.neg,
    },
  ];
}

function buildTrend(rows: TxRow[], monthKey: string) {
  // 최근 6개월만 보여 분석 화면의 막대 라인이 과밀해지지 않도록 합니다.
  const points = [] as { label: string; value: number }[];
  const values: number[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const key = shiftMonthKey(monthKey, -i);
    const spend = sumSpend(rows.filter((row) => toMonthKey(row.date) === key));
    const month = Number(key.split("-")[1] ?? 0);
    points.push({ label: month > 0 ? `${month}월` : key, value: spend });
    values.push(spend);
  }
  const nonZero = values.filter((value) => value > 0);
  const average =
    nonZero.length > 0 ? Math.round(nonZero.reduce((sum, v) => sum + v, 0) / nonZero.length) : 0;
  return { points, average };
}

function buildSummary(
  thisMonth: TxRow[],
  prevMonth: TxRow[],
  category: CategoryBarItem[],
  platform: { items: PlatformBarItem[]; totalSpend: number },
  /**
   * 본문 카피에 들어갈 기간 라벨. 사용자가 보는 월이 현재 월이면 "이번 달", 과거 월이면 "YYYY년 M월".
   * 헤더 알림은 이 값으로 깔끔하게 통일해서 "이번 달 요약 / 2026년 3월 요약" 두 케이스 모두 자연스럽게 합니다.
   */
  periodLabel: string,
): string {
  const totalSpend = sumSpend(thisMonth);
  if (totalSpend === 0) {
    return `${periodLabel}은 아직 집계할 지출이 없어요. 거래를 입력하면 요약이 채워져요.`;
  }
  const prevSpend = sumSpend(prevMonth);
  const deltaText =
    prevSpend > 0
      ? `지난달 대비 **지출은 ${totalSpend >= prevSpend ? "+" : "−"}${Math.abs(
          Math.round(((totalSpend - prevSpend) / prevSpend) * 1000) / 10,
        ).toFixed(1)}%** ${totalSpend >= prevSpend ? "증가" : "감소"}했어요.`
      : `${periodLabel}이 첫 집계라 비교 기준은 아직 없어요.`;
  const topCategory = category[0];
  const topPlatform = [...platform.items].sort((a, b) => b.value - a.value)[0];
  const parts: string[] = [];
  if (topCategory && topCategory.percent > 0) {
    // 카테고리명은 종성에 따라 "기타(92%)가" / "생활용품(20%)이" 가 갈립니다.
    // 라벨 자체(괄호 앞)의 받침 유무가 자연스러운 발음 기준이라 label 만 검사합니다.
    parts.push(
      `**${topCategory.label}(${topCategory.percent}%)**${subjectParticle(topCategory.label)} 가장 많이 쓰고 있고`,
    );
  }
  if (topPlatform && topPlatform.percent > 0) {
    parts.push(`**${topPlatform.label}** 비중이 가장 높아요`);
  }
  const composition = parts.length > 0 ? `${parts.join(", ")}. ` : "";
  return `${periodLabel}은 ${composition}${deltaText}`;
}

export const buildAnalysisData = (
  rows: TxRow[],
  monthKey: string,
  /**
   * 표준 카테고리 키 → 색상 맵. 설정 화면에서 사용자가 지정한 색을 그대로 쓰기 위해
   * 페이지에서 categoriesStore 구독 결과를 주입합니다. 미전달 시 기본 팔레트로 폴백합니다.
   */
  categoryColorMap?: Record<TxCategory, string>,
  /** 카테고리 키 → 표시 이름 맵. 커스텀 카테고리 이름을 분석 화면에 반영하기 위해 주입합니다. */
  categoryNameMap?: Record<string, string>
): AnalysisMockData => {
  const thisMonth = rows.filter((row) => toMonthKey(row.date) === monthKey);
  const prevMonth = rows.filter((row) => toMonthKey(row.date) === getPrevMonthKey(monthKey));

  // 페이지 카피의 일관성을 위해 한 곳에서 라벨을 결정합니다. 현재 월이면 "이번 달", 과거/미래 월이면
  // "YYYY년 M월". buildSummary에 그대로 흘려보내 본문 안내문도 따라 바뀌게 합니다.
  const isCurrentMonth = monthKey === getCurrentMonthKey();
  const periodLabel = (() => {
    if (isCurrentMonth) return "이번 달";
    const [yearStr, mStr] = monthKey.split("-");
    const y = Number(yearStr);
    const m = Number(mStr);
    if (!y || !m) return monthKey;
    return `${y}년 ${m}월`;
  })();

  const platform = buildPlatform(thisMonth);
  const category = buildCategory(thisMonth, categoryColorMap, categoryNameMap);
  const repeat = buildRepeat(thisMonth, categoryNameMap);
  const { items: subscriptions, total: subscriptionTotal } = buildSubscriptions(rows, monthKey);
  const trend = buildTrend(rows, monthKey);
  const weekly = buildWeekly(thisMonth);
  const kpis = buildKpis(thisMonth, prevMonth);
  const summary = buildSummary(thisMonth, prevMonth, category, platform, periodLabel);

  return {
    summary,
    kpis,
    platform,
    category,
    repeat,
    subscriptions,
    subscriptionTotal,
    trend,
    weekly,
  };
};
