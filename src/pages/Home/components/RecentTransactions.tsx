/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Home\components\RecentTransactions.tsx
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { Card, CardBd, CardHd, CardTitle } from "../../../components/primitives/Card";
import { Tag } from "../../../components/primitives/Tag";
import { tokens } from "../../../styles/tokens";
import { media } from "../../../tokens/breakpoints";
import { formatKRW } from "../../../utils/format";
import { PLATFORM_LABELS } from "../../../constants/labels";

type Platform = "coupang" | "naver" | "unspecified";

export interface RecentItem {
  id: string;
  initial: string;
  platform: Platform;
  title: string;
  date: string;
  amount: number;
}

const LinkButton = styled.button`
  border: 0;
  background: transparent;
  color: ${tokens.color.accentHover};
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  padding: 0;

  &:hover {
    text-decoration: underline;
  }
`;

const List = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
`;

/**
 * 거래가 한 건도 없을 때 카드 본문이 빈 박스로 보이지 않도록 띄우는 안내.
 * 다른 빈 상태(소비 인사이트 카드)와 결을 맞춰 회색 톤 + 짧은 안내 문구로 처리합니다.
 */
const EmptyState = styled.div`
  padding: 28px 12px;
  text-align: center;
  color: ${tokens.color.ink4};
  font-size: 12.5px;
  line-height: 1.55;
`;

const Row = styled.li`
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto auto;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  margin: 0 -12px;
  border-radius: ${tokens.radius.control};
  transition: background ${tokens.motion.fast} ease;
  cursor: pointer;

  & + & {
    border-top: 1px solid ${tokens.color.line2};
  }

  &:hover,
  &:focus-visible {
    background: ${tokens.color.tint};
    border-top-color: transparent;
    outline: none;
  }

  &:focus-visible {
    box-shadow: ${tokens.shadow.focus};
  }

  &:hover + &,
  &:focus-visible + & {
    border-top-color: transparent;
  }

  /*
   * 좁은 모바일에서 아바타 + 제목/날짜 + 태그 + 금액 네 칸이 한 줄에 들어가면
   * 제목이 "..."만 남도록 극단적으로 줄고 금액이 잘려 보이기 쉽습니다.
   * 2행 그리드(좌측 아바타 고정, 우측은 제목 상단 · 태그+금액 하단)로 정리해
   * 정보를 자연스럽게 두 줄로 분리합니다.
   */
  ${media.mobile} {
    grid-template-columns: 32px minmax(0, 1fr);
    grid-template-areas:
      "avatar title"
      "avatar meta";
    row-gap: 6px;
    column-gap: 10px;
    padding: 10px;
    margin: 0 -10px;
  }
`;

/*
 * 모바일에서 제목/날짜 블록과 "태그 + 금액" 블록을 각각 grid-area 로 배치합니다.
 * 데스크톱에서는 기존 grid 셀이 그대로 동작하므로 styled-component 레벨에서 별도 처리 필요 없음.
 */
const TitleBlock = styled.div`
  min-width: 0;

  ${media.mobile} {
    grid-area: title;
  }
`;

const MetaBlock = styled.div`
  display: contents;

  ${media.mobile} {
    grid-area: meta;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
`;

const Avatar = styled.div`
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 50%;
  background: ${tokens.color.tint};
  color: ${tokens.color.ink2};
  font-size: 12px;
  font-weight: 600;

  ${media.mobile} {
    grid-area: avatar;
  }
`;

const Title = styled.div`
  overflow: hidden;
  color: ${tokens.color.ink1};
  font-size: ${tokens.type.bodySm.size};
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Sub = styled.div`
  color: ${tokens.color.ink4};
  font-size: ${tokens.type.caption.size};
`;

const Amount = styled.div<{ $negative?: boolean }>`
  color: ${({ $negative }) => ($negative ? tokens.color.neg : tokens.color.pos)};
  font-family: ${tokens.font.mono};
  font-size: ${tokens.type.bodySm.size};
  font-weight: 600;
  font-variant-numeric: tabular-nums;
`;

export const RecentTransactions: React.FC<{ items: RecentItem[] }> = ({ items }) => {
  const navigate = useNavigate();

  return (
    <Card>
      <CardHd>
        <CardTitle>최근 거래</CardTitle>
        <LinkButton type="button" onClick={() => navigate("/transactions")}>
          전체보기
        </LinkButton>
      </CardHd>
      <CardBd>
        {items.length === 0 ? (
          <EmptyState>
            아직 거래가 없어요.
            <br />
            상단 ‘입력’에서 첫 거래를 추가해 보세요.
          </EmptyState>
        ) : (
          <List>
            {items.map((item) => (
              /**
               * 행 클릭 시 거래내역 페이지로 이동하면서 location.state.scrollToTransactionId
               * 로 대상 거래 id 를 함께 넘깁니다. Transactions 페이지가 이 값을 받아 월
               * 동기화·필터 리셋·자동 선택·부드러운 스크롤·하이라이트 펄스를 처리합니다.
               * 키보드/스크린리더 사용자도 같은 동선을 잡도록 button role + Enter/Space
               * 핸들러를 함께 둡니다.
               */
              <Row
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() =>
                  navigate("/transactions", { state: { scrollToTransactionId: item.id } })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate("/transactions", { state: { scrollToTransactionId: item.id } });
                  }
                }}
                aria-label={`${item.title} 거래 상세로 이동`}
              >
                <Avatar>{item.initial}</Avatar>
                <TitleBlock>
                  <Title>{item.title}</Title>
                  <Sub>{item.date}</Sub>
                </TitleBlock>
                <MetaBlock>
                  <Tag kind={item.platform}>{PLATFORM_LABELS[item.platform]}</Tag>
                  <Amount $negative={item.amount < 0}>
                    {item.amount < 0 ? "-" : "+"}
                    {formatKRW(Math.abs(item.amount))}
                  </Amount>
                </MetaBlock>
              </Row>
            ))}
          </List>
        )}
      </CardBd>
    </Card>
  );
};
