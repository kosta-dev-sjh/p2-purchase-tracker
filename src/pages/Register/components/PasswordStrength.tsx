/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Register\components\PasswordStrength.tsx
 */
import React from "react";
import styled from "styled-components";
import { tokens } from "../../../styles/tokens";

const Wrap = styled.div`
  display: grid;
  gap: 6px;
  margin-top: 8px;
`;

const Bars = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
`;

const Bar = styled.span<{ $filled?: boolean; $tone: "weak" | "mid" | "ok" }>`
  height: 4px;
  border-radius: 999px;
  background: ${({ $filled, $tone }) => {
    if (!$filled) {
      return tokens.color.line2;
    }

    if ($tone === "weak") {
      return tokens.color.neg;
    }

    if ($tone === "mid") {
      return tokens.color.warn;
    }

    return tokens.color.pos;
  }};
`;

const Label = styled.div<{ $tone: "weak" | "mid" | "ok" }>`
  color: ${({ $tone }) =>
    $tone === "weak" ? tokens.color.neg : $tone === "mid" ? tokens.color.warn : tokens.color.pos};
  font-size: 11.5px;
  font-weight: 600;
`;

function scorePassword(value: string): 0 | 1 | 2 | 3 | 4 {
  if (!value) {
    return 0;
  }

  let score = 0;
  if (value.length >= 8) score++;
  if (/[A-Z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;

  return score as 0 | 1 | 2 | 3 | 4;
}

export const PasswordStrength: React.FC<{ value: string }> = ({ value }) => {
  const score = scorePassword(value);

  if (score === 0) {
    return null;
  }

  const tone = score <= 1 ? "weak" : score <= 2 ? "mid" : "ok";
  const label = tone === "weak" ? "약함" : tone === "mid" ? "보통" : "안전";

  return (
    <Wrap>
      <Bars>
        {[0, 1, 2, 3].map((index) => (
          <Bar key={index} $filled={index < score} $tone={tone} />
        ))}
      </Bars>
      <Label $tone={tone}>비밀번호 강도: {label}</Label>
    </Wrap>
  );
};

