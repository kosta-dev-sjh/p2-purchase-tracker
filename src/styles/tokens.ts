/**
 * 역할: 프로젝트 전반에서 공유하는 스타일 토큰이나 전역 스타일을 정의합니다.
 * 위치: src\styles\tokens.ts
 */
// 화면 전반에서 반복되는 색상, 간격, 타이포 값을 한곳에 모아둡니다.
export const tokens = {
  color: {
    bg: "#F6F7F9",
    panel: "#FFFFFF",
    tint: "#F2F4F8",
    foot: "#FAFBFC",
    ink1: "#0B1220",
    ink2: "#2A3342",
    ink3: "#5B6474",
    ink4: "#8A94A6",
    ink5: "#C2C8D2",
    line: "#E6E9EE",
    line2: "#EEF1F5",
    accent: "#4F46E5",
    accentHover: "#4338CA",
    accentActive: "#3730A3",
    accentSubtle: "#EEF0FF",
    accentBorder: "#E0E4FF",
    pos: "#067A55",
    neg: "#B42318",
    warn: "#B45309",
    posBg: "#ECFDF5",
    negBg: "#FEF2F2",
    negSubtle: "#FEF2F2",
    negBorder: "#FECACA",
    warnBg: "#FEF3C7",
    cat1: "#4F46E5",
    cat2: "#0E9488",
    cat3: "#B45309",
    cat4: "#9F1239",
    cat5: "#6B7280",
    // 브라우저 기본 회색 스크롤바와 구분되도록 accent 계열의 희미한 라벤더 톤으로 칠합니다.
    // - scrollThumb  : 평소에는 ink5 와 거의 같은 "회색에 보라 한 방울" 느낌만 남겨 배경을 방해하지 않음.
    // - scrollThumbHover : 포인터가 얹히면 한 단계 진해져 그때서야 브랜드 인디고가 또렷이 보임.
    scrollThumb: "#D1D4E6",
    scrollThumbHover: "#9EA2CC",
    tag: {
      coupang: { bg: "#FFF4E5", fg: "#9A3412" },
      naver: { bg: "#ECFDF5", fg: "#065F46" },
      musinsa: { bg: "#EEF0FF", fg: "#3730A3" },
      temu: { bg: "#FCE7F3", fg: "#15803D" },
      // "미지정" 플랫폼. 다른 브랜드 톤과 확실히 구분되는 중립 회색을 써서
      // "선택되지 않음"이라는 상태성을 시각적으로도 약하게 표현합니다.
      unspecified: { bg: "#F5F5F6", fg: "#6B7280" },
      expense: { bg: "#FEF2F2", fg: "#B42318" },
      income: { bg: "#ECFDF5", fg: "#067A55" },
      purchase: { bg: "#F2F4F8", fg: "#5B6474" },
      sub: { bg: "#EEF0FF", fg: "#4338CA" },
      cancel: { bg: "#FEF2F2", fg: "#B42318" },
      refund: { bg: "#EFF6FF", fg: "#1D4ED8" },
      // "기타" 상태는 purchase와 유사한 회색 계열로 두되, 살짝 더 옅게 해 의미 있는 상태들과 시각 가중치를 낮춥니다.
      etc: { bg: "#F5F5F6", fg: "#6B7280" },
    },
  },
  radius: {
    card: "12px",
    control: "8px",
    controlLg: "10px",
    chip: "999px",
    tag: "4px",
    modal: "16px",
  },
  space: {
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "20px",
    6: "24px",
  },
  shadow: {
    card: "0 1px 2px rgba(16,24,40,.04), 0 1px 1px rgba(16,24,40,.03)",
    cardHover: "0 6px 18px rgba(16,24,40,.08)",
    focus: "0 0 0 3px rgba(79, 70, 229, 0.18)",
    modal: "0 20px 40px rgba(0,0,0,.12)",
  },
  motion: {
    fast: "120ms",
  },
  font: {
    sans: '"Pretendard Variable","Noto Sans KR",system-ui,sans-serif',
    mono: '"JetBrains Mono","SF Mono","Menlo","Consolas",monospace',
  },
  type: {
    h1: { size: "20px", weight: 700, tracking: "-0.02em" },
    metric: { size: "26px", weight: 700, tracking: "-0.02em" },
    titleLg: { size: "16px", weight: 700, tracking: "-0.02em" },
    cardTitle: { size: "14px", weight: 600, tracking: "-0.01em" },
    body: { size: "14px", weight: 500 },
    bodySm: { size: "13px", weight: 500 },
    caption: { size: "12px", weight: 500 },
    cardSub: { size: "12px", weight: 400 },
    navSect: { size: "10px", weight: 600, tracking: "0.08em", upper: true },
  },
} as const;

export type Tokens = typeof tokens;

