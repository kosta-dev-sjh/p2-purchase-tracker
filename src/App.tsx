/**
 * 역할: 애플리케이션의 전체 라우팅을 연결하는 최상위 컴포넌트입니다.
 * 위치: src\App.tsx
 */
import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
// ProductTour는 Routes와 형제로 라우터 안쪽에 마운트되어야
// useNavigate/useLocation 훅이 동작하고, 라우트 전환 중에도 상태가 유지됩니다.
import { ProductTour } from "./components/onboarding/ProductTour";
import { LoginPage } from "./pages/Login";
import { RegisterPage } from "./pages/Register";
import { ForgotPasswordPage } from "./pages/ForgotPassword";
import { HomePage } from "./pages/Home";
import { UploadPage } from "./pages/Upload";
import { ManualEntryPage } from "./pages/ManualEntry";
import { OcrUploadPage } from "./pages/OcrUpload";
import { OcrEditPage } from "./pages/OcrEdit";
import { CsvUploadPage } from "./pages/CsvUpload";
import { TransactionsPage } from "./pages/Transactions";
import { AnalysisPage } from "./pages/Analysis";
import { SubscriptionsPage } from "./pages/Subscriptions";
import { SettingsPage } from "./pages/Settings";
import { useAuthSession } from "./stores/authStore";

const LoadingScreen = () => (
  <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontSize: 14 }}>
    Firebase 연결 중...
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

function App() {
  return (
    <BrowserRouter>
      {/* EC2/Firebase Hosting/Docker 기준 배포를 전제로 일반 경로 라우팅을 사용합니다.
          서버에서 SPA fallback(index.html 재서빙)만 맞춰 주면 깊은 링크도 자연스럽게 동작합니다. */}
      <Routes>
        <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
        <Route path="/register" element={<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>} />
        <Route path="/forgot-password" element={<PublicOnlyRoute><ForgotPasswordPage /></PublicOnlyRoute>} />
        <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
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
      {/* tourStore.start()가 호출되면 이 컴포넌트가 열려서 스포트라이트 투어를 진행합니다. */}
      <ProductTour />
    </BrowserRouter>
  );
}

export default App;
