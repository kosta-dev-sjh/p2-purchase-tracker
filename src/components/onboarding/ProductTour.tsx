/**
 * 역할: 라우트를 자동으로 넘겨 가며 각 페이지의 핵심 요소를 스포트라이트로 조명하고
 *       말풍선으로 설명해 주는 제품 투어 오버레이입니다.
 *       외부 라이브러리 없이 `box-shadow: 0 0 0 9999px rgba(0,0,0,α)` 트릭으로
 *       대상 요소만 남기고 주변을 어둡게 합니다.
 * 위치: src/components/onboarding/ProductTour.tsx
 *
 * 동작 개요:
 *   1. `tourStore.start()`가 호출되면 0번 스텝부터 시작
 *   2. 각 스텝은 `route`와 `selector`를 가짐. 현재 라우트가 다르면 navigate
 *   3. 대상 요소가 마운트될 때까지 requestAnimationFrame으로 폴링 (최대 ~3초)
 *   4. 요소를 찾으면 scrollIntoView → 위치(rect)를 계산해 스포트라이트와 말풍선 배치
 *   5. resize/scroll 이벤트로 위치 재계산, ESC로 닫기 지원
 *
 * 마운트 위치: App.tsx 내부(BrowserRouter 안, Routes와 형제).
 *   - useNavigate / useLocation을 쓰므로 BrowserRouter 안쪽이어야 합니다.
 *   - Routes와 형제로 두면 라우트 전환에도 살아남아 투어가 연속됩니다.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import styled from "styled-components";
import { Button } from "../primitives/Button";
import { tokens } from "../../styles/tokens";
import { media } from "../../tokens/breakpoints";
import { tourStore, useTour } from "./tourStore";

interface TourStep {
  /** 디버깅용 안정적 id. */
  id: string;
  /** 이 스텝을 보여줄 라우트. 다르면 자동으로 navigate 합니다. */
  route: string;
  /** 스포트라이트 대상 엘리먼트 CSS 선택자. `[data-tour="..."]` 를 쓰는 것을 권장합니다. */
  selector: string;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    id: "home-kpi",
    route: "/",
    selector: '[data-tour="home-kpi"]',
    title: "이번 달 한눈에 보기",
    body:
      "총 지출·환급·건수·목표 사용률을 상단 한 줄로 확인할 수 있어요. 월을 바꾸면 같은 자리에서 수치만 교체됩니다.",
  },
  {
    id: "manual-savebar",
    route: "/manual-entry",
    selector: '[data-tour="manual-savebar"]',
    title: "영수증 없는 지출은 직접 입력",
    body:
      "오프라인 결제나 현금 지출처럼 자동으로 잡히지 않는 내역도, 수동 입력에서 한 건씩 가볍게 기록할 수 있어요.",
  },
  {
    id: "ocr-zone",
    route: "/ocr-upload",
    selector: '[data-tour="ocr-zone"]',
    title: "주문 캡처로 자동 등록",
    body:
      "쇼핑몰 주문내역 스크린샷을 올리면 상품·가격·플랫폼을 자동으로 뽑아 거래로 만들어 드려요. 한 번에 여러 장도 가능해요.",
  },
  {
    id: "csv-zone",
    route: "/csv-upload",
    selector: '[data-tour="csv-zone"]',
    title: "카드 CSV 한 번에 가져오기",
    body:
      "카드사에서 내려받은 CSV·엑셀 파일을 올리면 한 달치 결제가 바로 거래 테이블로 정리됩니다.",
  },
  {
    id: "analysis-summary",
    route: "/analysis",
    selector: '[data-tour="analysis-summary"]',
    title: "이번 달이 어땠는지 요약",
    body:
      "어디에 얼마를 썼는지, 지난달과 무엇이 달라졌는지 한 문장으로 요약해 보여드려요. 아래 차트로 세부 흐름도 확인해 보세요.",
  },
];

/** 스포트라이트 박스: 대상 주변을 살짝 감싸고 바깥쪽을 어둡게 칠합니다. */
const Spotlight = styled.div`
  position: fixed;
  border-radius: ${tokens.radius.card};
  box-shadow: 0 0 0 9999px rgba(11, 18, 32, 0.58);
  pointer-events: none;
  z-index: 1002;
  transition: top 200ms ease, left 200ms ease, width 200ms ease, height 200ms ease;
`;

