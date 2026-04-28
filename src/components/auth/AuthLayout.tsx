/**
 * 역할: 인증 화면에서 공통으로 재사용하는 레이아웃 컴포넌트입니다.
 * 위치: src\components\auth\AuthLayout.tsx
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import styled from "styled-components";
import { tokens } from "../../styles/tokens";

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  footerPrompt: string;
  footerLabel: string;
  footerHref: string;
  children: ReactNode;
}

const Page = styled.div`
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 40px 16px;
  background: ${tokens.color.bg};
`;

const Container = styled.div`
  width: 420px;
  max-width: 100%;
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 24px;
`;

const Logo = styled.div`
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 8px;
  background: ${tokens.color.accent};
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.02em;
`;

const BrandName = styled.div`
  color: ${tokens.color.ink1};
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
`;

const Card = styled.section`
  background: ${tokens.color.panel};
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.card};
  padding: 32px;
  box-shadow: ${tokens.shadow.card};
`;

const Title = styled.h1`
  margin: 0 0 6px;
  color: ${tokens.color.ink1};
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
`;

const Subtitle = styled.p`
  margin: 0 0 24px;
  color: ${tokens.color.ink3};
  font-size: 13px;
  line-height: 1.5;
`;

const Footer = styled.div`
  margin-top: 18px;
  color: ${tokens.color.ink3};
  text-align: center;
  font-size: 13px;

  a {
    margin-left: 4px;
    color: ${tokens.color.accentHover};
    font-weight: 600;
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
`;

export const AuthLayout = ({
  title,
  subtitle,
  footerPrompt,
  footerLabel,
  footerHref,
  children,
}: AuthLayoutProps) => (
  <Page>
    <Container>
      <Brand>
        <Logo>S</Logo>
        <BrandName>SpendTrack</BrandName>
      </Brand>
      <Card>
        <Title>{title}</Title>
        {subtitle && <Subtitle>{subtitle}</Subtitle>}
        {children}
      </Card>
      <Footer>
        {footerPrompt}
        <Link to={footerHref}>{footerLabel}</Link>
      </Footer>
    </Container>
  </Page>
);

