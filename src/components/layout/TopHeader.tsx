/**
 * 역할: 여러 화면이 함께 사용하는 공통 레이아웃 컴포넌트입니다.
 * 위치: src\components\layout\TopHeader.tsx
 */
import type { ReactNode } from "react";
import styled from "styled-components";
import { tokens } from "../../styles/tokens";
import { media } from "../../tokens/breakpoints";

interface TopHeaderProps {
  crumb?: string;
  title: string;
  right?: ReactNode;
}

const Header = styled.header`
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;

  ${media.mobile} {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const Heading = styled.div`
  min-width: 0;

  /*
   * 모바일(세로 스택) 상황에서만 제목 영역이 부모 폭을 꽉 채우도록 width:100% 를 걸어
   * 크럼/타이틀이 줄바꿈돼도 좌측 정렬이 유지되게 합니다.
   * 데스크톱/태블릿에서는 기존처럼 자연 폭으로 두어 RightSlot 쪽 여유를 확보합니다.
   */
  ${media.mobile} {
    width: 100%;
  }
`;

const Crumb = styled.div`
  color: ${tokens.color.ink4};
  font-size: 12px;
  font-weight: 500;
`;

const Title = styled.h1`
  margin: 2px 0 0;
  color: ${tokens.color.ink1};
  font-size: ${tokens.type.h1.size};
  font-weight: ${tokens.type.h1.weight};
  letter-spacing: ${tokens.type.h1.tracking};
  /*
   * 데스크톱/태블릿에서는 기존처럼 한 줄 말줄임을 유지해 긴 제목이 다음 행으로 넘어가며
   * 레이아웃이 밀려 보이는 현상을 차단합니다. 모바일에서만 2줄 이상 허용.
   */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  ${media.mobile} {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    line-height: 1.25;
  }
`;

const RightSlot = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
  margin-left: auto;
  color: ${tokens.color.ink3};
  font-size: 13px;
  font-weight: 400;

  ${media.mobile} {
    width: 100%;
    margin-left: 0;
    justify-content: flex-start;
  }
`;

export const TopHeader = ({ crumb, title, right }: TopHeaderProps) => (
  <Header>
    <Heading>
      {crumb && <Crumb>{crumb}</Crumb>}
      <Title>{title}</Title>
    </Heading>
    {right && <RightSlot>{right}</RightSlot>}
  </Header>
);
