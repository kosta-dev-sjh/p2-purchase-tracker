/**
 * 역할: 랜딩 페이지 히어로 섹션. 핵심 카피와 CTA, 그리고 우측(모바일에선 아래) 시각 프리뷰를 보여줍니다.
 * 위치: src\pages\Landing\components\LandingHero.tsx
 *
 * 시각 프리뷰는 Home 화면(`src/pages/Home/components/KpiStrip.tsx`,
 * `PlatformDonut.tsx`) 의 실제 카드를 보고 같은 라벨/포맷/색을 그대로 사용합니다.
 *  - 플랫폼: 쿠팡(warn=#B45309) / 네이버쇼핑(cat2=#0E9488) / 미지정(#9CA3AF) — 실제 사용 3종
 *  - KPI 라벨: "총 지출 / 평균 주문금액 / 총 수입·환불" — KpiStrip 의 키와 일치
 *  - 통화: formatKRW("₩1,234,567") — 앱 전체 포맷
 *  - 도넛 카드 카피 ("플랫폼별 소비 비중", "이번 달 기준", 중앙 "이번 달 총소비") 도 PlatformDonut 그대로
 *  - AI 인사이트 배지의 그라디언트(#f8fafc → #f1f5f9) · ✨ 이모지 도 InsightCards.AiSummaryBlock 와 일치
 * 이렇게 한 덕에 랜딩 → 가입 → Home 으로 넘어와도 "방금 본 카드" 를 그대로 만나게 됩니다.
 */
import { Link } from "react-router-dom";
import styled, { keyframes } from "styled-components";
import { tokens } from "../../../styles/tokens";
import { media } from "../../../tokens/breakpoints";
import { formatKRW } from "../../../utils/format";
import { PLATFORM_LABELS } from "../../../constants/labels";

// 등장 거리. easing 은 styled-component 단에서 cubic-bezier 적용.
//
// 무한 drift(까딱이는 floating) 는 의도적으로 제거했습니다. translateY 가 매 프레임 바뀌는
// 동안 backdrop-filter 까지 켜 두면 매 프레임 blur 를 다시 계산해 모바일/저사양 환경에서
// "렉 걸린 듯" 한 jank 가 보였습니다. 동적 느낌은 페이지 진입 entrance + 스크롤 reveal
// 한 번씩만 주고, 본 카드 자체는 완전 정적으로 둡니다(2026-04-28 사용자 피드백 반영).
const fadeUp = keyframes`
  from { opacity: 0; transform: translate3d(0, 16px, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
`;

const previewIn = keyframes`
  from {
    opacity: 0;
    transform: translate3d(0, 24px, 0) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
`;

// 페이지 베이스 그라데이션이 깔린 상태 위에 — 보더/배경색은 빼고 padding 만 책임집니다.
// 섹션 경계가 paint 가 아니라 spacing 으로만 표현되어야 부드러운 흐름이 유지됩니다.
const Section = styled.section`
  position: relative;
  isolation: isolate;
  padding: clamp(48px, 8vw, 104px) clamp(16px, 4vw, 40px) clamp(48px, 6vw, 80px);
  overflow: hidden;
`;

const Inner = styled.div`
  max-width: 1180px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
  align-items: center;
  gap: clamp(24px, 4vw, 56px);

  ${media.tablet} {
    grid-template-columns: 1fr;
    gap: 32px;
  }
`;

const Eyebrow = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: ${tokens.radius.chip};
  /* 채도 살짝 낮춰 옅은 라벤더, 보더는 제거하고 그림자도 거의 안 보이게 — 떠 있는 느낌만. */
  background: rgba(79, 70, 229, 0.08);
  color: ${tokens.color.accentActive};
  font-size: 12px;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin-bottom: 18px;
  animation: ${fadeUp} 720ms cubic-bezier(0.22, 1, 0.36, 1) both;
`;

const Dot = styled.span`
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: ${tokens.color.accent};
  box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.15);
