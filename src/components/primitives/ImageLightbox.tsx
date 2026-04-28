/**
 * 역할: 이미지를 전체 화면 오버레이로 확대해서 볼 수 있는 라이트박스 공용 컴포넌트.
 *       OcrEdit/ImagePreview 가 처음 도입했고, 이후 OcrUpload/UploadedGrid 와
 *       AddImagesModal 의 썸네일에도 같은 경험이 필요해 공용 primitives 로 승격했습니다.
 *
 *       설계:
 *         - 자체 state 를 갖지 않고 `isOpen`/`onClose` 패턴으로만 동작해, 상위가
 *           "어떤 이미지를 보여줄지"를 완전히 주도하도록 합니다(여러 썸네일이 섞인
 *           UploadedGrid 같은 UI 에서 열린 이미지를 상위가 식별할 수 있어야 하기 때문).
 *         - ESC 키와 배경 클릭으로 닫을 수 있고, 이미지 자체를 눌렀을 땐 닫히지 않도록
 *           버블링을 막습니다(실수로 닫히는 걸 방지).
 *         - 포커스 트랩은 넣지 않았습니다 — 닫기 버튼 하나 + 배경 클릭 + ESC 만으로
 *           충분하고, 접근성 도구가 해석하기 더 단순합니다.
 *
 *       2026-04-27 — 모바일 / 긴 캡쳐(파노라마 형태) 가 들어오면 max-height 92vh 안에
 *         축소 표시되어 텍스트가 너무 작아 읽기 어려운 케이스가 다수. 사용자 요청에
 *         따라 **클릭+드래그 pan + 휠/버튼 zoom** 을 추가:
 *           - 휠(또는 Cmd/Ctrl+휠) 로 확대/축소
 *           - 마우스 드래그(클릭 후 움직임) 로 panning
 *           - 더블클릭으로 1×↔fit 토글
 *           - +/− 키 로 단계적 zoom (5%↑↓)
 *           - Reset 버튼 / 0 키로 초기 fit 상태 복귀
 *         배경 클릭(panning 아닌 단순 클릭)으로 닫기는 유지하되, 드래그한 후 mouseup
 *         은 닫기로 해석하지 않게 movement threshold 를 둠.
 *
 * 위치: src/components/primitives/ImageLightbox.tsx
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(11, 18, 32, 0.82);
  z-index: 1100;
  overflow: hidden;
`;

/**
 * 이미지 wrapper — pan/zoom transform 을 적용하는 div.
 * 이미지 자체보다 wrapper 에 transform 을 줘야 hit-area 가 transform 과 함께 움직여 마우스
 * 이벤트가 자연스럽게 따라옴. 또 변환 원점을 50%/50% 로 두면 마우스 위치 기준 zoom-to-cursor
 * 보다 단순하고 (너무 작은 차이라 사용자 체감엔 무관), 코드가 간단해짐.
 */
