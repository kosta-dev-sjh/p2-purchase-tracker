/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Analysis\components\WeeklyPattern.tsx
 */
import React from "react";
import styled from "styled-components";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardBd,
  CardHd,
  CardSub,
  CardTitle,
} from "../../../components/primitives/Card";
import { tokens } from "../../../styles/tokens";

export interface WeeklyDay {
  /** 한 글자 요일 레이블. 월/화/수/목/금/토/일 순으로 전달됩니다. */
  day: string;
  /** 해당 요일의 총 지출. 0이면 빈 막대로 표시됩니다. */
  amount: number;
  /** true면 강조색으로 막대를 칠합니다. 주말·피크데이 하이라이트에 사용. */
  emphasize?: boolean;
}

interface WeeklyPatternProps {
  days: WeeklyDay[];
  /**
   * 하단 설명 영역. 문자열 안에서 `**강조**`는 ink1/볼드로 표시됩니다.
   * 예: "금·토·일에 전체의 **58%**가 집중돼요."
   */
  note?: string;
}

/**
 * 차트 높이는 바 140px + 상단 라벨(k 단위) 여유 + 하단 요일 라벨을 포함해 ~180px로 고정.
 * 기존 div 레이아웃과 같은 크기감을 유지합니다.
 */
const ChartWrap = styled.div`
  height: 180px;
  /* recharts LabelList가 잘리지 않도록 살짝 여유를 둡니다. */
  margin: -4px -8px 0;
`;

const Note = styled.p`
  margin: 10px 0 0;
  color: ${tokens.color.ink3};
  font-size: 12px;
  line-height: 1.55;

  b {
    color: ${tokens.color.ink1};
    font-weight: 600;
  }
`;

/** `**...**` 구간만 `<b>`로 감싸는 가벼운 파서. */
function renderNote(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <b key={index}>{part.slice(2, -2)}</b>;
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

type TickProps = {
  x?: number;
  y?: number;
  payload?: { value: string; index: number };
};

/**
 * 주말(`emphasize: true`) 요일은 ink2/볼드로, 평일은 ink4/기본 가중치로 출력합니다.
 * 별도 컴포넌트로 분리해 렌더 중 새 컴포넌트를 생성하지 않도록 고정합니다.
 */
const WeeklyTick: React.FC<TickProps & { days?: WeeklyDay[] }> = ({
  x = 0,
  y = 0,
  payload,
  days = [],
}) => {
  const index = payload?.index ?? 0;
  const emphasize = Boolean(days[index]?.emphasize);
  return (
    <text
      x={x}
      y={y + 12}
      textAnchor="middle"
      fontSize={11}
      fontWeight={emphasize ? 600 : 500}
      fill={emphasize ? tokens.color.ink2 : tokens.color.ink4}
    >
      {payload?.value}
    </text>
  );
};

export const WeeklyPattern: React.FC<WeeklyPatternProps> = ({ days, note }) => {
  return (
    <Card>
      <CardHd>
        <div>
          <CardTitle>요일별 지출 패턴</CardTitle>
          <CardSub>주말에 집중되는 경향</CardSub>
        </div>
      </CardHd>
      <CardBd>
        <ChartWrap>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={days}
              margin={{ top: 16, right: 8, left: 8, bottom: 0 }}
              barCategoryGap="28%"
            >
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                interval={0}
                tick={<WeeklyTick days={days} />}
              />
              {/* 라벨(k)이 막대 상단 밖으로 삐져나와도 잘리지 않게 도메인을 넉넉히 잡습니다. */}
              <YAxis hide domain={[0, (dataMax: number) => dataMax * 1.15]} />
              <Bar
                dataKey="amount"
                radius={[4, 4, 0, 0]}
                /* 진입 시 월~일 순으로 위에서 아래로 차오르며 리듬 있게 등장합니다. */
                isAnimationActive
                animationDuration={700}
                animationEasing="ease-out"
                maxBarSize={28}
              >
                <LabelList
                  dataKey="amount"
                  position="top"
                  /* recharts의 LabelFormatter 시그니처는 ReactText라 Number로 캐스팅해 사용합니다. */
                  formatter={(value) => {
                    const num = Number(value ?? 0);
                    return num > 0 ? `${Math.round(num / 1000)}k` : "";
                  }}
                  fill={tokens.color.ink4}
                  fontSize={10}
                  fontWeight={500}
                />
                {days.map((d) => (
                  <Cell
                    key={d.day}
                    fill={d.emphasize ? tokens.color.accent : tokens.color.accentBorder}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartWrap>
        {note && <Note>{renderNote(note)}</Note>}
      </CardBd>
    </Card>
  );
};
