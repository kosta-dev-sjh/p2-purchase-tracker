/**
 * 역할: React 앱을 실제 DOM에 마운트하고 전역 스타일을 먼저 적용합니다.
 * 위치: src\main.tsx
 */
import { createRoot } from "react-dom/client";
import App from "./App";
import { GlobalStyle } from "./styles/global";

// 전역 스타일을 먼저 적용한 뒤 실제 앱 라우팅을 렌더링합니다.
createRoot(document.getElementById("root")!).render(
  <>
    <GlobalStyle />
    <App />
  </>
);
