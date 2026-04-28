/**
 * 역할: 랜딩 페이지의 핵심 기능 3개 카드 섹션. 실제 Upload 화면(`src/pages/Upload/index.tsx`)
 *       의 3개 입력 방식(주문 캡처 · 수동 입력 · 카드 내역 가져오기)과 동일한 명칭/문구/아이콘을
 *       그대로 재사용해 가입 후 첫 화면과 사용자가 본 카피가 끊기지 않게 합니다.
 * 위치: src\pages\Landing\components\LandingFeatures.tsx
 *
 *   - 아이콘: Upload/components/icons.tsx 의 CameraIcon/PenIcon/SpreadsheetIcon 그대로
 *   - 라우트: 가입 전엔 /register 로 보냄. 가입 직후 동일 라벨의 카드를 Upload 에서 다시 만나게.
 *   - 카드 톤: MethodCard 의 흰 패널 + IconBox(accentSubtle/accent) 톤을 부드럽게 수정 — 1px 윤곽
 *     보더 대신 옅은 라벤더 보더 + ambient shadow 로 떠 있는 느낌만.
 */
import styled from "styled-components";
import { tokens } from "../../../styles/tokens";
import { media } from "../../../tokens/breakpoints";
import { useReveal } from "../hooks/useReveal";
import { CameraIcon, PenIcon, SpreadsheetIcon } from "../../Upload/components/icons";

const Section = styled.section`
  /* 섹션 보더/배경색 분리 제거 — 페이지 베이스 그라데이션 위에서 spacing 으로만 분리합니다. */
  padding: clamp(48px, 8vw, 96px) clamp(16px, 4vw, 40px);
`;

const Inner = styled.div`
  max-width: 1180px;
  margin: 0 auto;
`;

const Heading = styled.div<{ $visible: boolean }>`
  text-align: center;
  margin-bottom: clamp(28px, 4vw, 48px);
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
  /* 부드러운 인상을 위해 weight 700 + tracking 약하게. */
  font-weight: 700;
  letter-spacing: -0.022em;
`;

const Sub = styled.p`
  margin: 0;
  color: ${tokens.color.ink3};
  font-size: clamp(13px, 1.4vw, 15px);
  line-height: 1.7;
  max-width: 560px;
  margin-left: auto;
  margin-right: auto;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 22px;

  ${media.tablet} {
    grid-template-columns: 1fr 1fr;
    gap: 18px;
  }

  ${media.mobile} {
    grid-template-columns: 1fr;
    gap: 16px;
  }
`;

/*
 * 카드 디자인 가이드:
 *  - 또렷한 흰 배경 + 옅은 라벤더 보더 + ambient/contact shadow 두 단으로 카드감 분명히
 *  - 반투명 + backdrop-filter 는 베이스 그라데이션과 톤이 비슷해 카드가 흐려 보였고, 호버
 *    transform 과 같이 가면 모바일에서 jank 까지 만들었음 → 둘 다 제거
 *  - reveal entrance: 이동 28px + 옅은 scale-up 으로 시선에 또렷이 들어오게
 */
const Card = styled.article<{ $visible: boolean; $delay: number }>`
  position: relative;
  background: #FFFFFF;
  border: 1px solid rgba(33, 28, 92, 0.06);
  border-radius: 20px;
  padding: 32px 28px 26px;
  text-align: center;
  box-shadow:
    0 24px 48px -28px rgba(33, 28, 92, 0.2),
    0 6px 14px -10px rgba(33, 28, 92, 0.1),
    0 1px 0 rgba(33, 28, 92, 0.03);
  transition:
    opacity 820ms cubic-bezier(0.22, 1, 0.36, 1) ${({ $delay }) => $delay}ms,
    transform 820ms cubic-bezier(0.22, 1, 0.36, 1) ${({ $delay }) => $delay}ms,
    box-shadow 320ms cubic-bezier(0.22, 1, 0.36, 1),
    border-color 320ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: opacity, transform;

  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transform: translate3d(
      0,
      ${({ $visible }) => ($visible ? "0" : "28px")},
      0
    )
    scale(${({ $visible }) => ($visible ? 1 : 0.97)});

  &:hover {
    border-color: rgba(79, 70, 229, 0.22);
    box-shadow:
      0 36px 64px -28px rgba(33, 28, 92, 0.26),
      0 12px 22px -12px rgba(79, 70, 229, 0.22);
    /* hover 변환은 자체 translateY 만 — reveal scale 과 합성되어 깜빡이지 않게 단순화. */
    transform: translate3d(0, -6px, 0) scale(1);
  }
`;

