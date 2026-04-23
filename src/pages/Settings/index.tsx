/**
 * 역할: 해당 화면의 상태와 레이아웃을 조립하는 페이지 진입 파일입니다.
 * 위치: src\pages\Settings\index.tsx
 */
import React, { useState } from "react";
import styled from "styled-components";
import { AppShell } from "../../components/layout/AppShell";
import { media } from "../../tokens/breakpoints";
import { SettingsNav, type SettingsSection } from "./components/SettingsNav";
import { ProfileSection } from "./components/ProfileSection";
import { AccountSection } from "./components/AccountSection";
import { CategoriesSection } from "./components/CategoriesSection";
import { DangerSection } from "./components/DangerSection";

const Body = styled.div`
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 24px;
  align-items: start;

  ${media.tablet} {
    grid-template-columns: 1fr;
  }
`;

const Content = styled.div`
  display: grid;
  gap: 16px;
  min-width: 0;
`;

export const SettingsPage: React.FC = () => {
  // 현재 선택한 설정 섹션만 본문에 보여 주는 탭형 구조입니다.
  const [section, setSection] = useState<SettingsSection>("profile");

  return (
    <AppShell activeNav="settings" crumb="설정" title="설정">
      <Body>
        <SettingsNav value={section} onChange={setSection} />
        <Content>
          {/* 실제 라우팅을 늘리지 않고 한 화면 안에서 섹션만 전환합니다. */}
          {section === "profile" && <ProfileSection />}
          {section === "account" && <AccountSection />}
          {section === "categories" && <CategoriesSection />}
          {section === "danger" && <DangerSection />}
        </Content>
      </Body>
    </AppShell>
  );
};

