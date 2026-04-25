/**
 * 역할: OcrEdit 에서 "+ 이미지 추가" 를 눌렀을 때 나오는 모달.
 *       기존에는 `/ocr-upload` 로 navigate 한 뒤 append 모드로 재분석을 돌리고 돌아왔지만,
 *       편집 중 이미지를 덧붙일 때마다 페이지가 통째로 갈아치워져 편집 중이던 주문 필드
 *       스크롤/포커스가 날아가는 문제가 있었습니다. 이 모달은 편집 화면 위에 띄워진 채로
 *       플랫폼 선택 → 업로드 → 분석 진행률 → 완료의 흐름을 한 자리에서 처리하고, 분석이
 *       끝나면 새로 생긴 OcrImageItem 들만 상위에 돌려 줍니다(append).
 *
 *       재사용 컴포넌트 구성:
 *         - PlatformSelect / UploadZone / UploadedGrid   → OcrUpload 의 세 컴포넌트 재활용
 *         - analyzeUploadedImages (utils)                → OcrUpload 와 동일한 파이프라인
 *         - AnalysisProgressModal                         → 분석 중 진행률 UI
 *
 *       즉 OcrUpload 의 "분석 시작" 직후 로직을 그대로 가져다 쓰면서, 분석 결과를
 *       store 에 밀어 넣지 않고 onComplete 콜백으로만 돌려 주는 점이 다릅니다.
 *
 * 위치: src/pages/OcrEdit/components/AddImagesModal.tsx
 */
import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { Modal } from "../../../components/modal/Modal";
import { Button } from "../../../components/primitives/Button";
import { PLATFORM_LABELS } from "../../../constants/labels";
import { tokens } from "../../../styles/tokens";
import { media } from "../../../tokens/breakpoints";
import {
  PlatformSelect,
  type Platform,
} from "../../OcrUpload/components/PlatformSelect";
import { UploadZone } from "../../OcrUpload/components/UploadZone";
import { UploadedGrid } from "../../OcrUpload/components/UploadedGrid";
import {
  AnalysisProgressModal,
  type AnalysisProgress,
} from "../../OcrUpload/components/AnalysisProgressModal";
import type { UploadedImage } from "../../OcrUpload/data";
import type { OcrImageItem } from "../data";
import { analyzeUploadedImages } from "../../../utils/ocrAnalyzeImages";

/**
 * 한 OCR 세션(= OcrUpload 초기 배치 + OcrEdit 에서 추가한 것까지) 누적 이미지 상한.
 * OcrUpload 와 동일한 5 를 사용해, 사용자가 어느 경로로 들어가도 같은 상한을 가진다는
 * 멘탈 모델을 유지합니다.
 *
 * 2026-04-23: 이전에는 이 모달이 "한 번에 5장"을 로컬 기준으로 잡고 있어, 이미 OcrEdit 에
 * 5장이 들어와 있는 상태에서도 5장을 더 올릴 수 있는 버그가 있었습니다. 이제 existingCount
 * 를 받아 MAX_IMAGES - existingCount 만큼만 이번 모달에서 추가할 수 있도록 상한을 공유합니다.
 */
const MAX_IMAGES = 5;

const Stack = styled.div`
  display: grid;
  gap: 14px;
`;

