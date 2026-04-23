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
 * 위치: src/components/primitives/ImageLightbox.tsx
 */
import React, { useEffect } from "react";
import styled from "styled-components";

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

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  isOpen,
  src,
  alt,
  onClose,
}) => {
  // ESC로 닫기 — 라이트박스가 열려 있을 때만 리스너를 붙여 다른 화면의 키 핸들링을 방해하지 않습니다.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !src) return null;

  return (
    <>
      <Overlay type="button" aria-label="확대 보기 닫기" onClick={onClose}>
        <ZoomImg
          src={src}
          alt={alt ?? ""}
          // 이미지 자체를 눌렀을 땐 닫히지 않도록 버블링을 막습니다(실수 방지).
          onClick={(e) => e.stopPropagation()}
        />
      </Overlay>
      <CloseBtn type="button" aria-label="닫기" onClick={onClose}>
        ×
      </CloseBtn>
    </>
  );
};
