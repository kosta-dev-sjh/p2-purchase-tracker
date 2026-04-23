/**
 * 역할: 해당 화면의 상태와 레이아웃을 조립하는 페이지 진입 파일입니다.
 * 위치: src\pages\Login\index.tsx
 */
import React from "react";
import { AuthLayout } from "../../components/auth/AuthLayout";
import { LoginForm } from "./components/LoginForm";

export const LoginPage: React.FC = () => (
  <AuthLayout
    // 로그인과 회원가입은 같은 레이아웃을 공유하고 폼 내용만 바꿉니다.
    title="로그인"
    subtitle="계정에 로그인하고 최신 소비 흐름을 확인해 보세요."
    footerPrompt="아직 계정이 없으신가요?"
    footerLabel="회원가입"
    footerHref="/register"
  >
    <LoginForm />
  </AuthLayout>
);

