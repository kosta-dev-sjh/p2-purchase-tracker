/**
 * 역할: 모달 레이어를 통해 보조 입력 흐름을 처리하는 공통 컴포넌트입니다.
 * 위치: src\components\modal\Modal.tsx
 */
import { useEffect, type ReactNode } from "react";
import styled from "styled-components";
import { media } from "../../tokens/breakpoints";
import { tokens } from "../../styles/tokens";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  dismissible?: boolean;
}

const Overlay = styled.button`
  position: fixed;
  inset: 0;
  background: rgba(11, 18, 32, 0.4);
  border: none;
  padding: 0;
  z-index: 1000;
  cursor: default;
`;

const ModalCard = styled.div`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 480px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  background: ${tokens.color.panel};
  border-radius: ${tokens.radius.modal};
  z-index: 1001;
  box-shadow: ${tokens.shadow.modal};
  overflow: hidden;

  ${media.mobile} {
    /* 가장 좁은 모바일(320px)에서도 화면 좌우 16px 여유가 남도록 calc 로 폭을 잡고,
       세로 스크롤이 필요한 폼 모달도 뷰포트를 넘기지 않도록 max-height 를 지정합니다. */
    width: calc(100% - 24px);
    max-width: 480px;
    max-height: calc(100vh - 24px);
  }
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 24px 28px 20px;
  flex: 0 0 auto;

  ${media.mobile} {
    /* 좁은 모바일에서 28px 좌우 패딩은 타이틀이 튀어 보이므로 18px 로 줄입니다. */
    padding: 18px 18px 14px;
  }
`;

const Title = styled.h2`
  margin: 0;
  color: ${tokens.color.ink1};
  font-size: 18px;
  font-weight: 700;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  padding: 0;
  color: ${tokens.color.ink4};
  cursor: pointer;
  font-family: inherit;
  font-size: 20px;
  line-height: 1;
`;

const Divider = styled.div`
  height: 1px;
  background: ${tokens.color.line2};
`;

const Body = styled.div`
  padding: 24px 28px 28px;
  /*
   * 폼 필드가 많아 모달이 세로로 길어지면 뷰포트를 넘는 경우가 있습니다.
   * ModalCard 자체에 max-height/flex 를 걸어 두었으므로, 본문에서 overflow-y 를 허용해
   * 내부 스크롤만 생기도록 합니다. overflow-x 는 숨겨서 수평 스크롤바가 뜨는 것을 차단.
   */
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;

  ${media.mobile} {
    padding: 18px 18px 20px;
  }
`;

export const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  dismissible = true,
}: ModalProps) => {
  // 접근성: ESC 로 모달 닫기 (모바일 키보드/접근성 키패드에서도 자연스럽게 동작).
  // dismissible=false 인 경우(저장 진행 중 등) 닫지 않음.
  useEffect(() => {
    if (!isOpen || !dismissible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, dismissible, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <Overlay
        type="button"
        aria-label={dismissible ? "모달 닫기" : "모달 배경"}
        onClick={dismissible ? onClose : undefined}
      />
      <ModalCard role="dialog" aria-modal="true" aria-label={title}>
        <Header>
          <Title>{title}</Title>
          {dismissible ? (
            <CloseButton type="button" aria-label="닫기" onClick={onClose}>
              ×
            </CloseButton>
          ) : null}
        </Header>
        <Divider />
        <Body>{children}</Body>
      </ModalCard>
    </>
  );
};
