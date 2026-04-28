/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Home\components\KpiStrip.tsx
 */
import React from "react";
import styled from "styled-components";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Chip } from "../../../components/primitives/Chip";
import { tokens } from "../../../styles/tokens";
import { media } from "../../../tokens/breakpoints";
import { formatKRW } from "../../../utils/format";

export interface KpiItem {
  key: string;
  label: string;
  value: number;
  primary?: boolean;
  dotColor?: string;
  valueColor?: string;
  valuePrefix?: string;
  neuChip?: string;
  delta?: { tone: "up" | "down"; text: string };
  sub?: string;
  spark?: number[];
}

/**
 * 레퍼런스 스크린샷의 4분할 스트립을 따라 하나의 패널 안에서 세로 구분선으로 4개 셀을 나누고,
 * primary 셀(총 지출)은 큰 폰트 + sparkline으로 강조합니다. 비-primary 셀은 flex 배분으로
 * 라벨/값은 상단에, 서브텍스트는 하단에 붙여 여백이 가운데로 모이게 했습니다.
 */
const Strip = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  background: ${tokens.color.panel};
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.card};
  box-shadow: ${tokens.shadow.card};
  overflow: hidden;

  ${media.tablet} {
    grid-template-columns: 1fr 1fr;
  }

  ${media.mobile} {
    grid-template-columns: 1fr;
  }
`;

const Cell = styled.div<{ $primary?: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
  border-right: 1px solid ${tokens.color.line2};

  &:last-child {
    border-right: none;
  }

  /* 태블릿에선 2x2 격자: 2번째와 4번째 셀의 오른쪽 경계선을 제거하고
     3·4번째 셀에 상단 라인을 추가해 시각적으로 행을 구분합니다. */
  ${media.tablet} {
    &:nth-child(2n) {
      border-right: none;
    }
    &:nth-child(n + 3) {
      border-top: 1px solid ${tokens.color.line2};
    }
  }

  ${media.mobile} {
    border-right: none;

    & + & {
      border-top: 1px solid ${tokens.color.line2};
    }
  }
`;

const LabelRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  color: ${tokens.color.ink3};
  font-size: 12px;
  font-weight: 500;
`;

const Dot = styled.span<{ $color: string }>`
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: ${({ $color }) => $color};
`;

const Value = styled.div<{ $primary?: boolean; $color?: string }>`
  margin-top: 6px;
  color: ${({ $color }) => $color ?? tokens.color.ink1};
  /* 4분할 스트립에서 primary 셀이 너무 혼자만 커 보이지 않도록 비-primary 값을 22px로 올렸습니다. */
  font-size: ${({ $primary }) => ($primary ? tokens.type.metric.size : "22px")};
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
`;

const MetaRow = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
`;

/**
 * 비-primary 셀의 메타를 셀 바닥에 붙이기 위해 `margin-top: auto`를 주는 컨테이너입니다.
 * primary 셀은 아래에 sparkline이 이어지므로 push를 하지 않고 자연 위치에 둡니다.
 */
const MetaTail = styled.div<{ $pushDown?: boolean }>`
  ${({ $pushDown }) => $pushDown && "margin-top: auto; padding-top: 10px;"}
`;

const Sub = styled.div`
  margin-top: 4px;
  color: ${tokens.color.ink4};
  font-size: ${tokens.type.caption.size};
`;

const Spark: React.FC<{ data: number[] }> = ({ data }) => {
  const chartData = data.map((value, index) => ({ index, value }));

  // 2026-04-24: ResponsiveContainer 최초 렌더 시 부모 width 가 아직 측정되지 않아 Recharts 가
  //   `width(-1) height(-1)` 경고를 쏟아내는 회귀가 있었습니다. grid cell 안에서 flex item 의
  //   기본 `min-width: auto` 때문인데, wrap 에 `width: 100%; min-width: 0` 를 직접 박아
  //   첫 프레임부터 0 이상의 측정값을 돌려주도록 고정합니다.
  // 2026-04-28 추가: minHeight/minWidth 는 calculateChartDimensions 단계에 끼어들지 않아
  //   워닝이 계속 떴습니다. 근본 원인은 ResponsiveContainer 의 defaultProps
  //   initialDimension = { width: -1, height: -1 }. 첫 동기 렌더에서 useState 초기값으로 -1
  //   이 흘러 calculatedWidth/Height = -1 → warn() 트리거. initialDimension 을 부모 명시
  //   크기(32x32)로 줘서 첫 측정값이 처음부터 양수가 되도록 합니다(recharts 6.x 검증).
  return (
    <div style={{ width: "100%", minWidth: 0, height: 32, marginTop: 10 }}>
      <ResponsiveContainer
        width="100%"
        height="100%"
        minHeight={32}
        minWidth={1}
        initialDimension={{ width: 1, height: 32 }}
      >
        <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="home-kpi-spark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={tokens.color.accent} stopOpacity={0.28} />
              <stop offset="100%" stopColor={tokens.color.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={tokens.color.accent}
            strokeWidth={1.6}
            fill="url(#home-kpi-spark)"
            fillOpacity={1}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export const KpiStrip: React.FC<{ kpis: KpiItem[] }> = ({ kpis }) => (
  <Strip>
    {kpis.map((kpi) => (
      <Cell key={kpi.key} $primary={kpi.primary}>
        <LabelRow>
          {kpi.dotColor && <Dot $color={kpi.dotColor} />}
          <span>{kpi.label}</span>
          {kpi.neuChip && <Chip $tone="neu">{kpi.neuChip}</Chip>}
        </LabelRow>
        <Value
          className="tnum"
          $primary={kpi.primary}
          $color={kpi.valueColor}
        >
          {kpi.valuePrefix}
          {formatKRW(kpi.value)}
        </Value>
        <MetaTail $pushDown={!kpi.primary}>
          {kpi.delta && (
            <MetaRow>
              <Chip $tone={kpi.delta.tone === "up" ? "up" : "down"}>
                {kpi.delta.tone === "up" ? "상승" : "하락"} {kpi.delta.text}
              </Chip>
            </MetaRow>
          )}
          {kpi.sub && <Sub>{kpi.sub}</Sub>}
        </MetaTail>
        {kpi.spark && <Spark data={kpi.spark} />}
      </Cell>
    ))}
  </Strip>
);
