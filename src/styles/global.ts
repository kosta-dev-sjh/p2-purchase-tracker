/**
 * 역할: 프로젝트 전반에서 공유하는 스타일 토큰이나 전역 스타일을 정의합니다.
 * 위치: src\styles\global.ts
 */
import { createGlobalStyle } from "styled-components";
import { tokens } from "./tokens";

export const GlobalStyle = createGlobalStyle`
  /* 브라우저 기본 여백 차이를 먼저 없애서 화면이 동일하게 보이도록 맞춥니다. */
  * {
    box-sizing: border-box;
  }

  html,
  body,
  #root {
    min-height: 100%;
  }

  body {
    margin: 0;
    background: ${tokens.color.bg};
    color: ${tokens.color.ink1};
    font-family: ${tokens.font.sans};
    font-feature-settings: "ss01", "cv11";
    -webkit-font-smoothing: antialiased;
  }

  /*
   * 모바일 전용 가로 스크롤 잠금.
   * 데스크톱에서는 어떤 이유로든 가로 오버플로가 발생하면 '왜 그런지' 바로 보이도록
   * 기본 브라우저 동작(가로 스크롤)을 유지해야 디자인 회귀를 빨리 찾을 수 있어서
   * overflow-x 를 건드리지 않습니다. 반면 좁은 모바일에서는 셸 자식 중 하나만
   * 1~2px 초과해도 레이아웃이 통째로 밀려 보여서 안전망이 필요합니다.
   */
  @media (max-width: 768px) {
    body {
      overflow-x: hidden;
    }
  }

  button,
  input,
  textarea,
  select {
    font: inherit;
  }

  button,
  input,
  textarea,
  select,
  a {
    /* 키보드 접근성은 유지하되 포커스 표현은 토큰 기준으로 통일합니다. */
    &:focus {
      outline: none;
    }

    &:focus-visible {
      outline: none;
      box-shadow: ${tokens.shadow.focus};
    }
  }

  a {
    color: inherit;
  }

  .tnum {
    font-variant-numeric: tabular-nums;
  }

  /*
   * 크로스브라우저 커스텀 스크롤바.
   * - Chrome/Edge/Safari(WebKit): ::-webkit-scrollbar 의사요소로 두께, 트랙, 썸을 직접 그립니다.
   * - Firefox: scrollbar-width / scrollbar-color 표준 속성으로 얇게 + 토큰 색을 지정합니다.
   * - iOS Safari 는 기본 오버레이 스크롤바를 그대로 쓰되(시스템 통합이 자연스럽습니다),
   *   데스크톱 Safari 는 WebKit 규칙을 그대로 따라오므로 별도 분기가 필요 없습니다.
   * 두께는 8px 로 얇게 잡아 콘텐츠 공간을 최대한 보존합니다. 썸 색은 브라우저 기본 회색과
   * 구분되도록 accent 기반의 페리윙클(scrollThumb)을 쓰고, 호버 시에는 더 진한 인디고
   * (scrollThumbHover)로 옮겨가서 "SpendTrack 의 스크롤바" 라는 인상을 남깁니다.
   */
  * {
    scrollbar-width: thin;
    scrollbar-color: ${tokens.color.scrollThumb} transparent;
  }

  *::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  *::-webkit-scrollbar-track {
    background: transparent;
  }

  *::-webkit-scrollbar-thumb {
    background-color: ${tokens.color.scrollThumb};
    border-radius: 4px;
    /* 트랙과의 사이에 2px 여백을 만들어 썸이 떠 있는 것처럼 보이게 합니다. */
    border: 2px solid transparent;
    background-clip: padding-box;
    transition: background-color ${tokens.motion.fast} ease;
  }

  *::-webkit-scrollbar-thumb:hover {
    background-color: ${tokens.color.scrollThumbHover};
  }

  *::-webkit-scrollbar-corner {
    background: transparent;
  }

  /*
   * 가로 스크롤이 필요하긴 하지만 스크롤바 자체는 숨기고 싶은 영역에서 사용합니다.
   * 예: 모바일 상단 네비 레일, 탭형 설정 네비. 수평 휠/스와이프는 그대로 동작하고
   * 스크롤바 트랙만 투명 처리해 시각적으로 깔끔하게 보입니다.
   */
  .hide-scrollbar {
    scrollbar-width: none; /* Firefox */
    -ms-overflow-style: none; /* IE/Edge */
  }

  .hide-scrollbar::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  .hide-scrollbar::-webkit-scrollbar-thumb {
    background: transparent;
  }
`;