/** 말풍선. 대상 아래에 배치하되 공간이 부족하면 위로 뒤집습니다. */
const Tooltip = styled.div`
  position: fixed;
  width: min(360px, calc(100vw - 32px));
  background: ${tokens.color.panel};
  border-radius: ${tokens.radius.modal};
  box-shadow: ${tokens.shadow.modal};
  padding: 16px 18px 12px;
  z-index: 1003;
  /* 본문이 길거나 모바일 가로 공간이 좁아 줄바꿈이 누적될 때 viewport 를 넘기지 않도록
     자체 max-height 를 두고 안에서 스크롤. transition 은 위치 변경에만 적용합니다. */
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  transition: top 200ms ease, left 200ms ease;

  ${media.mobile} {
    width: calc(100vw - 24px);
    /* 모바일에서는 ResizeObserver 가 실측한 높이를 부모(ProductTour) 가 위치 계산에 쓰므로,
       내부 스크롤은 노치/홈바를 감안한 영역을 한 번 더 줄여 둡니다. */
    max-height: calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  }
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
`;

const Badge = styled.span`
  display: inline-flex;
  padding: 3px 9px;
  border-radius: ${tokens.radius.chip};
  background: ${tokens.color.accentSubtle};
  color: ${tokens.color.accentHover};
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.02em;
`;

const SkipButton = styled.button`
  background: none;
  border: none;
  color: ${tokens.color.ink4};
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 6px;

  &:hover {
    color: ${tokens.color.ink2};
  }
`;

const Title = styled.h3`
  margin: 0 0 6px;
  color: ${tokens.color.ink1};
  font-size: 15.5px;
  font-weight: 700;
  letter-spacing: -0.01em;
`;

const BodyText = styled.p`
  margin: 0 0 12px;
  color: ${tokens.color.ink3};
  font-size: 13px;
  line-height: 1.55;
`;

const Actions = styled.div`
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  align-items: center;
`;

/**
 * 말풍선 세로 공간 fallback 추정치.
 * 모바일에서 사용자 텍스트 크기가 커지거나 본문이 길면 실제 높이가 250~300px 까지 늘어나
 * 작은 화면에서는 카드가 viewport 를 벗어나는 회귀가 있었습니다.
 * 아래 컴포넌트 안에서 ResizeObserver 로 실측해 위치 계산에 사용하고, 측정 전에는 이 값을 씁니다.
 */
const TOOLTIP_HEIGHT_EST = 220;
// 스포트라이트와 대상 사이 패딩.
const SPOTLIGHT_PAD = 10;
// 스포트라이트와 말풍선 사이 간격.
const TOOLTIP_OFFSET = 14;

