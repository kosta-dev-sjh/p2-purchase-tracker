/**
 * 역할: 버튼, 카드처럼 여러 화면에서 재사용하는 기본 UI 컴포넌트입니다.
 * 위치: src\components\primitives\Tag.tsx
 */
import type { ReactNode } from "react";
import styled, { css } from "styled-components";
import { tokens } from "../../styles/tokens";

type LegacyVariant = "type" | "status" | "platform" | "source";
type ModernKind =
  | "coupang"
  | "naver"
  | "unspecified"
  | "expense"
  | "income"
  | "purchase"
  | "sub"
  | "cancel"
  | "refund"
  | "etc";

interface TagProps {
  kind?: ModernKind;
  variant?: LegacyVariant;
  value?: string;
  children?: ReactNode;
}

const modernStyles = Object.entries(tokens.color.tag).reduce((acc, [key, value]) => {
  acc[key as ModernKind] = css`
    background: ${value.bg};
    color: ${value.fg};
  `;
  return acc;
}, {} as Record<ModernKind, ReturnType<typeof css>>);

const legacyFilledToneMap: Record<string, { bg: string; text: string }> = {
  "type:지출": { bg: tokens.color.negBg, text: tokens.color.neg },
  "type:수입": { bg: tokens.color.posBg, text: tokens.color.pos },
  "status:구매": { bg: tokens.color.tint, text: tokens.color.ink3 },
  "status:환불": { bg: "#FFF5EB", text: "#E58C1A" },
  "status:반품": { bg: "#FFF5EB", text: "#E58C1A" },
  "status:취소": { bg: tokens.color.negBg, text: tokens.color.neg },
  "status:정기결제": { bg: tokens.color.accentSubtle, text: tokens.color.accentHover },
  "status:구독": { bg: tokens.color.accentSubtle, text: tokens.color.accentHover },
  "source:OCR": { bg: tokens.color.accentSubtle, text: tokens.color.accentHover },
  "source:직접": { bg: tokens.color.tint, text: tokens.color.ink3 },
};

const legacyPlatformToneMap: Record<string, { border: string; text: string }> = {
  쿠팡: { border: "#FF4B00", text: "#FF4B00" },
  "네이버쇼핑": { border: "#03C75A", text: "#03C75A" },
  네이버: { border: "#03C75A", text: "#03C75A" },
};

const LegacyTag = styled.span<{ $variant: LegacyVariant; $value: string }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  font-size: 11px;
  line-height: 1;

  ${({ $variant, $value }) => {
    if ($variant === "platform") {
      const tone = legacyPlatformToneMap[$value] ?? { border: "#D9D9D9", text: "#6B7280" };

      return css`
        background: #ffffff;
        color: ${tone.text};
        border: 1px solid ${tone.border};
        border-radius: 6px;
        padding: 4px 14px;
        font-weight: 600;
      `;
    }

    const tone = legacyFilledToneMap[`${$variant}:${$value}`] ?? {
      bg: "#F0F0F0",
      text: "#808080",
    };

    return css`
      background: ${tone.bg};
      color: ${tone.text};
      border: none;
      border-radius: 4px;
      padding: 4px 10px;
      font-weight: 600;
    `;
  }}
`;

const ModernTag = styled.span<{ $kind: ModernKind }>`
  display: inline-block;
  padding: 2px 7px;
  border-radius: ${tokens.radius.tag};
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
  ${({ $kind }) => modernStyles[$kind]}
`;

export const Tag = ({ kind, variant, value, children }: TagProps) => {
  if (kind) {
    return <ModernTag $kind={kind}>{children}</ModernTag>;
  }

  return (
    <LegacyTag $variant={variant ?? "status"} $value={value ?? ""}>
      {value}
    </LegacyTag>
  );
};
