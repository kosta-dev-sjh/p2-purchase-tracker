/**
 * 역할: 버튼, 카드처럼 여러 화면에서 재사용하는 기본 UI 컴포넌트입니다.
 * 위치: src\components\primitives\Chip.tsx
 */
import styled, { css } from "styled-components";
import { tokens } from "../../styles/tokens";

type ChipTone = "up" | "down" | "info" | "warn" | "neu";

const chipTone = {
  up: css`
    background: ${tokens.color.negBg};
    color: ${tokens.color.neg};
  `,
  down: css`
    background: ${tokens.color.posBg};
    color: ${tokens.color.pos};
  `,
  info: css`
    background: ${tokens.color.accentSubtle};
    color: ${tokens.color.accentHover};
  `,
  warn: css`
    background: ${tokens.color.warnBg};
    color: #92400e;
  `,
  neu: css`
    background: ${tokens.color.tint};
    color: ${tokens.color.ink3};
  `,
};

// 2026-04-24: `tone` 을 transient prop (`$tone`) 으로 전환.
//   styled.span 이 non-transient `tone` 을 DOM 으로 그대로 전달해
//   "unknown prop 'tone' is being sent through to the DOM" 경고가 발생했습니다.
//   Chip 은 리포 전역에서 쓰이므로 일괄로 접두사 `$` 를 붙이고 호출부도 함께 갱신합니다.
export const Chip = styled.span<{ $tone?: ChipTone }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: ${tokens.radius.chip};
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
  ${({ $tone = "neu" }) => chipTone[$tone]};
`;

