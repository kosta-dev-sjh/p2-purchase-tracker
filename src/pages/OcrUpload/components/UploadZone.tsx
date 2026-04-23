/**
 * 역할: OCR 업로드의 드롭 존. 클릭/드롭으로 이미지를 고르는 것 외에,
 *       "지금 이 버튼을 누르면 어떤 플랫폼 태그로 이미지가 찍히는가"를 함께 보여 줍니다.
 *       최대 매수에 도달했을 때는 disabled 상태로 렌더해 상위 상태와 싱크를 맞춥니다.
 * 위치: src\pages\OcrUpload\components\UploadZone.tsx
 */
import React, { useRef } from "react";
import styled, { css } from "styled-components";
import { tokens } from "../../../styles/tokens";

const Zone = styled.div<{ $disabled?: boolean }>`
  padding: 40px 24px;
  background: ${tokens.color.foot};
  border: 1.5px dashed ${tokens.color.line};
  border-radius: ${tokens.radius.card};
  text-align: center;
  cursor: pointer;
  transition: border-color ${tokens.motion.fast}, background ${tokens.motion.fast};

  &:hover {
    border-color: ${tokens.color.accent};
    background: ${tokens.color.accentSubtle};
  }

  ${({ $disabled }) =>
    $disabled &&
    css`
      cursor: not-allowed;
      opacity: 0.6;

      &:hover {
        border-color: ${tokens.color.line};
        background: ${tokens.color.foot};
      }
    `}
`;

const IconBox = styled.div`
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  margin: 0 auto 14px;
  border-radius: 50%;
  background: ${tokens.color.accentSubtle};
  color: ${tokens.color.accent};

  svg {
    width: 20px;
    height: 20px;
  }
`;

const Title = styled.div`
  margin-bottom: 4px;
  color: ${tokens.color.ink1};
  font-size: 14px;
  font-weight: 600;
`;

const Sub = styled.div`
  margin-bottom: 8px;
  color: ${tokens.color.ink4};
  font-size: ${tokens.type.caption.size};
`;

/**
 * "지금 이 플랫폼 태그로 올라갑니다"를 버튼 바로 위에 노출해,
 * PlatformSelect에서 고른 값이 업로드 액션에 직접 영향을 준다는 인과관계를 강조합니다.
 */
const PlatformHint = styled.div`
  margin: 0 auto 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid ${tokens.color.accentBorder};
  border-radius: 999px;
  background: ${tokens.color.accentSubtle};
  color: ${tokens.color.accentHover};
  font-size: 11.5px;
  font-weight: 600;
`;

const PickButton = styled.button<{ $disabled?: boolean }>`
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: ${tokens.color.accent};
  color: #fff;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;

  &:hover {
    background: ${tokens.color.accentHover};
  }

  ${({ $disabled }) =>
    $disabled &&
    css`
      cursor: not-allowed;
      background: ${tokens.color.line};
      color: ${tokens.color.ink4};

      &:hover {
        background: ${tokens.color.line};
      }
    `}
`;

const UpIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

export const UploadZone: React.FC<{
  acceptedTypes: string;
  maxSize: string;
  maxCount: number;
  /** 현재 선택된 플랫폼 라벨. "쿠팡" 같은 한글 라벨을 받아 그대로 표시합니다. */
  activePlatformLabel?: string;
  /** 최대 매수 도달 시 상위에서 true로 넘겨 클릭을 차단합니다. */
  disabled?: boolean;
  onPick: (files: File[]) => void;
}> = ({ acceptedTypes, maxSize, maxCount, activePlatformLabel, disabled, onPick }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onPick(Array.from(e.target.files));
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        multiple
        accept=".png,.jpg,.jpeg,.webp"
        onChange={handleFileChange}
      />
      <Zone $disabled={disabled} onClick={handleClick}>
        <IconBox>
        <UpIcon />
      </IconBox>
      <Title>
        {disabled
          ? `이미 ${maxCount}장까지 올렸어요`
          : "여러 장의 주문내역 캡처를 한 번에 업로드해 보세요"}
      </Title>
      <Sub>
        {acceptedTypes} · 최대 {maxSize} · 한 번에 {maxCount}장까지 분석할 수 있어요
      </Sub>
      {activePlatformLabel && !disabled && (
        <PlatformHint>
          이번 업로드는 <strong>{activePlatformLabel}</strong> 태그로 저장돼요
        </PlatformHint>
      )}
      <PickButton
        type="button"
        $disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          handleClick();
        }}
      >
        {disabled ? "더 올리려면 기존 이미지를 먼저 지워주세요" : "파일 선택하기"}
      </PickButton>
    </Zone>
    </>
  );
};
