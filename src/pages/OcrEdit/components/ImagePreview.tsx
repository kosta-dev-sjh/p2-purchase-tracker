/**
 * 역할: OcrEdit 3단 레이아웃 중 "중앙 미리보기" 카드. 선택된 이미지의 원본 캡쳐를
 *       보여 주고, 텍스트가 작아 잘 안 읽힌다는 피드백에 맞춰 이미지 클릭 시
 *       화면 전체 오버레이(라이트박스)로 확대해 볼 수 있게 확장했습니다.
 *
 *       라이트박스 정책:
 *         - 카드 안에 축소해 둔 미리보기는 OCR 결과 검토 흐름에서 "대충 이 캡쳐 맞나"만
 *           보여 주는 역할이고, 실제 원문 대조는 확대 뷰에서 이뤄집니다. 그래서 썸네일
 *           영역을 통째로 클릭 가능한 버튼으로 감싸고, 확대 뷰에서는 여백을 최소화해
 *           뷰포트의 90% 가까이 쓰게 했습니다.
 *         - Modal 공통 컴포넌트는 480px 카드 기준이라 이미지 확대용으로는 폭이 좁아,
 *           별도의 오버레이를 이 파일 안에 두는 쪽을 택했습니다. (다른 화면에서 같은
 *           형태가 필요해지면 그때 components/modal 아래로 승격.)
 *         - 접근성: ESC로 닫기, 배경 클릭으로 닫기, 포커스 트랩 없이 단일 버튼으로 단순화.
 *
 * 위치: src\pages\OcrEdit\components\ImagePreview.tsx
 */
import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { Card, CardBd } from "../../../components/primitives/Card";
import { tokens } from "../../../styles/tokens";
import type { OcrImageItem } from "../data";

const Wrap = styled(Card)`
  min-height: 480px;
`;

const Body = styled(CardBd)`
  display: grid;
  min-height: 480px;
  place-items: center;
  padding: 0;
`;

const Empty = styled.div`
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 40px;
  color: ${tokens.color.ink4};
  font-size: 13px;

  svg {
    width: 40px;
    height: 40px;
    opacity: 0.5;
  }
`;

/**
 * 썸네일 버튼. img를 그대로 두면 키보드/스크린리더에서 "클릭 가능"이 드러나지 않아,
 * 표면적으로는 button으로 감싸되 시각적으로는 테두리 없는 투명 컨테이너로 둡니다.
 * 호버 시 미세한 톤 변화로 "클릭 가능"이라는 신호만 줍니다.
 */
const Trigger = styled.button`
  appearance: none;
  border: none;
  background: transparent;
  padding: 0;
  cursor: zoom-in;
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;

  &:hover img {
    opacity: 0.92;
  }

  &:focus-visible {
    outline: 2px solid ${tokens.color.accent};
    outline-offset: 2px;
  }
`;

const Img = styled.img`
  display: block;
  max-width: 100%;
  max-height: 480px;
  object-fit: contain;
  transition: opacity ${tokens.motion.fast} ease;
`;

const Overlay = styled.button`
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(11, 18, 32, 0.82);
  border: none;
  cursor: zoom-out;
  z-index: 1100;
`;

const ZoomImg = styled.img`
  display: block;
  max-width: 92vw;
  max-height: 92vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
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

const EmptyIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

export const ImagePreview: React.FC<{ image?: OcrImageItem }> = ({ image }) => {
  const [isZoomed, setIsZoomed] = useState(false);

  // 이미지가 바뀌면 이전 확대 뷰를 닫아 줍니다(선택 변경 시 자연스럽게 초기화).
  useEffect(() => {
    setIsZoomed(false);
  }, [image?.id]);

  // ESC로 닫기 — 라이트박스가 열려 있을 때만 리스너를 붙여 다른 화면의 키 핸들링을 방해하지 않습니다.
  useEffect(() => {
    if (!isZoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsZoomed(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isZoomed]);

  return (
    <>
      <Wrap>
        <Body>
          {image?.thumbUrl ? (
            <Trigger
              type="button"
              onClick={() => setIsZoomed(true)}
              aria-label={`${image.fileName} 확대해서 보기`}
            >
              <Img src={image.thumbUrl} alt={image.fileName} />
            </Trigger>
          ) : (
            <Empty>
              <EmptyIcon />
              <span>이미지 목록에서 선택하세요</span>
            </Empty>
          )}
        </Body>
      </Wrap>

      {isZoomed && image?.thumbUrl && (
        <>
          <Overlay
            type="button"
            aria-label="확대 보기 닫기"
            onClick={() => setIsZoomed(false)}
          >
            <ZoomImg
              src={image.thumbUrl}
              alt={image.fileName}
              onClick={(e) => e.stopPropagation()}
            />
          </Overlay>
          <CloseBtn
            type="button"
            aria-label="닫기"
            onClick={() => setIsZoomed(false)}
          >
            ×
          </CloseBtn>
        </>
      )}
    </>
  );
};
