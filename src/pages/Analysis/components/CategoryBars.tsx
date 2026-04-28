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
  const displayed = mode === "prev" && prevItems ? prevItems : items;

  return (
    <Card padding={0}>
      <CardHd>
        <HeaderLeft>
          <CardTitle>카테고리별 지출</CardTitle>
          <CardSub>상위 {displayed.length}개 카테고리</CardSub>
        </HeaderLeft>
        {/* 홈 화면과 동일한 SegmentedControl로 통일. 지난 달 데이터가 없으면 버튼은 그대로 두되 */}
        {/* displayed가 빈 경우 안내 문구로 대응합니다. */}
        <SegmentedControl<Mode> value={mode} options={MODE_OPTIONS} onChange={setMode} />
      </CardHd>
      <CardBd>
        {displayed.length === 0 ? (
          <EmptyNote>표시할 카테고리 데이터가 없어요.</EmptyNote>
        ) : (
          displayed.map((item, index) => (
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
      </CardBd>
    </Card>
  );
};
