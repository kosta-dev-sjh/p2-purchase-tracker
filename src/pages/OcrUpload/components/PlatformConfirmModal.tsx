/**
 * 역할: "분석 시작하기"를 누른 직후, 업로드된 이미지 각각에 어떤 플랫폼 태그가
 *       찍혀 있는지 한 번에 보여주고 수정받는 확인 모달입니다.
 *
 *       도입 배경: PlatformSelect의 초기값이 coupang이라서, 사용자가 플랫폼을
 *       한 번도 건드리지 않고 바로 이미지를 올리면 모든 이미지가 "coupang"으로
 *       묵시 태깅됩니다. 이 모달은 분석이라는 무거운 작업 직전에 한 번 더
 *       "이 태그로 맞아요?"를 물어 잘못된 배치가 그대로 파서를 타는 일을 막습니다.
 *
 *       정책:
 *         - 모달은 분석 경로마다 항상 같은 톤의 "최종 확인" 단계로 동작합니다.
 *           (기본값으로 올렸는지 여부를 탐지하는 경고 배너는 두지 않습니다.
 *           업로드 시점의 PlatformHint와 모달 자체가 이미 두 번의 안내를 하고 있어,
 *           세 번째 경고는 중복이자 묵시적인 비난 톤이 되기 쉬웠습니다.)
 *         - 모든 이미지가 같은 플랫폼이면 상단에 "모두 ○○로 바꾸기" 일괄 칩을
 *           노출합니다. 플랫폼이 섞여 있을 때는 사용자가 의도적으로 나눠 올린
 *           케이스일 수 있어 일괄 액션을 숨겨 실수 방지 쪽을 우선합니다.
 *         - 취소는 비파괴적 — 이미지 배열은 유지하고 모달만 닫습니다.
 *           사용자는 OcrUpload 화면으로 돌아가 계속 편집/업로드할 수 있습니다.
 *
 * 위치: src\pages\OcrUpload\components\PlatformConfirmModal.tsx
 */
import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { Modal } from "../../../components/modal/Modal";
import { Button } from "../../../components/primitives/Button";
import { PLATFORM_LABELS } from "../../../constants/labels";
import { tokens } from "../../../styles/tokens";
import { media } from "../../../tokens/breakpoints";
import type { UploadedImage } from "../data";
import type { Platform } from "./PlatformSelect";

/**
 * 모달에서 선택할 수 있는 플랫폼 집합.
 * PlatformSelect와 동일한 OCR 파서 지원 목록만 노출합니다(쿠팡/네이버).
 */
const SELECTABLE_PLATFORMS: readonly Platform[] = ["coupang", "naver"];

const Description = styled.p`
  margin: 0 0 16px;
  color: ${tokens.color.ink3};
  font-size: 13px;
  line-height: 1.6;
`;

/**
 * 일괄 변경 영역. 이미지 수가 2장 이상이고 모든 이미지가 같은 플랫폼일 때만 보입니다.
 * "일단 기본값 그대로 다 올렸는데 사실은 전부 네이버였어요" 같은 흔한 패턴을
 * 한 번의 클릭으로 고칠 수 있도록 하는 편의 액션입니다.
 */
const BulkRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 12px;
  border: 1px dashed ${tokens.color.line};
  border-radius: ${tokens.radius.card};
  background: ${tokens.color.foot};

  .label {
    color: ${tokens.color.ink3};
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
`;

const List = styled.div`
  display: grid;
  gap: 10px;
  margin-bottom: 16px;
`;

const Row = styled.div`
  /*
   * 한 줄에 썸네일 · 파일명 · 칩 3개를 모두 밀어 넣는 구조는 "네이버쇼핑" 라벨이
 * 길어서 모달 폭(≈480px)에서도 맨 뒤 칩이 잘려 보이지 않는 문제가
   * 있었습니다.
   *   - flex-wrap을 허용하면 한두 개 칩만 다음 줄로 튕겨 레이아웃이 어그러지고,
   *   - flex-wrap을 끄면 넘치는 부분이 그대로 오버플로우로 가려집니다.
   *
   * 그래서 구조를 "1행: 썸네일 + 파일명, 2행: 칩 4개 풀-폭"으로 고정했습니다.
   * 데스크톱/모바일 모두 같은 규칙을 써서 폭에 따라 층이 바뀌지 않고, 네 칩이
   * 항상 한 줄에 균등하게 놓입니다.
   */
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  row-gap: 10px;
  column-gap: 12px;
  padding: 10px 12px;
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.card};
  background: ${tokens.color.panel};

  .thumb {
    flex: 0 0 auto;
    width: 40px;
    height: 40px;
    border-radius: 6px;
    background: ${tokens.color.foot};
    object-fit: cover;
    display: block;
  }

  .meta {
    /* 썸네일과 같은 줄에서 남은 폭을 모두 차지해 .chips를 다음 줄로 밀어냅니다. */
    flex: 1 1 0;
    min-width: 0;

    .name {
      color: ${tokens.color.ink1};
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .size {
      color: ${tokens.color.ink4};
      font-size: 11px;
      margin-top: 2px;
    }
  }

  .chips {
    /* flex-basis 100%로 새 줄 전체를 차지. padding-left는 썸네일(40px) + gap(12px)
     * 만큼 들여써 파일명과 시선 흐름을 맞춥니다. */
    flex: 1 0 100%;
    display: flex;
    gap: 6px;
    justify-content: flex-start;
    padding-left: 52px;
  }

  ${media.mobile} {
    .chips {
      /* 좁은 모바일에서는 들여쓰기만큼도 빠듯하므로 0으로 돌려 칩을 왼쪽 끝에 붙입니다. */
      padding-left: 0;
    }
  }
`;

/**
 * 플랫폼 선택 칩. PlatformSelect의 Option과 같은 색/보더 규칙을 공유해
 * 한 화면 안에서 두 컴포넌트의 시각적 일관성을 유지합니다.
 */
const PlatformChip = styled.button<{ $on?: boolean }>`
  padding: 5px 10px;
  border: 1px solid
    ${({ $on }) => ($on ? tokens.color.accentBorder : tokens.color.line)};
  border-radius: 999px;
  background: ${({ $on }) =>
    $on ? tokens.color.accentSubtle : tokens.color.panel};
  color: ${({ $on }) => ($on ? tokens.color.accentHover : tokens.color.ink2)};
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  transition:
    background ${tokens.motion.fast},
    border-color ${tokens.motion.fast},
    color ${tokens.motion.fast};

  &:hover {
    background: ${({ $on }) =>
      $on ? tokens.color.accentSubtle : tokens.color.tint};
  }
`;

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;

  > button {
    min-width: 96px;
  }
`;

interface PlatformConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: UploadedImage[];
  /**
   * 확인 시 호출됩니다. 모달 내에서 수정한 최종 플랫폼 태그가 반영된
   * 이미지 배열을 반환하고, 실제 OCR 분석은 호출부에서 이어받습니다.
   */
  onConfirm: (updatedImages: UploadedImage[]) => void;
}

