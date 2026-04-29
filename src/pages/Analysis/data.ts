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
import { getCardInstallmentKind } from "../../utils/cardInstallment";
import {
  countInstallmentApprovalEstimates,
  effectiveMonthlyAmount,
  findApprovalsCoveredByBilling,
  findBillingsLinkedToApproval,
  sumActualMonthlyExpense,
  sumInstallmentEstimateAmount,
} from "../../utils/expenseAccounting";
import { formatKRW } from "../../utils/format";

/**
 * "필수 항목" 합계 — 가계부에서 따로 추적하고 싶은 4가지 흐름(2026-04-28 사용자 피드백).
 *  · utility(공과금), maintenance(관리비), education(교육비) 는 카테고리 기반 합산
 *  · subscription(정기결제) 은 status === "sub" 기반 합산 (카테고리와는 다른 축)
 * 카테고리별 지출 카드와는 별도 섹션으로 노출해 "이번 달 고정 흐름이 얼마인지" 가 또렷이 보이게.
 */
export interface EssentialBucket {
  key: "utility" | "maintenance" | "education" | "subscription";
  label: string;
  amount: number;
  count: number;
  /** 전월 대비 차액(양수=증가, 음수=감소). 표시는 절대값+부호 칩으로 처리. */
  prevAmount: number;
}

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
  /** 공과금/관리비/교육비/정기결제 4종 합계 — 카테고리별 지출과 별도 섹션. */
  essentials: EssentialBucket[];
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

/**
 * "다음 결제" 추정값 — 가장 최근 결제일을 한 달 뒤로 이동시켜 "M.D" 형식으로 반환합니다.
 *
 * 배경(2026-04-29): 이전엔 latest.date 의 월/일을 그대로 표기해 "다음 결제 4.10" 처럼
 * 보였는데, 이는 사실상 "마지막 결제일" 이라 사용자에게 혼란을 줬습니다(사용자 피드백).
 * 실제 의미인 "다음 결제 추정일(=한 달 뒤)" 로 한 단계 미루어 표시합니다.
 *
 * 일자 클램프: 1.31 → 2.31 처럼 다음 달이 더 짧을 경우 그 달의 말일로 고정. 자바스크립트
 * Date 의 month overflow(2.31 → 3.3) 가 새는 걸 차단합니다.
 *
 * 일자 0-패딩(2026-04-29): "5.9" 와 "5.19" 가 한 컬럼에 섞이면 컬럼 폭이 들쑥날쑥해
 * 우측 "추정" 라벨이 좌우로 흔들려 보였습니다(사용자 피드백 — UI 가 물결치는 느낌).
 * "M.DD" 로 두 자리 고정하면 같은 달 안에서 모든 행이 동일 폭이 되어 정렬이 깔끔합니다.
 *
 * 표시용 라벨("추정") 은 UI 단에서 붙입니다 — `deriveDayOfMonth` 같은 후속 파서가
 * trailing 숫자를 그대로 읽을 수 있도록, 데이터 필드는 깔끔한 "M.DD" 만 유지합니다.
 */
