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

export const Chip = styled.span<{ tone?: ChipTone }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: ${tokens.radius.chip};
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
  ${({ tone = "neu" }) => chipTone[tone]};
`;

