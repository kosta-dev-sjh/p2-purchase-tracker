/**
 * 역할: 해당 화면의 상태와 레이아웃을 조립하는 페이지 진입 파일입니다.
 * 위치: src\pages\Register\index.tsx
 */
import React from "react";
import { AuthLayout } from "../../components/auth/AuthLayout";
import { RegisterForm } from "./components/RegisterForm";

export const RegisterPage: React.FC = () => (
  <AuthLayout
    // 회원가입도 공통 인증 레이아웃을 재사용해 화면 톤을 맞춥니다.
    title="회원가입"
    subtitle="30초면 충분해요. 이메일만 있으면 바로 시작할 수 있어요."
    footerPrompt="이미 계정이 있으신가요?"
    footerLabel="로그인"
    footerHref="/login"
  >
    <RegisterForm />
  </AuthLayout>
);

