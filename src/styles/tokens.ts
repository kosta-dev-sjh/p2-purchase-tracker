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
    // 데이터 마커(예: MonthPicker 의 "거래가 있는 달") 전용 톤.
    // warn 과 같은 앰버 계열이지만, "경고"가 아니라 "여기 데이터 있음"이라는 다른 의미라
    // 별도 슬롯으로 분리합니다. 인디고 accent(선택 상태)와 명확히 구분되는 따뜻한 톤.
    markerFg: "#92400E", // amber-800: 글자/숫자 가독성 확보
    markerBorder: "#FCD34D", // amber-300: 너무 튀지 않게 한 단계 옅은 테두리
    markerBg: "#FFFBEB", // amber-50: 셀 배경. 선택(accentSubtle)과 충분히 구분됨
    cat1: "#4F46E5",
    cat2: "#0E9488",
    cat3: "#B45309",
    cat4: "#9F1239",
    cat5: "#6B7280",
    /*
     * 추가 카테고리(2026-04-28): 가계부 사용자 피드백 — 공과금·관리비·교육비를
     * 별도 카테고리로 노출. 기존 5색이 식품/의류 같은 라이프스타일 톤이라 청록·
     * 보라 패밀리에서 유사하지 않은 색을 골라 도넛/태그에서 한눈에 구분되게.
     *  · cat6 (공과금)  : slate blue   — 인디고 cat1 과 톤은 가까우나 한 단계 어두워 구분
     *  · cat7 (관리비)  : forest green — 청록 cat2 와 다른 녹색 영역
     *  · cat8 (교육비)  : amber gold   — cat3(brown) 보다 밝고 따뜻한 노랑
     */
    cat6: "#3730A3",
    cat7: "#16A34A",
    cat8: "#CA8A04",
    // 브라우저 기본 회색 스크롤바와 구분되도록 accent 계열의 희미한 라벤더 톤으로 칠합니다.
    // - scrollThumb  : 평소에는 ink5 와 거의 같은 "회색에 보라 한 방울" 느낌만 남겨 배경을 방해하지 않음.
    // - scrollThumbHover : 포인터가 얹히면 한 단계 진해져 그때서야 브랜드 인디고가 또렷이 보임.
    scrollThumb: "#D1D4E6",
    scrollThumbHover: "#9EA2CC",
    tag: {
      coupang: { bg: "#FFF4E5", fg: "#9A3412" },
      naver: { bg: "#ECFDF5", fg: "#065F46" },
      // "미지정" 플랫폼. 다른 브랜드 톤과 확실히 구분되는 중립 회색을 써서
      // "선택되지 않음"이라는 상태성을 시각적으로도 약하게 표현합니다.
      unspecified: { bg: "#F5F5F6", fg: "#6B7280" },
      expense: { bg: "#FEF2F2", fg: "#B42318" },
      income: { bg: "#ECFDF5", fg: "#067A55" },
      purchase: { bg: "#F2F4F8", fg: "#5B6474" },
      sub: { bg: "#EEF0FF", fg: "#4338CA" },
      installment: { bg: "#EEF0FF", fg: "#4338CA" },
      billing: { bg: "#FFF7ED", fg: "#C2410C" },
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
