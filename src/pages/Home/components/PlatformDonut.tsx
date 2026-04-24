/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Home\components\PlatformDonut.tsx
 */
import React, { useMemo, useState } from "react";
import styled from "styled-components";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  Card,
  CardBd,
  CardFoot,
  CardHd,
  CardSub,
  CardTitle,
} from "../../../components/primitives/Card";
import { SegmentedControl } from "../../../components/primitives/SegmentedControl";
import { tokens } from "../../../styles/tokens";
import { media } from "../../../tokens/breakpoints";
import { formatKRW } from "../../../utils/format";

export interface DonutItem {
  label: string;
  value: number;
  percent: number;
  color: string;
  count: number;
}

type Mode = "amount" | "count";

const MODE_OPTIONS: Array<{ value: Mode; label: string }> = [
  { value: "amount", label: "금액" },
  { value: "count", label: "건수" },
];

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  width: 100%;

  /*
   * 모바일에서는 제목 블록과 세그먼티드 컨트롤을 한 줄에 밀어 넣으면
   * 세그먼트 폭이 줄어 글자가 잘리거나 터치 영역이 너무 작아집니다.
   * 세로로 쌓고 세그먼트는 풀-폭으로 펼쳐 앱 탭처럼 보이도록 합니다.
   */
  ${media.mobile} {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
`;

const Body = styled.div`
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 24px;
  align-items: center;

  ${media.mobile} {
    grid-template-columns: 1fr;
    justify-items: center;
  }
`;

const Legend = styled.ul`
  display: flex;
  flex-direction: column;
  /* Analysis BarRow/RepeatTop3/SubscriptionList의 12px 리듬에 맞춰 리스트 간격을 12px로 통일. */
  gap: 12px;
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const Row = styled.li`
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  gap: 10px;
  align-items: center;
  color: ${tokens.color.ink2};
  font-size: 13px;
  padding: 2px 4px;
  border-radius: 6px;
  transition: background ${tokens.motion.fast} ease;

  &:hover {
    background: ${tokens.color.tint};
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .label {
    font-weight: 500;
  }

  .pct {
    color: ${tokens.color.ink3};
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .amt {
    color: ${tokens.color.ink4};
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
`;

const DonutWrap = styled.div`
  width: 200px;
  height: 200px;
  /* ResponsiveContainer 가 부모 flex 의 min-width: auto 때문에 첫 프레임에 width=-1 측정값을
     받아 경고를 쏟아내던 회귀 방지. 고정 200x200 wrap 에도 min-width: 0 을 같이 박습니다. */
  min-width: 0;
  position: relative;
  margin: 0 auto;
`;

const CenterLabel = styled.div`
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  text-align: center;
  pointer-events: none;

  .amount {
    color: ${tokens.color.ink1};
    font-size: ${tokens.type.titleLg.size};
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .caption {
    margin-top: 4px;
    color: ${tokens.color.ink4};
    font-size: ${tokens.type.caption.size};
  }
`;

export const PlatformDonut: React.FC<{ total: number; items: DonutItem[] }> = ({
  total,
  items,
}) => {
  const [mode, setMode] = useState<Mode>("amount");

  const countTotal = useMemo(
    () => items.reduce((acc, item) => acc + item.count, 0),
    [items],
  );

  const chartItems = useMemo(() => {
    if (mode === "amount") {
      return items.map((item) => ({
        label: item.label,
        color: item.color,
        chartValue: item.value,
        percent: item.percent,
        primaryText: `${item.percent}%`,
        secondaryText: formatKRW(item.value),
      }));
    }
    return items.map((item) => {
      const pct = countTotal === 0 ? 0 : Math.round((item.count / countTotal) * 100);
      return {
        label: item.label,
        color: item.color,
        chartValue: item.count,
        percent: pct,
        primaryText: `${pct}%`,
        secondaryText: `${item.count}건`,
      };
    });
  }, [items, mode, countTotal]);

  const centerAmount = mode === "amount" ? formatKRW(total) : `${countTotal}건`;
  const centerCaption = mode === "amount" ? "이번 달 총소비" : "이번 달 총 주문";

  return (
    <Card>
      <CardHd>
        <HeaderRow>
          <div>
            <CardTitle>플랫폼별 소비 비중</CardTitle>
            <CardSub>이번 달 기준</CardSub>
          </div>
          <SegmentedControl<Mode>
            value={mode}
            options={MODE_OPTIONS}
            onChange={setMode}
          />
        </HeaderRow>
      </CardHd>
      <CardBd>
        <Body>
          <DonutWrap>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartItems}
                  dataKey="chartValue"
                  nameKey="label"
                  innerRadius={58}
                  outerRadius={92}
                  paddingAngle={2}
                  stroke="none"
                  isAnimationActive
                  animationDuration={400}
                >
                  {chartItems.map((item) => (
                    <Cell key={item.label} fill={item.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [
                    mode === "amount"
                      ? formatKRW(Number(value ?? 0))
                      : `${Number(value ?? 0)}건`,
                    mode === "amount" ? "금액" : "건수",
                  ]}
                  contentStyle={{
                    borderRadius: 12,
                    border: `1px solid ${tokens.color.line}`,
                    boxShadow: tokens.shadow.card,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <CenterLabel>
              <div>
                <div className="amount">{centerAmount}</div>
                <div className="caption">{centerCaption}</div>
              </div>
            </CenterLabel>
          </DonutWrap>
          <Legend>
            {chartItems.map((item) => (
              <Row key={item.label}>
                <span className="dot" style={{ background: item.color }} />
                <span className="label">{item.label}</span>
                <span className="pct">{item.primaryText}</span>
                <span className="amt">{item.secondaryText}</span>
              </Row>
            ))}
          </Legend>
        </Body>
      </CardBd>
      <CardFoot>
        <span>이번 달 총 {countTotal}건</span>
        <span className="tnum" style={{ fontWeight: 600, color: tokens.color.ink2 }}>
          {items.length}개 플랫폼
        </span>
      </CardFoot>
    </Card>
  );
};
