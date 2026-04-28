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
  width: 100%;
  /* grid/flex 부모에서 min-width 가 auto 인 탓에 Recharts ResponsiveContainer 가 첫 프레임에
     width=-1 로 측정돼 dev 콘솔에 경고가 도배됐습니다. min-width: 0 로 측정값을 0 이상으로
     강제합니다. */
  min-width: 0;
  height: 212px;
  padding-top: 4px;
`;

/**
 * 모든 포인트가 0인 빈 데이터 상태를 위한 placeholder. 평평한 0선만 보이는 대신
 * 사용자에게 "왜 비어있는지"를 안내하는 카피를 띄워 차트 컴포넌트가 정상 동작 중임을 분명히 합니다.
 */
const EmptyState = styled.div`
  width: 100%;
  height: 212px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: ${tokens.color.ink4};
  font-size: 12.5px;
  line-height: 1.55;
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

  /**
   * 차트가 그릴 의미 있는 데이터가 있는지 판정. 모든 포인트가 0이면 그래프가 평평한 0선만
   * 그어지므로 사용자가 어떤 정보를 읽어야 할지 막막합니다. 그 경우엔 빈 상태 안내로 대체합니다.
   */
  const hasData = useMemo(() => visible.some((point) => point.value > 0), [visible]);

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
        {hasData ? (
          <ChartWrap>
            {/* initialDimension 으로 첫 동기 렌더의 useState 초기값을 양수로 시드.
                ChartWrap 명시 height 212 와 동일. width 는 부모 100% 라 정확한 값이 첫 프레임엔
                알 수 없어 1 로 두면 ResizeObserver 첫 콜백에서 즉시 실값으로 갱신됩니다. */}
            <ResponsiveContainer
              width="100%"
              height="100%"
              minHeight={212}
              minWidth={1}
              initialDimension={{ width: 1, height: 212 }}
            >
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
        ) : (
          <EmptyState>
            최근 {period}개월 동안 기록된 지출이 없어요.
            <br />
            거래를 추가하면 추이가 채워져요.
          </EmptyState>
        )}
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
