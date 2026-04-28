/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Analysis\components\CategoryBars.tsx
 */
import React, { useState } from "react";
import styled from "styled-components";
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis } from "recharts";
import {
  Card,
  CardBd,
  CardHd,
  CardSub,
  CardTitle,
} from "../../../components/primitives/Card";
import { SegmentedControl } from "../../../components/primitives/SegmentedControl";
import { tokens } from "../../../styles/tokens";
import { media } from "../../../tokens/breakpoints";
import { formatKRW } from "../../../utils/format";

export interface CategoryBarItem {
  label: string;
  percent: number;
  amount: number;
  color: string;
}

type Mode = "current" | "prev";

const MODE_OPTIONS: Array<{ value: Mode; label: string }> = [
  { value: "current", label: "이번 달" },
  { value: "prev", label: "지난 달" },
];

const HeaderLeft = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

/**
 * PlatformBars와 동일한 `.bar-row` 리듬을 공유합니다.
 * 같은 그리드 비율을 쓰면 좌우 카드 시선이 가로로 이어져 훑기 좋습니다.
 * 실제 바는 행마다 작은 recharts BarChart로 렌더합니다.
 */
const BarRow = styled.div`
  display: grid;
  grid-template-columns: 88px 1fr 128px;
  gap: 12px;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px dashed ${tokens.color.line2};

  &:last-of-type {
    border-bottom: none;
  }

  /* PlatformBars와 동일한 모바일 규칙: 상단 라벨/값 + 하단 풀-폭 바 트랙으로 전환합니다. */
  ${media.mobile} {
    grid-template-columns: 1fr auto;
    gap: 4px 10px;
    padding: 12px 0;
  }
`;

const BarLabel = styled.div`
  color: ${tokens.color.ink2};
  font-size: 13px;
  font-weight: 500;
`;

const BarChartCell = styled.div`
  min-width: 0;
  /* barSize 8px + 상하 여유를 고려해 20px 높이를 확보합니다. */
  height: 20px;

  ${media.mobile} {
    grid-column: 1 / -1;
    height: 18px;
  }
`;

const BarAmount = styled.div`
  color: ${tokens.color.ink3};
  font-family: ${tokens.font.mono};
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  text-align: right;
`;

const EmptyNote = styled.div`
  padding: 18px 4px;
  color: ${tokens.color.ink4};
  font-size: 12px;
  text-align: center;
`;

/*
 * "더보기 / 접기" 토글 버튼(2026-04-28). 사용자 피드백 — 카테고리가 늘어나면 (utility/
 * maintenance/education 추가 후 최대 8+) 카드가 길어져 시야가 답답하니, 기본 3개만
 * 보이고 펼치면 전체 표시. SegmentedControl 과 같은 카드 안에 넣어 톤을 통일.
 */
const ToggleBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  margin-top: 8px;
  padding: 10px 12px;
  border: 1px dashed ${tokens.color.line2};
  border-radius: ${tokens.radius.control};
  background: transparent;
  color: ${tokens.color.accent};
  cursor: pointer;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  transition: background 160ms ease, border-color 160ms ease;

  &:hover {
    background: ${tokens.color.tint};
    border-color: ${tokens.color.line};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${tokens.shadow.focus};
  }
`;

const TOP_N_COLLAPSED = 3;

/*
 * 펼침 상태에서 카드가 너무 길어지지 않도록 내부 스크롤 가드(2026-04-28).
 * 카테고리 8개+ 인 사용자가 더보기를 누르면 카드 자체가 화면을 가득 차지해 양쪽 카드(플랫폼별
 * 지출) 와 라인이 어긋났습니다. SubscriptionList 와 같은 결의 max-height + overflow-y 를
 * 줘서 카드 높이는 일정하게 유지하고 안에서 굴려 보도록 합니다.
 *
 * collapsed 상태에서는 max-height 가 발동하지 않아 자연 높이 그대로 — 양쪽 카드와 같이
 * 4행 정도(타이틀+행 3줄) 로 잡히는 일반적인 분석 페이지 리듬 유지.
 */
const ScrollableBars = styled.div`
  max-height: 300px;
  overflow-y: auto;
  overflow-x: hidden;
  /* 우측에 스크롤바 자리 약간 — 수치 우측 정렬이 스크롤 위에 가려지지 않게. */
  padding-right: 4px;

  ${media.mobile} {
    max-height: 260px;
  }
