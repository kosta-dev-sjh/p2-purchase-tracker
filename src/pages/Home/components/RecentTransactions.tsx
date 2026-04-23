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

type Platform = "coupang" | "naver" | "musinsa" | "auction" | "temu" | "unspecified";

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

  &:hover {
    background: ${tokens.color.tint};
    border-top-color: transparent;
  }

  &:hover + & {
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
        <List>
          {items.map((item) => (
            <Row key={item.id}>
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
      </CardBd>
    </Card>
  );
};

