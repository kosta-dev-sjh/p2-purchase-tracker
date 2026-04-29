/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Analysis\components\RepeatTop3.tsx
 */
import React from "react";
import styled from "styled-components";
import { Card, CardBd, CardHd, CardTitle } from "../../../components/primitives/Card";
import { tokens } from "../../../styles/tokens";
import { formatKRW } from "../../../utils/format";

export interface RepeatItem {
  /** 1~5위(2026-04-28 TOP3 → TOP5 확장). 정기결제 카드와 시각 높이 맞추기. */
  rank: 1 | 2 | 3 | 4 | 5;
  title: string;
  platform: string;
  category: string;
  count: number;
  amount: number;
}

/**
 * 레퍼런스 HTML `.rep-num` / `.rep-num.top` 규칙을 그대로 가져옵니다.
 * 1위만 accent 팔레트로 강조하고, 2~5위는 중립 tint + ink3로 보여 주어
 * 과한 원색 사용을 피하고 정보 위계를 맞춥니다.
 */
const RANK_STYLE: Record<number, { bg: string; fg: string }> = {
  1: { bg: tokens.color.accentSubtle, fg: tokens.color.accentHover },
  2: { bg: tokens.color.tint, fg: tokens.color.ink3 },
  3: { bg: tokens.color.tint, fg: tokens.color.ink3 },
  4: { bg: tokens.color.tint, fg: tokens.color.ink3 },
  5: { bg: tokens.color.tint, fg: tokens.color.ink3 },
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
  padding: 12px;
  margin: 0 -12px;
  border-radius: ${tokens.radius.control};
  transition: background ${tokens.motion.fast} ease;

  & + & {
    border-top: 1px solid ${tokens.color.line2};
  }

  /*
   * 사용자 요청: 마우스 올렸을 때 눈이 재밌도록 색이 바뀌는 효과.
   * 표시 전용 카드라 클릭 동작은 없으므로 cursor 는 default 그대로 두고
   * 거래내역 테이블/홈 최근거래와 동일한 tint 톤으로 통일감을 유지합니다.
   * hover 상태에서는 위/아래 행 사이 경계선이 hover 박스를 가로지르지 않도록
   * border-top 색을 투명으로 떨어뜨려 한 덩어리로 떠오르는 느낌을 줍니다.
   */
  &:hover {
    background: ${tokens.color.tint};
    border-top-color: transparent;
  }

  &:hover + & {
    border-top-color: transparent;
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

/**
 * 같은 상품을 여러 번 사지 않은 달에는 카드 본문이 빈 박스가 됩니다. 빈 박스 대신
 * "반복 구매 흐름이 아직 없어요" 라는 안내를 띄워 카드의 의미를 분명하게 합니다.
 */
const EmptyState = styled.div`
  padding: 28px 12px;
  text-align: center;
  color: ${tokens.color.ink4};
  font-size: 12.5px;
  line-height: 1.55;
`;

export const RepeatTop3: React.FC<{ items: RepeatItem[] }> = ({ items }) => (
  /*
   * 컴포넌트 이름은 RepeatTop3 그대로 둡니다(2026-04-28 TOP5 확장 후).
   * 외부에서 import 하는 경로/식별자가 바뀌지 않게 하기 위해 라벨만 "TOP 5" 로 손봤습니다.
   * 사용자 화면 카피로는 "TOP 5" 만 보이며, 5건 미만이면 자연스럽게 적게 노출됩니다.
   */
  /*
   * 라벨(2026-04-29): 이전 "반복 구매 TOP 5" + "이번 달 3회 이상 구매" 칩 조합은
   * 실제 데이터엔 1~2회 항목도 함께 노출돼 칩 문구가 사실과 어긋나 보였습니다(사용자
   * 피드백). 기능을 "3회 이상만 보여주기" 로 좁히기보다는 "이번달 최다 구매 TOP 5" 로
   * 문구를 정확하게 다시 잡았습니다 — 구매 횟수 순 상위 5개라는 의미를 그대로 전달.
   * 칩은 제거 (제목이 시간 범위·정렬 기준을 모두 담아 부가 칩이 불필요).
   */
  <Card>
    <CardHd>
      <CardTitle>이번달 최다 구매 TOP 5</CardTitle>
    </CardHd>
    <CardBd>
      {items.length === 0 ? (
        <EmptyState>
          이번 달 반복 구매 흐름이 아직 없어요.
          <br />
          같은 상품을 여러 번 사면 여기에 표시돼요.
        </EmptyState>
      ) : (
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
      )}
    </CardBd>
  </Card>
);

