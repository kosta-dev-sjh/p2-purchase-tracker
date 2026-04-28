/**
 * 역할: 랜딩 페이지 하단 마무리 CTA 섹션. 다시 한 번 가입을 권유합니다.
 * 위치: src\pages\Landing\components\LandingCta.tsx
 *
 * 다크 그라데이션이 너무 콘트라스트 강하면 페이지 전체 부드러운 톤이 마지막에서 깨집니다.
 * 액센트 인디고 한 톤 안에서 깊고 옅은 두 점만 골라 부드럽게 잇고, 보더 대신 큰 ambient
 * shadow 로 띄웁니다.
 */
import { Link } from "react-router-dom";
import styled from "styled-components";
import { tokens } from "../../../styles/tokens";
import { media } from "../../../tokens/breakpoints";
import { useReveal } from "../hooks/useReveal";

const Section = styled.section`
  padding: clamp(48px, 8vw, 96px) clamp(16px, 4vw, 40px);
`;

const Inner = styled.div<{ $visible: boolean }>`
  max-width: 880px;
  margin: 0 auto;
  position: relative;
  /*
   * 인디고 단일 톤 안에서 어두운 → 중간 → 액티브 톤으로 흐르고, 광원도 인디고 패밀리만.
   * 좌하단에 청록(cat2) 광원을 섞으면 두 색 톤이 부딪쳐 어수선해 보였습니다 → 라이트 라벤더로 교체.
   */
  background:
    radial-gradient(700px 320px at 100% 0%, rgba(255, 255, 255, 0.14), transparent 60%),
    radial-gradient(560px 320px at 0% 100%, rgba(167, 139, 250, 0.22), transparent 60%),
    linear-gradient(135deg, #1E1B4B 0%, #312E81 55%, #3730A3 100%);
  color: #fff;
  border-radius: 28px;
  padding: clamp(36px, 6vw, 60px) clamp(24px, 5vw, 56px);
  text-align: center;
  overflow: hidden;
  isolation: isolate;
  /* 1px 보더 대신 흐릿한 큰 그림자 한 단으로 페이지 위에 떠 있는 느낌. */
  box-shadow:
    0 60px 120px -50px rgba(33, 28, 92, 0.55),
    0 24px 48px -32px rgba(33, 28, 92, 0.35);
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transform: translate3d(
      0,
      ${({ $visible }) => ($visible ? "0" : "32px")},
      0
    )
    scale(${({ $visible }) => ($visible ? 1 : 0.97)});
  transition:
    opacity 880ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 880ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: opacity, transform;
`;

const Title = styled.h2`
  margin: 0 0 12px;
  font-size: clamp(22px, 3vw, 32px);
  font-weight: 700;
  letter-spacing: -0.022em;
  line-height: 1.25;
`;

const Sub = styled.p`
  margin: 0 auto 26px;
  max-width: 560px;
  color: rgba(255, 255, 255, 0.78);
  font-size: clamp(13px, 1.4vw, 15px);
  line-height: 1.7;
`;

const Row = styled.div`
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;

  ${media.mobile} {
    width: 100%;
  }
`;

const Primary = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 50px;
  padding: 0 26px;
  border-radius: 14px;
  background: #fff;
  color: ${tokens.color.accentActive};
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  letter-spacing: -0.01em;
  /* 흰 버튼은 다크 위에서 살짝 떠 보이도록 부드러운 ambient + 옅은 light glow. */
  box-shadow:
    0 18px 36px -16px rgba(0, 0, 0, 0.35),
    0 0 0 1px rgba(255, 255, 255, 0.04);
  transition:
    transform 320ms cubic-bezier(0.22, 1, 0.36, 1),
    background 240ms ease;

  &:hover {
    transform: translateY(-2px);
    background: #F4F3FB;
  }

  ${media.mobile} {
    width: 100%;
  }
`;

const Ghost = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 50px;
  padding: 0 24px;
  border-radius: 14px;
  /* 다크 패널 위라 alpha 흰 배경만으로도 충분 — backdrop-filter 비용 제거. */
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  transition:
    background 280ms ease,
    border-color 280ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 320ms cubic-bezier(0.22, 1, 0.36, 1);

  &:hover {
    background: rgba(255, 255, 255, 0.14);
    border-color: rgba(255, 255, 255, 0.34);
    transform: translateY(-1px);
  }

  ${media.mobile} {
    width: 100%;
  }
`;

export const LandingCta = () => {
  const reveal = useReveal<HTMLDivElement>();
  return (
    <Section>
      <Inner ref={reveal.ref} $visible={reveal.visible}>
        <Title>오늘 들어온 거래부터 정리해 봐요</Title>
        <Sub>
          쇼핑몰 주문 캡처, 카드사 CSV, 다이어리에 적어둔 메모 — 전부 SpendTrack 한 곳에서.
        </Sub>
        <Row>
          <Primary to="/register">시작하기</Primary>
          <Ghost to="/login">이미 계정이 있어요</Ghost>
        </Row>
      </Inner>
    </Section>
  );
};
