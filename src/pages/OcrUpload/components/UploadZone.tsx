/**
 * 역할: OCR 업로드의 드롭 존. 클릭/드롭으로 이미지를 고르는 것 외에,
 *       "지금 이 버튼을 누르면 어떤 플랫폼 태그로 이미지가 찍히는가"를 함께 보여 줍니다.
 *       최대 매수에 도달했을 때는 disabled 상태로 렌더해 상위 상태와 싱크를 맞춥니다.
 * 위치: src\pages\OcrUpload\components\UploadZone.tsx
 */
import React, { useRef, useState } from "react";
import styled, { css } from "styled-components";
import { tokens } from "../../../styles/tokens";

/**
 * 이미지 드래그앤드랍 수용 MIME/확장자 화이트리스트.
 * accept 속성과 일치시켜 파일 선택/드롭에서 동일 기준으로 필터링합니다.
 */
const ACCEPTED_IMAGE_MIME = ["image/png", "image/jpeg", "image/webp"];
const ACCEPTED_IMAGE_EXT = [".png", ".jpg", ".jpeg", ".webp"];

const isImageFile = (file: File): boolean => {
  if (ACCEPTED_IMAGE_MIME.includes(file.type)) return true;
  // 일부 브라우저/운영체제에서 file.type이 비어 오는 경우가 있어 확장자로도 한번 더 판정.
  const lower = file.name.toLowerCase();
  return ACCEPTED_IMAGE_EXT.some((ext) => lower.endsWith(ext));
};

const Zone = styled.div<{ $disabled?: boolean; $active?: boolean }>`
  padding: 40px 24px;
  background: ${({ $active }) =>
    $active ? tokens.color.accentSubtle : tokens.color.foot};
  border: 1.5px dashed
    ${({ $active }) => ($active ? tokens.color.accent : tokens.color.line)};
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
  /** 현재까지 업로드된 장수. 드롭 시 "남은 슬롯" 계산에 사용합니다. */
  currentCount?: number;
  onPick: (files: File[]) => void;
}> = ({
  acceptedTypes,
  maxSize,
  maxCount,
  activePlatformLabel,
  disabled,
  currentCount = 0,
  onPick,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 드래그 중인지 상태 — Zone 테두리/배경을 강조해 "여기에 놓으면 됩니다" 단서를 줍니다.
  const [isDragging, setIsDragging] = useState(false);
  // 드래그앤드랍 시 슬롯 초과·비이미지 같은 일회성 안내를 위한 로컬 경고.
  const [dropNotice, setDropNotice] = useState<string | null>(null);

  const handleClick = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

  /**
   * FileList → File[] 로 정규화하면서 다음을 한 번에 처리합니다.
   *  - 이미지가 아닌 파일은 제외하고 notice로 남김
   *  - 남은 슬롯(maxCount - currentCount) 만큼만 잘라 onPick에 전달
   *  - 초과한 파일 수는 사용자에게 보이도록 notice로 남김
   */
  const normalizeAndPick = (rawFiles: File[]) => {
    if (disabled) return;

    const notices: string[] = [];

    // 1) 이미지 MIME/확장자 필터
    const imageFiles = rawFiles.filter(isImageFile);
    const droppedNonImage = rawFiles.length - imageFiles.length;
    if (droppedNonImage > 0) {
      notices.push(`이미지가 아닌 파일 ${droppedNonImage}개는 제외됐어요`);
    }
    if (imageFiles.length === 0) {
      if (notices.length > 0) setDropNotice(notices.join(" · "));
      return;
    }

    // 2) 남은 슬롯만큼만 수용
    const remainingSlots = Math.max(0, maxCount - currentCount);
    const accepted = imageFiles.slice(0, remainingSlots);
    const overflow = imageFiles.length - accepted.length;
    if (overflow > 0) {
      notices.push(`최대 ${maxCount}장까지만 올릴 수 있어요 (${overflow}장 제외)`);
    }

    if (accepted.length > 0) {
      onPick(accepted);
    }
    setDropNotice(notices.length > 0 ? notices.join(" · ") : null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      normalizeAndPick(Array.from(e.target.files));
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // ── 드래그앤드랍 핸들러 ────────────────────────────────────────
  // preventDefault가 없으면 브라우저가 이미지를 새 탭으로 열어버리므로 dragover/drop 둘 다 차단.
  const handleDragOver = (e: React.DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // dragleave가 자식 요소 전환에도 발동하므로, currentTarget 바깥으로 나갔을 때만 해제.
    const related = e.relatedTarget as Node | null;
    if (!related || !e.currentTarget.contains(related)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    normalizeAndPick(files);
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
      <Zone
        $disabled={disabled}
        $active={isDragging}
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <IconBox>
          <UpIcon />
        </IconBox>
        <Title>
          {disabled
            ? `이미 ${maxCount}장까지 올렸어요`
            : isDragging
              ? "여기에 놓으면 바로 업로드돼요"
              : "여러 장의 주문내역 캡처를 한 번에 업로드해 보세요"}
        </Title>
        <Sub>
          {acceptedTypes} · 최대 {maxSize} · 한 번에 {maxCount}장까지 분석할 수 있어요
          <br />
          파일을 끌어다 놓거나 아래 버튼으로 선택하세요.
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
        {dropNotice && (
          <div
            style={{
              marginTop: 10,
              color: tokens.color.warn,
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            {dropNotice}
          </div>
        )}
      </Zone>
    </>
  );
};
