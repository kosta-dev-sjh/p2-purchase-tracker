/**
 * 역할: 신규 계정(목업 1111/1111) 로그인 직후 Home에서 한 번만 뜨는 온보딩 오버레이.
 *       수동 입력 / OCR / CSV / 분석 4개 진입점을 슬라이드로 안내하고,
 *       닫으면 localStorage 플래그를 남겨 다음 진입부터는 자동으로 뜨지 않게 합니다.
 * 위치: src/components/onboarding/WelcomeTutorial.tsx
 *
 * TODO(auth): 실제 인증을 붙이고 목업 로그인 분기를 걷어낼 때, 이 오버레이의 표시 조건을
 *             "실제 신규 가입 이벤트 직후"로 옮겨야 합니다. 현재는 LoginForm의 1111/1111 분기가
 *             onboarding 플래그를 제거하는 것으로 트리거됩니다.
 */
import React, { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import styled from "styled-components";
import { Button } from "../primitives/Button";
import { tokens } from "../../styles/tokens";
import { media } from "../../tokens/breakpoints";
import { ONBOARDING_SEEN_KEY } from "../../mocks/auth";
import { tourStore } from "./tourStore";

interface Step {
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  emoji: string;
}

const STEPS: Step[] = [
  {
    emoji: "✍️",
    title: "수동 입력으로 첫 거래 기록하기",
    body:
      "자주 가는 오프라인 매장이나 현금 결제처럼 영수증이 없는 지출도, 수동 입력에서 한 건씩 가볍게 남길 수 있어요.",
    ctaLabel: "수동 입력 열어보기",
    ctaHref: "/manual-entry",
  },
  {
    emoji: "🧾",
    title: "쇼핑몰 주문내역 OCR로 자동 정리",
    body:
      "스크린샷을 올리면 상품·가격·플랫폼을 자동으로 뽑아서 거래로 만들어 드려요. 한 번에 여러 장도 괜찮아요.",
    ctaLabel: "OCR 업로드 보러가기",
    ctaHref: "/ocr-upload",
  },
  {
    emoji: "💳",
    title: "카드 CSV를 한 번에 불러오기",
    body:
      "카드사에서 내려받은 CSV를 그대로 올리면 한 달치 결제가 거래 테이블에 바로 정리됩니다.",
    ctaLabel: "CSV 업로드 보러가기",
    ctaHref: "/csv-upload",
  },
  {
    emoji: "📊",
    title: "분석 화면에서 한눈에 확인",
    body:
      "이번 달이 지난달과 얼마나 달랐는지, 어떤 카테고리/플랫폼이 지출을 끌어올렸는지 분석 화면에서 빠르게 볼 수 있어요.",
    ctaLabel: "분석 화면 보러가기",
    ctaHref: "/analysis",
  },
];

const Overlay = styled.button`
  position: fixed;
  inset: 0;
  background: rgba(11, 18, 32, 0.46);
  border: none;
  padding: 0;
  z-index: 1000;
  cursor: default;
`;

const Card = styled.div`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(520px, calc(100vw - 32px));
  background: ${tokens.color.panel};
  border-radius: ${tokens.radius.modal};
  z-index: 1001;
  box-shadow: ${tokens.shadow.modal};
  overflow: hidden;
  display: flex;
  flex-direction: column;

  ${media.mobile} {
    width: calc(100vw - 24px);
    max-height: calc(100vh - 48px);
  }
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 12px;
`;

const StepBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: ${tokens.radius.chip};
  background: ${tokens.color.accentSubtle};
  color: ${tokens.color.accentHover};
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
`;

const SkipButton = styled.button`
  background: none;
  border: none;
  color: ${tokens.color.ink4};
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  padding: 6px 8px;

  &:hover {
    color: ${tokens.color.ink2};
  }
`;

const Body = styled.div`
  padding: 6px 24px 20px;
`;

const Emoji = styled.div`
  font-size: 34px;
  line-height: 1;
  margin-bottom: 12px;
`;

const Title = styled.h2`
  margin: 0 0 8px;
  color: ${tokens.color.ink1};
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
`;

const BodyText = styled.p`
  margin: 0;
  color: ${tokens.color.ink3};
  font-size: 13.5px;
  line-height: 1.6;
`;

const Dots = styled.div`
  display: flex;
  gap: 6px;
  justify-content: center;
  padding: 4px 24px 16px;
`;

const Dot = styled.button<{ $active: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 999px;
  border: none;
  padding: 0;
  cursor: pointer;
  background: ${({ $active }) =>
    $active ? tokens.color.accent : tokens.color.ink5};
  transition: background ${tokens.motion.fast};
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 24px 20px;
  border-top: 1px solid ${tokens.color.line2};
  background: ${tokens.color.foot};

  ${media.mobile} {
    flex-direction: column-reverse;
    align-items: stretch;
  }
`;

const CtaLink = styled(Link)`
  color: ${tokens.color.accentHover};
  font-size: 12.5px;
  font-weight: 600;
  text-decoration: none;
  padding: 8px 4px;

  &:hover {
    text-decoration: underline;
  }
`;

const Nav = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

function markSeen(): void {
  try {
    localStorage.setItem(ONBOARDING_SEEN_KEY, "1");
  } catch {
    // localStorage 접근이 막힌 환경은 조용히 무시합니다.
  }
}

interface WelcomeTutorialProps {
  /** 외부에서 강제로 열림 상태를 지정하고 싶을 때 사용합니다. 생략 시 localStorage 플래그로 자동 결정. */
  forceOpen?: boolean;
  /** 닫힐 때 상위에서 추가 동작이 필요하면 여기서 받습니다. */
  onClose?: () => void;
}

/**
 * Home에서 최초 진입 시 자동으로 뜨는 온보딩 오버레이.
 * `forceOpen`이 true면 플래그 상관없이 열립니다. 닫으면 `ONBOARDING_SEEN_KEY`가 저장되어
 * 다음 세션부터는 자동 표시되지 않습니다.
 */
export const WelcomeTutorial: React.FC<WelcomeTutorialProps> = ({
  forceOpen,
  onClose,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    if (forceOpen) return true;
    try {
      return !localStorage.getItem(ONBOARDING_SEEN_KEY);
    } catch {
      return false;
    }
  });
  const [index, setIndex] = useState(0);

  const handleClose = useCallback(() => {
    markSeen();
    setIsOpen(false);
    onClose?.();
  }, [onClose]);

  /**
   * 마지막 슬라이드 "투어 시작" 버튼: 이 환영 모달을 닫고, 전역 ProductTour 오버레이를 띄워
   * 각 페이지로 자동 이동하며 핵심 요소를 스포트라이트로 조명합니다.
   */
  const handleStartTour = useCallback(() => {
    markSeen();
    setIsOpen(false);
    onClose?.();
    tourStore.start();
  }, [onClose]);

  if (!isOpen) return null;

  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

  return (
    <>
      <Overlay type="button" aria-label="튜토리얼 닫기" onClick={handleClose} />
      <Card role="dialog" aria-modal="true" aria-label="SpendTrack 시작 안내">
        <Header>
          <StepBadge>
            {index + 1} / {STEPS.length}
          </StepBadge>
          <SkipButton type="button" onClick={handleClose}>
            건너뛰기
          </SkipButton>
        </Header>
        <Body>
          <Emoji aria-hidden>{step.emoji}</Emoji>
          <Title>{step.title}</Title>
          <BodyText>{step.body}</BodyText>
        </Body>
        <Dots>
          {STEPS.map((_, i) => (
            <Dot
              key={i}
              type="button"
              aria-label={`${i + 1}번째 슬라이드`}
              aria-current={i === index}
              $active={i === index}
              onClick={() => setIndex(i)}
            />
          ))}
        </Dots>
        <Footer>
          <CtaLink to={step.ctaHref} onClick={handleClose}>
            {step.ctaLabel} →
          </CtaLink>
          <Nav>
            {index > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
              >
                이전
              </Button>
            )}
            {isLast ? (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleStartTour}
              >
                투어 시작
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() =>
                  setIndex((i) => Math.min(STEPS.length - 1, i + 1))
                }
              >
                다음
              </Button>
            )}
          </Nav>
        </Footer>
      </Card>
    </>
  );
};
