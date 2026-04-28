/**
 * 역할: 비로그인 첫 화면(랜딩) 의 섹션을 조립합니다.
 * 위치: src\pages\Landing\index.tsx
 *
 * 비로그인 진입을 무조건 /login 으로 보내던 기존 흐름 대신, 이 페이지가 첫 인상이 됩니다.
 * 데스크톱·태블릿·모바일 모든 폭에서 자연스럽게 흐르도록 모든 섹션은 viewport 폭에
 * 따라 그리드/타이포가 줄어드는 순수 CSS 반응형으로 구성했고, navigator.userAgent
 * 기반의 모바일 디바이스 인식도 같이 넣어 데이터-속성으로 노출합니다(이후 분석/조건부
 * 처리에 쓰기 위함).
 */
import { useEffect, useState } from "react";
import styled, { createGlobalStyle } from "styled-components";
import { tokens } from "../../styles/tokens";
import { LandingHeader } from "./components/LandingHeader";
import { LandingHero } from "./components/LandingHero";
import { LandingFeatures } from "./components/LandingFeatures";
import { LandingSteps } from "./components/LandingSteps";
import { LandingCta } from "./components/LandingCta";
import { LandingFooter } from "./components/LandingFooter";
import { useViewport } from "./hooks/useViewport";

// 랜딩 한정 글로벌 — Linear/Vercel/Stripe 같은 모던 SaaS 랜딩의 베이스는 거의 흰색
// cool gray 한 톤. 따뜻한 톤(앰버/sand)을 섞으면 빛이 합쳐져 누렇게 보여 톤이 구려집니다.
// 인디고 액센트 한 가족 안에서만 색을 다뤄 톤 통일성을 유지합니다.
const LandingGlobal = createGlobalStyle`
  html, body {
    background: #FAFBFF;
  }
  body {
    font-family: ${tokens.font.sans};
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
`;

const Page = styled.div`
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  color: ${tokens.color.ink1};
  /*
   * 페이지 베이스 — 단일 인디고 톤 wash:
   *  - 베이스: cool gray 안에서 매우 옅게(#FAFBFF → #F6F8FC) 흐르는 세로 그라데이션
   *  - 광원 1: 우상단의 인디고 안개(0.07) — 히어로의 액센트와 자연스럽게 이어짐
   *  - 광원 2: 좌중앙의 라벤더(인디고 light tint) 안개(0.05) — 단조로움만 제거하는 정도
   * 따뜻한 톤(앰버, sand)은 모두 제거. 인디고 한 색만 옅게 빛나는 cool 베이스.
   */
  background:
    radial-gradient(1200px 700px at 100% -10%, rgba(99, 102, 241, 0.08), transparent 60%),
    radial-gradient(900px 500px at 0% 35%, rgba(167, 139, 250, 0.05), transparent 60%),
    linear-gradient(180deg, #FAFBFF 0%, #F6F8FC 50%, #FAFBFF 100%);
`;

export const LandingPage = () => {
  const [scrolled, setScrolled] = useState(false);
  const { viewport, isMobileDevice } = useViewport();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <Page data-viewport={viewport} data-mobile-device={isMobileDevice ? "true" : "false"}>
      <LandingGlobal />
      <LandingHeader scrolled={scrolled} />
      <main>
        <LandingHero />
        <LandingFeatures />
        <LandingSteps />
        <LandingCta />
      </main>
      <LandingFooter />
    </Page>
  );
};

export default LandingPage;
