/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Upload\components\MethodCard.tsx
 */
import React from "react";
import { Link } from "react-router-dom";
import styled, { keyframes } from "styled-components";
import { tokens } from "../../../styles/tokens";

export interface MethodCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  ctaLabel: string;
  ctaVariant: "primary" | "ghost";
  footnote: string;
  href: string;
  /**
   * 페이지 첫 로딩 시 카드가 아래에서 위로 부드럽게 올라오는 애니메이션의 시작 지연(ms).
   * 부모에서 카드마다 다른 값을 주어 차례대로 등장하게 합니다.
   */
  enterDelayMs?: number;
}

/**
 * 카드가 아래에서 위로 올라오며 투명도가 차오르는 등장 연출.
 * "방금 자리잡은" 느낌을 주기 위해 12px 이동과 opacity 보간을 함께 사용합니다.
 */
const cardEnter = keyframes`
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const Card = styled(Link)<{ $enterDelayMs: number }>`
  display: block;
  /* 카드가 너무 좁아 타이틀/CTA가 두 줄로 내려가지 않도록 패딩을 살짝 키웠습니다. */
  padding: 36px 30px 26px;
  background: ${tokens.color.panel};
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.card};
  box-shadow: ${tokens.shadow.card};
  color: inherit;
  text-decoration: none;
  transition:
    border-color ${tokens.motion.fast},
    transform ${tokens.motion.fast},
    box-shadow ${tokens.motion.fast};

  /* 첫 렌더 시에만 발동하는 순차 등장 애니메이션. */
  animation: ${cardEnter} 620ms ease-out both;
  animation-delay: ${({ $enterDelayMs }) => `${$enterDelayMs}ms`};

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }

  &:hover {
    border-color: ${tokens.color.accent};
    transform: translateY(-1px);
    box-shadow: 0 8px 24px rgba(79, 70, 229, 0.08), ${tokens.shadow.card};
  }
`;

const IconBox = styled.div`
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  margin: 0 auto 18px;
  border-radius: 12px;
  background: ${tokens.color.accentSubtle};
  color: ${tokens.color.accent};

  svg {
    width: 24px;
    height: 24px;
  }
`;

const Title = styled.h3`
  margin: 0 0 6px;
  color: ${tokens.color.ink1};
  text-align: center;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
`;

const Desc = styled.p`
  margin: 0 0 20px;
  color: ${tokens.color.ink3};
  text-align: center;
  white-space: pre-line;
  font-size: 13px;
  line-height: 1.6;
`;

const Foot = styled.div`
  margin-top: 12px;
  color: ${tokens.color.ink4};
  text-align: center;
  font-size: 11px;
`;

const Cta = styled.div<{ $variant: "primary" | "ghost" }>`
  display: inline-flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  border: 1px solid transparent;
  border-radius: ${tokens.radius.control};
  font-size: 14px;
  font-weight: 600;

  ${({ $variant }) =>
    $variant === "primary"
      ? `
        background: ${tokens.color.accent};
        color: #fff;
      `
      : `
        background: transparent;
        color: ${tokens.color.ink2};
        border-color: ${tokens.color.line};
      `}
`;

export const MethodCard: React.FC<MethodCardProps> = ({
  icon,
  title,
  description,
  ctaLabel,
  ctaVariant,
  footnote,
  href,
  enterDelayMs = 0,
}) => (
  <Card to={href} $enterDelayMs={enterDelayMs}>
    <IconBox>{icon}</IconBox>
    <Title>{title}</Title>
    <Desc>{description}</Desc>
    <Cta $variant={ctaVariant}>{ctaLabel}</Cta>
    <Foot>{footnote}</Foot>
  </Card>
);

