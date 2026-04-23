/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Analysis\components\SummaryBanner.tsx
 */
import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { tokens } from "../../../styles/tokens";

interface SummaryBannerProps {
  title: string;
  /**
   * 본문. 문자열 안에서 `**강조**` 구간은 볼드 + 진한 색상으로 표시됩니다.
   * 레퍼런스 HTML의 <b> 마크업과 동일한 역할을 합니다.
   */
  text: string;
  speed?: number;
}

const Banner = styled.div`
  display: flex;
  gap: 10px;
  align-items: flex-start;
  background: ${tokens.color.accentSubtle};
  border: 1px solid ${tokens.color.accentBorder};
  border-left: 3px solid ${tokens.color.accent};
  border-radius: ${tokens.radius.card};
  padding: ${tokens.space[3]} ${tokens.space[4]};
  color: ${tokens.color.ink2};
  font-size: ${tokens.type.bodySm.size};
  line-height: 1.7;
`;

const Icon = styled.svg`
  flex: none;
  margin-top: 3px;
  color: ${tokens.color.accent};
`;

const Strong = styled.b`
  color: ${tokens.color.ink1};
  font-weight: 600;
`;

const Caret = styled.span`
  display: inline-block;
  width: 1px;
  height: 1em;
  margin-left: 2px;
  background: ${tokens.color.accent};
  vertical-align: -2px;
  animation: blink 1s steps(1, end) infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
`;

const SrOnly = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

/**
 * 부분 노출된 문자열에서 `**...**` 구간을 볼드로 렌더합니다.
 * 인덱스가 아직 닫힘 `**`에 도달하지 않아도 "열린 볼드"로 자연스럽게 표시돼
 * 타이핑 진행 중에도 강조가 깨지지 않습니다.
 */
function renderSegments(revealed: string): React.ReactNode[] {
  return revealed.split("**").map((part, index) =>
    index % 2 === 1 ? (
      <Strong key={index}>{part}</Strong>
    ) : (
      <React.Fragment key={index}>{part}</React.Fragment>
    ),
  );
}

export const SummaryBanner: React.FC<SummaryBannerProps> = ({ title, text, speed = 18 }) => {
  /**
   * 타이틀과 본문을 하나의 typed-stream으로 처리하기 위해
   * `**${title}** · ${text}` 형태로 합쳐 두고, `**` 마커로 볼드 구간을 나눕니다.
   * 이렇게 하면 타이틀도 타이핑되면서 자연스럽게 볼드 처리됩니다.
   */
  const marked = useMemo(() => `**${title}** · ${text}`, [title, text]);
  const plain = useMemo(() => marked.replace(/\*\*/g, ""), [marked]);

  const [cursor, setCursor] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      setCursor(marked.length);
      return;
    }
    setCursor(0);
    const timer = window.setInterval(() => {
      setCursor((c) => {
        if (c >= marked.length) {
          window.clearInterval(timer);
          return c;
        }
        // `**` 마커를 만나면 두 글자를 한 번에 건너뛰어 눈에 보이는 글자만 세어 타이핑한 효과를 줍니다.
        if (marked.slice(c, c + 2) === "**") return c + 2;
        return c + 1;
      });
    }, speed);
    return () => window.clearInterval(timer);
  }, [marked, reduceMotion, speed]);

  const revealed = marked.slice(0, cursor);
  const isTyping = cursor < marked.length;

  return (
    <Banner>
      <Icon
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="6" />
        <path d="M8 5v4" />
        <path d="M8 11h.01" />
      </Icon>
      <span aria-live={isTyping ? "off" : "polite"} aria-atomic="true">
        <span aria-hidden="true">
          {renderSegments(revealed)}
          {isTyping && !reduceMotion && <Caret aria-hidden="true" />}
        </span>
        <SrOnly>{plain}</SrOnly>
      </span>
    </Banner>
  );
};
