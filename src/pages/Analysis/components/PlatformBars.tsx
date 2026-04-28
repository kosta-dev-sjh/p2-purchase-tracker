/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Analysis\components\PlatformBars.tsx
 */
import React, { useMemo, useState } from "react";
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

export interface PlatformBarItem {
  label: string;
  /** 이번 달 금액(원 단위). "금액" 모드에서 사용합니다. */
  value: number;
  /** 금액 기준 비중(%). "금액" 모드에서 그대로 사용합니다. */
  percent: number;
  /** 건수. "건수" 모드에서 비중 재계산과 표시값에 사용됩니다. */
  count: number;
  color: string;
}

type Mode = "amount" | "count";

const MODE_OPTIONS: Array<{ value: Mode; label: string }> = [
  { value: "amount", label: "금액" },
  { value: "count", label: "건수" },
];

const HeaderLeft = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

/**
 * 레퍼런스의 `.bar-row` 그리드와 동일한 구조.
 * 라벨 폭/바 트랙/금액 폭이 행마다 정렬되어 여러 플랫폼을 시각적으로 비교하기 좋습니다.
 * 실제 바는 행마다 작은 recharts BarChart로 렌더해 recharts 기반 차트 상태를 유지합니다.
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

  /*
   * 좁은 모바일에서는 88px + 128px 두 고정 칼럼이 본문 폭을 거의 다 먹어 가운데 바 트랙이
   * 20~30px 만 남는 문제가 있었습니다. 라벨/값 라인을 상단으로 올리고 바 트랙을 아래 풀-폭
   * 행으로 내려 주면 전체 정보 밀도는 유지하면서도 막대가 시각적으로 의미 있는 길이를 갖습니다.
   */
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

/**
 * recharts ResponsiveContainer가 width 100%를 채우도록 하려면 부모가 실제 폭을 가져야 하므로
 * min-width: 0을 주어 grid 1fr 셀이 넘치지 않도록 안전장치를 둡니다.
 * barSize 8px + 상하 여유를 고려해 20px 높이를 확보합니다(너무 얇으면 recharts가 렌더를 스킵).
 */
const BarChartCell = styled.div`
  min-width: 0;
  height: 20px;

  /* 모바일에서는 라벨/값 아래 풀-폭 한 줄을 차지하도록 두 컬럼을 모두 가로지릅니다. */
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

const Summary = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid ${tokens.color.line2};

  /* 모바일은 세 개 값을 세로로 쌓아 긴 금액 문자열이 잘리지 않도록 합니다. */
  ${media.mobile} {
    grid-template-columns: 1fr;
    gap: 10px;
  }
`;

const SummaryLabel = styled.div`
  color: ${tokens.color.ink4};
  font-size: 11px;
  font-weight: 500;
`;

const SummaryValue = styled.div<{ $color?: string }>`
  margin-top: 2px;
  color: ${({ $color }) => $color ?? tokens.color.ink1};
  font-family: ${tokens.font.mono};
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
`;

/**
 * delayMs: 행 순서에 따라 진입 애니메이션이 살짝 밀려 시작되도록 조절합니다.
 * 첫 노출 시 각 바가 왼쪽에서 오른쪽으로 차오르며 시각적 리듬이 생깁니다.
 */
const RowBar: React.FC<{ percent: number; color: string; delayMs?: number }> = ({
  percent,
  color,
  delayMs = 0,
}) => (
  // initialDimension 으로 첫 동기 렌더 -1 워닝 차단. BarChartCell 명시 height(20/18) 와 동일.
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

export const PlatformBars: React.FC<{
  items: PlatformBarItem[];
  totalSpend: number;
  totalIncome: number;
  netSpend: number;
}> = ({ items, totalSpend, totalIncome, netSpend }) => {
  const [mode, setMode] = useState<Mode>("amount");

  /**
   * 모드에 따라 표시용 행 데이터를 재구성합니다.
   * - amount: 기존 값/퍼센트 그대로
   * - count : 건수 총합 기준으로 비중을 재계산해 바와 우측 라벨을 모두 건수 기준으로 바꿉니다.
   */
  const rows = useMemo(() => {
    if (mode === "amount") {
      return items.map((item) => ({
        label: item.label,
        color: item.color,
        percent: item.percent,
        rightText: `${formatKRW(item.value)} · ${item.percent}%`,
      }));
    }
    const totalCount = items.reduce((acc, it) => acc + it.count, 0) || 1;
    return items.map((item) => {
      const pct = Math.round((item.count / totalCount) * 100);
      return {
        label: item.label,
        color: item.color,
        percent: pct,
        rightText: `${item.count}건 · ${pct}%`,
      };
    });
  }, [items, mode]);

  const totalCount = useMemo(
    () => items.reduce((acc, it) => acc + it.count, 0),
    [items],
  );

  return (
    <Card padding={0}>
      <CardHd>
        <HeaderLeft>
          <CardTitle>플랫폼별 지출</CardTitle>
          <CardSub>
            {mode === "amount"
              ? `이번 달 · 총 ${formatKRW(totalSpend)}`
              : `이번 달 · 총 ${totalCount}건`}
          </CardSub>
        </HeaderLeft>
        {/* 홈 화면과 동일한 SegmentedControl로 통일해 전 화면 탭 UI가 일관되게 보이도록 했습니다. */}
        <SegmentedControl<Mode> value={mode} options={MODE_OPTIONS} onChange={setMode} />
      </CardHd>
      <CardBd>
        {rows.map((row, index) => (
          <BarRow key={row.label}>
            <BarLabel>{row.label}</BarLabel>
            <BarChartCell>
              <RowBar percent={row.percent} color={row.color} delayMs={index * 90} />
            </BarChartCell>
            <BarAmount>{row.rightText}</BarAmount>
          </BarRow>
        ))}
        <Summary>
          <div>
            <SummaryLabel>이번 달 총 지출</SummaryLabel>
            <SummaryValue>{formatKRW(totalSpend)}</SummaryValue>
          </div>
          <div>
            <SummaryLabel>이번 달 총 수입</SummaryLabel>
            <SummaryValue $color={tokens.color.pos}>+{formatKRW(totalIncome)}</SummaryValue>
          </div>
          <div>
            <SummaryLabel>순 지출</SummaryLabel>
            <SummaryValue $color={tokens.color.neg}>{formatKRW(netSpend)}</SummaryValue>
          </div>
        </Summary>
      </CardBd>
    </Card>
  );
};