`;

const H1 = styled.h1`
  margin: 0 0 18px;
  color: ${tokens.color.ink1};
  font-size: clamp(28px, 4.4vw, 48px);
  /* 800 은 너무 단단해 보여서 700 으로. line-height 살짝 키워 한국어 자모가 답답하지 않게. */
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.22;
  animation: ${fadeUp} 820ms cubic-bezier(0.22, 1, 0.36, 1) 80ms both;

  span {
    /*
     * 인디고 한 패밀리 안에서만 흐르도록: accent(#4F46E5) → 라이트 라벤더(#A5B4FC) → accent.
     * 인디고 + 청록(cat2) 그라디언트는 무지개 같아 보여 모던 SaaS 톤에서 벗어남.
     * 단일 톤 안에서 라이트 → 다크로 흐르는 것이 더 세련되고 깔끔합니다.
     */
    background: linear-gradient(
      120deg,
      ${tokens.color.accent} 0%,
      #818CF8 50%,
      ${tokens.color.accent} 100%
    );
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
`;

const Lead = styled.p`
  margin: 0 0 30px;
  color: ${tokens.color.ink3};
  font-size: clamp(14px, 1.6vw, 17px);
  line-height: 1.7;
  max-width: 560px;
  animation: ${fadeUp} 880ms cubic-bezier(0.22, 1, 0.36, 1) 140ms both;

  ${media.tablet} {
    max-width: 640px;
  }
`;

const CtaRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  animation: ${fadeUp} 940ms cubic-bezier(0.22, 1, 0.36, 1) 200ms both;
`;

const PrimaryCta = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 50px;
  padding: 0 24px;
  border-radius: 14px;
  /* 액티브 톤(#3730A3) 까지 가지 않고 한 단계만 어둡게 — 그라데이션이 강하지 않게. */
  background-image: linear-gradient(135deg, ${tokens.color.accent}, ${tokens.color.accentHover});
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  letter-spacing: -0.01em;
  /* 1px 라인 없이 큰 ambient + 작은 contact shadow 두 단으로 부드럽게 띄움. */
  box-shadow:
    0 18px 36px -16px rgba(79, 70, 229, 0.45),
    0 4px 10px -4px rgba(79, 70, 229, 0.25);
  transition:
    transform 320ms cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 320ms cubic-bezier(0.22, 1, 0.36, 1),
    filter 240ms ease;

  &:hover {
    transform: translateY(-2px);
    filter: brightness(1.03);
    box-shadow:
      0 22px 44px -16px rgba(79, 70, 229, 0.5),
      0 6px 14px -4px rgba(79, 70, 229, 0.3);
  }

  &:active {
    transform: translateY(0);
  }

  ${media.mobile} {
    width: 100%;
  }
`;

const GhostCta = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 50px;
  padding: 0 24px;
  border-radius: 14px;
  /* 또렷한 흰 배경 + 옅은 라벤더 보더 1px 로 카드감 살림. backdrop-filter 는 비용 큼 → 제거. */
  background: #FFFFFF;
  border: 1px solid rgba(79, 70, 229, 0.14);
  color: ${tokens.color.ink1};
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  box-shadow:
    0 8px 20px -12px rgba(33, 28, 92, 0.18),
    0 1px 0 rgba(33, 28, 92, 0.04);
  transition:
    border-color 280ms cubic-bezier(0.22, 1, 0.36, 1),
    background 280ms ease,
    transform 320ms cubic-bezier(0.22, 1, 0.36, 1);

  &:hover {
    border-color: rgba(79, 70, 229, 0.28);
    background: rgba(255, 255, 255, 0.92);
    transform: translateY(-1px);
  }

  ${media.mobile} {
    width: 100%;
  }
`;

const TrustRow = styled.div`
  margin-top: 24px;
  display: flex;
  flex-wrap: wrap;
  gap: 14px 20px;
  color: ${tokens.color.ink4};
  font-size: 12.5px;
  font-weight: 500;
  animation: ${fadeUp} 980ms cubic-bezier(0.22, 1, 0.36, 1) 260ms both;
`;

const TrustItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;

  /*
   * 체크 색을 초록(#067A55) 에서 인디고(#4F46E5) 로 변경.
   * 초록은 재무용 pos 컨벤션(수입/이익) 톤이라 의미 신호인데, TrustItem 은 그런 의미가 없는
   * 신뢰 포인트 라벨이라 액센트 인디고로 통일하는 게 모던 SaaS 톤에 맞고 깔끔합니다.
   */
  &::before {
    content: "";
    display: inline-block;
    width: 14px;
    height: 14px;
    background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234F46E5' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><polyline points='20 6 9 17 4 12'/></svg>")
      center / contain no-repeat;
  }
`;

/** 우측 프리뷰 — 실제 Home 의 KPI/도넛 느낌을 SVG/카드로 압축 */
const Preview = styled.div`
  position: relative;
  width: 100%;
  max-width: 520px;
  margin-left: auto;
  /* 한 번의 진입 entrance 만 — 이후 위치 고정. drift 무한 모션 제거 후 jank 완전 사라짐. */
  animation: ${previewIn} 900ms cubic-bezier(0.22, 1, 0.36, 1) 240ms both;

  ${media.tablet} {
    margin: 0 auto;
  }
`;

const PreviewCard = styled.div`
  position: relative;
  /*
   * 또렷한 흰색 + 미세 라벤더 보더 1px 로 카드감 회복. 반투명 + backdrop-filter 조합은
   * 1) 베이스 그라데이션과 톤이 비슷해 카드처럼 안 보이고
   * 2) blur 가 매 프레임 GPU 비용을 일으켜 같이 까닥이는 모션과 어울리면 jank 가 강해집니다.
   * 흰 패널 + 흐릿한 ambient + 옅은 contact line 으로 카드 위계를 분명히 합니다.
   */
  background: #FFFFFF;
  border: 1px solid rgba(33, 28, 92, 0.06);
  border-radius: 22px;
  padding: 22px;
  box-shadow:
    0 40px 80px -30px rgba(33, 28, 92, 0.22),
    0 12px 24px -16px rgba(79, 70, 229, 0.12),
    0 1px 0 rgba(33, 28, 92, 0.03);
`;

const PreviewHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 14px;
`;

// PlatformDonut 카드의 CardTitle/CardSub 톤을 그대로 따라갑니다.
const PreviewTitle = styled.div`
  font-size: ${tokens.type.cardTitle.size};
  font-weight: 700;
  color: ${tokens.color.ink1};
  letter-spacing: -0.01em;
`;

const PreviewSub = styled.div`
  margin-top: 2px;
  font-size: 11px;
  color: ${tokens.color.ink4};
`;

// KpiStrip 의 4분할을 프리뷰 폭에 맞게 3분할로 압축. 첫 셀은 primary 처럼 더 큰 폰트로
// 강조해 실제 KpiStrip 의 위계를 살립니다.
const KpiGrid = styled.div`
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr;
  gap: 8px;
  margin-bottom: 14px;

  ${media.mobile} {
    grid-template-columns: 1fr 1fr;
  }
`;

const KpiCell = styled.div`
  background: ${tokens.color.tint};
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const KpiLabelRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  color: ${tokens.color.ink3};
  font-size: 10.5px;
  font-weight: 500;
`;

const KpiDot = styled.span<{ $color: string }>`
  width: 6px;
  height: 6px;
  border-radius: 2px;
  background: ${({ $color }) => $color};
`;

const KpiChip = styled.span`
  /* KpiStrip neuChip 톤 모방 — 옅은 회색 칩으로 "이번 달" 표시 */
  background: ${tokens.color.tag.purchase.bg};
  color: ${tokens.color.tag.purchase.fg};
  font-size: 9px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
`;

const KpiValue = styled.div<{ $primary?: boolean; $color?: string }>`
  color: ${({ $color }) => $color ?? tokens.color.ink1};
  font-size: ${({ $primary }) => ($primary ? "20px" : "14px")};
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
`;

const KpiSub = styled.div`
  color: ${tokens.color.ink4};
  font-size: 10.5px;
  margin-top: 2px;
`;

// 실제 KpiStrip 의 sparkline 톤(accent + 그라디언트 fill) 을 그대로 흉내냅니다.
const SparkSvg = styled.svg`
  width: 100%;
  height: 22px;
  margin-top: 6px;
  display: block;
`;

const ChartWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;

  ${media.mobile} {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
`;

const Donut = styled.svg`
  width: 124px;
  height: 124px;
  flex: 0 0 124px;

  ${media.mobile} {
    align-self: center;
  }
`;

const Legend = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  color: ${tokens.color.ink2};
  flex: 1;
  min-width: 0;
`;

const LegendItem = styled.li`
  display: grid;
  grid-template-columns: 8px 1fr auto auto;
  gap: 8px;
  align-items: center;

  & > .swatch {
    width: 8px;
    height: 8px;
    border-radius: 999px;
  }

  & > .pct {
    color: ${tokens.color.ink3};
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  & > .amt {
    color: ${tokens.color.ink4};
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
`;

// 보조 카드 — 실제 InsightCards.AiSummaryBlock 그라디언트와 보더를 그대로 따라가
// "랜딩에서 본 그 박스" 가 가입 후 Home 에서도 그대로 보이도록 합니다.
// 모션은 본 카드와 살짝 늦은 한 번의 entrance 만. 무한 drift 제거.
const FloatBadge = styled.div`
  position: absolute;
  right: -10px;
  bottom: -16px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 14px;
  background: linear-gradient(145deg, #f8fafc, #f1f5f9);
  border: 1px solid #e2e8f0;
  box-shadow:
    0 24px 48px -20px rgba(33, 28, 92, 0.28),
    0 6px 14px -8px rgba(33, 28, 92, 0.18);
  font-size: 12px;
  color: ${tokens.color.ink1};
  font-weight: 500;
  line-height: 1.45;
  max-width: 280px;
  animation: ${fadeUp} 720ms cubic-bezier(0.22, 1, 0.36, 1) 720ms both;

  ${media.mobile} {
    right: 8px;
    bottom: -12px;
    font-size: 11px;
    padding: 10px 12px;
    max-width: 240px;
  }
`;

const Sparkle = styled.span`
  font-size: 16px;
  flex: 0 0 auto;
`;

export const LandingHero = () => {
  // PlatformDonut 의 실제 색상/라벨/순서. 데이터는 적당히 그럴듯한 비율(현실적인 한 달 예시).
  // formatKRW 로 ₩기호+콤마 적용해 실제 카드와 같은 포맷.
  const totalSpend = 1284300;
  const segments = [
    { color: tokens.color.warn, value: 47, amount: 603620, label: PLATFORM_LABELS.coupang },
    { color: tokens.color.cat2, value: 38, amount: 488030, label: PLATFORM_LABELS.naver },
    { color: "#9CA3AF", value: 15, amount: 192650, label: PLATFORM_LABELS.unspecified },
  ];
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  // KPI 미니 — 실제 KpiStrip 의 첫 3 셀과 같은 키/라벨/색.
  const incomeRefund = 482100;
  const avgOrder = 53513;

  // sparkline path — 6개 점 (실제 monthSpark 와 유사한 누적 곡선 톤).
  // 0~22 픽셀 높이 안에서 0,3,7,12,16,20 정도 (yyyy 누적 증가) 로 그려 매끈한 상승선이 되게.
  const sparkPath = "M2,20 L18,18 L34,15 L50,11 L66,6 L82,2";

  return (
    <Section>
      <Inner>
        <div>
          <Eyebrow>
            <Dot />
            주문 캡처 · 카드 내역 · 수동 입력 한 자리에
          </Eyebrow>
          <H1>
            소비를 모으면 <span>패턴이 보여요</span>
          </H1>
          <Lead>
            SpendTrack 은 쇼핑몰 주문 캡처와 카드사 CSV, 직접 적은 거래까지
            한 곳에 모아 정리합니다. AI 가 흩어진 항목을 정돈하고,
            한 달의 흐름을 한 화면에 보여드려요.
          </Lead>
          <CtaRow>
            <PrimaryCta to="/register">무료로 시작하기 →</PrimaryCta>
            <GhostCta to="/login">로그인</GhostCta>
          </CtaRow>
          <TrustRow>
            <TrustItem>회원가입 30초</TrustItem>
            <TrustItem>주문 캡처 · 카드내역 · 수동 입력</TrustItem>
            <TrustItem>모바일·데스크톱 동시 지원</TrustItem>
          </TrustRow>
        </div>

        <Preview aria-hidden="true">
          <PreviewCard>
            <PreviewHeader>
              <div>
                <PreviewTitle>플랫폼별 소비 비중</PreviewTitle>
                <PreviewSub>이번 달 기준</PreviewSub>
              </div>
              <PreviewSub>SpendTrack</PreviewSub>
            </PreviewHeader>

            <KpiGrid>
              <KpiCell>
                <KpiLabelRow>
                  <span>총 지출</span>
                  <KpiChip>이번 달</KpiChip>
                </KpiLabelRow>
                <KpiValue $primary>{formatKRW(totalSpend)}</KpiValue>
                <SparkSvg viewBox="0 0 84 22" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="landing-spark" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={tokens.color.accent} stopOpacity="0.28" />
                      <stop offset="100%" stopColor={tokens.color.accent} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d={`${sparkPath} L82,22 L2,22 Z`}
                    fill="url(#landing-spark)"
                  />
                  <path
                    d={sparkPath}
                    stroke={tokens.color.accent}
                    strokeWidth="1.6"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </SparkSvg>
              </KpiCell>
              <KpiCell>
                <KpiLabelRow>
                  <span>평균 주문금액</span>
                </KpiLabelRow>
                <KpiValue>{formatKRW(avgOrder)}</KpiValue>
                <KpiSub>쇼핑 24건 기준</KpiSub>
              </KpiCell>
              <KpiCell>
                <KpiLabelRow>
                  <KpiDot $color={tokens.color.pos} />
                  <span>총 수입 · 환불</span>
                </KpiLabelRow>
                <KpiValue $color={tokens.color.pos}>+{formatKRW(incomeRefund)}</KpiValue>
                <KpiSub>환불 2건 포함</KpiSub>
              </KpiCell>
            </KpiGrid>

            <ChartWrap>
              <Donut viewBox="0 0 124 124" role="img" aria-label="플랫폼 비중 도넛">
                <circle cx="62" cy="62" r={radius} fill="none" stroke={tokens.color.line2} strokeWidth="14" />
                {segments.map((seg) => {
                  const length = (seg.value / 100) * circumference;
                  const dasharray = `${length} ${circumference - length}`;
                  const dashoffset = -offset;
                  offset += length;
                  return (
                    <circle
                      key={seg.label}
                      cx="62"
                      cy="62"
                      r={radius}
                      fill="none"
                      stroke={seg.color}
                      strokeWidth="14"
                      strokeDasharray={dasharray}
                      strokeDashoffset={dashoffset}
                      transform="rotate(-90 62 62)"
                      strokeLinecap="butt"
                    />
                  );
                })}
                {/* 도넛 중앙 라벨 — 실제 PlatformDonut 의 CenterLabel 과 동일한 카피 */}
                <text
                  x="62"
                  y="58"
                  textAnchor="middle"
                  fontSize="13"
                  fontWeight="700"
                  fill={tokens.color.ink1}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatKRW(totalSpend)}
                </text>
                <text x="62" y="72" textAnchor="middle" fontSize="9" fill={tokens.color.ink4}>
                  이번 달 총소비
                </text>
              </Donut>
              <Legend>
                {segments.map((seg) => (
                  <LegendItem key={seg.label}>
                    <span className="swatch" style={{ background: seg.color }} />
                    <span>{seg.label}</span>
                    <span className="pct">{seg.value}%</span>
                    <span className="amt">{formatKRW(seg.amount)}</span>
                  </LegendItem>
                ))}
              </Legend>
            </ChartWrap>
          </PreviewCard>
          {/* 실제 ✨ AI 인사이트 카드 톤. 본문도 buildInsights() 가 만드는 카피 형태로. */}
          <FloatBadge>
            <Sparkle>✨</Sparkle>
            <span>
              <strong style={{ fontWeight: 600 }}>{PLATFORM_LABELS.coupang}</strong> 비중이 가장 높아요 ·
              <span style={{ marginLeft: 4, fontVariantNumeric: "tabular-nums" }}>47%</span>
            </span>
          </FloatBadge>
        </Preview>
      </Inner>
    </Section>
  );
};
