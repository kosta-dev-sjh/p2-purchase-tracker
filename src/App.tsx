/**
 * 역할: 애플리케이션의 전체 라우팅을 연결하는 최상위 컴포넌트입니다.
 * 위치: src\App.tsx
 */
import React, { Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
// ProductTour는 Routes와 형제로 라우터 안쪽에 마운트되어야
// useNavigate/useLocation 훅이 동작하고, 라우트 전환 중에도 상태가 유지됩니다.
import { ProductTour } from "./components/onboarding/ProductTour";
import { useAuthSession } from "./stores/authStore";

const LandingPage = React.lazy(async () => ({ default: (await import("./pages/Landing")).LandingPage }));
const LoginPage = React.lazy(async () => ({ default: (await import("./pages/Login")).LoginPage }));
const RegisterPage = React.lazy(async () => ({ default: (await import("./pages/Register")).RegisterPage }));
const ForgotPasswordPage = React.lazy(async () => ({
  default: (await import("./pages/ForgotPassword")).ForgotPasswordPage,
}));
const TermsPage = React.lazy(async () => ({ default: (await import("./pages/Terms")).TermsPage }));
const PrivacyPage = React.lazy(async () => ({ default: (await import("./pages/Privacy")).PrivacyPage }));
const HomePage = React.lazy(async () => ({ default: (await import("./pages/Home")).HomePage }));
const UploadPage = React.lazy(async () => ({ default: (await import("./pages/Upload")).UploadPage }));
const ManualEntryPage = React.lazy(async () => ({
  default: (await import("./pages/ManualEntry")).ManualEntryPage,
}));
const OcrUploadPage = React.lazy(async () => ({
  default: (await import("./pages/OcrUpload")).OcrUploadPage,
}));
const OcrEditPage = React.lazy(async () => ({ default: (await import("./pages/OcrEdit")).OcrEditPage }));
const CsvUploadPage = React.lazy(async () => ({
  default: (await import("./pages/CsvUpload")).CsvUploadPage,
}));
const TransactionsPage = React.lazy(async () => ({
  default: (await import("./pages/Transactions")).TransactionsPage,
}));
const AnalysisPage = React.lazy(async () => ({ default: (await import("./pages/Analysis")).AnalysisPage }));
const SubscriptionsPage = React.lazy(async () => ({
  default: (await import("./pages/Subscriptions")).SubscriptionsPage,
}));
const SettingsPage = React.lazy(async () => ({ default: (await import("./pages/Settings")).SettingsPage }));

const LoadingScreen = () => (
  <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontSize: 14 }}>
    계정 정보를 확인하는 중...
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status } = useAuthSession();
  if (status === "loading") return <LoadingScreen />;
  if (status !== "authenticated") return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const PublicOnlyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status } = useAuthSession();
  if (status === "loading") return <LoadingScreen />;
  if (status === "authenticated") return <Navigate to="/" replace />;
  return <>{children}</>;
};

/**
 * 루트("/") 진입 분기:
 *  - 로그인 상태 → 기존 HomePage(대시보드)로 그대로 보냄.
 *  - 비로그인 상태 → 랜딩 페이지를 첫 인상으로 노출.
 *  - loading → 깜빡임을 막기 위해 공통 LoadingScreen 사용.
 *
 * 이전에는 "/" 가 ProtectedRoute 로 감싸져 비로그인 시 즉시 /login 으로 튕겼지만,
 * 이제 첫 화면이 "이 앱이 뭐 하는 곳" 인지 보여주는 랜딩이 되도록 분기합니다.
 * 로그인/회원가입 같은 PublicOnly 라우트는 변경 없이 유지되고, ProtectedRoute 도
 * 그대로라 깊은 링크(/transactions 등) 의 보호 흐름은 깨지지 않습니다.
 */
const RootRoute: React.FC = () => {
  const { status } = useAuthSession();
  if (status === "loading") return <LoadingScreen />;
  if (status === "authenticated") return <HomePage />;
  return <LandingPage />;
};

function App() {
  return (
    <BrowserRouter>
      {/* EC2/Firebase Hosting/Docker 기준 배포를 전제로 일반 경로 라우팅을 사용합니다.
          서버에서 SPA fallback(index.html 재서빙)만 맞춰 주면 깊은 링크도 자연스럽게 동작합니다. */}
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
          <Route path="/register" element={<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>} />
          <Route path="/forgot-password" element={<PublicOnlyRoute><ForgotPasswordPage /></PublicOnlyRoute>} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/" element={<RootRoute />} />
          <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
          <Route path="/ocr-upload" element={<ProtectedRoute><OcrUploadPage /></ProtectedRoute>} />
          <Route path="/manual-entry" element={<ProtectedRoute><ManualEntryPage /></ProtectedRoute>} />
          <Route path="/ocr-edit" element={<ProtectedRoute><OcrEditPage /></ProtectedRoute>} />
          <Route path="/csv-upload" element={<ProtectedRoute><CsvUploadPage /></ProtectedRoute>} />
          <Route path="/transactions" element={<ProtectedRoute><TransactionsPage /></ProtectedRoute>} />
          <Route path="/analysis" element={<ProtectedRoute><AnalysisPage /></ProtectedRoute>} />
          <Route path="/subscriptions" element={<ProtectedRoute><SubscriptionsPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          {/* 정의되지 않은 경로는 홈으로 되돌려서 데모 흐름이 끊기지 않게 합니다. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      {/* tourStore.start()가 호출되면 이 컴포넌트가 열려서 스포트라이트 투어를 진행합니다. */}
      <ProductTour />
    </BrowserRouter>
  );
}

export default App;
