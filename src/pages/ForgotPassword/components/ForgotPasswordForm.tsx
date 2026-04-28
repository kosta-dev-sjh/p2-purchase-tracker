/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\ForgotPassword\components\ForgotPasswordForm.tsx
 */
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import styled from "styled-components";
import { Button } from "../../../components/primitives/Button";
import { FormField } from "../../../components/form/FormField";
import { TextInput } from "../../../components/form/TextInput";
import { tokens } from "../../../styles/tokens";
import { normalizeAuthError } from "../../../lib/authError";
import { sendPasswordReset } from "../../../lib/firebaseSync";

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin: 14px 0 18px;
  font-size: 12.5px;
`;

const BackLink = styled(Link)`
  color: ${tokens.color.accentHover};
  font-weight: 600;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

function getForgotPasswordEmailError(email: string): string | undefined {
  const trimmedEmail = email.trim();
  if (!trimmedEmail) return "이메일을 입력해 주세요.";
  if (!/.+@.+\..+/.test(trimmedEmail)) return "이메일 형식이 맞지 않습니다.";
  return undefined;
}

export const ForgotPasswordForm: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setEmailError(null);
        setInfo(null);

        const trimmed = email.trim();
        const nextError = getForgotPasswordEmailError(email);
        if (nextError) {
          setEmailError(nextError);
          return;
        }

        setSubmitting(true);
        try {
          await sendPasswordReset(trimmed);
          setSent(true);
          setInfo(`${trimmed} 로 비밀번호 재설정 메일을 보냈어요. 메일함을 확인해 주세요.`);
        } catch (err) {
          const normalized = normalizeAuthError(err, "password-reset");
          setEmailError(normalized.message);
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div style={{ display: "grid", gap: 14 }}>
        <FormField
          label={<span>이메일<span style={{ color: tokens.color.neg }}> *</span></span>}
          errorText={emailError ?? undefined}
          statusText={info ?? undefined}
        >
          <TextInput
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(event) => {
              const nextValue = event.target.value;
              setEmail(nextValue);
              setEmailError(getForgotPasswordEmailError(nextValue) ?? null);
              if (sent) {
                setSent(false);
                setInfo(null);
              }
            }}
          />
        </FormField>
      </div>

      <Row>
        <BackLink to="/login">로그인으로 돌아가기</BackLink>
      </Row>

      <Button variant="primary" size="lg" block type="submit" disabled={submitting}>
        {submitting ? "메일 보내는 중..." : sent ? "다시 보내기" : "재설정 메일 보내기"}
      </Button>

      {sent && (
        <Button
          variant="secondary"
          size="lg"
          block
          type="button"
          style={{ marginTop: 10 }}
          onClick={() => navigate("/login")}
        >
          로그인 화면으로 이동
        </Button>
      )}
    </form>
  );
};