// MethodCard 의 IconBox 톤(accentSubtle 배경 + accent 색)을 그대로 따라갑니다.
const IconBox = styled.div`
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  margin: 0 auto 18px;
  border-radius: 16px;
  background: ${tokens.color.accentSubtle};
  color: ${tokens.color.accent};

  svg {
    width: 26px;
    height: 26px;
  }
`;

const CardTitle = styled.h3`
  margin: 0 0 8px;
  color: ${tokens.color.ink1};
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.01em;
`;

const CardBody = styled.p`
  margin: 0 0 18px;
  color: ${tokens.color.ink3};
  font-size: 13.5px;
  line-height: 1.7;
  white-space: pre-line;
`;

const Bullets = styled.ul`
  list-style: none;
  margin: 0 0 14px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
`;

const Bullet = styled.li`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: ${tokens.color.ink2};
  font-size: 12.5px;
  line-height: 1.55;

  &::before {
    content: "";
    flex: 0 0 14px;
    width: 14px;
    height: 14px;
    margin-top: 3px;
    background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234F46E5' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><polyline points='20 6 9 17 4 12'/></svg>")
      center / contain no-repeat;
  }
`;

const Foot = styled.div`
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed ${tokens.color.line2};
  color: ${tokens.color.ink4};
  font-size: 11.5px;
  line-height: 1.5;
`;

// Upload/index.tsx 의 3개 MethodCard 와 라벨/카피/아이콘을 통일.
// description 줄바꿈도 동일 (`\n` 사용). 카드 footnote 도 같은 문구를 가져옵니다.
const features = [
  {
    icon: <CameraIcon />,
    title: "주문 캡처로 입력",
    description: "쇼핑몰 주문내역 캡처를 인식해\n자동으로 입력합니다.",
    bullets: [
      "쿠팡 · 네이버쇼핑 자동 인식",
      "AI 보정으로 빠진 상품명 복원",
      "여러 장 일괄 업로드 지원",
    ],
    footnote: "취소, 반품, 환불, 정기결제까지 함께 감지",
  },
  {
    icon: <PenIcon />,
    title: "수동 입력",
    description: "지출과 수입 내역을 직접\n기록할 수 있습니다.",
    bullets: [
      "지출 · 수입 직접 입력",
      "상품도 팝업으로 간편하게 추가",
      "카테고리 · 플랫폼 동시 지정",
    ],
    footnote: "구매 · 취소 · 환불 · 정기결제 상태로 분류",
  },
  {
    icon: <SpreadsheetIcon />,
    title: "카드 내역 가져오기",
    description: "카드사에서 내려받은 CSV/엑셀로\n결제내역을 한 번에 불러옵니다.",
    bullets: [
      "CSV · XLSX 컬럼 자동 매핑",
      "중복 거래 자동 감지",
      "미리보기 후 일괄 적용",
    ],
    footnote: "OCR로 상품 상세를 나중에 덧붙일 수 있어요",
  },
];

export const LandingFeatures = () => {
  const heading = useReveal<HTMLDivElement>();
  const grid = useReveal<HTMLDivElement>();

  return (
    <Section>
      <Inner>
        <Heading ref={heading.ref} $visible={heading.visible}>
          <Eyebrow>입력 방법</Eyebrow>
          <Title>들어오는 형식이 달라도, 한 자리에 정리됩니다</Title>
          <Sub>주문 캡처 · 카드 내역 · 수동 입력 — 어떤 길로 들어와도 같은 형태로 저장돼요.</Sub>
        </Heading>
        <Grid ref={grid.ref}>
          {features.map((f, i) => (
            // stagger 110→160ms 로 늘려 카드가 차례로 올라오는 흐름이 또렷해지게.
            <Card key={f.title} $visible={grid.visible} $delay={i * 160}>
              <IconBox>{f.icon}</IconBox>
              <CardTitle>{f.title}</CardTitle>
              <CardBody>{f.description}</CardBody>
              <Bullets>
                {f.bullets.map((b) => (
                  <Bullet key={b}>{b}</Bullet>
                ))}
              </Bullets>
              <Foot>{f.footnote}</Foot>
            </Card>
          ))}
        </Grid>
      </Inner>
    </Section>
  );
};
