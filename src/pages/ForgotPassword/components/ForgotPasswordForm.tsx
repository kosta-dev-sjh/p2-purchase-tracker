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

const StatusBox = styled.div<{ tone: "ok" | "error" }>`
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: ${tokens.radius.control};
  font-size: 12.5px;
  line-height: 1.5;
  font-weight: 500;
  background: ${({ tone }) => (tone === "ok" ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)")};
  color: ${({ tone }) => (tone === "ok" ? tokens.color.pos : tokens.color.neg)};
  border: 1px solid
    ${({ tone }) => (tone === "ok" ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)")};
`;

// Firebase 가 돌려주는 코드성 에러 메시지를 사용자가 알아볼 수 있는 한국어로 바꿔 줍니다.
function toFriendlyMessage(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as { code?: string }).code ?? "";
    if (code === "auth/invalid-email") return "이메일 형식이 올바르지 않아요.";
    if (code === "auth/missing-email") return "이메일을 입력해 주세요.";
    if (code === "auth/user-not-found") {
      // 보안상 가입 여부를 노출하지 않기 위해 성공 메시지와 동일하게 다룹니다.
      return "";
    }
    if (code === "auth/too-many-requests")
      return "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.";
    if (code === "auth/network-request-failed")
      return "네트워크 연결을 확인하고 다시 시도해 주세요.";
    return err.message || "메일 전송에 실패했어요. 잠시 후 다시 시도해 주세요.";
  }
  return "메일 전송에 실패했어요. 잠시 후 다시 시도해 주세요.";
}

export const ForgotPasswordForm: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        setInfo(null);

        const trimmed = email.trim();
        if (!trimmed) {
          // 빈 값일 때는 오류 메시지를 보여줍니다. 단일 필드라 별도 포커스 이동은 불필요.
          setError("이메일을 입력해 주세요.");
          return;
        }

        setSubmitting(true);
        try {
          await sendPasswordReset(trimmed);
          // user-not-found 도 여기로 들어옵니다(우리 쪽에서 try/catch 흡수).
          setSent(true);
          setInfo(`${trimmed} 로 비밀번호 재설정 메일을 보냈어요. 메일함을 확인해 주세요.`);
        } catch (err) {
          const message = toFriendlyMessage(err);
          if (message === "") {
            // 가입되지 않은 이메일이어도 동일한 성공 응답을 보여줘 사용자 존재 여부를 흘리지 않습니다.
            setSent(true);
            setInfo(`${trimmed} 로 비밀번호 재설정 메일을 보냈어요. 메일함을 확인해 주세요.`);
          } else {
            setError(message);
          }
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div style={{ display: "grid", gap: 14 }}>
        <FormField label={<span>이메일<span style={{ color: tokens.color.neg }}> *</span></span>}>
          <TextInput
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (sent) {
                // 이메일을 새로 입력하면 직전 응답 배너를 정리합니다.
                setSent(false);
                setInfo(null);
              }
              if (error) setError(null);
            }}
          />
        </FormField>
      </div>

      <Row>
        <BackLink to="/login">로그인으로 돌아가기</BackLink>
      </Row>

      {info && <StatusBox tone="ok" role="status">{info}</StatusBox>}
      {error && (
        <StatusBox tone="error" role="alert">
          {error}
        </StatusBox>
      )}

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
