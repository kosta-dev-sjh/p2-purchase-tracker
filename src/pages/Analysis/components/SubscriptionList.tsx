/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Analysis\components\SubscriptionList.tsx
 */
import React from "react";
import styled from "styled-components";
import {
  Card,
  CardBd,
  CardFoot,
  CardHd,
  CardTitle,
} from "../../../components/primitives/Card";
import { Chip } from "../../../components/primitives/Chip";
import { tokens } from "../../../styles/tokens";
import { formatKRW } from "../../../utils/format";

export interface SubscriptionItem {
  id: string;
  name: string;
  color: string;
  nextDate: string;
  amount: number;
}

const List = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
`;

const Row = styled.li`
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 10px 0;

  & + & {
    border-top: 1px solid ${tokens.color.line2};
  }
`;

const Icon = styled.div<{ $color: string }>`
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: ${({ $color }) => $color};
`;

const Name = styled.div`
  color: ${tokens.color.ink1};
  font-size: 13.5px;
  font-weight: 500;
`;

const Next = styled.div`
  color: ${tokens.color.ink4};
  font-size: 11px;
`;

const Amount = styled.div`
  color: ${tokens.color.ink1};
  font-family: ${tokens.font.mono};
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
`;

/**
 * 정기결제(status === "sub") 거래가 한 건도 없을 때 본문이 빈 박스로 보이지 않도록 띄우는 안내.
 * 푸터의 "이번 달 정기결제 합계 ₩0/월"만 떠 있으면 사용자는 카드 본문이 비어 있는지 데이터 누락인지
 * 분간이 안 됩니다.
 */
const EmptyState = styled.div`
  padding: 28px 12px;
  text-align: center;
  color: ${tokens.color.ink4};
  font-size: 12.5px;
  line-height: 1.55;
`;

export const SubscriptionList: React.FC<{ items: SubscriptionItem[]; total: number }> = ({
  items,
  total,
}) => (
  <Card>
    <CardHd>
      <CardTitle>정기결제 감지</CardTitle>
      <Chip $tone="info">자동 감지됨</Chip>
    </CardHd>
    <CardBd>
      {items.length === 0 ? (
        <EmptyState>
          아직 감지된 정기결제가 없어요.
          <br />
          매달 결제되는 항목을 ‘정기결제’ 상태로 입력하면 여기에 모여요.
        </EmptyState>
      ) : (
        <List>
          {items.map((item) => (
            <Row key={item.id}>
              <Icon $color={item.color} />
              <div>
                <Name>{item.name}</Name>
                <Next>다음 결제 {item.nextDate}</Next>
              </div>
              <Amount>{formatKRW(item.amount)}/월</Amount>
            </Row>
          ))}
        </List>
      )}
    </CardBd>
    <CardFoot>
      <span>이번 달 정기결제 합계</span>
      <span
        className="tnum"
        style={{ fontWeight: 600, color: tokens.color.ink2, fontFamily: tokens.font.mono }}
      >
        {formatKRW(total)}/월
      </span>
    </CardFoot>
  </Card>
);

