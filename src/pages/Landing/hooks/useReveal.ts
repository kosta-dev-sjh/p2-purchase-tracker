/**
 * 역할: 스크롤 인뷰 시점에 등장 애니메이션을 트리거하는 공통 hook 입니다.
 * 위치: src\pages\Landing\hooks\useReveal.ts
 *
 * IntersectionObserver 한 번이면 충분한 일회성 reveal 이라, 노출 후에는 observer 를 끊어
 * 다시 스크롤해 화면 밖으로 나갔다 들어와도 깜빡이지 않게 합니다. prefers-reduced-motion
 * 사용자에게는 즉시 visible 처리해 모션을 강요하지 않습니다.
 */
import { useEffect, useRef, useState } from "react";

interface Options {
  // 한 번만 보여줄지(true) 매 진입 시 다시 애니메이트할지(false). 랜딩에서는 한 번이 자연스러움.
  once?: boolean;
  // viewport bottom 으로부터 얼마나 일찍 트리거할지. 모바일에서 좁은 화면에 너무 늦게 나타나지 않게 미리 발동.
  rootMargin?: string;
}

export const useReveal = <T extends HTMLElement = HTMLDivElement>({
  once = true,
  // 카드가 viewport 안에 충분히 들어왔을 때 발동되도록 -15% 까지 늦춥니다. 사용자 시선이
  // "어, 카드가 들어오네" 하고 인지한 직후 페이드업이 시작돼야 동적 느낌이 또렷해집니다.
  rootMargin = "0px 0px -15% 0px",
}: Options = {}) => {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // 모션 민감 사용자: observer 만들지 않고 즉시 노출.
    if (typeof window !== "undefined") {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        setVisible(true);
        return;
      }
    }

    // IntersectionObserver 미지원 환경(아주 옛날 브라우저) 폴백 — 그냥 보여주고 종료.
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            if (once) io.disconnect();
          } else if (!once) {
            setVisible(false);
          }
        }
      },
      { rootMargin, threshold: 0.05 },
    );
    io.observe(el);

    return () => io.disconnect();
  }, [once, rootMargin]);

  return { ref, visible };
};
