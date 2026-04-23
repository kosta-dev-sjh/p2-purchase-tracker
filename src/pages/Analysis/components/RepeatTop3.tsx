/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Analysis\components\RepeatTop3.tsx
 */
import React from "react";
import styled from "styled-components";
import { Card, CardBd, CardHd, CardTitle } from "../../../components/primitives/Card";
import { Chip } from "../../../components/primitives/Chip";
import { tokens } from "../../../styles/tokens";
import { formatKRW } from "../../../utils/format";

export interface RepeatItem {
  rank: 1 | 2 | 3;
  title: string;
  platform: string;
  category: string;
  count: number;
  amount: number;
}

/**
 * 레퍼런스 HTML `.rep-num` / `.rep-num.top` 규칙을 그대로 가져옵니다.
 * 1위만 accent 팔레트로 강조하고, 2/3위는 중립 tint + ink3로 보여 주어
 * 과한 원색 사용을 피하고 정보 위계를 맞춥니다.
 */
const RANK_STYLE: Record<number, { bg: string; fg: string }> = {
  1: { bg: tokens.color.accentSubtle, fg: tokens.color.accentHover },
  2: { bg: tokens.color.tint, fg: tokens.color.ink3 },
  3: { bg: tokens.color.tint, fg: tokens.color.ink3 },
};

const List = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
`;

const Row = styled.li`
  display: grid;
  grid-template-columns: 22px 1fr auto auto;
  gap: 12px;
  align-items: center;
  padding: 12px 0;

  & + & {
    border-top: 1px solid ${tokens.color.line2};
  }
`;

const Rank = styled.div<{ $bg: string; $fg: string }>`
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border-radius: 50%;
  background: ${({ $bg }) => $bg};
  color: ${({ $fg }) => $fg};
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  /* 숫자 폭이 제각각이어도 원 정중앙에 놓이도록 라인-하이트를 명시합니다. */
  line-height: 1;
  text-align: center;
`;

const Title = styled.div`
  color: ${tokens.color.ink1};
  font-size: 13.5px;
  font-weight: 500;
`;

const Meta = styled.div`
  color: ${tokens.color.ink4};
  font-size: 11px;
`;

const Count = styled.span`
  color: ${tokens.color.accentHover};
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
`;

const Amount = styled.span`
  color: ${tokens.color.ink1};
  font-family: ${tokens.font.mono};
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
`;

export const RepeatTop3: React.FC<{ items: RepeatItem[] }> = ({ items }) => (
  <Card>
    <CardHd>
      <CardTitle>반복 구매 TOP 3</CardTitle>
      <Chip tone="info">이번 달 3회 이상 구매</Chip>
    </CardHd>
    <CardBd>
      <List>
        {items.map((item) => {
          const style = RANK_STYLE[item.rank];
          return (
            <Row key={item.rank}>
              <Rank $bg={style.bg} $fg={style.fg}>
                {item.rank}
              </Rank>
              <div>
                <Title>{item.title}</Title>
                <Meta>
                  {item.platform} · {item.category}
                </Meta>
              </div>
              <Count>{item.count}회</Count>
              <Amount>{formatKRW(item.amount)}</Amount>
            </Row>
          );
        })}
      </List>
    </CardBd>
  </Card>
);

