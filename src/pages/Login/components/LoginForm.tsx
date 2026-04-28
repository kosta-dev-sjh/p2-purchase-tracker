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

// Google 로그인 에러 코드 → 한국어 친화 메시지 매핑.
// 이 분리가 없으면 raw 'Firebase: Error (auth/...)' 영문 디버그 문자열이 사용자에게 그대로
// 노출됩니다. popup-closed-by-user / cancelled-popup-request 두 코드는 호출자가 별도 처리
// (=조용히 무시) 하므로 여기 매핑에서 빠져 있어도 default 폴백으로 떨어지지 않습니다.
function mapGoogleAuthErrorCode(code: string): string {
  switch (code) {
    case "auth/popup-blocked":
      return "브라우저가 팝업을 차단했어요. 팝업 허용 후 다시 시도해 주세요.";
    case "auth/account-exists-with-different-credential":
      return "이미 다른 방식으로 가입된 이메일이에요. 기존 로그인 방법으로 시도해 주세요.";
    case "auth/credential-already-in-use":
      return "이 Google 계정은 다른 사용자에게 이미 연결되어 있어요.";
    case "auth/network-request-failed":
      return "네트워크 연결을 확인해 주세요.";
    case "auth/too-many-requests":
      return "너무 많은 요청이 들어와 잠시 후 다시 시도해 주세요.";
    case "auth/user-disabled":
      return "이 계정은 사용이 중지되었어요.";
    case "auth/unauthorized-domain":
      return "현재 도메인에서 Google 로그인이 허용되어 있지 않아요. 관리자에게 문의해 주세요.";
    case "auth/web-storage-unsupported":
      return "브라우저 저장소가 비활성화돼 있어요. 시크릿 모드/추적 방지 설정을 확인해 주세요.";
    default:
      return "Google 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.";
  }
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
        // 클라이언트 측 1차 검증 — 빈 폼/이메일 형식 오류는 서버까지 가지 않고 즉시 친화적 메시지로
        // 안내합니다. 이걸 안 하면 Firebase가 "Firebase: Error (auth/invalid-email)." 같은
        // 영문 raw 메시지를 던져 사용자가 이해 못하고, 백엔드 스택까지 노출돼 보안적으로도 좋지 않아요.
        const trimmedEmail = email.trim();
        if (!trimmedEmail || !password) {
          setError("이메일과 비밀번호를 모두 입력해 주세요.");
          return;
        }
        if (!/.+@.+\..+/.test(trimmedEmail)) {
          setError("올바른 이메일 형식을 입력해 주세요.");
          return;
        }
        setSubmitting(true);
        try {
          await signIn(trimmedEmail, password);
          navigate("/");
        } catch (err) {
          const code = (err as { code?: string }).code ?? "";
          // Firebase 에러 코드를 한국어 친화 메시지로 매핑합니다. 매핑되지 않은 코드는 일반화된
          // 폴백으로 떨어뜨려 raw 'Firebase: Error (...)' 문자열이 그대로 노출되지 않게 합니다.
          let message: string;
          switch (code) {
            case "auth/invalid-credential":
            case "auth/user-not-found":
            case "auth/wrong-password":
              message = "이메일이나 비밀번호가 일치하지 않습니다.";
              break;
            case "auth/invalid-email":
              message = "올바른 이메일 형식을 입력해 주세요.";
              break;
            case "auth/missing-password":
              message = "비밀번호를 입력해 주세요.";
              break;
            case "auth/too-many-requests":
              message = "너무 많은 요청이 들어와 잠시 후 다시 시도해 주세요.";
              break;
            case "auth/network-request-failed":
              message = "네트워크 연결을 확인해 주세요.";
              break;
            case "auth/user-disabled":
              message = "이 계정은 사용이 중지되었어요.";
              break;
            default:
              message = "로그인에 실패했어요. 잠시 후 다시 시도해 주세요.";
          }
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
            const code = (err as { code?: string }).code ?? "";
            // 사용자가 직접 팝업을 닫거나(=취소 의도), 버튼을 두 번 눌러서 이전 팝업 요청이
            // 캔슬된 경우는 "에러"가 아니라 정상적인 취소이므로 메시지를 띄우지 않고 조용히
            // 폼 상태만 원복합니다. 이 분기를 빼두면 raw 'Firebase: Error (auth/popup-closed-by-user).'
            // 가 그대로 사용자에게 노출돼요.
            if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
              return;
            }
            setError(mapGoogleAuthErrorCode(code));
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
