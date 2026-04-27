/**
 * 역할: 해당 화면의 상태와 레이아웃을 조립하는 페이지 진입 파일입니다.
 * 위치: src\pages\Home\index.tsx
 */
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import styled from "styled-components";
import { AppShell } from "../../components/layout/AppShell";
import { MonthPicker } from "../../components/primitives/MonthPicker";
import { tokens } from "../../styles/tokens";
import { media } from "../../tokens/breakpoints";
import { KpiStrip } from "./components/KpiStrip";
import { PlatformDonut } from "./components/PlatformDonut";
import { TrendChart } from "./components/TrendChart";
import { RecentTransactions } from "./components/RecentTransactions";
import { InsightCards } from "./components/InsightCards";
import { buildHomeData } from "./data";
import {
  computeMinYear,
  getCurrentMonthKey,
  getMonthOption,
} from "../../constants/months";
import { useTransactionsStore } from "../../stores/transactionsStore";
import { useAiInsightsStore } from "../../stores/aiInsightsStore";
import { generateInsight } from "../../utils/aiService";
import { WelcomeTutorial } from "../../components/onboarding/WelcomeTutorial";

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;

  /*
   * 데스크톱/태블릿에서는 오른쪽 슬롯이 자연 폭이어야 제목 영역(Heading)이 남은 공간을
   * 자연스럽게 확보하고, 레이아웃 비율이 기존 레퍼런스와 동일하게 유지됩니다.
   * 모바일에서는 TopHeader 가 세로 스택으로 바뀌고 HeaderRight 가 풀-폭이 되므로,
   * 내부도 세로 스택으로 전환해 MonthPicker 는 풀-폭 pill 로 깔끔히 펴지고
   * DateStamp 는 그 아래 한 줄로 붙도록 합니다. 이전에 justify-content:flex-start
   * 로만 바꿨더니 MonthPicker(width:100%) 가 가로를 전부 먹어 DateStamp(nowrap)가
   * 오른쪽으로 삐져나가며 비율이 깨지는 문제가 있었습니다.
   */
  ${media.mobile} {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }
`;

const DateStamp = styled.div`
  color: ${tokens.color.ink4};
  font-size: ${tokens.type.caption.size};
  font-weight: 500;
  /* 짧게 정리된 stamp("2026.04.20")가 한 줄로 보여야 '오늘과 같다'는 걸 한눈에 읽힙니다. */
  white-space: nowrap;

  ${media.mobile} {
    /* 세로 스택 전환 이후 stamp 는 pill 아래에 한 줄로 붙이되, 왼쪽 정렬로 유지해
       MonthPicker 시작점과 시선이 맞도록 합니다. */
    text-align: left;
  }
