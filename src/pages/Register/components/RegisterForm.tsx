/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Register\components\RegisterForm.tsx
 */
import React, { useState } from "react";
import styled from "styled-components";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../../components/primitives/Button";
import { FormField } from "../../../components/form/FormField";
import { PasswordTextInput, TextInput } from "../../../components/form/TextInput";
import { tokens } from "../../../styles/tokens";
import { normalizeAuthError } from "../../../lib/authError";
import { PasswordStrength } from "./PasswordStrength";
import { registerAccount, signInWithGoogle } from "../../../lib/firebaseSync";
import { ONBOARDING_SEEN_KEY } from "../../../constants/onboarding";
import { validatePasswordPolicy } from "../../../utils/passwordPolicy";

interface RegisterFieldErrors {
  name?: string;
  email?: string;
  password?: string;
  form?: string;
  agree?: string;
}

function getRegisterNameError(name: string): string | undefined {
  const trimmedName = name.trim();
  if (!trimmedName) return "이름을 입력해 주세요.";
  if (/\s/.test(trimmedName)) return "이름에 공백을 포함할 수 없어요.";
  if (trimmedName.length < 2) return "이름은 2자 이상 입력해 주세요.";
  return undefined;
}

function getRegisterEmailError(email: string): string | undefined {
  const trimmedEmail = email.trim();
  if (!trimmedEmail) return "이메일을 입력해 주세요.";
  if (/\s/.test(email)) return "이메일에 공백을 포함할 수 없어요.";
  if (!/.+@.+\..+/.test(trimmedEmail)) return "이메일 형식이 맞지 않습니다.";
  return undefined;
}

function getRegisterPasswordError(password: string): string | undefined {
  return validatePasswordPolicy(password).error;
}

function validateRegisterFields(
  name: string,
  email: string,
  password: string,
  agreed: boolean,
): RegisterFieldErrors {
  const errors: RegisterFieldErrors = {};
  const nameError = getRegisterNameError(name);
  const emailError = getRegisterEmailError(email);
  const passwordError = getRegisterPasswordError(password);

  if (!agreed) {
    errors.agree = "이용약관과 개인정보 처리방침에 동의하셔야 회원가입이 가능합니다.";
  }
  if (nameError) errors.name = nameError;
  if (emailError) errors.email = emailError;
  if (passwordError) errors.password = passwordError;

  return errors;
}

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

export const RegisterForm: React.FC = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<RegisterFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const nextErrors = validateRegisterFields(name, email, password, agreed);
        if (Object.keys(nextErrors).length > 0) {
          setErrors(nextErrors);
          return;
        }

        setErrors({});
        setSubmitting(true);
        try {
          try {
            localStorage.removeItem(ONBOARDING_SEEN_KEY);
          } catch {
            // ignore
          }
          await registerAccount({
            name: name.trim(),
            email: email.trim(),
            password,
          });
          navigate("/", { state: { showTutorial: true } });
        } catch (err) {
          const normalized = normalizeAuthError(err, "email-register");
          if (
            normalized.code === "auth/email-already-in-use" ||
            normalized.code === "auth/invalid-email" ||
            normalized.code === "auth/missing-email"
          ) {
            setErrors({ email: normalized.message });
          } else if (
            normalized.code === "auth/weak-password" ||
            normalized.code === "auth/missing-password"
          ) {
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
        <FormField label="이름" errorText={errors.name}>
          <TextInput
            placeholder="홍길동"
            autoComplete="name"
            value={name}
            onChange={(event) => {
              const nextValue = event.target.value;
              setErrors((current) => ({
                ...current,
                name: getRegisterNameError(nextValue),
                form: undefined,
              }));
              setName(nextValue);
            }}
          />
        </FormField>
        <FormField label="이메일" errorText={errors.email}>
          <TextInput
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              const nextValue = event.target.value;
              setErrors((current) => ({
                ...current,
                email: getRegisterEmailError(nextValue),
                form: undefined,
              }));
              setEmail(nextValue);
            }}
          />
        </FormField>
        <FormField
          label="비밀번호"
          helpText="8자 이상, 숫자를 포함해 주세요."
          errorText={errors.password}
        >
          <PasswordInput
            placeholder="8자 이상, 숫자 포함"
            autoComplete="new-password"
            value={password}
            onChange={(event) => {
              const nextValue = event.target.value;
              setErrors((current) => ({
                ...current,
                password: getRegisterPasswordError(nextValue),
                form: undefined,
              }));
              setPassword(nextValue);
            }}
          />
          <PasswordStrength value={password} />
        </FormField>
      </div>
      <Agree>
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => {
            setAgreed(e.target.checked);
            if (e.target.checked) {
              setErrors((current) => ({ ...current, agree: undefined }));
            }
          }}
        />
        <span>
          <Link to="/terms">이용약관</Link>과{" "}
          <Link to="/privacy">개인정보 처리방침</Link>에 동의합니다. (필수)
        </span>
      </Agree>
      {errors.agree && (
        <div style={{ marginBottom: 12, color: tokens.color.neg, fontSize: 12.5, fontWeight: 600 }}>
          {errors.agree}
        </div>
      )}
      {errors.form && (
        <div style={{ marginBottom: 12, color: tokens.color.neg, fontSize: 12.5, fontWeight: 600 }}>
          {errors.form}
        </div>
      )}
      <Button variant="primary" size="lg" block type="submit" disabled={submitting}>
        계정 만들기
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
          setSubmitting(true);
          try {
            try {
              localStorage.removeItem(ONBOARDING_SEEN_KEY);
            } catch {
              // ignore
            }
            await signInWithGoogle();
            navigate("/", { state: { showTutorial: true } });
          } catch (err) {
            const normalized = normalizeAuthError(err, "google-login");
            if (normalized.silent) return;
            setErrors({ form: normalized.message });
          } finally {
            setSubmitting(false);
          }
        }}
      >
        Google로 시작하기
      </Button>
    </form>
  );
};
