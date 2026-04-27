/**
 * 역할: 여러 화면이 함께 사용하는 공통 레이아웃 컴포넌트입니다.
 * 위치: src\components\layout\Sidebar.tsx
 */
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import type { NavKey } from "./AppShell";
import { tokens } from "../../styles/tokens";
import { media } from "../../tokens/breakpoints";
import { logOut } from "../../lib/firebaseSync";

interface SidebarProps {
  activeNav: NavKey;
  user: {
    name: string;
    initial: string;
    email?: string;
    /** 프로필 사진을 설정한 경우의 base64 data URL. 없으면 이니셜을 표시합니다. */
    avatarDataUrl?: string | null;
  };
}

type IconKey = Exclude<NavKey, "settings"> | "settings";

const NavIcon = ({ name }: { name: IconKey }) => {
  const common = {
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M2 7l6-5 6 5v7H2z" />
        </svg>
      );
    case "upload":
      return (
        <svg {...common}>
          <path d="M8 2v9" />
          <path d="M5 5l3-3 3 3" />
          <path d="M3 13h10" />
        </svg>
      );
    case "transactions":
      return (
        <svg {...common}>
          <rect x="2" y="3" width="12" height="10" rx="1" />
          <path d="M2 7h12" />
        </svg>
      );
    case "analysis":
      return (
        <svg {...common}>
          <path d="M3 12V6" />
          <path d="M7 12V3" />
          <path d="M11 12V8" />
        </svg>
      );
    case "settings":
      // 톱니바퀴 모양으로 변경. 이전에는 햇빛(중심 원 + 8방향 짧은 선) 아이콘이라 라이트/다크
      // 모드 토글로 오해할 여지가 있었어요. 둥근 톱니로 굴곡을 명시해 "설정"의 일반적 픽토그램에 맞춥니다.
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="2.4" />
          <path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1" />
          <circle cx="8" cy="8" r="5.2" />
        </svg>
      );
  }
};

const NAV_ITEMS: Array<{
  key: Exclude<NavKey, "settings">;
  label: string;
  path: string;
}> = [
  { key: "home", label: "홈", path: "/" },
  { key: "upload", label: "입력", path: "/upload" },
  { key: "transactions", label: "수입·지출 내역", path: "/transactions" },
  { key: "analysis", label: "소비 분석", path: "/analysis" },
];

const Aside = styled.aside`
  width: 232px;
  height: 100vh;
  padding: 18px 14px;
  background: ${tokens.color.panel};
  border-right: 1px solid ${tokens.color.line};
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  overflow-y: auto;

  ${media.tablet} {
    width: 220px;
  }
`;

const LogoArea = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px 18px;
`;

const LogoMark = styled.div`
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  background: ${tokens.color.accent};
  border-radius: 8px;
  color: #fff;
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 700;
`;

const BrandText = styled.div`
  .name {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  .sub {
    margin-top: -2px;
    color: ${tokens.color.ink4};
    font-size: 11px;
  }
`;

const Section = styled.div`
  padding: 14px 10px 6px;
  color: ${tokens.color.ink4};
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const Nav = styled.nav`
  display: flex;
  flex-direction: column;
`;

const NavItem = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 1px 0;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: ${({ $active }) => ($active ? tokens.color.accentSubtle : "transparent")};
  color: ${({ $active }) => ($active ? tokens.color.accentHover : tokens.color.ink2)};
  cursor: pointer;
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 500;
  position: relative;
  text-align: left;
  transition:
    background ${tokens.motion.fast} ease,
    color ${tokens.motion.fast} ease,
    transform ${tokens.motion.fast} ease;

  svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: ${({ $active }) => ($active ? tokens.color.accent : tokens.color.ink4)};
    transition: color ${tokens.motion.fast} ease, transform ${tokens.motion.fast} ease;
  }

  &:hover {
    background: ${({ $active }) => ($active ? tokens.color.accentSubtle : tokens.color.tint)};
    color: ${({ $active }) => ($active ? tokens.color.accentHover : tokens.color.ink1)};
  }

  &:hover svg {
    color: ${({ $active }) => ($active ? tokens.color.accent : tokens.color.ink2)};
    transform: translateY(-0.5px);
  }

  &:focus-visible {
    outline: 2px solid ${tokens.color.accent};
    outline-offset: 2px;
  }

  &::before {
    content: "";
    position: absolute;
    left: -14px;
    top: 6px;
    bottom: 6px;
    width: 3px;
    background: ${tokens.color.accent};
    border-radius: 0 3px 3px 0;
    display: ${({ $active }) => ($active ? "block" : "none")};
  }
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: auto;
  padding: 10px;
  border: 1px solid ${tokens.color.line};
  border-radius: 10px;
`;

const Avatar = styled.div<{ $bg?: string }>`
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 50%;
  background: ${({ $bg }) => $bg ?? tokens.color.accent};
  background-size: cover;
  background-position: center;
  color: #fff;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
`;

const UserMeta = styled.div`
  min-width: 0;

  .name {
    color: ${tokens.color.ink1};
    font-size: 13px;
    font-weight: 600;
    line-height: 1.3;
  }

  .sub {
    color: ${tokens.color.ink4};
    font-size: 11px;
    line-height: 1.3;
  }
`;

const ActionButton = styled.button`
  margin-top: 1px;
  border: none;
  background: none;
  padding: 0;
  color: inherit;
  cursor: pointer;
  font-family: inherit;
  font-size: inherit;
  text-align: left;

  &:hover {
    color: ${tokens.color.ink3};
  }
`;

export const Sidebar = ({ activeNav, user }: SidebarProps) => {
  const navigate = useNavigate();
  const handleLogout = async () => {
    await logOut();
    navigate("/login", { replace: true });
  };

  return (
    <Aside>
      <LogoArea>
        <LogoMark>S</LogoMark>
        <BrandText>
          <div className="name">SpendTrack</div>
          <div className="sub">쇼핑 소비 관리</div>
        </BrandText>
      </LogoArea>

      <Section>메뉴</Section>
      <Nav>
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.key}
            type="button"
            $active={activeNav === item.key}
            onClick={() => navigate(item.path)}
          >
            <NavIcon name={item.key} />
            <span>{item.label}</span>
          </NavItem>
        ))}
      </Nav>

      {/* "환경설정" 섹션은 카테고리·테마처럼 계정 정보 외 항목까지 포함하므로
          기존 "계정" 라벨에서 옮겨 왔습니다. NavItem도 단순히 "설정"으로 줄여 일관성을 맞춥니다. */}
      <Section>환경설정</Section>
      <Nav>
        <NavItem
          type="button"
          $active={activeNav === "settings"}
          onClick={() => navigate("/settings")}
        >
          <NavIcon name="settings" />
          <span>설정</span>
        </NavItem>
      </Nav>

      <Footer>
        <Avatar $bg={user.avatarDataUrl ? `url(${user.avatarDataUrl})` : undefined}>
          {!user.avatarDataUrl && user.initial}
        </Avatar>
        <UserMeta>
          <div className="name">{user.name}</div>
          <div className="sub">{user.email ?? ""}</div>
          <div className="sub">
            <ActionButton type="button" onClick={() => void handleLogout()}>
              로그아웃
            </ActionButton>
          </div>
        </UserMeta>
      </Footer>
    </Aside>
  );
};