const Footer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 6px;

  .count {
    color: ${tokens.color.ink4};
    font-size: 12px;
    line-height: 1.5;
  }

  .count strong {
    color: ${tokens.color.ink2};
    font-weight: 700;
  }

  ${media.mobile} {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  flex-shrink: 0;

  ${media.mobile} {
    width: 100%;
    && > * {
      flex: 1;
      min-width: 0;
      padding: 0 14px;
      white-space: nowrap;
    }
  }
`;

interface AddImagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * 현재 OcrEdit 에 이미 들어와 있는 이미지 개수.
   * 이 값만큼 MAX_IMAGES 상한에서 차감한 뒤 "이번 모달에서 몇 장까지 더 받을지"를 계산합니다.
   */
  existingCount: number;
  /** 분석이 완료된 새 OcrImageItem 배열. 상위에서 기존 images 뒤에 append 합니다. */
  onComplete: (newImages: OcrImageItem[]) => void;
}

export const AddImagesModal: React.FC<AddImagesModalProps> = ({
  isOpen,
  onClose,
  existingCount,
  onComplete,
}) => {
  /**
   * 이 모달에서 추가할 수 있는 최대 장수.
   * 기존 이미지 수가 이미 상한을 넘어 있으면 0 으로 clamp 해 업로드존을 비활성화 합니다.
   */
  const remainingCapacity = Math.max(0, MAX_IMAGES - existingCount);
  const [platform, setPlatform] = useState<Platform>("coupang");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress>({
    currentIndex: 0,
    totalCount: 0,
    currentFileName: "",
    currentThumbUrl: undefined,
    currentPlatform: undefined,
    currentProgress: 0,
    currentStatus: "",
  });

  /**
   * 모달이 새로 열릴 때마다 내부 상태를 비웁니다. 분석 도중 사용자가 모달을 닫아도
   * 다음 번 열 때는 깨끗한 상태가 되도록 하기 위함입니다. isAnalyzing 이 true 인
   * 동안은 Modal 의 close 버튼을 숨기는 식으로 중단을 막는 건 아니지만, 루프가
   * 유저 눈에 안 보이는 상태로 계속 돌아도 onComplete 만 호출되지 않으면 상위
   * images 에는 아무 영향 없습니다.
   */
  useEffect(() => {
    if (isOpen) {
      setImages([]);
      setPlatform("coupang");
      setIsAnalyzing(false);
    }
  }, [isOpen]);

  const handleFileSelect = (files: File[]) => {
    setImages((current) => {
      // MAX_IMAGES 가 아니라 remainingCapacity 기준 — 이번 모달 버퍼가 아니라
      // 세션 전체 상한에서 남은 슬롯만큼만 받습니다.
      const remainingSlots = remainingCapacity - current.length;
      if (remainingSlots <= 0) return current;

      const filesToAdd = files.slice(0, remainingSlots);
      const newImages = filesToAdd.map((file, index) => ({
        id: `add-${Date.now()}-${index}`,
        thumbUrl: URL.createObjectURL(file),
        fileName: file.name,
        sizeLabel: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        status: "ready" as const,
        platform,
        file,
      }));
      return [...current, ...newImages];
    });
  };

  const handleRemove = (id: string) => {
    setImages((current) => current.filter((image) => image.id !== id));
  };

  const runAnalysis = async () => {
    if (images.length === 0 || isAnalyzing) return;
    setIsAnalyzing(true);
    try {
      const processed = await analyzeUploadedImages(images, (event) => {
        setAnalysisProgress(event);
      });
      // 결과는 상위에서 기존 images 뒤에 append 하도록 콜백으로만 돌려줍니다.
      onComplete(processed);
    } catch (error) {
      console.error("이미지 추가 분석 실패:", error);
      alert("이미지 분석 중 오류가 발생했습니다.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const platformCounts = useMemo(() => {
    const counts: Partial<Record<Platform, number>> = {};
    for (const image of images) {
      counts[image.platform] = (counts[image.platform] ?? 0) + 1;
    }
    return counts;
  }, [images]);

  const atCapacity = images.length >= remainingCapacity;

  return (
    <>
      <Modal
        isOpen={isOpen && !isAnalyzing}
        onClose={onClose}
        title="이미지 추가"
      >
        <Stack>
          <PlatformSelect value={platform} onChange={setPlatform} />
          <UploadZone
            acceptedTypes="PNG, JPG, WEBP"
            maxSize="10MB"
            maxCount={remainingCapacity}
            activePlatformLabel={PLATFORM_LABELS[platform]}
            disabled={atCapacity || remainingCapacity === 0}
            currentCount={images.length}
            onPick={handleFileSelect}
          />
          {images.length > 0 && (
            <UploadedGrid images={images} onRemove={handleRemove} />
          )}
          <Footer>
            <span className="count">
              {remainingCapacity === 0 ? (
                <>
                  이미 <strong>{existingCount}/{MAX_IMAGES}</strong>장이라 더 추가할 수 없어요. 삭제 후 다시 추가해 주세요.
                </>
              ) : (
                <>
                  추가할 이미지 <strong>{images.length}/{remainingCapacity}</strong>
                  <span style={{ opacity: 0.7 }}> · 세션 총 {existingCount + images.length}/{MAX_IMAGES}</span>
                  {images.length > 0 && (
                    <>
                      {" · "}
                      {(Object.keys(platformCounts) as Platform[])
                        .map((p) => `${PLATFORM_LABELS[p]} ${platformCounts[p]}장`)
                        .join(", ")}
                    </>
                  )}
                </>
              )}
            </span>
            <Actions>
              <Button variant="ghost" size="md" onClick={onClose}>
                취소
              </Button>
              <Button
                variant="primary"
                size="md"
                disabled={images.length === 0}
                onClick={runAnalysis}
              >
                분석 시작하기
              </Button>
            </Actions>
          </Footer>
        </Stack>
      </Modal>
      {/*
        분석 중에는 메인 업로드 모달을 숨기고 진행률 모달만 띄웁니다. 두 모달이
        시각적으로 겹치지 않도록 isOpen 조건을 분리했어요. isAnalyzing 이 끝나는
        시점(성공/실패 무관)에 onComplete 혹은 alert 로 흐름이 갈려, 다음 렌더에서
        둘 다 자연스럽게 닫힙니다.
      */}
      <AnalysisProgressModal
        isOpen={isOpen && isAnalyzing}
        progress={analysisProgress}
      />
    </>
  );
};
