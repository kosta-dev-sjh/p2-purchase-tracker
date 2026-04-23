/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Home\components\TrendChart.tsx
 */
import React, { useMemo, useState } from "react";
import styled from "styled-components";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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

interface Point {
  label: string;
  value: number;
}

type Period = "3" | "6" | "12";

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: "3", label: "3개월" },
  { value: "6", label: "6개월" },
  { value: "12", label: "12개월" },
];

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  width: 100%;

  /*
   * 모바일에서는 제목과 기간 선택 세그먼트가 한 줄을 공유하면
   * 세그먼트가 눌려 "3/6/12" 라벨이 잘립니다. 세로 스택으로 전환하고
   * 세그먼트는 풀-폭으로 펴서 터치 영역을 확보합니다.
   */
  ${media.mobile} {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
`;

const ChartWrap = styled.div`
  height: 212px;
  padding-top: 4px;
`;

export const TrendChart: React.FC<{ points: Point[] }> = ({ points }) => {
  const [period, setPeriod] = useState<Period>("6");

  const visible = useMemo(() => {
    const n = Number(period);
    return points.slice(Math.max(0, points.length - n));
  }, [points, period]);

  const average = useMemo(() => {
    if (visible.length === 0) return 0;
    const sum = visible.reduce((acc, p) => acc + p.value, 0);
    return Math.round(sum / visible.length);
  }, [visible]);

  return (
    <Card>
      <CardHd>
        <HeaderRow>
          <div>
            <CardTitle>최근 소비 추이</CardTitle>
            <CardSub>최근 {period}개월 지출</CardSub>
          </div>
          <SegmentedControl<Period>
            value={period}
            options={PERIOD_OPTIONS}
            onChange={setPeriod}
          />
        </HeaderRow>
      </CardHd>
      <CardBd>
        <ChartWrap>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={visible} margin={{ top: 12, right: 12, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="home-trend-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={tokens.color.accent} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={tokens.color.accent} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={tokens.color.line2} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: tokens.color.ink4, fontSize: 11 }}
              />
              <YAxis hide domain={["dataMin - 40000", "dataMax + 40000"]} />
              <Tooltip
                formatter={(value) => [formatKRW(Number(value ?? 0)), "지출"]}
                contentStyle={{
                  borderRadius: 12,
                  border: `1px solid ${tokens.color.line}`,
                  boxShadow: tokens.shadow.card,
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={tokens.color.accent}
                strokeWidth={2.5}
                fill="url(#home-trend-fill)"
                activeDot={{ r: 4, stroke: tokens.color.accent, strokeWidth: 2, fill: "#fff" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartWrap>
      </CardBd>
      <CardFoot>
        <span>최근 {period}개월 평균</span>
        <span className="tnum" style={{ fontWeight: 600, color: tokens.color.ink2 }}>
          {formatKRW(average)}/월
        </span>
      </CardFoot>
    </Card>
  );
};