function projectNextPaymentDate(parsed: { year: number; month: number; day: number }): string {
  const m = parsed.month;
  const nextMonth1Indexed = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? parsed.year + 1 : parsed.year;
  // new Date(year, monthIndex, 0) 트릭 → 그 monthIndex(1-based 로 보면 해당 월) 의 말일.
  const lastDayOfNextMonth = new Date(nextYear, nextMonth1Indexed, 0).getDate();
  const clampedDay = Math.min(parsed.day, lastDayOfNextMonth);
  return `${nextMonth1Indexed}.${String(clampedDay).padStart(2, "0")}`;
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

function countPurchase(rows: TxRow[], allRows?: TxRow[]): number {
  // 같은 결제의 approval+billing 페어는 KPI 와 같은 dedup 정책으로 1건으로 셉니다.
  const skip = findApprovalsCoveredByBilling(rows, allRows);
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

function buildPlatform(rows: TxRow[], allRows?: TxRow[]): {
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
  const skip = findApprovalsCoveredByBilling(rows, allRows);
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
  nameMap?: Record<string, string>,
  allRows?: TxRow[],
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
  const skip = findApprovalsCoveredByBilling(rows, allRows);
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
    /*
     * TOP3 → TOP5 확장(2026-04-28 사용자 피드백). 정기결제 카드와 시각 높이를 맞추려면
     * 같은 행 수를 가져야 카드 위쪽 공백이 사라집니다.
     */
    .slice(0, 5)
    .map((entry, index) => ({
      rank: (index + 1) as RepeatItem["rank"],
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

/** "utility" 카테고리로 묶을 개념들(공과금/통신/보험). UI 에서 "공과금" 칩으로 통합 표시. */
const UTILITY_CONCEPTS = new Set(["telecom", "utility", "insurance"]);

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

  /*
   * 분류 태그 결정. 우선순위가 위에서 아래로 내려갑니다:
   *   1) status === "sub"             → "subscription" (사용자 마킹)
   *   2) concept = "subscription"     → "subscription" (넷플릭스 등 명백한 구독 가맹점)
   *   3) concept ∈ UTILITY_CONCEPTS   → "utility"      (공과금/통신비/보험)
   *   4) 할부 행 존재(이번 달)         → "installment"  (할부 결제 진행중)
   *   5) 같은 가맹점 3건+              → "frequent"     (자주 구매)
   *   6) 그 외                          → null (정기결제 목록에 포함 안 함)
   *
   * 정책 변경(2026-04-28): "2개월+ 비슷 금액 → 정기결제" 자동 패턴 매칭을 제거했습니다.
   * 매월 비슷한 금액으로 두 번 들른 식당/병원이 모두 "정기결제" 로 잡혀 false positive 가
   * 컸어요(예: 국밥집 매달 10,000 / 이비인후과 매달 4,000 등). 정기결제 태그는 이제
   * "사용자 명시" 또는 "명백한 구독 가맹점 개념" 만 인정하고, 같은 가맹점 반복 결제는
   * 일괄 "자주 구매" 로 떨어뜨립니다 — 사용자가 진짜 구독이라면 거래 상세에서 status 를
   * "정기결제" 로 마킹하면 다음 빌드부터 즉시 승격됩니다.
   */
  type Bucket = {
    rows: TxRow[];
    months: Set<string>;
    currentMonthRows: TxRow[];
    concept: string | null;
  };
  const detectTagKind = (bucket: Bucket): SubscriptionItem["tagKind"] | null => {
    if (bucket.rows.some((row) => row.status === "sub")) return "subscription";
    if (bucket.concept === "subscription") return "subscription";
    if (bucket.concept && UTILITY_CONCEPTS.has(bucket.concept)) return "utility";
    const hasInstallmentInCurrentMonth = bucket.currentMonthRows.some((row) => {
      const ci = row.detail?.cardImport;
      if (!ci) return false;
      const kind = getCardInstallmentKind(ci, row.amount);
      return kind === "installment_approval" || kind === "installment_billing";
    });
    if (hasInstallmentInCurrentMonth) return "installment";

    const expenseRows = bucket.rows.filter(
      (row) => row.type === "expense" && row.status !== "cancel",
    );
    if (expenseRows.length >= 3) return "frequent";
    return null;
  };

  const items = Array.from(buckets.values())
    .filter((bucket) => bucket.currentMonthRows.length > 0)
    .map((bucket) => {
      const tagKind = detectTagKind(bucket);
      if (!tagKind) return null;
      const latest = [...bucket.currentMonthRows].sort((a, b) => b.date.localeCompare(a.date))[0];
      const parsed = latest ? parseDate(latest.date) : null;
      /*
       * "월마다 빠지는 돈" 정의:
       *   - 일반 결제(구독/공과금/청구/자주 구매): amount 그대로
       *   - 할부 승인(amount 가 총액): amount / installmentMonths 분할 추정
       *
       * Phase 5B (2026-04-28): approval 이 쌓인 billing 행과 패턴 매칭되면 그 billing 들의
       * 평균을 "실제 청구 평균(이자 포함)" 으로 표시 — 사용자가 추가 데이터 import 한 만큼
       * 추정 → 실측으로 자동 갱신됩니다. 이자 데이터가 따로 안 들어오는 카드사 한계를
       * billing 행이 들어왔을 때 우회하는 메커니즘.
       */
      const ci = latest?.detail?.cardImport;
      const isApproval =
        latest && ci
          ? getCardInstallmentKind(ci, latest.amount) === "installment_approval"
          : false;
      const installmentMonths = isApproval ? ci?.installmentMonths ?? 0 : 0;
      const rawAmount = latest ? Math.abs(latest.amount) : 0;
      const linkedBillings =
        isApproval && latest ? findBillingsLinkedToApproval(latest, rows) : [];
      const billingAvg =
        linkedBillings.length > 0
          ? Math.round(
              linkedBillings.reduce((s, b) => s + Math.abs(b.amount), 0) /
                linkedBillings.length,
            )
          : null;
      const monthlyAmount =
        billingAvg !== null
          ? billingAvg
          : isApproval && installmentMonths > 0
            ? Math.round(rawAmount / installmentMonths)
            : rawAmount;
      // 추정인지 실측인지: 할부 승인이고 빌링 매칭 안 된 경우에만 "추정" 라벨 노출.
      // 빌링 매칭되면 실제 청구액 평균이라 정확 → "추정" 안 붙임.
      const isEstimated = isApproval && billingAvg === null && installmentMonths > 0;
      /*
       * billing 행의 원금/개월수 메타(2026-04-28 추가).
       *
       * billing 행은 회차가 명시돼 있어 카드사 측 계산값(billedAmount) 이 정확하므로
       * "(월 추정)" 라벨은 안 붙지만, sub 라인에 "원금 ₩X · N개월" 은 함께 보여 줘야
       * 사용자가 이 결제의 총 규모를 한눈에 알 수 있습니다(거래내역 표 정책과 일치).
       *
       * 우선순위:
       *  1) cardImport.approvedAmount (CSV 의 원본 "이용금액") 이 있으면 그대로
       *  2) 없으면 회차당 청구액 × cycleTotal 로 역산 (이자 미포함 추정값)
       * 개월수는 cycleTotal > installmentMonths > undefined 순.
       */
      const isBilling =
        !isApproval &&
        ci?.recordKind === "billing" &&
        ci?.paymentMode === "installment";
      const billingCycleTotal =
        ci?.installmentCycleTotal ?? ci?.installmentMonths ?? 0;
      const billingOriginal = isBilling
        ? ci?.approvedAmount ??
          (billingCycleTotal > 1
            ? Math.round(rawAmount * billingCycleTotal)
            : undefined)
        : undefined;
      const billingMonths =
        isBilling && billingCycleTotal > 0 ? billingCycleTotal : undefined;
      /*
       * 데이터로 매월 반복 패턴 확인 여부(2026-04-28 강화: 일자 매칭 추가).
       *
       * 정의(모두 충족해야 ✓):
       *   1) 같은 가맹점에서 **할부가 아닌** 일반 결제가
       *   2) **서로 다른 달** 에 2건 이상
       *   3) 금액 편차 ±15% 이내
       *   4) **결제 일자(day-of-month) 가 ±5일 이내로 비슷** ← 이번 라운드 추가
       *
       * 4) 추가 배경: 사용자 보고로 "씨제이올리브영 전북대점" 이 ✓ 로 잡혀 있는데 데이터를
       * 보니 2026.04.03 + 2026.03.27 두 건. 같은 가맹점·금액 비슷·다른 달 까지 충족이라
       * 우리 룰에는 걸렸지만 실제로는 "매달 27~3일 사이 = 매월 같은 날 결제" 로 보기 어려운
       * 케이스. 정기결제는 **카드사 측 재시도 폭(3~5일)** 안에서 매달 같은 날 비슷하게
       * 빠지는 흐름이라, day-of-month 가 ±5일 이내인 결제만 "반복" 으로 인정합니다.
       *
       * month boundary 회귀(예: 1.30 + 2.1 = 사실상 2일 차이) 차단 위해 modular distance
       * (min(|d1-d2|, 31-|d1-d2|)) 사용 — 31일 사이클 위에서 가장 짧은 거리.
       *
       * 할부 행 제외(이전 라운드 유지): "한 번 결제 → N개월 분할" 이라 검증 단위 아님.
       */
      const patternVerified = (() => {
        const verifiedRows = bucket.rows.filter((r) => {
          if (r.type !== "expense") return false;
          if (r.status === "cancel") return false;
          const rci = r.detail?.cardImport;
          if (rci) {
            const k = getCardInstallmentKind(rci, r.amount);
            if (k === "installment_approval" || k === "installment_billing") return false;
          }
          return true;
        });
        if (verifiedRows.length < 2) return false;
        const verifiedMonths = new Set(verifiedRows.map((r) => toMonthKey(r.date)));
        if (verifiedMonths.size < 2) return false;
        // 금액 편차
        const amounts = verifiedRows.map((r) => Math.abs(r.amount));
        const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
        if (avg <= 0) return false;
        const maxDev = Math.max(...amounts.map((a) => Math.abs(a - avg))) / avg;
        if (maxDev > 0.15) return false;
        // 결제 일자(day-of-month) ±5일 이내 — 정기결제 재시도 폭 표준값.
        const days = verifiedRows
          .map((r) => parseDate(r.date)?.day ?? 0)
          .filter((d) => d >= 1 && d <= 31);
        if (days.length < 2) return false;
        const base = days[0];
        const RECURRING_DAY_TOLERANCE = 5;
        const allClose = days.every((d) => {
          const raw = Math.abs(d - base);
          const modular = Math.min(raw, 31 - raw);
          return modular <= RECURRING_DAY_TOLERANCE;
        });
        return allClose;
      })();
      /*
       * 색 정책(2026-04-28): tagKind 기반으로 4개 분류만 색을 분리. 이전엔 concept 별로
       * (telecom=cat3, insurance=cat4 등) 잡았는데 telecom 의 cat3 와 installment 의 warn
       * 이 같은 #B45309 라 사용자가 "공과금이랑 할부가 같은 색이야?" 라고 헷갈림.
       *   - subscription : accent(인디고)
       *   - utility      : cat2(틸 그린)  ← telecom/insurance/utility 모두
       *   - installment  : warn(앰버 브라운)
       *   - frequent     : ink4(회색)
       * SUB_COLOR(넷플릭스 등 명시 매핑) 은 brand 색 우선이라 그대로 유지.
       */
      const tagColor =
        tagKind === "subscription"
          ? tokens.color.accent
          : tagKind === "utility"
            ? tokens.color.cat2
            : tagKind === "installment"
              ? tokens.color.warn
              : tokens.color.ink4;
      return {
        name: latest?.title ?? "알 수 없음",
        amount: monthlyAmount,
        // 원금/개월수 — approval 우선, 그 외엔 billing 메타로 채워 둘 다 sub 라인에 노출.
        installmentOriginalAmount:
          isApproval && installmentMonths > 0 ? rawAmount : billingOriginal,
        installmentMonths:
          isApproval && installmentMonths > 0
            ? installmentMonths
            : billingMonths,
        isEstimated,
        patternVerified,
        nextDate: parsed ? projectNextPaymentDate(parsed) : "",
        latestTxId: latest?.id,
        tagKind,
        color: SUB_COLOR[latest?.title ?? ""] ?? tagColor,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, Number.isFinite(limit) ? limit : undefined)
    .map((sub, index) => ({
      id: `${monthKey}-sub-${index}`,
      name: sub.name,
      color: sub.color,
      nextDate: sub.nextDate,
      amount: sub.amount,
      installmentOriginalAmount: sub.installmentOriginalAmount,
      installmentMonths: sub.installmentMonths,
      isEstimated: sub.isEstimated,
      patternVerified: sub.patternVerified,
      tagKind: sub.tagKind,
      latestTxId: sub.latestTxId,
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

function buildWeekly(rows: TxRow[], allRows?: TxRow[]): { days: WeeklyDay[]; note: string; subtitle: string } {
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  const skip = findApprovalsCoveredByBilling(rows, allRows);
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
  prevMonth: TxRow[],
  allRows: TxRow[],
): KpiItem[] {
  const totalSpend = sumSpend(thisMonth, allRows);
  const prevSpend = sumSpend(prevMonth, allRows);
  const count = countPurchase(thisMonth, allRows);
  const prevCount = countPurchase(prevMonth, allRows);
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

  const installmentEstimateAmount = sumInstallmentEstimateAmount(thisMonth, allRows);
  const installmentEstimateCount = countInstallmentApprovalEstimates(thisMonth, allRows);

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
    const slice = rows.filter((row) => toMonthKey(row.date) === key);
    // cross-month dedup 을 위해 allRows(=rows) 같이 전달.
    const spend = sumSpend(slice, rows);
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
  allRows: TxRow[],
): string {
  const totalSpend = sumSpend(thisMonth, allRows);
  if (totalSpend === 0) {
    return `${periodLabel}은 아직 집계할 지출이 없어요. 거래를 입력하면 요약이 채워져요.`;
  }
  const prevSpend = sumSpend(prevMonth, allRows);
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

  const platform = buildPlatform(thisMonth, rows);
  const category = buildCategory(thisMonth, categoryColorMap, categoryNameMap, rows);
  const repeat = buildRepeat(thisMonth, categoryNameMap);
  /*
   * 분석 페이지의 정기결제 카드는 SubscriptionList 의 ScrollArea(max-height + overflow-y) 가
   * 자체 wheel 스크롤을 갖고 있어 항목이 많아도 카드 높이는 일정합니다. 그러므로 데이터 단계
   * 에서 상위 N건만 자르면 사용자가 "이 가맹점 결제는 어디 갔지?" 하고 헷갈리는 회귀가 발생.
   * 분석에서도 풀 리스트를 받아 카드 안에서 굴려 보도록 limit: Infinity (2026-04-28 사용자 피드백).
   */
  const { items: subscriptions, total: subscriptionTotal } = buildSubscriptions(
    rows,
    monthKey,
    Number.POSITIVE_INFINITY,
  );
  const trend = buildTrend(rows, monthKey);
  const weekly = buildWeekly(thisMonth, rows);
  const kpis = buildKpis(thisMonth, prevMonth, rows);
  const summary = buildSummary(thisMonth, prevMonth, category, platform, periodLabel, rows);
  const essentials = buildEssentials(thisMonth, prevMonth, rows);

  return {
    summary,
    kpis,
    platform,
    category,
    repeat,
    subscriptions,
    subscriptionTotal,
    essentials,
    trend,
    weekly,
  };
};

/**
 * 필수 항목 합계 4종(2026-04-28 사용자 피드백 — 가계부 핵심 흐름):
 *  · utility(공과금), maintenance(관리비), education(교육비): 카테고리에 포함된 거래 합산
 *  · subscription(정기결제): status === "sub" 거래 합산
 *
 * 합산 단위는 KPI 총 지출과 동일한 effectiveMonthlyAmount(할부 승인은 분할분).
 * approval+billing 페어 dedup 도 적용해 같은 결제가 두 번 카운트되지 않도록 합니다.
 * 다중 카테고리 거래(예: ["utility","etc"]) 는 utility 가 한 번만 카운트되도록 categories.includes 체크.
 */
function buildEssentialAmount(
  rows: TxRow[],
  predicate: (row: TxRow) => boolean,
  allRows: TxRow[],
): { amount: number; count: number } {
  const skip = findApprovalsCoveredByBilling(rows, allRows);
  let amount = 0;
  let count = 0;
  for (const row of rows) {
    if (row.type !== "expense" || row.status === "cancel") continue;
    if (skip.has(row.id)) continue;
    if (!predicate(row)) continue;
    amount += effectiveMonthlyAmount(row);
    count += 1;
  }
  return { amount, count };
}

/*
 * 행이 어떤 essentials 분류에 속하는지 결정하는 공용 검사기(2026-04-28 보강).
 *
 * 회귀 배경: 사용자 데이터에 "공과금/정기결제" 가 분명 있는데 EssentialStrip 가 0원으로 떴음.
 * 원인은 `row.categories.includes("utility")` 만 보던 점인데, 자동 카테고리 추정이 켜진
 * 시점 이전에 들어온 행은 카테고리가 etc 인 채로 저장돼 있어 매칭에서 빠집니다.
 *
 * 폴백 체인:
 *  1) 카테고리에 직접 들어 있으면 우선 매칭(가장 정확).
 *  2) 가맹점명에서 detectConcept 로 추정한 concept 이 같은 의미군이면 매칭.
 *     - utility 카테고리: utility / telecom concept (둘 다 "고정 청구" 라는 가계부 흐름)
 *     - maintenance 카테고리: maintenance concept
 *     - education 카테고리: education concept
 *  3) 정기결제는 status="sub" + concept subscription 둘 중 하나라도 매칭.
 *
 * 이렇게 하면 카테고리 미정정 행도 합계에 자연스럽게 포함되고, 사용자가 카테고리를 직접
 * "기타" 로 둔 행도 의도가 명확하면 잡힙니다(가맹점이 "한국전력" 이면 그건 공과금이 맞음).
 */
function rowConcept(row: TxRow): string | null {
  // 가맹점명은 화면 표시명(title) 보다 카드 원문(originalMerchant) 이 정규화 정확도가 높음.
  // 둘 다 시도하고 먼저 매칭되는 concept 우선.
  const candidates = [row.detail?.cardImport?.originalMerchant, row.title].filter(
    (v): v is string => Boolean(v),
  );
  for (const merchant of candidates) {
    const c = detectConcept(merchant);
    if (c) return c;
  }
  return null;
}

function buildEssentials(
  thisMonth: TxRow[],
  prevMonth: TxRow[],
  allRows: TxRow[],
): EssentialBucket[] {
  const matchUtility = (row: TxRow) => {
    if (row.categories.includes("utility")) return true;
    const c = rowConcept(row);
    return c === "utility" || c === "telecom";
  };
  const matchMaintenance = (row: TxRow) => {
    if (row.categories.includes("maintenance")) return true;
    return rowConcept(row) === "maintenance";
  };
  const matchEducation = (row: TxRow) => {
    if (row.categories.includes("education")) return true;
    return rowConcept(row) === "education";
  };
  const matchSubscription = (row: TxRow) => {
    if (row.status === "sub") return true;
    return rowConcept(row) === "subscription";
  };

  const buckets: Array<{
    key: EssentialBucket["key"];
    label: string;
    predicate: (row: TxRow) => boolean;
  }> = [
    { key: "utility", label: "공과금", predicate: matchUtility },
    { key: "maintenance", label: "관리비", predicate: matchMaintenance },
    { key: "education", label: "교육비", predicate: matchEducation },
    { key: "subscription", label: "정기결제", predicate: matchSubscription },
  ];

  return buckets.map(({ key, label, predicate }) => {
    const cur = buildEssentialAmount(thisMonth, predicate, allRows);
    const prev = buildEssentialAmount(prevMonth, predicate, allRows);
    return {
      key,
      label,
      amount: cur.amount,
      count: cur.count,
      prevAmount: prev.amount,
    };
  });
}
