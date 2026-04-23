/**
 * 역할: 입력 흐름에서 재사용하는 폼 관련 공통 컴포넌트입니다.
 * 위치: src\components\form\TextInput.tsx
 */
import type { InputHTMLAttributes } from "react";
import styled from "styled-components";
import { tokens } from "../../styles/tokens";

type TextInputProps = InputHTMLAttributes<HTMLInputElement>;

const StyledInput = styled.input`
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.control};
  background: ${tokens.color.panel};
  color: ${tokens.color.ink1};
  font-family: inherit;
  font-size: ${tokens.type.bodySm.size};
  box-sizing: border-box;
  transition: border-color ${tokens.motion.fast}, box-shadow ${tokens.motion.fast};

  &::placeholder {
    color: ${tokens.color.ink5};
  }

  &:focus {
    border-color: ${tokens.color.accent};
    box-shadow: ${tokens.shadow.focus};
    outline: none;
  }
`;

export const TextInput = (props: TextInputProps) => <StyledInput {...props} />;

