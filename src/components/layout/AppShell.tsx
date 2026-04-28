/**
 * 역할: 여러 화면이 함께 사용하는 공통 레이아웃 컴포넌트입니다.
 * 위치: src\components\layout\AppShell.tsx
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";
import { tokens } from "../../styles/tokens";
import { media } from "../../tokens/breakpoints";
import { useProfile } from "../../stores/profileStore";
import { logOut } from "../../lib/firebaseSync";

export type NavKey =
  | "home"
  | "upload"
  | "transactions"
  | "analysis"
  | "subscriptions"
  | "settings";

/**
 * 모바일 하단 칩 중 "더보기" 토글이 펼치는 보조 메뉴 항목 키.
 * 핵심 4개(홈/입력/거래/분석) 외 페이지가 늘어나면 여기로 추가합니다.
 */
const SECONDARY_NAV_KEYS: NavKey[] = ["subscriptions", "settings"];

interface AppShellProps {
  activeNav: NavKey;
  crumb?: string;
  title: string;
  headerRight?: ReactNode;
  children: ReactNode;
}

type MobileNavItemConfig = {
  key: NavKey;
  label: string;
  shortLabel: string;
  path: string;
};

/**
 * 모바일 하단 메뉴는 "핵심 4개 + 더보기" 5칩 구성으로 고정합니다.
 * 정기결제 / 설정처럼 자주 진입하지 않는 보조 페이지는 더보기 토글 안의 시트에 묶어
 * 360px 폭에서도 칩이 깨지지 않게 해 둡니다(향후 보조 페이지가 더 늘어나도 동일 패턴).
 */
const MOBILE_PRIMARY_NAV_ITEMS: MobileNavItemConfig[] = [
  { key: "home", label: "홈", shortLabel: "홈", path: "/" },
  { key: "upload", label: "입력", shortLabel: "입력", path: "/upload" },
  { key: "transactions", label: "수입·지출 내역", shortLabel: "거래", path: "/transactions" },
  { key: "analysis", label: "소비 분석", shortLabel: "분석", path: "/analysis" },
];

const MOBILE_SECONDARY_NAV_ITEMS: MobileNavItemConfig[] = [
  { key: "subscriptions", label: "반복결제", shortLabel: "반복결제", path: "/subscriptions" },
  { key: "settings", label: "설정", shortLabel: "설정", path: "/settings" },
];

/**
 * 모바일 칩에 들어가는 아이콘. NavKey 외에 "more"(더보기 ⋯) 도 함께 받습니다.
 * NavKey 자체는 라우트 식별자이므로 "more" 를 NavKey 에 섞지 않고 별도 prop 키로 둠.
 */
type IconKey = NavKey | "more";

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
    case "subscriptions":
      // 시계 아이콘 — "예정된 결제" 메타포. Sidebar 와 동일 모양 사용.
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4.5v3.7l2.4 1.8" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="2" />
          <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M3 13l1.5-1.5M11.5 4.5L13 3" />
        </svg>
      );
    case "more":
      return (
        <svg {...common}>
          <circle cx="3.5" cy="8" r="1.2" />
          <circle cx="8" cy="8" r="1.2" />
          <circle cx="12.5" cy="8" r="1.2" />
        </svg>
      );
  }
};

// 데스크톱에서는 좌측 사이드바와 본문 2단 구조를 사용합니다.
const Shell = styled.div`
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr);
  min-height: 100vh;
  background: ${tokens.color.bg};

  ${media.mobile} {
    grid-template-columns: 1fr;
  }
`;

const SidebarWrapper = styled.div`
  ${media.mobile} {
    display: none;
  }
`;

const Main = styled.main`
  display: flex;
  flex-direction: column;
  min-width: 0;
  width: 100%;
  /*
   * Shell이 이미 grid로 min-height: 100vh를 걸고 있으므로 Main은 해당 셀을 그대로 채웁니다.
   * 이전에는 Main에도 min-height: 100vh를 중복으로 걸어 모바일에서 MobileNav(sticky)의 높이만큼
   * 세로 스크롤이 한 단계 더 길어지는 "빈 아래 공간" 문제가 있었습니다.
   */
`;

