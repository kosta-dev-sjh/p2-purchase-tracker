/**
 * 역할: 랜딩 페이지의 "이렇게 사용해요" 3단계 섹션. 가입 → 입력(3종 중 선택) → Home 자동 분석
 *       이라는 실제 앱 흐름을 그대로 단계화합니다.
 * 위치: src\pages\Landing\components\LandingSteps.tsx
 *
 *   - 2단계 라벨 ("주문 캡처 · 카드 내역 · 수동 입력") 은 Upload/index.tsx 의 3개 MethodCard 명칭과 일치
 *   - 3단계 라벨 ("총 지출 · 평균 주문금액 · 플랫폼별 소비 비중 · AI 인사이트") 은 Home/data.ts 의
 *     KpiStrip 키와 PlatformDonut 카드 제목, InsightCards.AiSummaryBlock 의 표현을 그대로 차용
 *
 *   디자인 정책:
 *   - 단계 카드는 또렷한 흰 배경 + 옅은 보더 + 큰 ambient/contact shadow 로 명확히 구분.
 *   - 단계 번호는 "01·02·03" 큰 칩으로 카드 좌상단에 두어 한눈에 흐름이 보이게.
 *   - 각 단계마다 액센트 컬러를 다르게(인디고 → 인디고 어두움 → 청록) 진행감을 표현.
 *   - reveal entrance 는 이동 28px + 옅은 scale-up + stagger 160ms 로 또렷한 흐름.
 */
import styled from "styled-components";
import { tokens } from "../../../styles/tokens";
import { media } from "../../../tokens/breakpoints";
import { useReveal } from "../hooks/useReveal";

const Section = styled.section`
  padding: clamp(48px, 8vw, 96px) clamp(16px, 4vw, 40px);
`;

const Inner = styled.div`
  max-width: 1180px;
  margin: 0 auto;
`;

const Heading = styled.div<{ $visible: boolean }>`
  text-align: center;
  margin-bottom: clamp(36px, 5vw, 56px);
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transform: translate3d(0, ${({ $visible }) => ($visible ? "0" : "24px")}, 0);
  transition:
    opacity 820ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 820ms cubic-bezier(0.22, 1, 0.36, 1);
`;

const Eyebrow = styled.div`
  color: ${tokens.color.accent};
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 10px;
`;

const Title = styled.h2`
  margin: 0 0 12px;
  color: ${tokens.color.ink1};
  font-size: clamp(22px, 3vw, 32px);
  font-weight: 700;
  letter-spacing: -0.022em;
`;

const Sub = styled.p`
  margin: 0;
  color: ${tokens.color.ink3};
  font-size: clamp(13px, 1.4vw, 15px);
  line-height: 1.7;
`;

// 카드 사이 gap 을 22px 로 키워 "각각 분리된 카드" 라는 인상이 또렷해지게.
const Track = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 22px;
  counter-reset: step;

  ${media.tablet} {
    grid-template-columns: 1fr;
    gap: 18px;
  }
`;

const Step = styled.li<{
  $visible: boolean;
  $delay: number;
  $accent: string;
}>`
  position: relative;
  background: #FFFFFF;
  border: 1px solid rgba(33, 28, 92, 0.06);
  border-radius: 20px;
  padding: 32px 26px 26px;
  counter-increment: step;
  /* 좌측 위에 가는 액센트 라인을 둬서 단계 카드라는 시각 단서를 강화. */
  box-shadow:
    0 24px 48px -28px rgba(33, 28, 92, 0.2),
    0 6px 14px -10px rgba(33, 28, 92, 0.1),
    0 1px 0 rgba(33, 28, 92, 0.03);
  transition:
    opacity 820ms cubic-bezier(0.22, 1, 0.36, 1) ${({ $delay }) => $delay}ms,
    transform 820ms cubic-bezier(0.22, 1, 0.36, 1) ${({ $delay }) => $delay}ms,
    box-shadow 320ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: opacity, transform;

  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transform: translate3d(
      0,
      ${({ $visible }) => ($visible ? "0" : "28px")},
      0
    )
    scale(${({ $visible }) => ($visible ? 1 : 0.97)});

  /*
   * 카드 상단에 가는 4px 액센트 바를 그려 "단계 카드" 라는 시각 신호를 더 강하게.
   * border-radius 와 어울리도록 좌우 inset.
   */
  &::after {
    content: "";
    position: absolute;
    top: 0;
    left: 20px;
    right: 20px;
    height: 3px;
    border-radius: 0 0 999px 999px;
    background: ${({ $accent }) => $accent};
    opacity: 0.85;
  }

  &:hover {
    box-shadow:
      0 36px 64px -28px rgba(33, 28, 92, 0.26),
      0 12px 22px -12px rgba(79, 70, 229, 0.18);
    transform: translate3d(0, -4px, 0) scale(1);
  }
`;

// 좌상단 단계 번호 — "01"/"02"/"03" 두 자리 표시. 액센트 컬러로 채워 단계마다 진행감 부여.
const StepBadge = styled.div<{ $accent: string }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: ${({ $accent }) => $accent};
  text-transform: uppercase;
  margin-bottom: 14px;

  &::before {
    counter-reset: none;
    content: "STEP " counter(step, decimal-leading-zero);
  }
`;

