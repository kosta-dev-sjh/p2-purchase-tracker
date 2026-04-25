/**
 * 역할: 해당 화면의 상태와 레이아웃을 조립하는 페이지 진입 파일입니다.
 * 위치: src\pages\ForgotPassword\index.tsx
 */
import React from "react";
import { AuthLayout } from "../../components/auth/AuthLayout";
import { ForgotPasswordForm } from "./components/ForgotPasswordForm";

export const ForgotPasswordPage: React.FC = () => (
  <AuthLayout
    // 비밀번호 찾기도 로그인/회원가입과 같은 인증 레이아웃을 재사용해 톤을 맞춥니다.
    title="비밀번호 찾기"
    subtitle="가입한 이메일을 입력하면 비밀번호 재설정 링크를 보내드려요."
    footerPrompt="비밀번호가 기억나셨나요?"
    footerLabel="로그인"
    footerHref="/login"
  >
    <ForgotPasswordForm />
  </AuthLayout>
);