// 모바일에서는 사이드바 대신 가벼운 텍스트 네비게이션을 따로 보여 줍니다.
const MobileNav = styled.nav`
  display: none;

  ${media.mobile} {
    /*
     * 가로 360px 기기(iPhone SE 세로, 일부 안드로이드 소형기)에서 상단 칩 5개가
     * 잘려 보이지 않아야 합니다. 바깥 패딩을 10px 로 줄이고, 칩 간 간격도 4px 로
     * 좁혀 최소 폭에서도 5개가 한 줄에 들어가도록 계산해 둡니다.
     */
    display: grid;
    gap: 8px;
    padding: 10px 10px 8px;
    background: ${tokens.color.panel};
    border-bottom: 1px solid ${tokens.color.line};
    position: sticky;
    top: 0;
    z-index: 20;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
  }
`;

const MobileNavHead = styled.div`
  display: none;

  ${media.mobile} {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
`;

const MobileBrand = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;

  /* 파비콘 SVG 그대로. 이전엔 "S" 글자였는데 파비콘과 통일(2026-04-28). */
  .mark {
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    border-radius: 9px;
    overflow: hidden;
    box-shadow: 0 10px 18px rgba(79, 70, 229, 0.2);
  }
  .mark img {
    width: 100%;
    height: 100%;
    display: block;
  }

  .name {
    color: ${tokens.color.ink1};
    font-size: 14px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
`;

const MobileMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const MobileAvatar = styled.div<{ $bg?: string }>`
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 50%;
  background: ${({ $bg }) => $bg ?? tokens.color.accent};
  background-size: cover;
  background-position: center;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
`;

const MobileLogout = styled.button`
  border: 1px solid ${tokens.color.line};
  background: ${tokens.color.foot};
  color: ${tokens.color.ink3};
  border-radius: ${tokens.radius.control};
  height: 32px;
  padding: 0 10px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
`;

/*
 * 모바일 칩 영역 = (스크롤되는 4개 primary rail) + (스크롤되지 않는 더보기 chip).
 *
 * 더보기 드롭다운(MoreSheet)은 absolute 로 칩 아래에 펼쳐지는데, 이전 구조에서는
 * MoreSheetWrap 이 `overflow-x: auto` 인 MobileNavRail 안에 들어가 있어
 * BFC 가 형성되며 absolute 자식이 rail 의 bottom 경계에서 잘려 보이지 않는 문제가 있었습니다
 * (CSS 사양상 overflow-x:auto 는 overflow-y 도 visible 이외의 값으로 강제됨).
 *
 * 그래서 rail 과 더보기 wrap 을 같은 flex 부모(MobileNavRow)의 형제로 분리해,
 * 드롭다운이 overflow 컨테이너 바깥에서 렌더되도록 했습니다.
 */
const MobileNavRow = styled.div`
  display: none;

  ${media.mobile} {
    display: flex;
    gap: 4px;
    align-items: stretch;
  }
`;

/*
 * primary 4개 칩만 들어가는 가로 스크롤 가능한 레일.
 * - 360px 뷰포트에서도 4개가 잘리지 않고 한 줄에 들어가도록 gap/padding/min-width 를
 *   계산해 두었습니다. 만약 유저 환경 폰트가 커져 overflow가 나면 가로 스크롤로 흘려
 *   스와이프로 나머지 칩에 접근할 수 있게 해 두고, 스크롤바는 `.hide-scrollbar`로 숨깁니다.
 * - flex: 4 1 0 으로 더보기 chip 과 4:1 비율을 잡아, 기존 5칩 균등 분할 시각을 유지합니다.
 */
const MobileNavRail = styled.div`
  display: none;

  ${media.mobile} {
    display: flex;
    flex: 4 1 0;
    min-width: 0;
    gap: 4px;
    overflow-x: auto;
    padding: 0;
    -webkit-overflow-scrolling: touch;
  }
`;

/**
 * "더보기" 칩이 펼치는 드롭다운 시트. 모바일에서만 노출되고, 칩 바로 아래에
 * absolute 로 떠서 외부 클릭 / ESC / 항목 선택 시 닫힙니다.
 *
 * MoreSheetWrap 자체가 `position: relative` 의 기준점이므로,
 * 반드시 overflow 컨테이너(MobileNavRail) **밖** 에 있어야 드롭다운이 잘리지 않습니다.
 */
const MoreSheetWrap = styled.div`
  display: none;

  ${media.mobile} {
    display: flex;
    flex: 1 1 0;
    position: relative;
  }
`;

const MoreSheet = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  min-width: 168px;
  padding: 6px;
  background: ${tokens.color.panel};
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.card};
  box-shadow: ${tokens.shadow.modal};
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const MoreSheetItem = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: none;
  border-radius: ${tokens.radius.control};
  background: ${({ $active }) => ($active ? tokens.color.accentSubtle : "transparent")};
  color: ${({ $active }) => ($active ? tokens.color.accentHover : tokens.color.ink2)};
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
  text-align: left;

  svg {
    width: 14px;
    height: 14px;
    color: ${({ $active }) => ($active ? tokens.color.accent : tokens.color.ink4)};
  }

  &:hover {
    background: ${({ $active }) => ($active ? tokens.color.accentSubtle : tokens.color.tint)};
  }
`;

const MobileNavItem = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex: 1 1 0;
  /*
   * 360px 기준 계산:
   *   viewport 360 - MobileNav 좌우 padding 20 = 340
   *   340 / 5 items - 4*4 gap = (340 - 16) / 5 = 64.8px per item
   * 48px 최소폭을 잡아두면 더 좁은 기기(예: 320px)에서도 터치 타겟은 유지하되
   * 넘치는 분량은 가로 스크롤로 흘려 잘림을 방지합니다.
   */
  min-width: 48px;
  border: 1px solid ${({ $active }) => ($active ? tokens.color.accentBorder : tokens.color.line)};
  background: ${({ $active }) => ($active ? tokens.color.accentSubtle : tokens.color.foot)};
  padding: 7px 6px;
  border-radius: 999px;
  color: ${({ $active }) => ($active ? tokens.color.accentHover : tokens.color.ink3)};
  cursor: pointer;
  font-family: inherit;
  font-size: 11.5px;
  font-weight: ${({ $active }) => ($active ? 700 : 600)};
  white-space: nowrap;
  transition:
    background ${tokens.motion.fast} ease,
    color ${tokens.motion.fast} ease,
    border-color ${tokens.motion.fast} ease;

  svg {
    width: 13px;
    height: 13px;
    color: ${({ $active }) => ($active ? tokens.color.accent : tokens.color.ink4)};
  }
`;

const Content = styled.div`
  width: 100%;
  min-width: 0;
  flex: 1;
  padding: 24px 28px 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;

  ${media.tablet} {
    padding: 20px 20px 28px;
  }

  ${media.mobile} {
    /*
     * 네이티브 앱처럼 보이도록 좌우 여백을 12px 까지 더 줄여 카드들이 화면 가장자리
     * 거의 끝까지 차오르게 만듭니다. Card Container 는 모바일에서 padding 0 이라
     * CardHd/CardBd 가 카드 내부 여백(16/12px)을 스스로 책임집니다. 총 body 좌우 여백
     * 12(Content) + 12(CardBd) = 24px 로, 360px 뷰포트에서도 본문이 약 336px 폭을 확보합니다.
     */
    padding: 12px 12px 16px;
    gap: 12px;
  }
`;

export const AppShell = ({ activeNav, crumb, title, headerRight, children }: AppShellProps) => {
  const navigate = useNavigate();
  const profile = useProfile();
  const initial = profile.name.trim().charAt(0) || "?";
  // "더보기" 시트의 펼침 상태. 외부 클릭/ESC/항목 선택 시 닫힙니다.
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  // 보조 항목(정기결제/설정) 중 하나가 활성 라우트면 더보기 칩 자체를 active 로 표기.
  // 사용자가 어떤 화면에 있는지 칩에서도 시각적으로 추적되게 하기 위함.
  const moreActive = SECONDARY_NAV_KEYS.includes(activeNav);

  useEffect(() => {
    if (!moreOpen) return;
    const handlePointer = (event: MouseEvent) => {
      if (!moreRef.current) return;
      if (!moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [moreOpen]);

  const handleSecondaryNavigate = (path: string) => {
    setMoreOpen(false);
    navigate(path);
  };

  const handleLogout = async () => {
    await logOut();
    navigate("/login", { replace: true });
  };

  return (
    <Shell>
      <SidebarWrapper>
        <Sidebar
          activeNav={activeNav}
          user={{
            name: profile.name,
            initial,
            email: profile.email,
            avatarDataUrl: profile.avatarDataUrl,
          }}
        />
      </SidebarWrapper>
      <Main>
        <MobileNav>
          <MobileNavHead>
            <MobileBrand>
              {/*
               * 바로 아래에 칩 네비게이션이 펼쳐지므로 별도 서브 카피("빠른 이동" 등)는
               * 정보를 더해 주지 않아 제거했습니다. 브랜드명만 노출.
               */}
              <div className="mark">
                <img src="/favicon.svg" alt="SpendTrack" />
              </div>
              <div className="name">Spend Track</div>
            </MobileBrand>
            <MobileMeta>
              <MobileAvatar $bg={profile.avatarDataUrl ? `url(${profile.avatarDataUrl})` : undefined}>
                {!profile.avatarDataUrl && initial}
              </MobileAvatar>
              <MobileLogout type="button" onClick={() => void handleLogout()}>
                로그아웃
              </MobileLogout>
            </MobileMeta>
          </MobileNavHead>
          {/*
           * Rail 과 더보기 wrap 을 형제로 둠으로써, 더보기 드롭다운이 rail 의 overflow:auto
           * 에 의해 잘리지 않도록 합니다. (이전 구조에서 발생하던 "더보기 클릭해도 메뉴가
           * 안 보이는" 회귀의 원인이 바로 이 BFC 클리핑이었습니다.)
           */}
          <MobileNavRow>
            <MobileNavRail className="hide-scrollbar">
              {MOBILE_PRIMARY_NAV_ITEMS.map((item) => (
                <MobileNavItem
                  key={item.key}
                  $active={activeNav === item.key}
                  onClick={() => navigate(item.path)}
                >
                  <NavIcon name={item.key} />
                  {item.shortLabel}
                </MobileNavItem>
              ))}
            </MobileNavRail>
            {/*
             * "더보기" 토글. 칩 자체가 아래로 시트를 펼치는 형태라 별도의 wrapper(MoreSheetWrap)
             * 가 필요합니다 — flex 칸 1개분의 폭을 차지하면서 absolute 시트의 기준점이 됨.
             */}
            <MoreSheetWrap ref={moreRef}>
              <MobileNavItem
                type="button"
                $active={moreActive || moreOpen}
                onClick={() => setMoreOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                aria-label="더보기"
                style={{ width: "100%" }}
              >
                <NavIcon name="more" />
                더보기
              </MobileNavItem>
              {moreOpen && (
                <MoreSheet role="menu">
                  {MOBILE_SECONDARY_NAV_ITEMS.map((item) => (
                    <MoreSheetItem
                      key={item.key}
                      type="button"
                      role="menuitem"
                      $active={activeNav === item.key}
                      onClick={() => handleSecondaryNavigate(item.path)}
                    >
                      <NavIcon name={item.key} />
                      {item.label}
                    </MoreSheetItem>
                  ))}
                </MoreSheet>
              )}
            </MoreSheetWrap>
          </MobileNavRow>
        </MobileNav>
        <Content>
          {/* 모든 화면이 같은 헤더 패턴을 공유하도록 셸에서 먼저 감쌉니다. */}
          <TopHeader crumb={crumb} title={title} right={headerRight} />
          {children}
        </Content>
      </Main>
    </Shell>
  );
};
