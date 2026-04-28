/**
 * 역할: 랜딩 페이지 푸터. 카피라이트와 보조 링크 정도만.
 * 위치: src\pages\Landing\components\LandingFooter.tsx
 */
import styled from "styled-components";
import { Link } from "react-router-dom";
import { tokens } from "../../../styles/tokens";

const Wrap = styled.footer`
  padding: 36px clamp(16px, 4vw, 40px) 44px;
  /* 페이지 베이스 그라데이션이 끝까지 이어지도록 색/보더 둘 다 빼고, 가장 위에 옅은 fade
     라인 한 줄만 그려 자연스럽게 마무리. */
  background: transparent;
  position: relative;

  &::before {
    content: "";
    position: absolute;
    top: 0;
    left: clamp(16px, 4vw, 40px);
    right: clamp(16px, 4vw, 40px);
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(33, 28, 92, 0.1) 50%,
      transparent 100%
    );
  }
`;

const Inner = styled.div`
  max-width: 1180px;
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: ${tokens.color.ink4};
  font-size: 12.5px;
`;

const Brand = styled.span`
  color: ${tokens.color.ink2};
  font-weight: 700;
`;

const LinkRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
`;

const FooterLink = styled(Link)`
  color: ${tokens.color.ink3};
  font-weight: 600;
  text-decoration: none;

  &:hover {
    color: ${tokens.color.accentHover};
    text-decoration: underline;
  }
`;

export const LandingFooter = () => (
  <Wrap>
    <Inner>
      <span>
        {/*
         * 카피 변경 이유: "영수증" 은 실제 앱 어휘가 아닙니다. 주 기능은 쇼핑몰
         * 주문내역 캡처(OCR) + 카드 내역 + 수동 입력 → Home 자동 분석. 사용자 멘탈
         * 모델이 깨지지 않도록 푸터에서도 "거래 입력 → 분석" 흐름을 그대로 표현합니다.
         */}
        <Brand>SpendTrack</Brand> · 거래 입력부터 분석까지 한 자리에
      </span>
      <LinkRow>
        <FooterLink to="/terms">이용약관</FooterLink>
        <FooterLink to="/privacy">개인정보 처리방침</FooterLink>
        <span>© {new Date().getFullYear()} SpendTrack. All rights reserved.</span>
      </LinkRow>
    </Inner>
  </Wrap>
);
