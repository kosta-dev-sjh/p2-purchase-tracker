/**
 * 역할: React 앱을 실제 DOM에 마운트하고 전역 스타일을 먼저 적용합니다.
 * 위치: src\main.tsx
 */
import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { GlobalStyle } from "./styles/global";

const RootApp: React.FC = () => {
  useEffect(() => {
    let cancelled = false;

    const startSync = () => {
      void import("./lib/firebaseSync").then(({ startFirebaseSync }) => {
        if (!cancelled) startFirebaseSync();
      });
    };

    const frame = window.requestAnimationFrame(startSync);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <GlobalStyle />
      <App />
    </>
  );
};

createRoot(document.getElementById("root")!).render(
  <RootApp />
);
