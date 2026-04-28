/**
 * 역할: 랜딩 페이지 상단 글로벌 헤더(브랜드 + 로그인/회원가입 진입).
 * 위치: src\pages\Landing\components\LandingHeader.tsx
 *
 * 데스크톱에선 양쪽 정렬, 모바일에선 가로 폭이 줄어 우측 액션이 좁아지므로 두 버튼 중
 * "회원가입"만 강조하고 "로그인"은 보조 톤으로 남겨 읽기 흐름을 단순화합니다.
 */
import { Link } from "react-router-dom";
import styled from "styled-components";
import { tokens } from "../../../styles/tokens";
import { media } from "../../../tokens/breakpoints";

const Wrap = styled.header<{ $scrolled: boolean }>`
  position: sticky;
  top: 0;
  z-index: 50;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px clamp(16px, 4vw, 40px);
  background: ${({ $scrolled }) =>
    $scrolled ? "rgba(251, 250, 253, 0.78)" : "rgba(251, 250, 253, 0)"};
  backdrop-filter: ${({ $scrolled }) => ($scrolled ? "saturate(180%) blur(14px)" : "none")};
  /* 1px 라인 대신 살짝 페이드된 그림자만 — 페이지 베이스와 자연스럽게 이어지게. */
  box-shadow: ${({ $scrolled }) =>
    $scrolled ? "0 1px 0 rgba(33, 28, 92, 0.04), 0 8px 16px -12px rgba(33, 28, 92, 0.08)" : "none"};
  transition:
    background 360ms cubic-bezier(0.22, 1, 0.36, 1),
    backdrop-filter 360ms cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 360ms cubic-bezier(0.22, 1, 0.36, 1);
`;

const Brand = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
`;

/**
 * 랜딩 헤더 로고 — 파비콘 SVG 와 통일(2026-04-28). 이전엔 "S" 글자였음.
 * 사이드바·모바일·랜딩 모두 같은 SVG 자산을 사용해 브랜드 일관성 유지.
 */
const Logo = styled.div`
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 8px;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    display: block;
  }
`;

const BrandName = styled.span`
  color: ${tokens.color.ink1};
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
`;

const Actions = styled.nav`
  display: inline-flex;
  align-items: center;
  gap: 8px;
`;

const LinkBase = styled(Link)`
  display: inline-flex;
  align-items: center;
  height: 38px;
  padding: 0 16px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition:
    background 280ms cubic-bezier(0.22, 1, 0.36, 1),
    color 200ms ease,
    box-shadow 280ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
`;

const LoginLink = styled(LinkBase)`
  color: ${tokens.color.ink2};
  background: transparent;

  &:hover {
    background: rgba(79, 70, 229, 0.06);
    color: ${tokens.color.ink1};
  }
`;

const SignupLink = styled(LinkBase)`
  color: #fff;
  background-image: linear-gradient(135deg, ${tokens.color.accent}, ${tokens.color.accentHover});
  /* 1px 라인 대신 흐릿한 ambient — 인디고 광원만. */
  box-shadow:
    0 10px 22px -12px rgba(79, 70, 229, 0.55),
    0 2px 6px -2px rgba(79, 70, 229, 0.3);

  &:hover {
    transform: translateY(-1px);
    box-shadow:
      0 14px 28px -12px rgba(79, 70, 229, 0.6),
      0 4px 10px -2px rgba(79, 70, 229, 0.35);
  }

  ${media.mobile} {
    /* 모바일에선 아이콘 자리도 빠듯하니 라벨만 짧게 유지 */
    padding: 0 14px;
  }
`;

interface Props {
  scrolled: boolean;
}

export const LandingHeader = ({ scrolled }: Props) => (
  <Wrap $scrolled={scrolled}>
    <Brand to="/">
      <Logo>
        <img src="/favicon.svg" alt="SpendTrack" />
      </Logo>
      <BrandName>SpendTrack</BrandName>
    </Brand>
    <Actions>
      <LoginLink to="/login">로그인</LoginLink>
      <SignupLink to="/register">시작하기</SignupLink>
    </Actions>
  </Wrap>
);
