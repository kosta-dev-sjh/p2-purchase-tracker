/**
 * 역할: 입력 흐름에서 재사용하는 폼 관련 공통 컴포넌트입니다.
 * 위치: src\components\form\TextInput.tsx
 */
import { useState } from "react";
import type { InputHTMLAttributes } from "react";
import styled from "styled-components";
import { tokens } from "../../styles/tokens";

type TextInputProps = InputHTMLAttributes<HTMLInputElement>;
type PasswordTextInputProps = Omit<TextInputProps, "type">;

const inputBase = `
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

const StyledInput = styled.input`
  ${inputBase}
`;

export const TextInput = (props: TextInputProps) => <StyledInput {...props} />;

const PasswordWrap = styled.div`
  position: relative;
  width: 100%;
`;

const PasswordInputField = styled.input`
  ${inputBase}
  padding-right: 44px;
`;

const ToggleButton = styled.button`
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: ${tokens.color.ink4};
  cursor: pointer;

  &:hover {
    background: ${tokens.color.line2};
  }

  &:focus-visible {
    outline: none;
    box-shadow: ${tokens.shadow.focus};
  }
`;

const EyeIcon = ({ open }: { open: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M2 12C3.9 7.9 7.5 5.5 12 5.5C16.5 5.5 20.1 7.9 22 12C20.1 16.1 16.5 18.5 12 18.5C7.5 18.5 3.9 16.1 2 12Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
    {!open ? (
      <path d="M4 4L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    ) : null}
  </svg>
);

export const PasswordTextInput = ({ className, ...props }: PasswordTextInputProps) => {
  const [visible, setVisible] = useState(false);

  return (
    <PasswordWrap className={className}>
      <PasswordInputField {...props} type={visible ? "text" : "password"} />
      <ToggleButton
        type="button"
        aria-label={visible ? "비밀번호 숨기기" : "비밀번호 보기"}
        onClick={() => setVisible((current) => !current)}
      >
        <EyeIcon open={visible} />
      </ToggleButton>
    </PasswordWrap>
  );
};
