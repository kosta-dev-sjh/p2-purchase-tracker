/* eslint-disable react-refresh/only-export-components */
/**
 * 역할: 버튼, 카드처럼 여러 화면에서 재사용하는 기본 UI 컴포넌트입니다.
 * 위치: src\components\primitives\Card.tsx
 */
import type { HTMLAttributes, ReactNode } from "react";
import styled from "styled-components";
import { tokens } from "../../styles/tokens";
import { media } from "../../tokens/breakpoints";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: number | string;
  children: ReactNode;
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}

const Container = styled.div<{ $padding: string }>`
  background: ${tokens.color.panel};
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.card};
  padding: ${({ $padding }) => $padding};
  box-shadow: ${tokens.shadow.card};
  transition:
    transform ${tokens.motion.fast} ease,
    box-shadow ${tokens.motion.fast} ease,
    border-color ${tokens.motion.fast} ease;

  /*
   * 프로젝트 전반에서 Card 는 주로 CardHd / CardBd(+CardFoot)를 내부에 품는 구조로 사용됩니다.
   * 이때 Container 의 기본 padding(20px)과 Hd/Bd 각자의 16px 가 이중으로 쌓여
   * 좁은 모바일(360px)에서는 본문 시작점이 화면 왼쪽 가장자리로부터 40~50px 밀리는 문제가 있습니다.
   * 모바일에서는 Container 패딩을 0 으로 접어 Hd/Bd 가 실제 가시적인 좌우 여백을 책임지게 하고,
   * 카드 자체는 "앱처럼 좌우가 꽉 찬" 섹션으로 보이도록 합니다. Container 에 padding 을 명시적으로
   * 내려 받은 경우(예: SettingsNav 의 styled(Card) with padding:8px)는 styled-components 의
   * cascading 규칙상 그쪽이 우선하므로 영향이 없습니다.
   */
  ${media.mobile} {
    padding: 0;
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: ${tokens.space[3]};
  margin-bottom: ${tokens.space[3]};

  .titles {
    display: flex;
    flex-direction: column;
    gap: ${tokens.space[1]};
  }

  h3 {
    margin: 0;
    color: ${tokens.color.ink2};
    font-size: ${tokens.type.titleLg.size};
    font-weight: ${tokens.type.titleLg.weight};
    letter-spacing: ${tokens.type.titleLg.tracking};
  }

  .subtitle {
    color: ${tokens.color.ink4};
    font-size: ${tokens.type.cardSub.size};
    font-weight: ${tokens.type.cardSub.weight};
  }
`;

export const CardHd = styled.div<{ bare?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${tokens.space[2]};
  padding: ${tokens.space[4]} ${tokens.space[4]} ${tokens.space[3]};
  border-bottom: ${({ bare }) => (bare ? "none" : `1px solid ${tokens.color.line2}`)};

  /*
   * 카드 헤더에는 제목 + 세그먼티드 컨트롤/칩/버튼 등이 같이 들어가는 경우가 많습니다.
   * 좁은 모바일 폭에서는 이 두 그룹이 한 줄에 억지로 들어가면 어느 한쪽이 잘려 보여서,
   * 세로로 자연스럽게 쌓이도록 flex-direction 을 전환합니다.
   * align-items 기본값(stretch)에 맡기면 Chip 같은 inline 요소가 풀-폭으로 늘어나 어색해지므로
   * flex-start 로 잡아 자연 너비를 유지하고, SegmentedControl 처럼 스스로 width:100% 를 가진
   * 컨트롤만 실제로 풀-폭으로 펼쳐지도록 합니다.
   */
  ${media.mobile} {
    flex-direction: column;
    align-items: flex-start;
    gap: ${tokens.space[3]};

    & > * {
      min-width: 0;
      max-width: 100%;
    }
  }
`;

export const CardTitle = styled.h3`
  display: flex;
  align-items: center;
  gap: ${tokens.space[2]};
  margin: 0;
  color: ${tokens.color.ink2};
  font-size: ${tokens.type.cardTitle.size};
  font-weight: ${tokens.type.cardTitle.weight};
`;

export const CardSub = styled.p`
  margin: 2px 0 0;
  color: ${tokens.color.ink4};
  font-size: ${tokens.type.cardSub.size};
`;

export const CardBd = styled.div`
  padding: ${tokens.space[4]};

  /* 모바일에서는 카드 내부 좌우 패딩을 살짝 줄여, AppShell 의 14px 외부 패딩과 합쳤을 때
     카드 내부 콘텐츠(표/차트/목록)가 320~360px 뷰포트에서도 눌리지 않도록 합니다. */
  ${media.mobile} {
    padding: ${tokens.space[3]};
  }
`;

export const CardFoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${tokens.space[2]};
  padding: ${tokens.space[3]} ${tokens.space[4]};
  background: ${tokens.color.foot};
  border-top: 1px solid ${tokens.color.line2};
  border-radius: 0 0 ${tokens.radius.card} ${tokens.radius.card};
  color: ${tokens.color.ink3};
  font-size: ${tokens.type.caption.size};

  ${media.mobile} {
    padding: ${tokens.space[3]};
  }
`;

export const Card = ({ padding = 20, children, ...rest }: CardProps) => {
  const resolvedPadding = typeof padding === "number" ? `${padding}px` : padding;
  return (
    <Container $padding={resolvedPadding} {...rest}>
      {children}
    </Container>
  );
};

export const CardHeader = ({ title, subtitle, right }: CardHeaderProps) => (
  <Header>
    <div className="titles">
      <h3>{title}</h3>
      {subtitle && <span className="subtitle">{subtitle}</span>}
    </div>
    {right}
  </Header>
);