export const ProductTour: React.FC = () => {
  const isOpen = useTour();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  /**
   * 말풍선 실측 높이. 측정되기 전에는 TOOLTIP_HEIGHT_EST 폴백.
   * 모바일/줌 상태에서 본문이 늘어나는 경우에도 말풍선이 viewport 를 벗어나지 않도록 하기 위함.
   */
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [tooltipHeight, setTooltipHeight] = useState<number>(TOOLTIP_HEIGHT_EST);
  const navigate = useNavigate();
  const location = useLocation();

  const step = STEPS[index];

  const close = useCallback(() => {
    tourStore.stop();
    setIndex(0);
    setRect(null);
  }, []);

  // 투어가 다시 열릴 때 첫 스텝부터 시작하도록 초기화합니다.
  useEffect(() => {
    if (isOpen) {
      setIndex(0);
    } else {
      setRect(null);
    }
  }, [isOpen]);

  // 현재 라우트가 스텝의 라우트와 다르면 자동으로 이동합니다.
  useEffect(() => {
    if (!isOpen) return;
    if (location.pathname !== step.route) {
      navigate(step.route);
    }
  }, [isOpen, index, step.route, location.pathname, navigate]);

  // 대상 엘리먼트가 마운트되기를 기다리면서 위치를 계산합니다.
  useEffect(() => {
    if (!isOpen) return;
    setRect(null);
    let raf = 0;
    let attempts = 0;
    const find = () => {
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (el) {
        // 즉시(non-smooth) 스크롤해서 위치 측정이 한 프레임 안에 확정되도록 합니다.
        el.scrollIntoView({ block: "center", inline: "nearest" });
        raf = requestAnimationFrame(() => {
          setRect(el.getBoundingClientRect());
        });
        return;
      }
      // 라우트 전환 직후에는 타깃이 아직 없을 수 있으므로 최대 ~3초(≈180 프레임)까지 폴링합니다.
      if (attempts < 180) {
        attempts++;
        raf = requestAnimationFrame(find);
      }
    };
    raf = requestAnimationFrame(find);
    return () => cancelAnimationFrame(raf);
  }, [isOpen, index, step.selector, location.pathname]);

  // 창 크기나 스크롤이 바뀌면 위치를 다시 계산합니다.
  useEffect(() => {
    if (!isOpen) return;
    const update = () => {
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [isOpen, step.selector]);

  // 말풍선 실측 높이 추적. ref 가 붙은 다음부터 ResizeObserver 로 변동을 따라잡고,
  // 미지원 브라우저에선 1회 측정값으로 폴백합니다.
  useEffect(() => {
    if (!isOpen) return;
    const node = tooltipRef.current;
    if (!node) return;

    const measure = () => {
      const next = node.getBoundingClientRect().height;
      // 0 으로 떨어지는 transient 측정은 무시 (mount 직후 1프레임).
      if (next > 0) setTooltipHeight(next);
    };
    measure();

    const RO = (window as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    if (typeof RO === "function") {
      const observer = new RO(measure);
      observer.observe(node);
      return () => observer.disconnect();
    }
  }, [isOpen, index, step.title, step.body]);

  // ESC 키로 닫기.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  if (!isOpen) return null;
  if (!rect) return null; // 대상이 준비될 때까지 어둠 깔기도 보류

  const viewW = typeof window !== "undefined" ? window.innerWidth : 1280;
  const viewH = typeof window !== "undefined" ? window.innerHeight : 800;

  const spotTop = rect.top - SPOTLIGHT_PAD;
  const spotLeft = rect.left - SPOTLIGHT_PAD;
  const spotWidth = rect.width + SPOTLIGHT_PAD * 2;
  const spotHeight = rect.height + SPOTLIGHT_PAD * 2;

  const tooltipWidth = Math.min(360, viewW - 32);

  // 아래 공간이 충분하면 말풍선을 아래에, 아니면 위에 배치합니다.
  // tooltipHeight 는 ResizeObserver 가 실측해 둔 값(없으면 fallback 추정치).
  const spaceBelow = viewH - (rect.top + rect.height);
  const placeBelow = spaceBelow > tooltipHeight + TOOLTIP_OFFSET;

  let tooltipTop = placeBelow
    ? rect.top + rect.height + TOOLTIP_OFFSET
    : rect.top - tooltipHeight - TOOLTIP_OFFSET;
  // 뷰포트 밖으로 나가지 않도록 클램프. 실측 높이를 사용해 모바일/줌 환경에서도 잘리지 않게 합니다.
  tooltipTop = Math.max(
    16,
    Math.min(tooltipTop, viewH - tooltipHeight - 16)
  );

  let tooltipLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
  tooltipLeft = Math.max(
    16,
    Math.min(tooltipLeft, viewW - tooltipWidth - 16)
  );

  const isLast = index === STEPS.length - 1;

  return (
    <>
      <Spotlight
        style={{
          top: spotTop,
          left: spotLeft,
          width: spotWidth,
          height: spotHeight,
        }}
      />
      <Tooltip
        ref={tooltipRef}
        role="dialog"
        aria-modal="true"
        aria-label="기능 투어"
        style={{ top: tooltipTop, left: tooltipLeft }}
      >
        <Header>
          <Badge>
            {index + 1} / {STEPS.length}
          </Badge>
          <SkipButton type="button" onClick={close}>
            건너뛰기
          </SkipButton>
        </Header>
        <Title>{step.title}</Title>
        <BodyText>{step.body}</BodyText>
        <Actions>
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
            <Button type="button" variant="primary" size="sm" onClick={close}>
              완료
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
        </Actions>
      </Tooltip>
    </>
  );
};
