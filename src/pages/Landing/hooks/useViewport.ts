/**
 * 역할: 뷰포트 사이즈와 모바일 UA 감지를 합쳐 화면 종류를 알려주는 hook.
 * 위치: src\pages\Landing\hooks\useViewport.ts
 *
 * "모바일로 접속한 경우" 도 인식하기 위해 viewport width 와 navigator.userAgent 를 함께
 * 봅니다. width 만 보면 데스크톱 브라우저를 좁힌 상태와 진짜 모바일을 구분 못 하지만,
 * UA 만 보면 iPad 가로보기 등 큰 모바일 화면이 모바일로 잘못 분류됩니다. 둘을 OR 가
 * 아니라 별도로 노출해, 컴포넌트가 필요한 쪽을 골라 쓰게 했습니다.
 */
import { useEffect, useState } from "react";
import { breakpoints } from "../../../tokens/breakpoints";

const parsePx = (s: string) => Number.parseInt(s, 10);
const MOBILE_PX = parsePx(breakpoints.mobile); // 768
const TABLET_PX = parsePx(breakpoints.tablet); // 1024

const detectMobileUa = () => {
  if (typeof navigator === "undefined") return false;
  // Android, iPhone, iPad(iPadOS 13+ 이후 데스크톱 사이트로 식별되는 케이스는 touch 로 보강) 등.
  const ua = navigator.userAgent || "";
  if (/Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(ua)) return true;
  // iPadOS 가 데스크톱 사파리로 둔갑하는 경우 — touch + Mac 으로 추론.
  const isMacLike = /Macintosh/i.test(ua);
  const hasTouch =
    typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 1;
  return isMacLike && hasTouch;
};

export type Viewport = "mobile" | "tablet" | "desktop";

export const useViewport = () => {
  const [width, setWidth] = useState<number>(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );
  const [isMobileUa] = useState<boolean>(() => detectMobileUa());

  useEffect(() => {
    if (typeof window === "undefined") return;
    let raf = 0;
    const onResize = () => {
      // resize 폭주 방지 — rAF 로 하나로 묶음.
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setWidth(window.innerWidth));
    };
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      cancelAnimationFrame(raf);
    };
  }, []);

  const viewport: Viewport =
    width <= MOBILE_PX ? "mobile" : width <= TABLET_PX ? "tablet" : "desktop";

  return {
    width,
    viewport,
    isMobile: viewport === "mobile",
    isTablet: viewport === "tablet",
    isDesktop: viewport === "desktop",
    // UA 기준 모바일 디바이스로 접속 — viewport 가 가로 모드 등으로 768 을 넘었어도 true 가 될 수 있음.
    isMobileDevice: isMobileUa,
  };
};
