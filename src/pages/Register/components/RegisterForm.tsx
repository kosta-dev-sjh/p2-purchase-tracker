/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Register\components\RegisterForm.tsx
 */
import React, { useState } from "react";
import styled from "styled-components";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../../components/primitives/Button";
import { FormField } from "../../../components/form/FormField";
import { TextInput } from "../../../components/form/TextInput";
import { tokens } from "../../../styles/tokens";
import { PasswordStrength } from "./PasswordStrength";

const Agree = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 8px 0 18px;
  color: ${tokens.color.ink3};
  cursor: pointer;
  font-size: 12.5px;
  line-height: 1.5;

  input {
    margin-top: 2px;
    accent-color: ${tokens.color.accent};
  }

  a {
    color: ${tokens.color.accentHover};
    font-weight: 600;
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
`;

const PasswordInput = styled(TextInput)`
  letter-spacing: 0.08em;
`;

export const RegisterForm: React.FC = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        navigate("/");
      }}
    >
      <div style={{ display: "grid", gap: 14 }}>
        <FormField label="이름">
          <TextInput placeholder="홍길동" autoComplete="name" />
        </FormField>
        <FormField label="이메일">
          <TextInput type="email" placeholder="you@example.com" autoComplete="email" />
        </FormField>
        <FormField label="비밀번호" helpText="8자 이상, 숫자를 포함해 주세요.">
          <PasswordInput
            type="password"
            placeholder="8자 이상, 숫자 포함"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <PasswordStrength value={password} />
        </FormField>
      </div>
      <Agree>
        <input type="checkbox" defaultChecked />
        <span>
          <Link to="/register">이용약관</Link>과{" "}
          <Link to="/register">개인정보 처리방침</Link>에 동의합니다. (필수)
        </span>
      </Agree>
      <Button variant="primary" size="lg" block type="submit">
        계정 만들기
      </Button>
    </form>
  );
};

