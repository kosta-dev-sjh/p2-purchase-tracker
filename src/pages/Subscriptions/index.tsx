/**
 * 역할: "반복결제" 전용 페이지의 진입 컴포넌트.
 *       분석 페이지의 SubscriptionList 카드를 더 풍성하게 펼쳐 보여주는 화면입니다.
 *       정기결제·공과금·할부·자주 구매를 한 화면에서 분류 태그로 구분해 보여줍니다.
 *       - KPI 스트립: 이번 달 합계 / 전월 대비 / 항목 수
 *       - 전체 목록: buildSubscriptions(rows, month, Infinity) 결과 그대로
 *
 *       탐지 로직(status='sub' + concept 휴리스틱 + 할부 + 자주 구매) 자체는
 *       Analysis/data.ts 의 buildSubscriptions 단일 진실원을 재사용합니다 — 두 화면 사이에
 *       탐지 결과가 어긋나지 않도록 하기 위함입니다.
 *
 *       이름 메모(2026-04-28): 페이지/메뉴 이름은 "반복결제" — 정기결제 + 공과금 + 할부 +
 *       자주 구매 를 모두 포괄하는 우산 라벨. 분류 칩의 "정기결제"(좁은 의미, 구독성) 와
 *       구분.
 *
 * 위치: src/pages/Subscriptions/index.tsx
 */
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import styled, { css, keyframes } from "styled-components";
import { AppShell } from "../../components/layout/AppShell";
import { MonthPicker } from "../../components/primitives/MonthPicker";
import { Card, CardBd, CardHd, CardTitle } from "../../components/primitives/Card";
import { Chip } from "../../components/primitives/Chip";
import { tokens } from "../../styles/tokens";
import { media } from "../../tokens/breakpoints";
import { useTransactionsStore } from "../../stores/transactionsStore";
import { buildSubscriptions } from "../Analysis/data";
import type {
  SubscriptionItem,
  SubscriptionTagKind,
} from "../Analysis/components/SubscriptionList";
import {
  computeMaxMonthKey,
  computeMinYear,
  getCurrentMonthKey,
  getPrevMonthKey,
} from "../../constants/months";
import { formatKRW } from "../../utils/format";

/**
 * KPI 카드 3개를 가로로 배치하는 스트립.
 * 모바일에서는 2열 그리드(가로 좁음 → 1열) 로 자연스럽게 줄어듭니다.
 */
const KpiStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;

  ${media.tablet} {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  ${media.mobile} {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
`;

const KpiCard = styled.div`
  padding: 14px 16px;
  background: ${tokens.color.panel};
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.card};

  .label {
    color: ${tokens.color.ink4};
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .value {
    margin-top: 6px;
    color: ${tokens.color.ink1};
    font-family: ${tokens.font.mono};
    font-size: 18px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .delta {
    margin-top: 4px;
    font-size: 11.5px;
    font-weight: 600;
  }

  .delta--up {
    color: ${tokens.color.neg};
  }

  .delta--down {
    color: ${tokens.color.pos};
  }

  .delta--flat {
    color: ${tokens.color.ink4};
  }

  ${media.mobile} {
    padding: 10px 12px;

    .label {
      font-size: 10.5px;
    }

    .value {
      font-size: 15px;
    }

    .delta {
      font-size: 10.5px;
    }
  }
`;

/**
 * 활성 필터의 합계를 표 상단에 명시(2026-04-28 사용자 피드백).
 * 사용자가 탭을 누르면 표에 보이는 항목이 줄어드는데, 페이지 어디에도 그 분류의 합계가
 * 다시 표시되지 않아 "지금 보고 있는 게 무엇의 합계지?" 가 모호했습니다. 표 바로 위에
 * "이번 달 [공과금] 합계 ₩X · N건" 헤더 행으로 명시.
 *
 * 디자인(개정): 1차 시안의 라벤더 배경 + 좌측 strip 이 카드의 다른 영역과 톤이 너무 분리돼
 * 어색하다는 피드백 → 배경을 빼고 점선 보더 한 줄로 단정하게 처리. 표 위 "행 헤더" 처럼
 * 자연스럽게 얹혀 보입니다.
 */
const FilterTotalBanner = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 12px;
  padding: 10px 2px 12px;
  border-bottom: 1px solid ${tokens.color.line2};

  .label {
    color: ${tokens.color.ink3};
    font-size: 12.5px;
    font-weight: 500;
    letter-spacing: -0.01em;

    strong {
      color: ${tokens.color.ink1};
      font-weight: 700;
    }
  }

  .total {
    color: ${tokens.color.ink1};
    font-family: ${tokens.font.mono};
    font-size: 16px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .count {
    margin-left: 6px;
    color: ${tokens.color.ink4};
    font-family: ${tokens.font.sans};
    font-size: 12px;
    font-weight: 500;
  }

  ${media.mobile} {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;

    .total {
      font-size: 15px;
    }
  }
`;

/**
 * 분류 필터 칩 그룹 — 전체 / 공과금 / 할부 결제 / 정기결제 / 자주 구매 중 하나만 활성화.
 * 모바일 좁은 폭에서는 가로 스크롤 허용해 칩이 잘리지 않게.
 */
const FilterChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;

  ${media.mobile} {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
  }
`;

const FilterChip = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid
    ${({ $active }) => ($active ? tokens.color.accent : tokens.color.line)};
  background: ${({ $active }) =>
    $active ? tokens.color.accentSubtle : tokens.color.panel};
  color: ${({ $active }) =>
    $active ? tokens.color.accentHover : tokens.color.ink2};
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  transition:
    background ${tokens.motion.fast} ease,
    border-color ${tokens.motion.fast} ease,
    color ${tokens.motion.fast} ease;

  &:hover {
    background: ${({ $active }) =>
      $active ? tokens.color.accentSubtle : tokens.color.tint};
  }

  &:focus,
  &:focus-visible {
    outline: none;
    box-shadow: ${tokens.shadow.focus};
  }

  .count {
    color: ${({ $active }) => ($active ? tokens.color.accentHover : tokens.color.ink4)};
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
`;

/**
 * 반복결제 페이지 표 — 거래내역 표(TransactionTable) 와 같은 grid 컬럼 톤으로 통일해
 * "수입·지출 내역과 같은 모양으로 데이터를 본다" 는 인상 (2026-04-28 사용자 요청).
 *
 * 컬럼: 색칩(28) | 분류(110) | 가맹점(1fr) | 다음 결제(80) | 반복(72) | 금액(180)
 *   - 반복: 데이터 상 매월 같은 패턴이 검증된 경우 ✓ 칩, 아니면 dash
 * 스크롤은 분석 페이지의 SubscriptionList 카드에만 적용 — 이 전용 페이지는 페이지
 * 자체 스크롤로 충분하므로 내부 max-height 안 잡음.
 */
const Table = styled.div`
  display: grid;
  grid-template-columns: 28px 110px minmax(0, 1fr) 80px 72px 180px;

  ${media.tablet} {
    grid-template-columns: 28px 96px minmax(0, 1fr) 70px 64px 156px;
  }
`;

/**
 * "월별 반복 확인됨" 칩. 데이터 상 같은 가맹점 2개월+ + 금액 ±15% 일관 시 노출.
 * 분류 칩(공과금/할부 등) 과는 의미가 달라 색을 분리: 정보성 그린 톤(pos).
 * 미확인 항목은 dash 로 비워둠 — 사용자가 "이건 아직 검증 안 된 추정 분류" 임을 즉각 인지.
 */
const VerifiedChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 999px;
  background: ${tokens.color.posBg};
  color: ${tokens.color.pos};
  font-size: 10.5px;
  font-weight: 700;
  white-space: nowrap;
`;

const UnverifiedDash = styled.span`
  color: ${tokens.color.ink5 ?? tokens.color.ink4};
  font-size: 13px;
`;

/**
 * 행 등장 애니메이션 — 거래내역 표(TransactionTable) 와 같은 톤으로 통일.
 * 페이지 첫 진입 시 항목들이 위에서 살짝 내려앉으며 페이드 인. stagger 로 자연스러운 흐름.
 */
const rowEnter = keyframes`
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
`;

/**
 * 카드 본문 상단 안내 — 할부 결제의 분할 추정·이자 미포함 disclaimer 를 한 곳으로 모았습니다.
 * 이전에는 매 행마다 "원금 ₩X · 할부 N개월 분할 추정 (이자 미포함)" 이 반복돼 회색 글씨가
 * 도배되어 가시성 떨어졌어요(2026-04-28). 카드 단위로 한 번만 안내하고 행에는 핵심 메타만.
 */
const CardHint = styled.div`
  margin: 0 0 8px;
  padding: 8px 12px;
  border: 1px dashed ${tokens.color.line};
  border-radius: ${tokens.radius.control};
  background: ${tokens.color.bg};
  color: ${tokens.color.ink3};
  font-size: 11.5px;
  line-height: 1.5;

  strong {
    color: ${tokens.color.ink2};
    font-weight: 600;
  }
`;

const HeaderCell = styled.div`
  padding: 8px 12px;
  background: ${tokens.color.foot};
  border-bottom: 1px solid ${tokens.color.line2};
  color: ${tokens.color.ink4};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;

  &.center {
    text-align: center;
  }

  &.right {
    text-align: right;
  }
`;

const Cell = styled.div<{
  $right?: boolean;
  $center?: boolean;
  $hovered?: boolean;
  /** 첫 화면에 잡힌 행만 stagger 입장 애니메이션 (재정렬·필터 변경 후엔 적용 안 함). */
  $enterIndex?: number;
}>`
  display: flex;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid ${tokens.color.line2};
  min-width: 0;
  cursor: pointer;
  transition: background ${tokens.motion.fast} ease;

  ${({ $right }) =>
    $right &&
    css`
      justify-content: flex-end;
    `}

  ${({ $center }) =>
    $center &&
    css`
      justify-content: center;
    `}

  ${({ $hovered }) =>
    $hovered &&
    css`
      background: ${tokens.color.tint};
    `}

  ${({ $enterIndex }) =>
    typeof $enterIndex === "number" &&
    $enterIndex >= 0 &&
    css`
      animation: ${rowEnter} 360ms ease-out both;
      animation-delay: ${$enterIndex * 22}ms;

      @media (prefers-reduced-motion: reduce) {
        animation: none;
      }
    `}
`;

const Icon = styled.span<{ $color: string }>`
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: ${({ $color }) => $color};
`;

const AmountCol = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  max-width: 200px;
  color: ${tokens.color.ink1};
  font-family: ${tokens.font.mono};
  font-size: 13.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;

  > span:first-child {
    white-space: nowrap;
  }

  /*
   * 원금 + 할부 N개월. 추정 라벨은 메인 금액 옆 EstimateHint 한 곳에만 노출 (수입·지출
   * 내역과 동일 패턴). sub 라인에는 "원금/개월수" 핵심 메타만 — 회색 글자 도배 차단.
   */
  .original {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 4px 6px;
    font-size: 11px;
    font-weight: 500;
    line-height: 1.35;
    text-align: right;
    white-space: nowrap;

    .principal {
      /* 메인 금액(ink1 검정) 과 색을 분리 — accentHover(짙은 인디고) 로 정보성 강조.
         "추정" 인라인 힌트(accent) 와도 한 단계 색감 차이가 있어 시각적 충돌 없음. */
      color: ${tokens.color.accentHover};
      font-weight: 700;
    }

    .months {
      color: ${tokens.color.ink4};
    }
  }
`;

/**
 * 메인 금액 옆에 인라인으로 붙는 "(월 추정)" 라벨. 인디고 톤으로 시선 분리 — 수입·지출
 * 내역의 AmountInlineHint 와 동일 톤으로 통일.
 */
const EstimateHint = styled.span`
  margin-left: 4px;
  color: ${tokens.color.accent};
  font-family: ${tokens.font.sans};
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
`;

/** 분류 태그 칩 — Analysis SubscriptionList 와 같은 톤 / 라벨로 통일. */
const TagChip = styled.span<{ $kind: SubscriptionTagKind }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  white-space: nowrap;
  ${({ $kind }) => {
    if ($kind === "subscription") {
      return `background: ${tokens.color.tag.installment.bg}; color: ${tokens.color.tag.installment.fg};`;
    }
    if ($kind === "utility") {
      return `background: ${tokens.color.posBg}; color: ${tokens.color.pos};`;
    }
    if ($kind === "installment") {
      return `background: ${tokens.color.warnBg}; color: ${tokens.color.warn};`;
    }
    return `background: ${tokens.color.tint}; color: ${tokens.color.ink3};`;
  }}
`;

const TAG_LABEL: Record<SubscriptionTagKind, string> = {
  subscription: "정기결제",
  utility: "공과금",
  installment: "할부 결제",
  frequent: "자주 구매",
};

const EmptyState = styled.div`
  padding: 36px 16px;
  text-align: center;
  color: ${tokens.color.ink4};
  font-size: 13px;
  line-height: 1.6;

  strong {
    display: block;
    margin-bottom: 6px;
    color: ${tokens.color.ink2};
    font-size: 14px;
    font-weight: 700;
  }
`;

/**
 * KPI 영역의 "전월 대비" 라벨/색을 결정. 변화량이 미미하면(±1%) flat 으로 두어
 * 작은 노이즈가 시각적으로 강조되지 않도록 합니다.
 */
/**
 * "M.D" (예: "4.13") 또는 "YYYY.MM.DD" 형태의 다음결제일 문자열에서 일(day-of-month) 추출.
 * 검증된 정기결제 클릭 시 거래내역 필터로 넘기기 위해 씁니다. 파싱 실패 시 null.
 */
function deriveDayOfMonth(s: string): number | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})\s*$/);
  if (!m) return null;
  const day = Number(m[1]);
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;
  return day;
}

function deltaInfo(current: number, prev: number): {
  label: string;
  modifier: "up" | "down" | "flat";
} {
  if (prev === 0 && current === 0) return { label: "변동 없음", modifier: "flat" };
  if (prev === 0) return { label: "신규", modifier: "up" };
  const diff = current - prev;
  const ratio = diff / prev;
  if (Math.abs(ratio) < 0.01) return { label: "변동 없음", modifier: "flat" };
  const sign = diff > 0 ? "+" : "−";
  return {
    label: `${sign}${formatKRW(Math.abs(diff))} (${(Math.abs(ratio) * 100).toFixed(0)}%)`,
    modifier: diff > 0 ? "up" : "down",
  };
}

/** 필터 상태 — "all" 이면 전체, 아니면 특정 tagKind 만 노출. */
type SubscriptionFilter = "all" | SubscriptionTagKind;

const FILTER_LABELS: Record<SubscriptionFilter, string> = {
  all: "전체",
  subscription: "정기결제",
  utility: "공과금",
  installment: "할부 결제",
  frequent: "자주 구매",
};
const FILTER_ORDER: SubscriptionFilter[] = [
  "all",
  "subscription",
  "utility",
  "installment",
  "frequent",
];

export const SubscriptionsPage: React.FC = () => {
  const [month, setMonth] = useState(() => getCurrentMonthKey());
  const [hoveredId, setHoveredId] = useState<string>("");
  const [filter, setFilter] = useState<SubscriptionFilter>("all");
  const rows = useTransactionsStore();
  const navigate = useNavigate();

  /**
   * 한 줄 클릭 → 거래내역으로 이동.
   * 검증된 반복 결제(patternVerified=true) 면 가맹점명 + 동일 일자(±2일) 필터로 좁혀
   * "매월 같은 날 같은 패턴" 거래만 보여 줍니다(2026-04-28 사용자 요청).
   * 미검증 항목은 그냥 가맹점명 검색만 — 사용자가 폭넓게 같은 가맹점 거래를 볼 수 있게.
   */
  const handleRowClick = (item: SubscriptionItem) => {
    const recurringDay = item.patternVerified
      ? deriveDayOfMonth(item.nextDate)
      : null;
    navigate("/transactions", {
      state: {
        searchTransactionName: item.name,
        ...(recurringDay !== null ? { recurringDay } : {}),
      },
    });
  };

  // MonthPicker 상하한 계산은 Analysis/Home 과 동일 패턴.
  const pickerMinYear = useMemo(
    () => computeMinYear(rows.map((row) => row.date)),
    [rows],
  );
  const pickerMaxMonth = useMemo(
    () => computeMaxMonthKey(rows.map((row) => row.date)),
    [rows],
  );
  // 거래가 1건이라도 있는 달을 마커로 표시(앰버 톤).
  const markedMonthKeys = useMemo(() => {
    const monthKeys = rows
      .map((row) => {
        const match = row.date.match(/(\d{4})[./-](\d{1,2})/);
        if (!match) return "";
        return `${match[1]}-${match[2].padStart(2, "0")}`;
      })
      .filter(Boolean);
    return Array.from(new Set(monthKeys));
  }, [rows]);

  // 전월 대비 비교를 위해 이번 달과 지난 달 모두 풀 목록으로 빌드.
  // 상위 5개 자르기는 전용 페이지에서는 의미가 없어 Infinity 를 넘깁니다.
  const current = useMemo(
    () => buildSubscriptions(rows, month, Infinity),
    [rows, month],
  );
  const previous = useMemo(
    () => buildSubscriptions(rows, getPrevMonthKey(month), Infinity),
    [rows, month],
  );

  const itemCount = current.items.length;
  const delta = useMemo(
    () => deltaInfo(current.total, previous.total),
    [current.total, previous.total],
  );
  /** 분류별 항목 수 — 필터 칩에 카운트 표시. */
  const filterCounts = useMemo(() => {
    const counts: Record<SubscriptionFilter, number> = {
      all: current.items.length,
      subscription: 0,
      utility: 0,
      installment: 0,
      frequent: 0,
    };
    for (const it of current.items) counts[it.tagKind] += 1;
    return counts;
  }, [current.items]);
  /** 필터 적용된 항목 + 합계. 필터에 따라 표·합계 라벨 모두 동기화. */
  const visibleItems = useMemo(
    () =>
      filter === "all"
        ? current.items
        : current.items.filter((it) => it.tagKind === filter),
    [current.items, filter],
  );
  /*
   * 활성 필터의 합계 — "이번 달 [필터명] 합계 ₩X" 배너에 노출. 전체 필터(all) 면
   * current.total 을 그대로 쓰지만, 특정 분류면 visibleItems 에서 다시 합산해
   * 정확한 분류 합계를 보여 줍니다.
   */
  const visibleTotal = useMemo(
    () =>
      filter === "all"
        ? current.total
        : visibleItems.reduce((sum, it) => sum + it.amount, 0),
    [filter, current.total, visibleItems],
  );
  // 활성 항목 카드의 보조 라벨도 합계 카드와 같은 "전월 대비 …" 톤으로 통일.
  // 이전에는 'sub 태그' 같은 내부 구현 용어가 노출돼 사용자에게 혼란을 줬습니다.
  const itemDelta = useMemo(() => {
    const diff = itemCount - previous.items.length;
    if (diff === 0) {
      return { label: "전월과 동일", modifier: "flat" as const };
    }
    const sign = diff > 0 ? "+" : "−";
    return {
      label: `전월 대비 ${sign}${Math.abs(diff)}건`,
      modifier: diff > 0 ? ("up" as const) : ("down" as const),
    };
  }, [itemCount, previous.items.length]);

  return (
    <AppShell
      activeNav="subscriptions"
      crumb="반복결제"
      title="반복결제 관리"
      headerRight={
        <MonthPicker
          value={month}
          onChange={setMonth}
          minYear={pickerMinYear}
          maxMonthKey={pickerMaxMonth}
          markedMonthKeys={markedMonthKeys}
        />
      }
    >
      <KpiStrip>
        <KpiCard>
          <div className="label">이번 달 합계</div>
          <div className="value">{formatKRW(current.total)}</div>
          <div className={`delta delta--${delta.modifier}`}>
            전월 대비 {delta.label}
          </div>
        </KpiCard>
        <KpiCard>
          <div className="label">활성 항목</div>
          <div className="value">{itemCount}건</div>
          <div className={`delta delta--${itemDelta.modifier}`}>
            {itemDelta.label}
          </div>
        </KpiCard>
        <KpiCard>
          <div className="label">평균 항목당</div>
          <div className="value">
            {itemCount > 0
              ? formatKRW(Math.round(current.total / itemCount))
              : formatKRW(0)}
          </div>
          <div className="delta delta--flat">이번 달 기준</div>
        </KpiCard>
      </KpiStrip>

      <Card>
        <CardHd>
          <CardTitle>반복결제 목록</CardTitle>
          {/*
           * "자동 감지" 칩 — 사용자가 직접 sub 로 표시한 항목 + concept/할부/반복 휴리스틱으로
           * 잡힌 항목이 함께 있다는 걸 짚어줍니다. 잘못 잡힌 항목은 거래 상세에서 status 를
           * 바꾸면 다음 새로고침에 빠집니다(분석 페이지와 동일 정책).
           */}
          <Chip $tone="info">자동 감지됨</Chip>
        </CardHd>
        <CardBd>
          {itemCount === 0 ? (
            <EmptyState>
              <strong>아직 감지된 반복결제가 없어요.</strong>
              매달 빠지는 통신비·구독·공과금·보험·할부 결제가 쌓이거나, 거래 상태를
              <span style={{ margin: "0 4px", color: tokens.color.accent, fontWeight: 700 }}>
                정기결제
              </span>
              로 직접 표시하면 여기에 모여요.
            </EmptyState>
          ) : (
            <>
              {/*
                필터 합계 배너 — 활성 필터가 무엇이든 "이번 달 [필터명] 합계 ₩X · N건" 으로
                표 상단에 명시. 사용자가 탭 전환할 때 항상 같은 자리에 합계가 보이도록 고정 위치.
              */}
              <FilterTotalBanner role="status" aria-live="polite">
                <span className="label">
                  이번 달 <strong>{FILTER_LABELS[filter]}</strong> 합계
                  <span className="count">· {visibleItems.length}건</span>
                </span>
                <span className="total">{formatKRW(visibleTotal)}/월</span>
              </FilterTotalBanner>
              {/* 분류별 필터 칩 — 전체/공과금/할부/정기결제/자주 구매 한 가지로 좁혀 보기. */}
              <FilterChips role="tablist" aria-label="분류 필터">
                {FILTER_ORDER.filter(
                  (key) => key === "all" || filterCounts[key] > 0,
                ).map((key) => (
                  <FilterChip
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={filter === key}
                    $active={filter === key}
                    onClick={() => setFilter(key)}
                  >
                    {FILTER_LABELS[key]}
                    <span className="count">{filterCounts[key]}</span>
                  </FilterChip>
                ))}
              </FilterChips>
              {/*
               * 할부 분할 "추정" 안내 — 매 행에 반복하던 "(이자 미포함)" 도배 차단을 위해 한 곳에 모음.
               * 현재 보이는 항목 중 추정이 있는 경우만 노출.
               */}
              {visibleItems.some((it) => it.isEstimated) ? (
                <CardHint role="note">
                  <strong>추정</strong> 라벨이 붙은 할부 항목은 원금 ÷ 개월수로 계산한 추정값이라
                  카드사 이자 분이 빠져 있어요. 실제 청구 데이터가 매칭되면 자동으로 정확한 금액으로
                  바뀝니다.
                </CardHint>
              ) : null}
              {visibleItems.length === 0 ? (
                <EmptyState>
                  <strong>해당 분류에는 아직 항목이 없어요.</strong>
                  다른 필터를 선택해 보세요.
                </EmptyState>
              ) : (
              <Table role="table">
                {/* 헤더 행 — 거래내역 표와 같은 회색 톤. 색칩 컬럼은 빈 헤더로 둠. */}
                <HeaderCell aria-hidden="true" />
                <HeaderCell>분류</HeaderCell>
                <HeaderCell>가맹점</HeaderCell>
                <HeaderCell>다음 결제</HeaderCell>
                <HeaderCell className="center">반복</HeaderCell>
                <HeaderCell className="right">금액</HeaderCell>
                {visibleItems.map((item, index) => {
                  const hovered = item.id === hoveredId;
                  const cellProps = {
                    $hovered: hovered,
                    $enterIndex: index,
                    onClick: () => handleRowClick(item),
                    onMouseEnter: () => setHoveredId(item.id),
                    onMouseLeave: () =>
                      setHoveredId((cur) => (cur === item.id ? "" : cur)),
                    role: "button" as const,
                    tabIndex: 0,
                    "aria-label": `${item.name} 결제 거래 보기`,
                    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleRowClick(item);
                      }
                    },
                  };
                  return (
                    <React.Fragment key={item.id}>
                      <Cell {...cellProps} aria-hidden="true">
                        <Icon $color={item.color} />
                      </Cell>
                      <Cell {...cellProps}>
                        <TagChip $kind={item.tagKind}>{TAG_LABEL[item.tagKind]}</TagChip>
                      </Cell>
                      <Cell {...cellProps}>
                        <span
                          style={{
                            color: tokens.color.ink1,
                            fontSize: 13.5,
                            fontWeight: 600,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            minWidth: 0,
                          }}
                        >
                          {item.name}
                        </span>
                      </Cell>
                      <Cell {...cellProps}>
                        <span
                          style={{
                            color: tokens.color.ink3,
                            fontSize: 12,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {item.nextDate || "—"}
                        </span>
                      </Cell>
                      <Cell {...cellProps} $center>
                        {/*
                         * 반복 검증 시각화: 검증된 항목은 ✓ 칩, 아니면 dash.
                         * 라벨 "확인" 으로 — "월별" 보다 직관적(2026-04-28).
                         */}
                        {item.patternVerified ? (
                          <VerifiedChip
                            title="같은 가맹점에서 2개월 이상 반복 + 금액 ±15% 이내 확인"
                            aria-label="반복 패턴 확인됨"
                          >
                            ✓ 확인
                          </VerifiedChip>
                        ) : (
                          <UnverifiedDash aria-label="반복 패턴 미확인">—</UnverifiedDash>
                        )}
                      </Cell>
                      <Cell {...cellProps} $right>
                        <AmountCol>
                          <span>
                            {formatKRW(item.amount)}
                            {item.isEstimated ? (
                              <EstimateHint>(월 추정)</EstimateHint>
                            ) : (
                              "/월"
                            )}
                          </span>
                          {item.installmentOriginalAmount && item.installmentMonths ? (
                            <span className="original">
                              <span className="principal">
                                원금 {formatKRW(item.installmentOriginalAmount)}
                              </span>
                              <span className="months">· {item.installmentMonths}개월</span>
                            </span>
                          ) : null}
                        </AmountCol>
                      </Cell>
                    </React.Fragment>
                  );
                })}
              </Table>
              )}
            </>
          )}
        </CardBd>
      </Card>
    </AppShell>
  );
};