export const PlatformConfirmModal: React.FC<PlatformConfirmModalProps> = ({
  isOpen,
  onClose,
  images,
  onConfirm,
}) => {
  /**
   * 모달 내부 draft. 사용자가 확인을 누르기 전까지는 상위 images state를
   * 건드리지 않아야 취소가 깔끔합니다.
   *
   * 모달이 다시 열릴 때(새로운 분석 시도)마다 images의 최신 스냅샷으로
   * 초기화합니다.
   */
  const [draft, setDraft] = useState<UploadedImage[]>(images);

  useEffect(() => {
    if (isOpen) {
      setDraft(images);
    }
  }, [isOpen, images]);

  const handleRowChange = (id: string, next: Platform) => {
    setDraft((prev) =>
      prev.map((image) =>
        image.id === id ? { ...image, platform: next } : image
      )
    );
  };

  const handleBulkChange = (next: Platform) => {
    setDraft((prev) => prev.map((image) => ({ ...image, platform: next })));
  };

  const handleConfirm = () => {
    onConfirm(draft);
  };

  // 일괄 액션 노출 조건: 이미지 2장 이상 + 모두 같은 플랫폼.
  // 섞여 있는 경우에는 사용자가 의도적으로 나눠 태깅했을 가능성이 높아 일괄 버튼은 숨깁니다.
  const uniquePlatforms = Array.from(
    new Set(draft.map((image) => image.platform))
  );
  const showBulk = draft.length >= 2 && uniquePlatforms.length === 1;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="이 태그가 맞나요?">
      <Description>
        분석을 시작하기 전에 각 이미지의 플랫폼 태그를 확인해 주세요. 틀린 태그는
        각 이미지 오른쪽에서 바로 바꿀 수 있어요.
      </Description>

      {showBulk && (
        <BulkRow>
          <span className="label">모두 한 번에 바꾸기</span>
          <div className="chips">
            {SELECTABLE_PLATFORMS.map((platform) => {
              const isCurrent = uniquePlatforms[0] === platform;
              return (
                <PlatformChip
                  key={platform}
                  type="button"
                  $on={isCurrent}
                  onClick={() => handleBulkChange(platform)}
                >
                  {PLATFORM_LABELS[platform]}
                </PlatformChip>
              );
            })}
          </div>
        </BulkRow>
      )}

      <List>
        {draft.map((image) => (
          <Row key={image.id}>
            {image.thumbUrl ? (
              <img
                className="thumb"
                src={image.thumbUrl}
                alt={image.fileName}
              />
            ) : (
              <div className="thumb" aria-hidden="true" />
            )}
            <div className="meta">
              <div className="name" title={image.fileName}>
                {image.fileName}
              </div>
              <div className="size">{image.sizeLabel}</div>
            </div>
            <div className="chips">
              {SELECTABLE_PLATFORMS.map((platform) => (
                <PlatformChip
                  key={platform}
                  type="button"
                  $on={image.platform === platform}
                  onClick={() => handleRowChange(image.id, platform)}
                >
                  {PLATFORM_LABELS[platform]}
                </PlatformChip>
              ))}
            </div>
          </Row>
        ))}
      </List>

      <Footer>
        <Button variant="ghost" size="md" onClick={onClose}>
          취소
        </Button>
        <Button variant="primary" size="md" onClick={handleConfirm}>
          확인하고 분석 시작
        </Button>
      </Footer>
    </Modal>
  );
};
