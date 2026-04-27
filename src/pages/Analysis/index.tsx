/**
 * 역할: 해당 화면의 상태와 레이아웃을 조립하는 페이지 진입 파일입니다.
 * 위치: src\pages\Analysis\index.tsx
 */
import React, { useMemo, useState } from "react";
import styled from "styled-components";
import { AppShell } from "../../components/layout/AppShell";
import { MonthPicker } from "../../components/primitives/MonthPicker";
import { media } from "../../tokens/breakpoints";
import { SummaryBanner } from "./components/SummaryBanner";
import { KpiStrip } from "./components/KpiStrip";
import { PlatformBars } from "./components/PlatformBars";
import { CategoryBars } from "./components/CategoryBars";
import { RepeatTop3 } from "./components/RepeatTop3";
import { SubscriptionList } from "./components/SubscriptionList";
import { MonthlyTrend } from "./components/MonthlyTrend";
import { WeeklyPattern } from "./components/WeeklyPattern";
import { buildAnalysisData } from "./data";
import {
  computeMinYear,
  getCurrentMonthKey,
  getLatestMonthKey,
  getMonthOption,
  getPrevMonthKey,
} from "../../constants/months";
import { useTransactionsStore } from "../../stores/transactionsStore";
import { useCategoryColorMap, useCategoryNameMap } from "../../stores/categoriesStore";

const Grid = styled.div`
  display: grid;
  gap: 16px;
`;

const Row2 = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;

  ${media.tablet} {
    grid-template-columns: 1fr;
  }
`;

const Row3 = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;

  ${media.tablet} {
    grid-template-columns: 1fr;
  }
`;

export const AnalysisPage: React.FC = () => {
  // Analysis도 월 선택만 바꾸면 같은 분석 레이아웃 안에서 데이터가 교체됩니다.
  // 거래 데이터는 transactionsStore를 구독해 쓰므로, 수동 입력이나 삭제가 즉시 반영됩니다.
  // 디폴트 월은 "오늘 시점의 현재 월". 과거 목업처럼 특정 월에 고정되지 않습니다.
  const [month, setMonth] = useState(() => getCurrentMonthKey());
  const rows = useTransactionsStore();
  // MonthPicker 셀렉터의 가장 오래된 년도 — 거래 데이터에 옛날 거래가 있으면 자동 확장.
  const pickerMinYear = useMemo(
    () => computeMinYear(rows.map((row) => row.date)),
    [rows]
  );
  // 설정에서 바꾼 색이 카테고리별 지출 차트에 즉시 반영되도록 스토어 구독 결과를 그대로 흘려보냅니다.
  const categoryColorMap = useCategoryColorMap();
  const categoryNameMap = useCategoryNameMap();
  const data = useMemo(
    () => buildAnalysisData(rows, month, categoryColorMap, categoryNameMap),
    [rows, month, categoryColorMap, categoryNameMap]
  );
  // CategoryBars의 "지난 달" 탭에서 쓸 전달 참조 데이터.
  const prevData = useMemo(
    () => buildAnalysisData(rows, getPrevMonthKey(month), categoryColorMap, categoryNameMap),
    [rows, month, categoryColorMap, categoryNameMap]
  );
  const monthOption = getMonthOption(month);

  const summaryTitle = useMemo(() => {
    // 최신 월(=오늘이 속한 월)은 "이번 달"로, 과거 월은 실제 라벨로 보여줘 문구를 자연스럽게 만듭니다.
    if (month === getLatestMonthKey()) {
      return "이번 달 요약";
    }
    return `${monthOption.label} 요약`;
  }, [month, monthOption.label]);

  return (
    <AppShell
      activeNav="analysis"
      crumb={`분석 · ${monthOption.label}`}
      title="소비 분석"
      headerRight={
        <MonthPicker value={month} onChange={setMonth} minYear={pickerMinYear} />
      }
    >
      <Grid>
        {/* 요약 배너 → KPI → 플랫폼/카테고리 → 월간 추이 → 반복구매/정기결제/요일패턴 */}
        {/* data-tour: ProductTour 스포트라이트 타겟. */}
        <div data-tour="analysis-summary">
          <SummaryBanner
            key={`${summaryTitle}:${data.summary}`}
            title={summaryTitle}
            text={data.summary}
          />
        </div>
        <KpiStrip kpis={data.kpis} />
        <Row2>
          <PlatformBars
            items={data.platform.items}
            totalSpend={data.platform.totalSpend}
            totalIncome={data.platform.totalIncome}
            netSpend={data.platform.netSpend}
          />
          <CategoryBars items={data.category} prevItems={prevData.category} />
        </Row2>
        <MonthlyTrend points={data.trend.points} average={data.trend.average} />
        <Row3>
          <RepeatTop3 items={data.repeat} />
          <SubscriptionList items={data.subscriptions} total={data.subscriptionTotal} />
          <WeeklyPattern days={data.weekly.days} note={data.weekly.note} />
        </Row3>
      </Grid>
    </AppShell>
  );
};
