/**
 * 역할: 버튼, 카드처럼 여러 화면에서 재사용하는 기본 UI 컴포넌트입니다.
 * 위치: src\components\primitives\Button.tsx
 */
import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styled, { css } from "styled-components";
import { tokens } from "../../styles/tokens";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  fullWidth?: boolean;
  block?: boolean;
  children: ReactNode;
}

const variantStyles: Record<Variant, ReturnType<typeof css>> = {
  primary: css`
    background: ${tokens.color.accent};
    color: #fff;
    border: 1px solid ${tokens.color.accent};
    box-shadow: 0 1px 2px rgba(79, 70, 229, 0.2);

    &:hover:not(:disabled) {
      background: ${tokens.color.accentHover};
      border-color: ${tokens.color.accentHover};
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.22);
    }

    &:active:not(:disabled) {
      background: ${tokens.color.accentActive};
      border-color: ${tokens.color.accentActive};
      box-shadow: none;
    }
  `,
  secondary: css`
    background: #fff;
    color: ${tokens.color.ink2};
    border: 1px solid ${tokens.color.line};
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);

    &:hover:not(:disabled) {
      background: ${tokens.color.foot};
      border-color: ${tokens.color.accentBorder};
    }

    &:active:not(:disabled) {
      background: ${tokens.color.tint};
    }
  `,
  ghost: css`
    background: transparent;
    color: ${tokens.color.accent};
    border: 1px dashed ${tokens.color.accentBorder};

    &:hover:not(:disabled) {
      background: ${tokens.color.accentSubtle};
      border-color: ${tokens.color.accent};
    }

    &:active:not(:disabled) {
      background: ${tokens.color.accentBorder};
    }
  `,
  danger: css`
    background: ${tokens.color.negSubtle};
    color: ${tokens.color.neg};
    border: 1px solid ${tokens.color.negBorder};

    &:hover:not(:disabled) {
      background: ${tokens.color.negBg};
      border-color: ${tokens.color.neg};
    }

    &:active:not(:disabled) {
      background: ${tokens.color.negBorder};
    }
  `,
};

const sizeStyles: Record<Size, ReturnType<typeof css>> = {
  sm: css`
    height: 32px;
    padding: 0 12px;
    font-size: ${tokens.type.caption.size};
    border-radius: ${tokens.radius.control};
  `,
  md: css`
    height: 40px;
    padding: 0 16px;
    font-size: ${tokens.type.bodySm.size};
    border-radius: ${tokens.radius.controlLg};
  `,
  lg: css`
    height: 48px;
    padding: 0 22px;
    font-size: ${tokens.type.body.size};
    border-radius: ${tokens.radius.card};
  `,
};

const StyledButton = styled.button<{
  $variant: Variant;
  $size: Size;
  $fullWidth?: boolean;
}>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: ${({ $fullWidth }) => ($fullWidth ? "100%" : "auto")};
  font-family: inherit;
  font-weight: 600;
  letter-spacing: -0.01em;
  cursor: pointer;
  transition:
    background ${tokens.motion.fast} ease,
    border-color ${tokens.motion.fast} ease,
    box-shadow ${tokens.motion.fast} ease;

  &:focus-visible {
    box-shadow: ${tokens.shadow.focus};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  ${({ $variant }) => variantStyles[$variant]}
  ${({ $size }) => sizeStyles[$size]}
`;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      icon,
      fullWidth,
      block,
      type = "button",
      children,
      ...rest
    },
    ref
  ) => (
    <StyledButton
      ref={ref}
      type={type}
      $variant={variant}
      $size={size}
      $fullWidth={fullWidth ?? block}
      {...rest}
    >
      {icon}
      {children}
    </StyledButton>
  )
);

Button.displayName = "Button";