const StepNumber = styled.div<{ $accent: string }>`
  position: absolute;
  top: 18px;
  right: 22px;
  font-size: 36px;
  font-weight: 800;
  color: ${({ $accent }) => $accent};
  letter-spacing: -0.04em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  /* 카드의 우상단 워터마크처럼 옅게 — 본문을 가리지 않으면서 단계감 보강. */
  opacity: 0.18;

  &::before {
    content: counter(step, decimal-leading-zero);
  }
`;

const StepTitle = styled.h3`
  margin: 0 0 10px;
  color: ${tokens.color.ink1};
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.012em;
  line-height: 1.4;
`;

const StepBody = styled.p`
  margin: 0 0 16px;
  color: ${tokens.color.ink3};
  font-size: 13.5px;
  line-height: 1.7;
`;

const Tags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

/*
 * Tag 색상 가이드:
 *  - accent : 액센트 인디고 옅게 — 입력 라벨 (주문 캡처/카드 내역/수동 입력) 의 강조용
 *  - warm   : 앰버 brown(#92400E) → violet 패밀리(#6D28D9) 로 교체. 앰버는 노랗고 구려
 *             보였고, violet 은 인디고와 인접색이라 톤이 끊기지 않으면서도 "특별/마법" 같은
 *             AI 인사이트의 뉘앙스를 표현하기에 맞습니다.
 *  - neutral: 회색 칩 — 분석 결과(총 지출, 플랫폼별 소비 비중) 같은 사실 라벨
 */
const Tag = styled.span<{ $tone: "accent" | "neutral" | "warm" }>`
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  background: ${({ $tone }) =>
    $tone === "accent"
      ? "rgba(79, 70, 229, 0.10)"
      : $tone === "warm"
        ? "rgba(124, 58, 237, 0.10)"
        : tokens.color.tint};
  color: ${({ $tone }) =>
    $tone === "accent"
      ? tokens.color.accentActive
      : $tone === "warm"
        ? "#6D28D9"
        : tokens.color.ink3};
`;

interface StepDef {
  title: string;
  body: string;
  accent: string;
  tags: Array<{ label: string; tone: "accent" | "neutral" | "warm" }>;
}

/*
 * 단계별 액센트 컬러:
 *  - 인디고 한 패밀리 안에서만 진행감을 표현. 청록(cat2) 같은 가족 밖 색을 섞으면 톤이
 *    어긋나 보였습니다. 1 → 2 → 3 단계로 갈수록 점점 진해져 "흐름 끝에 도달" 한 느낌을 줍니다.
 *      1: indigo-500 (#6366F1) — 시작, 라이트
 *      2: indigo accent (#4F46E5) — 본격
 *      3: indigo accent hover (#4338CA) — 가장 진함, 분석 결과 도달
 *  - 워터마크 숫자가 충분히 보이도록 1단계도 라이트 인디고 정도까지만 옅게 합니다.
 */
const steps: StepDef[] = [
  {
    title: "회원가입 · 워크스페이스 자동 생성",
    body: "이메일 30초면 충분합니다. 가입과 함께 개인 워크스페이스가 만들어져 바로 거래를 추가할 수 있어요.",
    accent: "#6366F1",
    tags: [
      { label: "이메일 가입", tone: "neutral" },
      { label: "30초", tone: "neutral" },
    ],
  },
  {
    title: "주문 캡처 · 카드 내역 · 수동 입력 중 선택",
    body: "쇼핑몰 주문 캡처, 카드사 CSV/엑셀, 직접 입력 — 원하는 방식 아무거나. 거래내역의 + 버튼으로도 한 건씩 빠르게 추가할 수 있어요.",
    accent: tokens.color.accent,
    tags: [
      { label: "주문 캡처", tone: "accent" },
      { label: "카드 내역", tone: "accent" },
      { label: "수동 입력", tone: "accent" },
      { label: "+ 빠른 추가", tone: "accent" },
    ],
  },
  {
    title: "홈에서 한 화면으로 분석",
    body: "총 지출 · 평균 주문금액 · 플랫폼별 소비 비중이 자동 집계되고, ✨ AI 인사이트가 이번 달 패턴을 한 줄로 요약해 드려요.",
    accent: tokens.color.accentHover,
    tags: [
      { label: "총 지출", tone: "neutral" },
      { label: "플랫폼별 소비 비중", tone: "neutral" },
      { label: "AI 인사이트", tone: "warm" },
    ],
  },
];

export const LandingSteps = () => {
  const heading = useReveal<HTMLDivElement>();
  const track = useReveal<HTMLOListElement>();

  return (
    <Section>
      <Inner>
        <Heading ref={heading.ref} $visible={heading.visible}>
          <Eyebrow>이렇게 써요</Eyebrow>
          <Title>3 단계, 그게 전부예요</Title>
          <Sub>복잡한 설정 없이 — 가입하고, 데이터 넣고, 자동 분석을 보세요.</Sub>
        </Heading>
        <Track ref={track.ref}>
          {steps.map((s, i) => (
            <Step
              key={s.title}
              $visible={track.visible}
              $delay={i * 160}
              $accent={s.accent}
            >
              <StepNumber $accent={s.accent} aria-hidden="true" />
              <StepBadge $accent={s.accent} />
              <StepTitle>{s.title}</StepTitle>
              <StepBody>{s.body}</StepBody>
              <Tags>
                {s.tags.map((t) => (
                  <Tag key={t.label} $tone={t.tone}>
                    {t.label}
                  </Tag>
                ))}
              </Tags>
            </Step>
          ))}
        </Track>
      </Inner>
    </Section>
  );
};
