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
// TODO(auth): src/mocks/auth.ts 제거 시 아래 import 와 onSubmit 내 분기 통째로 교체
import {
  ONBOARDING_SEEN_KEY,
  isNewAccountCredential,
  isSeededDemoCredential,
} from "../../../mocks/auth";
import { transactionsStore } from "../../../stores/transactionsStore";
import { profileStore } from "../../../stores/profileStore";

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

export const LoginForm: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();

        // TODO(auth): src/mocks/auth.ts 제거 시 이 분기 통째로 실제 auth SDK 호출로 교체.
        // 현재는 프런트엔드만 있는 MVP라서 아래 두 시나리오를 입력값으로 흉내 냅니다.
        //   1) 1111@test.com / 1111 → "비어있는 신규 계정" (튜토리얼 자동 표시)
        //   2) 그 외 이메일/비밀번호 모두 입력 → "기존 계정 로그인"
        //      (저장된 거래가 있으면 그대로 유지, 없으면 빈 화면)
        //   3) 둘 다 비어있음 → 현재 세션 상태 그대로 유지
        //
        // 과거에는 2) 경로에서 월별 랜덤 시드 거래를 강제로 채워 넣어
        // "데이터 있는 데모 계정"을 연출했지만, 이제 실제 입력(수동/OCR/CSV)만 저장/표시하기로
        // 정책을 바꿨기 때문에 이 경로에서도 기존 localStorage 데이터를 그대로 둡니다.
        //
        // 테스트 결정성(determinism)을 위해 "튜토리얼을 무조건 띄운다"는 신호는
        // localStorage 플래그가 아니라 React Router navigation state로 Home에 직접 전달합니다.
        if (isNewAccountCredential(email, password)) {
          // 신규 계정: 거래/프로필을 전부 초기화
          transactionsStore.replaceAll([]);
          profileStore.reset();
          // 이메일만 입력값으로 덮어써서 헤더/설정에서 "1111" 계정인 게 자연스럽게 보이게 함
          profileStore.save({ email });
          // localStorage 플래그도 함께 제거해 두어, 혹시 forceOpen 전달이 유실되더라도
          // WelcomeTutorial의 기본 자동 표시 로직이 백업으로 동작하게 합니다.
          try {
            localStorage.removeItem(ONBOARDING_SEEN_KEY);
          } catch {
            // localStorage 접근 불가 환경(예: 서버 렌더)은 무시
          }
          // 핵심: Home에 "이번 진입에서 튜토리얼 무조건 띄워"를 명시적으로 전달
          navigate("/", { state: { showTutorial: true } });
          return;
        }
        if (isSeededDemoCredential(email, password)) {
          // 기존 계정 로그인: 저장된 거래는 그대로 두고 프로필만 입력한 이메일로 갱신합니다.
          // (과거 "시드 거래 강제 복원" 로직은 제거했습니다.)
          profileStore.reset();
          profileStore.save({ email });
          try {
            // 기존 계정 경로는 튜토리얼을 띄우지 않습니다. (신규 계정 전용 가이드라서)
            localStorage.setItem(ONBOARDING_SEEN_KEY, "1");
          } catch {
            // localStorage 접근 불가 환경(예: 서버 렌더)은 무시
          }
        }

        navigate("/");
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
        <ForgotLink to="/login">비밀번호를 잊으셨나요?</ForgotLink>
      </Row>
      <Button variant="primary" size="lg" block type="submit">
        로그인
      </Button>
    </form>
  );
};