const PanZoomWrap = styled.div<{ $scale: number; $tx: number; $ty: number; $dragging: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  transform: ${({ $scale, $tx, $ty }) => `translate3d(${$tx}px, ${$ty}px, 0) scale(${$scale})`};
  transform-origin: center center;
  transition: ${({ $dragging }) =>
    $dragging ? "none" : "transform 120ms ease"};
  cursor: ${({ $dragging, $scale }) =>
    $dragging ? "grabbing" : $scale > 1 ? "grab" : "zoom-in"};
  user-select: none;
  will-change: transform;
`;

const ZoomImg = styled.img`
  display: block;
  max-width: 92vw;
  max-height: 92vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
  pointer-events: none;
  -webkit-user-drag: none;
`;

const CloseBtn = styled.button`
  position: fixed;
  top: 18px;
  right: 18px;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  cursor: pointer;
  z-index: 1101;
  font-size: 20px;
  line-height: 1;

  &:hover {
    background: rgba(255, 255, 255, 0.24);
  }
`;

/**
 * 좌측 하단의 zoom 컨트롤 + 안내. 마우스 휠 / 더블클릭 / 키보드를 모두 모르는 사용자도
 * 버튼만으로 zoom in/out/reset 할 수 있게 합니다.
 */
const ControlBar = styled.div`
  position: fixed;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 12px;
  z-index: 1101;
`;

const ControlButton = styled.button`
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;

  &:hover { background: rgba(255, 255, 255, 0.32); }
`;

const ZoomLabel = styled.span`
  min-width: 44px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
`;

const Hint = styled.span`
  color: rgba(255, 255, 255, 0.72);
  font-size: 11px;
  margin-left: 4px;
`;

interface ImageLightboxProps {
  /** 라이트박스가 열려 있는지 여부. 닫혀 있으면 아무것도 렌더하지 않습니다. */
  isOpen: boolean;
  /** 확대해 보여줄 이미지의 src. null/undefined 면 렌더하지 않습니다. */
  src?: string;
  /** 접근성 용 대체 텍스트. 보통 파일명을 넣습니다. */
  alt?: string;
  /** 닫기 요청 콜백(배경 클릭 · ESC · X 버튼 어느 경로에서든 호출). */
  onClose: () => void;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 6;
const SCALE_STEP = 0.25;
// 드래그 중 mouseup 이 "클릭 → 닫기" 로 해석되지 않도록 픽셀 임계.
const CLOSE_CLICK_THRESHOLD = 6;

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  isOpen,
  src,
  alt,
  onClose,
}) => {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const totalDelta = useRef({ x: 0, y: 0 });

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // 이미지 src 변경 또는 닫힘 시 zoom/offset 초기화. 이전 zoom 상태가 다른 이미지에 그대로
  // 적용되면 사용자 혼동을 줘서.
  // 외부 prop(src/isOpen) 에 따라 내부 zoom 상태를 "동기화" 하는 정당한 effect 케이스라
  // react-hooks/set-state-in-effect 는 의도적으로 비활성화. 호출자가 매번 key 를 바꿔
  // 리마운트하게 만들면 호출 부담이 커지므로 effect 동기화가 더 자연스럽습니다.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isOpen) reset();
  }, [isOpen, reset]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reset();
  }, [src, reset]);

  // 키보드 단축키 — ESC 닫기 / + - 확대축소 / 0 리셋.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)));
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)));
      } else if (e.key === "0") {
        e.preventDefault();
        reset();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, reset]);

  // 휠 zoom — 휠 deltaY 부호로 in/out, 부드러운 step.
  // Cmd/Ctrl 없어도 동작 (사진 뷰어 관습). 페이지 스크롤 차단.
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1;
    setScale((s) => {
      const next = +(s + dir * SCALE_STEP).toFixed(2);
      return Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
    });
  }, []);

  // 마우스 다운 — 드래그 시작
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    totalDelta.current = { x: 0, y: 0 };
  }, [offset]);

  // 마우스 이동 — pan
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const start = dragStart.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      totalDelta.current = { x: dx, y: dy };
      setOffset({ x: start.ox + dx, y: start.oy + dy });
    };
    const onUp = () => {
      setDragging(false);
      dragStart.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  // 더블클릭 — 1× ↔ 2× 토글 (간단한 fast zoom). 사용자가 한 부분을 빨리 보고 싶을 때 유용.
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setScale((s) => (s > 1 ? 1 : 2));
    if (scale > 1) setOffset({ x: 0, y: 0 });
  }, [scale]);

  // 배경(Overlay) 클릭 — 드래그가 거의 없었으면 닫기. 드래그 후 mouseup 으로 닫히는 회귀 방지.
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    // 자식 wrapper 에서 발생한 클릭은 stopPropagation 으로 여기 안 옴.
    const moved = Math.abs(totalDelta.current.x) + Math.abs(totalDelta.current.y);
    if (moved <= CLOSE_CLICK_THRESHOLD) onClose();
    totalDelta.current = { x: 0, y: 0 };
    void e;
  }, [onClose]);

  if (!isOpen || !src) return null;

  return (
    <>
      <Overlay onClick={handleOverlayClick} onWheel={handleWheel} aria-label="확대 보기">
        <PanZoomWrap
          $scale={scale}
          $tx={offset.x}
          $ty={offset.y}
          $dragging={dragging}
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
          onClick={(e) => e.stopPropagation()}
        >
          <ZoomImg src={src} alt={alt ?? ""} />
        </PanZoomWrap>
      </Overlay>
      <ControlBar onClick={(e) => e.stopPropagation()}>
        <ControlButton
          type="button"
          aria-label="축소"
          onClick={() => setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)))}
        >
          −
        </ControlButton>
        <ZoomLabel>{Math.round(scale * 100)}%</ZoomLabel>
        <ControlButton
          type="button"
          aria-label="확대"
          onClick={() => setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)))}
        >
          +
        </ControlButton>
        <ControlButton type="button" aria-label="원래 크기" onClick={reset}>
          ⤺
        </ControlButton>
        <Hint>드래그로 이동 · 더블클릭 토글</Hint>
      </ControlBar>
      <CloseBtn type="button" aria-label="닫기" onClick={onClose}>
        ×
      </CloseBtn>
    </>
  );
};
