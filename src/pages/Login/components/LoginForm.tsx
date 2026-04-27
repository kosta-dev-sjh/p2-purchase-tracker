/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Login\components\LoginForm.tsx
 */
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import styled from "styled-components";
import { Button } from "../../../components/primitives/Button";
import { FormField } from "../../../components/form/FormField";
import { TextInput } from "../../../components/form/TextInput";
import { tokens } from "../../../styles/tokens";
import { signIn, signInWithGoogle } from "../../../lib/firebaseSync";

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 14px 0 18px;
  font-size: 12.5px;
  gap: 12px;
`;

const Remember = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: ${tokens.color.ink3};
  cursor: pointer;

  input {
    accent-color: ${tokens.color.accent};
  }
`;

const ForgotLink = styled(Link)`
  color: ${tokens.color.accentHover};
  font-weight: 600;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

const PasswordInput = styled(TextInput)`
  letter-spacing: 0.08em;
`;

const Divider = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 14px 0;
  color: ${tokens.color.ink4};
  font-size: 12px;

  &::before,
  &::after {
    content: "";
    flex: 1;
    height: 1px;
    background: ${tokens.color.line2};
  }
`;

const GoogleMark = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
    <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.5 3.9-5.4 3.9-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.6 3.6 14.6 2.8 12 2.8 6.9 2.8 2.8 7 2.8 12s4.1 9.2 9.2 9.2c5.3 0 8.8-3.7 8.8-8.9 0-.6-.1-1.1-.2-1.6H12z" />
    <path fill="#34A853" d="M2.8 12c0 5 4.1 9.2 9.2 9.2 2.5 0 4.6-.8 6.2-2.2l-3-2.4c-.8.6-1.9 1-3.2 1-3.2 0-5.9-2.2-6.8-5.2H2.8z" />
    <path fill="#4A90E2" d="M18.2 19c1.8-1.7 2.6-4.1 2.6-6.7 0-.6-.1-1.1-.2-1.6H12v3.9h5.4c-.2 1-.8 2.4-2.2 3.4l3 2.4z" />
    <path fill="#FBBC05" d="M5.2 12c0-.8.1-1.5.4-2.2L2.6 7.4C1.9 8.8 1.5 10.4 1.5 12s.4 3.2 1.1 4.6l3-2.4c-.2-.7-.4-1.4-.4-2.2z" />
  </svg>
);

export const LoginForm: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
          await signIn(email.trim(), password);
          navigate("/");
        } catch (err) {
          const code = (err as { code?: string }).code ?? "";
          const message =
            code === "auth/invalid-credential" ||
            code === "auth/user-not-found" ||
            code === "auth/wrong-password"
              ? "이메일이나 비밀번호가 일치하지 않습니다."
              : err instanceof Error
                ? err.message
                : "로그인에 실패했어요.";
          setError(message);
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div style={{ display: "grid", gap: 14 }}>
        <FormField label="이메일">
          <TextInput
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </FormField>
        <FormField label="비밀번호">
          <PasswordInput
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </FormField>
      </div>
      <Row>
        <Remember>
          <input type="checkbox" /> 로그인 상태 유지
        </Remember>
        <ForgotLink to="/forgot-password">비밀번호를 잊으셨나요?</ForgotLink>
      </Row>
      {error && (
        <div style={{ marginBottom: 12, color: tokens.color.neg, fontSize: 12.5, fontWeight: 600 }}>
          {error}
        </div>
      )}
      <Button variant="primary" size="lg" block type="submit" disabled={submitting}>
        로그인
      </Button>
      <Divider>또는</Divider>
      <Button
        variant="secondary"
        size="lg"
        block
        type="button"
        icon={<GoogleMark />}
        disabled={submitting}
        onClick={async () => {
          setError(null);
          setSubmitting(true);
          try {
            await signInWithGoogle();
            navigate("/");
          } catch (err) {
            const message = err instanceof Error ? err.message : "Google 로그인에 실패했어요.";
            setError(message);
          } finally {
            setSubmitting(false);
          }
        }}
      >
        Google로 계속하기
      </Button>
    </form>
  );
};
