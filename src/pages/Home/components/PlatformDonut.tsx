/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Home\components\PlatformDonut.tsx
 */
import React, { useMemo, useState } from "react";
import styled from "styled-components";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
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
  /* SVG focus outline 차단은 styles/global.ts 의 .recharts-wrapper 룰에서 통합 처리합니다. */
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

/**
 * 슬라이스 hover 시 떠 오르는 커스텀 툴팁. Recharts 기본 Tooltip 은 커서를 따라가
 * 도넛 가운데 글자 위에 겹쳤음(2026-04-28). 도넛 wrap 안쪽 상단(가운데 글자 위쪽 여백) 에
 * 고정 위치로 띄워, 가운데 텍스트를 침범하지 않으면서도 도넛에 가깝게 붙어 보이도록 합니다.
 */
const FloatingTip = styled.div`
  position: absolute;
  left: 50%;
  top: 8px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid ${tokens.color.line};
  background: ${tokens.color.panel};
  box-shadow: ${tokens.shadow.card};
  color: ${tokens.color.ink1};
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 2;

  .swatch {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .label {
    font-weight: 600;
    color: ${tokens.color.ink2};
  }

  .pct {
    color: ${tokens.color.ink3};
    font-variant-numeric: tabular-nums;
  }

  .amount {
    color: ${tokens.color.ink1};
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
`;

export const PlatformDonut: React.FC<{
  total: number;
  items: DonutItem[];
  /**
   * 카드 내 "이번 달 …" 라벨에 들어갈 기간 표시. 현재 월이면 "이번 달", 아니면 "YYYY년 M월".
   * 미지정 시 과거 호환을 위해 "이번 달"로 폴백합니다.
   */
  periodLabel?: string;
}> = ({ total, items, periodLabel = "이번 달" }) => {
  const [mode, setMode] = useState<Mode>("amount");
  /*
   * hover/터치된 슬라이스 인덱스. 기본 floating Tooltip은 도넛 가운데
   * 텍스트(₩총액 / 이번 달 총소비)와 겹쳐 가독성이 떨어졌습니다.
   * 떠다니는 툴팁을 제거하고, 활성 슬라이스 정보를 그대로 가운데
   * 라벨에 노출하면 데스크톱 hover와 모바일 탭 모두 동일하게 동작합니다.
   */
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

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
  const centerCaption = mode === "amount" ? `${periodLabel} 총소비` : `${periodLabel} 총 주문`;

  // 활성 슬라이스 정보(있을 때만 FloatingTip 으로 노출).
  const activeItem =
    activeIndex !== null && activeIndex >= 0 && activeIndex < chartItems.length
      ? chartItems[activeIndex]
      : null;

  return (
    <Card>
      <CardHd>
        <HeaderRow>
          <div>
            <CardTitle>플랫폼별 소비 비중</CardTitle>
            <CardSub>{periodLabel} 기준</CardSub>
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
            {/* recharts 6.x ResponsiveContainer 는 defaultProps initialDimension={-1,-1} 를
                useState 초기값으로 써서 첫 동기 렌더에 calculatedWidth/Height=-1 워닝을 띄웁니다.
                initialDimension 을 DonutWrap 명시 크기(200x200)로 주면 첫 measure 부터 양수.
                minHeight/minWidth 는 calculate 단계 fallback 이라 워닝 자체는 못 막습니다. */}
            <ResponsiveContainer
              width="100%"
              height="100%"
              minHeight={200}
              minWidth={200}
              initialDimension={{ width: 200, height: 200 }}
            >
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
                  /*
                   * 모바일 환경에서도 동일하게 동작하도록 Pie 의 mouse 이벤트만으로
                   * 활성 슬라이스를 추적합니다. recharts 는 터치 이벤트를 mouse 이벤트로
                   * 합성해 발화하므로 별도 onTouch 핸들러가 없어도 탭 시 동일하게 작동합니다.
                   */
                  onMouseEnter={(_, index) => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  {chartItems.map((item, index) => {
                    const dimmed = activeIndex !== null && activeIndex !== index;
                    return (
                      <Cell
                        key={item.label}
                        fill={item.color}
                        // 활성 슬라이스를 강조하기 위해 비활성 슬라이스만 살짝 흐리게.
                        // opacity 만 건드려 색상 토큰은 그대로 유지합니다.
                        fillOpacity={dimmed ? 0.45 : 1}
                        style={{ transition: `fill-opacity ${tokens.motion.fast} ease` }}
                      />
                    );
                  })}
                </Pie>
                {/*
                 * Recharts <Tooltip> 은 의도적으로 사용 안 함 — 커서를 따라가 도넛 가운데
                 * 글자를 침범하던 회귀(2026-04-28). 대신 activeIndex 기반 커스텀 FloatingTip
                 * 을 도넛 wrap 위쪽 바깥에 절대 위치로 띄워 가운데 라벨을 절대 침범하지 않게
                 * 했습니다. 슬라이스 hover 추적 자체는 Pie 의 onMouseEnter/Leave 가 그대로
                 * 처리합니다.
                 */}
              </PieChart>
            </ResponsiveContainer>
            <CenterLabel>
              {/*
               * 가운데 라벨은 항상 고정 — 총액 + 기간 캡션. 슬라이스 hover 시 라벨을
               * 갈아끼우지 않습니다(2026-04-28). 슬라이스 단위 정보는 위쪽 FloatingTip 에 표시.
               */}
              <div>
                <div className="amount">{centerAmount}</div>
                <div className="caption">{centerCaption}</div>
              </div>
            </CenterLabel>
            {activeItem ? (
              <FloatingTip role="status" aria-live="polite">
                <span className="swatch" style={{ background: activeItem.color }} />
                <span className="label">{activeItem.label}</span>
                <span className="pct">{activeItem.primaryText}</span>
                <span className="amount">{activeItem.secondaryText}</span>
              </FloatingTip>
            ) : null}
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
        <span>{periodLabel} 총 {countTotal}건</span>
        <span className="tnum" style={{ fontWeight: 600, color: tokens.color.ink2 }}>
          {items.length}개 플랫폼
        </span>
      </CardFoot>
    </Card>
  );
};