`;

/**
 * PlatformBars와 동일 전략의 미니 BarChart.
 * 카테고리별로 단일 값 하나를 tint 트랙 위에 채워 가로 막대를 표현합니다.
 */
const RowBar: React.FC<{ percent: number; color: string; delayMs?: number }> = ({
  percent,
  color,
  delayMs = 0,
}) => (
  // initialDimension 으로 첫 동기 렌더 -1 워닝 차단. BarCell 명시 height(20/18) 와 동일.
  <ResponsiveContainer
    width="100%"
    height="100%"
    minHeight={18}
    minWidth={1}
    initialDimension={{ width: 1, height: 20 }}
  >
    <BarChart
      data={[{ name: "row", value: Math.max(Math.min(percent, 100), 0) }]}
      layout="vertical"
      margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
    >
      <XAxis type="number" hide domain={[0, 100]} />
      {/* 단일 카테고리라도 dataKey를 실제 필드(name)로 맞춰야 recharts가 Y 축 위치를 계산합니다. */}
      <YAxis type="category" dataKey="name" hide />
      <Bar
        dataKey="value"
        barSize={8}
        radius={999}
        isAnimationActive
        animationDuration={700}
        animationBegin={delayMs}
        animationEasing="ease-out"
        background={{ fill: tokens.color.tint, radius: 999 }}
      >
        <Cell fill={color} />
      </Bar>
    </BarChart>
  </ResponsiveContainer>
);

export const CategoryBars: React.FC<{
  items: CategoryBarItem[];
  /** 선택적: 전달되면 "지난 달" 탭에서 이 배열로 전환해 표시합니다. */
  prevItems?: CategoryBarItem[];
}> = ({ items, prevItems }) => {
  const [mode, setMode] = useState<Mode>("current");
  /*
   * 더보기 펼침 상태. 기본 collapsed — 상위 3개만 노출. "더보기" 누르면 전체 표시.
   * 모드(이번 달/지난 달) 전환 시에도 사용자의 펼침 의도는 유지(state 그대로).
   */
  const [expanded, setExpanded] = useState(false);
  const displayed = mode === "prev" && prevItems ? prevItems : items;
  const visible = expanded ? displayed : displayed.slice(0, TOP_N_COLLAPSED);
  const hasMore = displayed.length > TOP_N_COLLAPSED;

  return (
    <Card padding={0}>
      <CardHd>
        <HeaderLeft>
          <CardTitle>카테고리별 지출</CardTitle>
          {/*
            서브 라벨 — 펼침 상태에 따라 안내 문구 분기.
            collapsed: "상위 3개 카테고리 (전체 N개)" 로 "여기서 더 있다" 를 명확히.
            expanded: "전체 N개 카테고리" 로 현재 모든 행을 보고 있음을 알림.
          */}
          <CardSub>
            {expanded || !hasMore
              ? `전체 ${displayed.length}개 카테고리`
              : `상위 ${TOP_N_COLLAPSED}개 · 전체 ${displayed.length}개`}
          </CardSub>
        </HeaderLeft>
        {/* 홈 화면과 동일한 SegmentedControl로 통일. 지난 달 데이터가 없으면 버튼은 그대로 두되 */}
        {/* displayed가 빈 경우 안내 문구로 대응합니다. */}
        <SegmentedControl<Mode> value={mode} options={MODE_OPTIONS} onChange={setMode} />
      </CardHd>
      <CardBd>
        {displayed.length === 0 ? (
          <EmptyNote>표시할 카테고리 데이터가 없어요.</EmptyNote>
        ) : (
          <>
            {/*
              expanded 일 때만 ScrollableBars 로 감싸서 카드 길이 폭주 방지. collapsed 면 3행
              뿐이라 자연 높이 그대로 두어 다른 분석 카드들과 라인이 어긋나지 않습니다.
            */}
            {expanded ? (
              <ScrollableBars>
                {visible.map((item, index) => (
                  <BarRow key={item.label}>
                    <BarLabel>{item.label}</BarLabel>
                    <BarChartCell>
                      <RowBar percent={item.percent} color={item.color} delayMs={index * 90} />
                    </BarChartCell>
                    <BarAmount>
                      {formatKRW(item.amount)} · {item.percent}%
                    </BarAmount>
                  </BarRow>
                ))}
              </ScrollableBars>
            ) : (
              visible.map((item, index) => (
                <BarRow key={item.label}>
                  <BarLabel>{item.label}</BarLabel>
                  <BarChartCell>
                    <RowBar percent={item.percent} color={item.color} delayMs={index * 90} />
                  </BarChartCell>
                  <BarAmount>
                    {formatKRW(item.amount)} · {item.percent}%
                  </BarAmount>
                </BarRow>
              ))
            )}
            {hasMore && (
              <ToggleBtn
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
              >
                {expanded
                  ? "접기"
                  : `더보기 (+${displayed.length - TOP_N_COLLAPSED}개)`}
              </ToggleBtn>
            )}
          </>
        )}
      </CardBd>
    </Card>
  );
};
