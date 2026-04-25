/**
 * 역할: 값 0~1(또는 0~100) 범위를 가로 막대로 시각화하는 공용 진행률 표시 컴포넌트입니다.
 *       OCR 분석 모달처럼 "현재 얼마나 진행됐는지"를 사용자에게 구체적으로 알려 줘야 하는
 *       자리에서 반복해 쓰일 수 있도록 단일 구현으로 모아 두었습니다.
 * 위치: src\components\primitives\ProgressBar.tsx
 */
import React from "react";
import styled, { keyframes } from "styled-components";
import { tokens } from "../../styles/tokens";

interface ProgressBarProps {
  /** 0.0 ~ 1.0 사이 진행률. 범위 밖 값은 clamp 처리. */
  value: number;
  /**
   * true일 때 진행률 대신 좌우로 흐르는 인디터미네이트(indeterminate) 애니메이션을 표시합니다.
   * 전체 작업 완료 시간은 알 수 없지만 "뭔가 돌고 있다"는 사실만 표시하고 싶을 때 사용합니다.
   */
  indeterminate?: boolean;
  /**
   * true 일 때 determinate fill 위에 좌우로 흐르는 shimmer 하이라이트를 겹쳐 보여줍니다.
   * "특정 지점(예: 50%)에서 진행이 멈춰 있지만 실제로는 백엔드가 작업 중" 인 상황 — 대표적으로
   * AI fallback 호출 같이 progress 가 0 인 단발 요청 — 에서 사용자에게 "멈춰있지 않다" 신호를
   * 줍니다. indeterminate 와 다른 점: value 는 그대로 유지하고 위에 effect 만 얹습니다.
   */
  shimmer?: boolean;
  /** 막대 두께(px). 기본 8. */
  size?: number;
  /** 막대 배경 톤을 약하게 깔지, 강조된 오프색으로 깔지 결정합니다. */
  tone?: "accent" | "neutral";
  className?: string;
}

const Track = styled.div<{ $size: number; $tone: "accent" | "neutral" }>`
  position: relative;
  width: 100%;
  height: ${({ $size }) => $size}px;
  border-radius: 999px;
  background: ${({ $tone }) => ($tone === "accent" ? tokens.color.accentSubtle : tokens.color.line2)};
  overflow: hidden;
`;

const Fill = styled.div<{ $percent: number }>`
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: ${({ $percent }) => `${$percent}%`};
  background: linear-gradient(90deg, ${tokens.color.accent}, ${tokens.color.accentHover});
  border-radius: 999px;
  /*
   * 진행률은 툭툭 튀기보다 살짝 보간되는 편이 체감이 부드럽습니다.
   * 너무 길면 실제 진행보다 한 박자 늦어 보이므로 180ms 정도가 안정적.
   */
  transition: width 180ms ease-out;
`;

/**
 * 인디터미네이트 애니메이션. 작은 하이라이트가 왼쪽에서 오른쪽으로 반복 이동하는 형태로,
 * 진행률을 모르는 상황에서도 "멈춰 있지 않다"는 시각적 신호를 줍니다.
 */
const slide = keyframes`
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
`;

const IndeterminateFill = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 25%;
  background: linear-gradient(90deg, transparent, ${tokens.color.accent}, transparent);
  border-radius: 999px;
  animation: ${slide} 1.2s linear infinite;
`;

/**
 * Shimmer 오버레이. determinate Fill 위에 얹어 "고정된 진행률 + 흐르는 하이라이트" 를 동시에
 * 표시합니다. indeterminate 와 달리 progressbar value 는 그대로 두기 때문에 a11y 측면에서
 * 정확한 진행률이 유지됩니다.
 */
const ShimmerOverlay = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  pointer-events: none;
  overflow: hidden;
  border-radius: 999px;

  &::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 35%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.55),
      transparent
    );
    animation: ${slide} 1.6s linear infinite;
  }
`;

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  indeterminate = false,
  shimmer = false,
  size = 8,
  tone = "neutral",
  className,
}) => {
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const percent = Math.round(clamped * 100);

  return (
    <Track
      $size={size}
      $tone={tone}
      className={className}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : percent}
    >
      {indeterminate ? (
        <IndeterminateFill />
      ) : (
        <>
          <Fill $percent={percent} />
          {shimmer && <ShimmerOverlay aria-hidden />}
        </>
      )}
    </Track>
  );
};