`;

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

export const HomePage: React.FC = () => {
  // 월을 바꾸면 같은 화면 구조 안에서 해당 월의 집계만 교체됩니다.
  // 거래 데이터는 transactionsStore에서 구독해 가져오고, 추가/삭제가 즉시 반영됩니다.
  // 디폴트 월은 "오늘 시점의 현재 월". 페이지를 재방문해도 항상 최신 월에서 출발합니다.
  const [month, setMonth] = useState(() => getCurrentMonthKey());
  const rows = useTransactionsStore();
  const data = useMemo(() => buildHomeData(rows, month), [rows, month]);
  const monthOption = getMonthOption(month);
  // MonthPicker 셀렉터의 가장 오래된 년도 — 거래 데이터에 옛날 거래가 있으면 자동으로 뒤로 확장.
  const pickerMinYear = useMemo(
    () => computeMinYear(rows.map((row) => row.date)),
    [rows]
  );

  const { getInsight, setInsight } = useAiInsightsStore();
  const [isAiLoading, setIsAiLoading] = useState(false);

  useEffect(() => {
    const monthRows = rows.filter(r => r.date.startsWith(month));
    if (monthRows.length === 0) return;

    // 데이터 변동 감지를 위한 지문(Hash) 생성: 건수 + 총액
    const hash = `${monthRows.length}-${monthRows.reduce((sum, r) => sum + r.amount, 0)}`;
    const cached = getInsight(month);

    if (!cached || cached.hash !== hash) {
      setIsAiLoading(true);
      const rulesText = data.insights.map(i => `${i.title}: ${i.body}`).join('\n');

      // 실패하면 null 이 돌아옵니다. 그 경우 캐시에 쓰지 않아야
      // 다음 hash 변동 때 자연스럽게 재시도됩니다.
      // (에러 문자열을 정상 인사이트로 캐시해 그 달 내내 에러가 박히던 버그 방지)
      generateInsight(rulesText).then(insightText => {
        if (insightText) {
          setInsight(month, hash, insightText);
        }
      }).finally(() => {
        setIsAiLoading(false);
      });
    }
  }, [rows, month, data.insights, getInsight, setInsight]);

  const currentInsight = getInsight(month);

  // 로그인 분기에서 navigation state로 "튜토리얼 무조건 표시"를 요청받습니다.
  // 이 값을 한 번 캡처해 내부 state로 옮기고 즉시 history를 정리해서,
  // 뒤로가기/새로고침 시 같은 state가 반복 소비되어 튜토리얼이 재트리거되지 않게 합니다.
  const location = useLocation();
  const [forceTutorialOpen, setForceTutorialOpen] = useState<boolean>(
    () => Boolean((location.state as { showTutorial?: boolean } | null)?.showTutorial),
  );
  useEffect(() => {
    if (forceTutorialOpen) {
      // 현재 URL은 그대로 유지하되 state만 비워 "1회성 신호"로 처리합니다.
      try {
        window.history.replaceState({}, "", window.location.href);
      } catch {
        // SSR 등에서 접근이 불가하면 조용히 무시
      }
    }
  }, [forceTutorialOpen]);

  return (
    <AppShell
      activeNav="home"
      crumb={`대시보드 · ${monthOption.label}`}
      title="최신 소비 요약"
      headerRight={
        <HeaderRight>
          <MonthPicker value={month} onChange={setMonth} minYear={pickerMinYear} />
          <DateStamp>{monthOption.stamp}</DateStamp>
        </HeaderRight>
      }
    >
      <Grid>
        {/* Home은 상단 요약 → 차트 → 최근 거래 → 인사이트 순서로 읽히도록 구성합니다. */}
        {/* data-tour: ProductTour 스포트라이트 타겟. 실제 인증으로 교체되더라도 유지해도 무해합니다. */}
        <div data-tour="home-kpi">
          <KpiStrip kpis={data.kpis} />
        </div>
        <Row2>
          <PlatformDonut total={data.platformDonut.total} items={data.platformDonut.items} />
          <TrendChart points={data.trend.points} />
        </Row2>
        <RecentTransactions items={data.recent} />
        <InsightCards 
          items={data.insights} 
          aiInsightText={currentInsight?.insightText}
          isAiLoading={isAiLoading}
        />
      </Grid>
      {/*
        WelcomeTutorial 표시 우선순위:
          1) LoginForm에서 `navigate("/", { state: { showTutorial: true } })`로 넘어왔다면
             forceTutorialOpen=true가 되어 **무조건** 뜹니다. (테스트 결정성 확보)
          2) 그 외 일반 진입에서는 컴포넌트 내부의 localStorage 플래그 로직이
             "최초 1회만 자동 표시"를 담당합니다.
        onClose에서 forceTutorialOpen을 내려주어, Home 내에서 페이지 이동 후 돌아와도
        닫힌 튜토리얼이 재오픈되지 않도록 합니다.
      */}
      <WelcomeTutorial
        forceOpen={forceTutorialOpen}
        onClose={() => setForceTutorialOpen(false)}
      />
    </AppShell>
  );
};
