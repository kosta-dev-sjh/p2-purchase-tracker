/**
 * 역할: 신규 가입 직후 Home에서 한 번만 뜨는 온보딩 오버레이.
 *       수동 입력 / 주문 캡처 / 카드 내역 / 분석 4개 진입점을 슬라이드로 안내하고,
 *       닫으면 localStorage 플래그를 남겨 다음 진입부터는 자동으로 뜨지 않게 합니다.
 * 위치: src/components/onboarding/WelcomeTutorial.tsx
 */
import React, { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import styled from "styled-components";
import { Button } from "../primitives/Button";
import { tokens } from "../../styles/tokens";
import { media } from "../../tokens/breakpoints";
import { ONBOARDING_SEEN_KEY } from "../../constants/onboarding";
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
      "오프라인 매장이나 현금 결제처럼 주문 캡처·카드 내역으로는 들어오지 않는 지출도, 수동 입력에서 한 건씩 가볍게 남길 수 있어요.",
    ctaLabel: "수동 입력 열어보기",
    ctaHref: "/manual-entry",
  },
  {
    emoji: "🧾",
    title: "주문 캡처로 한 번에 자동 정리",
    body:
      "쿠팡·네이버쇼핑 같은 쇼핑몰 주문내역 스크린샷을 올리면 상품·가격·플랫폼을 자동으로 뽑아서 거래로 만들어 드려요. 한 번에 여러 장도 괜찮아요.",
    ctaLabel: "주문 캡처 시작하기",
    ctaHref: "/ocr-upload",
  },
  {
    emoji: "💳",
    title: "카드 내역을 한 번에 불러오기",
    body:
      "카드사에서 내려받은 이용내역 파일(CSV·엑셀)을 그대로 올리면 한 달치 결제가 거래 테이블에 바로 정리됩니다.",
    ctaLabel: "카드 내역 업로드 보러가기",
    ctaHref: "/csv-upload",
  },
  {
    emoji: "📊",
    title: "분석 화면에서 한눈에 확인",
    body:
      "이번 달이 지난달과 얼마나 달랐는지, 어떤 카테고리·플랫폼이 지출을 끌어올렸는지 한 줄 요약과 차트로 빠르게 확인할 수 있어요.",
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
  /*
   * 모바일에서 사용자 글씨 크기를 키운 환경(시스템 텍스트 200% 등)에서는 본문 + 푸터가
   * 카드 max-height 를 넘어 잘리는 회귀가 있었습니다. 카드 자체에 max-height + flex 만
   * 두면 overflow:hidden 으로 뒷부분(다음/완료 버튼)이 사라지므로,
   *   - max-height 를 동적 viewport(dvh) 기준으로 두고
   *   - 본문(Body)만 overflow-y:auto 로 풀어 푸터가 항상 보이도록 분리합니다.
   * dvh 미지원 브라우저는 vh 폴백으로 자연스럽게 떨어집니다.
   */
  max-height: calc(100vh - 48px);
  max-height: calc(100dvh - 48px);
  background: ${tokens.color.panel};
  border-radius: ${tokens.radius.modal};
  z-index: 1001;
  box-shadow: ${tokens.shadow.modal};
  overflow: hidden;
  display: flex;
  flex-direction: column;

  ${media.mobile} {
    width: calc(100vw - 24px);
    /* 안전 영역(노치/홈 인디케이터) 만큼 카드를 살짝 띄워, 모바일 사파리 하단 바와
       겹치지 않게 합니다. env() 미지원 브라우저는 0 으로 떨어집니다. */
    max-height: calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
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
  /*
   * 본문만 스크롤 가능하게 해 두고 카드 자체는 overflow:hidden 을 유지합니다.
   * Footer(다음/완료) 가 항상 화면에 보이도록 layout 책임을 본문 쪽으로 옮긴 형태.
   * min-height:0 은 flex 자식의 overflow 가 제대로 동작하기 위한 정석 처방.
   */
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 24px 20px;

  ${media.mobile} {
    padding: 6px 20px 16px;
  }
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
  /* 카드 안에서 항상 바닥에 sticky. 본문 스크롤 후에도 액션 버튼이 화면에 남도록 보장. */
  flex: 0 0 auto;
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
    /* 모바일에서 좌우 패딩을 줄여 좁은 화면에서도 두 버튼이 한 줄에 살아남게 합니다. */
    padding: 12px 16px calc(16px + env(safe-area-inset-bottom, 0px));
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

  ${media.mobile} {
    /* 모바일에서 Footer 가 column-reverse + stretch 가 되면 Nav 가 풀-폭이 되므로,
       내부 버튼이 50:50 으로 자연스럽게 나뉘도록 만들어 줍니다. && 는 styled.button
       기본 specificity 보다 한 단계 위에 잡기 위해 사용. */
    && > button {
      flex: 1;
    }
  }
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
