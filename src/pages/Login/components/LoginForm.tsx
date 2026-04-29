/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Login\components\LoginForm.tsx
 */
import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import styled from "styled-components";
import { Button } from "../../../components/primitives/Button";
import { FormField } from "../../../components/form/FormField";
import { PasswordTextInput, TextInput } from "../../../components/form/TextInput";
import { tokens } from "../../../styles/tokens";
import { authStore, useAuthSession } from "../../../stores/authStore";
import { normalizeAuthError } from "../../../lib/authError";
import { resendVerificationEmailForLogin, signIn, signInWithGoogle } from "../../../lib/firebaseSync";

interface LoginFieldErrors {
  email?: string;
  password?: string;
  form?: string;
}

function getLoginEmailError(email: string): string | undefined {
  const trimmedEmail = email.trim();
  if (!trimmedEmail) return "이메일을 입력해 주세요.";
  if (!/.+@.+\..+/.test(trimmedEmail)) return "이메일 형식이 맞지 않습니다.";
  return undefined;
}

function getLoginPasswordError(password: string): string | undefined {
  if (!password) return "비밀번호를 입력해 주세요.";
  return undefined;
}

function validateLoginFields(email: string, password: string): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  const emailError = getLoginEmailError(email);
  const passwordError = getLoginPasswordError(password);

  if (emailError) errors.email = emailError;
  if (passwordError) errors.password = passwordError;

  return errors;
}

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

const PasswordInput = styled(PasswordTextInput)`
  input {
    letter-spacing: 0.08em;
  }
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
  const location = useLocation();
  const { error: authError } = useAuthSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<LoginFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [lastErrorCode, setLastErrorCode] = useState("");
  const [resendingVerification, setResendingVerification] = useState(false);
  const notice = typeof location.state === "object" && location.state && "notice" in location.state
    ? String((location.state as { notice?: string }).notice ?? "")
    : "";

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        authStore.clearError();
        setLastErrorCode("");
        const nextErrors = validateLoginFields(email, password);
        if (Object.keys(nextErrors).length > 0) {
          setErrors(nextErrors);
          return;
        }

        const trimmedEmail = email.trim();
        setErrors({});
        setSubmitting(true);
        try {
          await signIn(trimmedEmail, password);
          navigate("/");
        } catch (err) {
          const normalized = normalizeAuthError(err, "password-login");
          setLastErrorCode(normalized.code);
          if (
            normalized.code === "auth/invalid-credential" ||
            normalized.code === "auth/user-not-found" ||
            normalized.code === "auth/wrong-password"
          ) {
            setErrors({ password: normalized.message });
          } else if (
            normalized.code === "auth/invalid-email" ||
            normalized.code === "auth/missing-email"
          ) {
            setErrors({ email: normalized.message });
          } else if (normalized.code === "auth/missing-password") {
            setErrors({ password: normalized.message });
          } else {
            setErrors({ form: normalized.message });
          }
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div style={{ display: "grid", gap: 14 }}>
        <FormField label="이메일" errorText={errors.email}>
          <TextInput
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              const nextValue = event.target.value;
              authStore.clearError();
              setErrors((current) => ({
                ...current,
                email: getLoginEmailError(nextValue),
                form: undefined,
              }));
              setEmail(nextValue);
            }}
          />
        </FormField>
        <FormField label="비밀번호" errorText={errors.password}>
          <PasswordInput
            placeholder="••••••••"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              const nextValue = event.target.value;
              authStore.clearError();
              setErrors((current) => ({
                ...current,
                password: getLoginPasswordError(nextValue),
                form: undefined,
              }));
              setPassword(nextValue);
            }}
          />
        </FormField>
      </div>
      <Row>
        <Remember>
          <input type="checkbox" /> 로그인 상태 유지
        </Remember>
        <ForgotLink to="/forgot-password">비밀번호를 잊으셨나요?</ForgotLink>
      </Row>
      {notice && (
        <div style={{ marginBottom: 12, color: tokens.color.pos, fontSize: 12.5, fontWeight: 600 }}>
          {notice}
        </div>
      )}
      {(errors.form || authError) && (
        <div style={{ marginBottom: 12, color: tokens.color.neg, fontSize: 12.5, fontWeight: 600 }}>
          {errors.form ?? authError}
        </div>
      )}
      {lastErrorCode === "auth/email-not-verified" && (
        <div style={{ marginBottom: 12 }}>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            disabled={submitting || resendingVerification}
            onClick={async () => {
              setResendingVerification(true);
              try {
                await resendVerificationEmailForLogin(email, password);
                setErrors({ form: "인증 메일을 다시 보냈어요. 메일 인증 후 로그인해 주세요." });
              } catch (err) {
                const normalized = normalizeAuthError(err, "password-login");
                setErrors({ form: normalized.message });
              } finally {
                setResendingVerification(false);
              }
            }}
          >
            {resendingVerification ? "재전송 중..." : "인증 메일 다시 보내기"}
          </Button>
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
          setErrors({});
          authStore.clearError();
          setSubmitting(true);
        try {
          await signInWithGoogle();
          navigate("/");
        } catch (err) {
          const normalized = normalizeAuthError(err, "google-login");
          setLastErrorCode(normalized.code);
          if (normalized.silent) return;
          setErrors({ form: normalized.message });
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
