/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Analysis\components\SubscriptionList.tsx
 */
import React from "react";
import { useNavigate } from "react-router-dom";
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

/*
 * 정기결제 카드의 각 행은 클릭 시 /subscriptions 전용 페이지로 이동하는 단축
 * 동선을 가집니다. 거래내역 테이블/홈 최근거래와 같은 tint 톤 hover 로 통일성을
 * 유지하고, cursor: pointer + button role 로 키보드/스크린리더 사용자도 같은
 * 동선을 잡을 수 있게 합니다. 행간 경계선은 hover 박스에 흡수되지 않도록
 * border-top 을 투명 처리해 한 덩어리로 떠오르는 인상을 줍니다.
 */
const Row = styled.li`
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  margin: 0 -12px;
  border-radius: ${tokens.radius.control};
  cursor: pointer;
  transition: background ${tokens.motion.fast} ease;

  & + & {
    border-top: 1px solid ${tokens.color.line2};
  }

  &:hover,
  &:focus-visible {
    background: ${tokens.color.tint};
    border-top-color: transparent;
    outline: none;
  }

  &:hover + & {
    border-top-color: transparent;
  }

  &:focus-visible {
    box-shadow: ${tokens.shadow.focus};
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

/**
 * 카드 부제. "고정지출"의 가계부 뉘앙스를 보조 설명으로 살리되, 라벨·라우트는 코드베이스
 * 표준인 "정기결제"로 통일했습니다(2026-04-28 결정). 자세한 배경은 CLAUDE.md / 사이드바
 * 메뉴와 일치시키기 위함입니다.
 */
const Hint = styled.div`
  margin-bottom: 6px;
  color: ${tokens.color.ink4};
  font-size: 12px;
  line-height: 1.5;
`;

export const SubscriptionList: React.FC<{ items: SubscriptionItem[]; total: number }> = ({
  items,
  total,
}) => {
  const navigate = useNavigate();
  const goToSubscriptions = () => navigate("/subscriptions");

  return (
    <Card>
      <CardHd>
        <CardTitle>정기결제</CardTitle>
        <Chip $tone="info">자동 감지됨</Chip>
      </CardHd>
      <CardBd>
        {items.length === 0 ? (
          <EmptyState>
            아직 감지된 정기결제가 없어요.
            <br />
            구독·공과금·보험·통신비처럼 매월 고정으로 빠지는 결제가 쌓이면 여기에 모여요.
          </EmptyState>
        ) : (
          <>
            <Hint>매월 고정으로 빠지는 결제 · 클릭하면 정기결제 페이지로 이동합니다.</Hint>
            <List>
              {items.map((item) => (
                <Row
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={goToSubscriptions}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      goToSubscriptions();
                    }
                  }}
                  aria-label={`${item.name} 정기결제 상세 보기`}
                >
                  <Icon $color={item.color} />
                  <div>
                    <Name>{item.name}</Name>
                    <Next>다음 결제 {item.nextDate}</Next>
                  </div>
                  <Amount>{formatKRW(item.amount)}/월</Amount>
                </Row>
              ))}
            </List>
          </>
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
};
