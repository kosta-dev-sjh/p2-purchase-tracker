/**
 * 역할: OCR 업로드 화면의 상태와 레이아웃을 조립하는 페이지 진입 파일입니다.
 *
 *       업로드 흐름은 "배치 단위"로 설계돼 있습니다. 사용자는 플랫폼을 고른 뒤 그 플랫폼의
 *       캡쳐 여러 장을 한 번에 올리고, 필요하면 플랫폼을 바꿔 다른 몰의 캡쳐를 이어서 올릴 수
 *       있습니다. 각 이미지는 "업로드 시점에 선택돼 있던 플랫폼"을 태그로 지니며, 이 태그는
 *       UploadedGrid의 뱃지와 OcrEdit의 image.platform으로 그대로 이어집니다.
 *
 *       플랫폼 선택 카드는 페이지 상단이 아니라 업로드 영역 바로 위에 둬, "지금 고른 플랫폼이
 *       바로 이 업로드 버튼을 눌렀을 때 찍힌다"는 점을 시각적으로 붙여 인지시킵니다.
 * 위치: src\pages\OcrUpload\index.tsx
 */
import React, { useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import styled from "styled-components";
import { AppShell } from "../../components/layout/AppShell";
import { Button } from "../../components/primitives/Button";
import { PLATFORM_LABELS } from "../../constants/labels";
import { tokens } from "../../styles/tokens";
import { media } from "../../tokens/breakpoints";
import { PlatformSelect, type Platform } from "./components/PlatformSelect";
import { UploadZone } from "./components/UploadZone";
import { UploadedGrid } from "./components/UploadedGrid";
import { GuideCard } from "./components/GuideCard";
import { PlatformConfirmModal } from "./components/PlatformConfirmModal";
import {
  AnalysisProgressModal,
  type AnalysisProgress,
} from "./components/AnalysisProgressModal";
import { OCR_UPLOAD_GUIDE, type UploadedImage } from "./data";
import { ALLOWED_IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from "../../constants/inputLimits";
import { ocrStore } from "../../stores/ocrStore";
import { analyzeUploadedImages } from "../../utils/ocrAnalyzeImages";
import type { OcrImageItem } from "../OcrEdit/data";
import { Modal } from "../../components/modal/Modal";
import { createThumbDataUrl } from "../../utils/createThumbDataUrl";

const Wrap = styled.div`
  display: grid;
  gap: 16px;
`;

/**
 * 플랫폼 ↔ 업로드 구역을 하나의 "현재 배치" 묶음으로 보이게 감싸는 컨테이너.
 * 두 카드가 한 번의 업로드 액션에 엮여 있다는 시각적 힌트 역할을 합니다.
 */
const UploadStack = styled.div`
  display: grid;
  gap: 12px;
`;

const Footer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 4px;

  .count {
    color: ${tokens.color.ink4};
    font-size: 12px;
    line-height: 1.5;
  }

  .count strong {
    color: ${tokens.color.ink2};
    font-weight: 700;
  }

  /*
   * 좁은 모바일에서는 왼쪽의 업로드 요약(쿠팡 2장, 네이버 1장 …)이 길어지면
   * flex-shrink 로 오른쪽 버튼 컨테이너가 1~2 글자 폭까지 쪼그라들어 "취/소",
   * "분/석/시/작/하/기" 처럼 세로로 잘리는 현상이 생깁니다. 세로로 쌓아 요약을
   * 먼저 보여 주고, 액션 버튼은 바로 아래에 풀-폭으로 배치합니다.
   */
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

  /*
   * 버튼 자체가 pc 에서는 자연 폭, 모바일에서는 Footer 가 세로 스택이 된 뒤
   * Actions 가 풀-폭이 되도록 잡아 두고, 그 안에서 두 버튼이 50:50 으로 나눠 갖게 합니다.
   * && 를 써서 styled.button 의 기본 클래스보다 specificity 를 한 단계 높여 확실히 덮어씁니다.
   */
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

/**
 * 업로드할 수 있는 최대 이미지 수. 한 번에 너무 많은 캡쳐를 처리하면 OCR 비용과
 * 편집 화면 체감 부하가 커지므로 MVP에서는 5로 제한합니다.
 */
const MAX_IMAGES = 5;

export const OcrUploadPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isAppendMode = location.state?.append === true;

  // 여기서의 platform은 "다음에 올릴 이미지에 찍힐 태그"입니다.
  // 업로드를 실행할 때마다 새 이미지의 UploadedImage.platform에 스냅샷으로 복사됩니다.
  const [platform, setPlatform] = useState<Platform>("coupang");

  // 실제 OCR 흐름에서는 사용자가 직접 업로드하기 전에는 이미지가 비어 있어야 합니다.
  // append 모드(기존 결과에 이어 붙이기)든 새 세션이든 초기 상태는 항상 빈 배열로 시작합니다.
  const [images, setImages] = useState<UploadedImage[]>([]);

  /**
   * "분석 시작하기" → 플랫폼 확인 모달(PlatformConfirmModal)의 개폐 상태.
   * 모달에서 확인을 누르면 수정된 이미지 배열이 내려와 실제 OCR 파이프(runAnalysis)가 돕니다.
   */
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  React.useEffect(() => {
    // 새로운 세션 시작일 경우에만 스토어를 초기화합니다.
    if (!isAppendMode) {
      ocrStore.clear();
    }
  }, [isAppendMode]);

  const handleRemove = (id: string) => {
    setImages((current) => current.filter((image) => image.id !== id));
  };

  const handleFileSelect = async (files: File[]) => {
    // 남은 슬롯을 현재 state 스냅샷으로 계산합니다.
    const remainingSlots = MAX_IMAGES - images.length;
    if (remainingSlots <= 0) return;
    // MIME 타입 화이트리스트 + 사이즈 상한 검증.
    // 사용자 단말은 다양한 캡쳐 도구를 쓰므로 jpeg/png/webp/heic 만 명시적으로 허용하고
    // 그 외 (text/pdf/svg 등) 는 OCR 단계에서 의미 없거나 위험할 수 있어 입력 시점에 차단.
    // 사이즈 상한은 메모리·Firestore 비용 보호 + DoS 방지(거대한 파일을 여러 장 올리는 패턴).
    const accepted: File[] = [];
    let rejectedMime = 0;
    let rejectedSize = 0;
    for (const file of files.slice(0, remainingSlots)) {
      const mimeOk = (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type);
      const sizeOk = file.size > 0 && file.size <= MAX_IMAGE_BYTES;
      if (!mimeOk) {
        rejectedMime += 1;
        continue;
      }
      if (!sizeOk) {
        rejectedSize += 1;
        continue;
      }
      accepted.push(file);
    }
    if (rejectedMime > 0 || rejectedSize > 0) {
      // 정확한 toast 시스템이 없는 단계라 console + 추후 SaveResultModal 류 안내로 묶기 좋게
      // console.warn 으로 남깁니다(사용자에 즉시 보이지 않더라도 개발 단계에서 확인 가능).
      console.warn(
        `[OcrUpload] 파일 일부 거절: MIME ${rejectedMime}건, 사이즈 초과(${MAX_IMAGE_BYTES / (1024 * 1024)}MB) ${rejectedSize}건`,
      );
    }
    const filesToAdd = accepted;

    // thumbUrl(blob)은 즉시 생성하고, sourceDataUrl(압축 data URL)은 병렬로 생성합니다.
    // sourceDataUrl은 저장 후 거래내역 "OCR 이미지 보기"에 쓰이며 새로고침 후에도 유효합니다.
    const newImages = await Promise.all(
      filesToAdd.map(async (file, index) => ({
        id: `file-${Date.now()}-${index}`,
        thumbUrl: URL.createObjectURL(file),
        sourceDataUrl: await createThumbDataUrl(file),
        fileName: file.name,
        sizeLabel: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        status: "ready" as const,
        platform,
        file,
      }))
    );

    setImages((current) => {
      const remaining = Math.max(0, MAX_IMAGES - current.length);
      if (remaining === 0) return current;
      return [...current, ...newImages.slice(0, remaining)];
    });
  };

  const [isAnalyzing, setIsAnalyzing] = useState(false);

  /**
   * OCR 진행률 모달에 전달할 상태. runAnalysis가 시작될 때 전체 이미지 수와
   * 첫 번째 이미지 정보로 초기화되고, 이후 Tesseract logger와 이미지 루프가
   * currentIndex / currentProgress / currentStatus를 갱신합니다.
   */
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
   * 이미지 0장 상태에서 "분석 시작하기"를 눌렀을 때 잠깐 노출되는 가이드 메시지.
   * disabled 버튼이 시각적으로 흐리게 보이긴 해도, 사용자가 클릭했을 때 아무 반응이 없으면
   * "고장난 건가?"라는 의심을 사기 쉬워서 "이미지를 먼저 올려주세요" 안내를 인라인으로 띄웁니다.
   */
  const [emptyHint, setEmptyHint] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!emptyHint) return;
    const timer = window.setTimeout(() => setEmptyHint(null), 2400);
    return () => window.clearTimeout(timer);
  }, [emptyHint]);

  /**
   * "분석 시작하기" 진입점.
   * 분석 자체는 이미지 장수만큼 Tesseract를 돌리는 무거운 작업이라, 실행 전
   * PlatformConfirmModal을 먼저 띄워 사용자에게 태그를 재확인할 기회를 줍니다.
   * 모달에서 "확인하고 분석 시작"을 누르면 handleConfirmAnalyze가 실제 파이프를 돌립니다.
   */
  const handleAnalyze = () => {
    if (images.length === 0) {
      setEmptyHint("먼저 분석할 이미지를 1장 이상 업로드해 주세요.");
      return;
    }
    if (isAnalyzing) return;
    setIsConfirmOpen(true);
  };

  /**
   * 모달에서 확정된 최종 이미지 배열로 OCR 파이프를 실행합니다.
   * 여기서 받은 updatedImages는 사용자가 모달에서 플랫폼 태그를 수정한 결과이므로,
   * 상위 images state에도 그대로 반영해 UploadedGrid의 뱃지가 같이 바뀌도록 합니다.
   */
  const handleConfirmAnalyze = async (updatedImages: UploadedImage[]) => {
    setIsConfirmOpen(false);
    setImages(updatedImages);
    await runAnalysis(updatedImages);
  };

  /**
   * Platform mismatch 후속 모달 상태. analyzeUploadedImages 결과에서 detectedPlatform 이
   * 사용자가 고른 platform 과 다르고 confidence ≥ 0.7 인 이미지를 모은다. 비어 있으면
   * 곧바로 OcrEdit 으로 이동, 있으면 사용자에게 "rerun with detected" / "그대로 진행" 선택지.
   * 자세한 알고리즘 정책은 src/utils/ocrPlatformDetect.ts.
   */
  const [pendingMismatchImages, setPendingMismatchImages] = useState<OcrImageItem[] | null>(null);

  const runAnalysis = async (targetImages: UploadedImage[]) => {
    if (targetImages.length === 0) return;
    setIsAnalyzing(true);

    try {
      // 실제 OCR 파이프라인은 utils/ocrAnalyzeImages 로 분리됐습니다.
      // 이 페이지는 진행률을 모달 상태로만 매핑해 두고, 이미지 추가(OcrEdit) 경로와
      // 같은 구현체를 공유합니다.
      const processedImages = await analyzeUploadedImages(targetImages, (event) => {
        setAnalysisProgress(event);
      });

      // ── Platform mismatch 감지 ─────────────────────────────────────────────
      // 사용자 선택 platform 과 detectedPlatform 이 다르고 confidence ≥ 0.6 이면 mismatch.
      // OCR 손상이 큰 이미지는 detectedPlatform 이 null 또는 confidence 낮음 → 알람 안 띄움.
      // 임계값 0.6 (이전 0.7 에서 완화): 짧은 캡쳐도 mismatch 잡히도록.
      //
      // DevTools 콘솔에 항상 detection 결과 로그 — 사용자가 "모달이 왜 안 뜨냐" 디버깅 시 즉시
      // 원인 확인 가능 (platform/detected/confidence 셋이 보이면 코드 흐름은 정상).
      console.info(
        "[OCR mismatch-detect]",
        processedImages.map((img) => ({
          file: img.fileName,
          selected: img.platform,
          detected: img.detectedPlatform ?? "(none)",
          confidence: Math.round((img.detectionConfidence ?? 0) * 100) / 100,
        })),
      );
      const mismatched = processedImages.filter(
        (img) =>
          img.detectedPlatform &&
          img.detectedPlatform !== img.platform &&
          (img.detectionConfidence ?? 0) >= 0.6,
      );

      if (mismatched.length > 0) {
        console.info(
          `[OCR mismatch-detect] ${mismatched.length}건 mismatch — 모달 띄움`,
        );
        // 진행 모달 닫고 mismatch 모달로 사용자 선택을 받음. processedImages 는 store 에 아직
        // 안 넣음 — 사용자 결정 후에 반영.
        setIsAnalyzing(false);
        setPendingMismatchImages(processedImages);
        return;
      }

      ocrStore.setImages(
        isAppendMode ? [...ocrStore.getImages(), ...processedImages] : processedImages,
      );
      navigate("/ocr-edit");
    } catch {
      // 사용자에게는 alert로 친화적 메시지만 노출. 콘솔 디버그 로그는 정리했습니다.
      alert("이미지 분석 중 오류가 발생했습니다.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  /**
   * Mismatch 모달에서 "감지된 platform 으로 다시 분석" 선택 시.
   * 1) processedImages 의 platform 만 detectedPlatform 으로 바꾼 새 UploadedImage 배열을 만듦
   * 2) runAnalysis 재실행
   *
   * UploadedImage 와 OcrImageItem 은 다른 형식이라 변환 필요. file/thumbUrl/sourceDataUrl 은 원본
   * targetImages 에서 그대로 끌어와야 하므로 stem id 매칭으로 lookup.
   */
  const handleMismatchRerun = async () => {
    const processed = pendingMismatchImages;
    if (!processed) return;
    const replacements: UploadedImage[] = processed.map((p) => {
      const orig = images.find((i) => i.id === p.id);
      const targetPlatform =
        p.detectedPlatform &&
        p.detectionConfidence !== undefined &&
        p.detectionConfidence >= 0.6 &&
        p.detectedPlatform !== p.platform
          ? p.detectedPlatform
          : p.platform;
      return {
        ...(orig ?? ({} as UploadedImage)),
        id: p.id,
        platform: targetPlatform,
      };
    });
    setPendingMismatchImages(null);
    setImages(replacements);
    await runAnalysis(replacements);
  };

  /**
   * Mismatch 모달에서 "그대로 진행" 선택 시. processedImages 그대로 store 에 반영하고 OcrEdit 이동.
   */
  const handleMismatchKeep = () => {
    const processed = pendingMismatchImages;
    if (!processed) return;
    setPendingMismatchImages(null);
    ocrStore.setImages(
      isAppendMode ? [...ocrStore.getImages(), ...processed] : processed,
    );
    navigate("/ocr-edit");
  };

  /**
   * 플랫폼 뱃지별로 현재 몇 장이 올라가 있는지 요약합니다.
   * 사용자가 "내가 쿠팡 3장, 네이버 2장 올렸구나"를 한 눈에 확인할 수 있게 Footer에 노출합니다.
   */
  const platformCounts = useMemo(() => {
    const counts: Partial<Record<Platform, number>> = {};
    for (const image of images) {
      counts[image.platform] = (counts[image.platform] ?? 0) + 1;
    }
    return counts;
  }, [images]);

  const atCapacity = images.length >= MAX_IMAGES;

  return (
    <AppShell activeNav="upload" crumb="입력 · 주문 캡처" title="주문 캡처로 입력">
      <Wrap>
        <GuideCard items={OCR_UPLOAD_GUIDE} />

        {/* 플랫폼 선택과 업로드 구역은 "한 번의 배치"를 구성하므로 시각적으로 붙여 보여 줍니다. */}
        <UploadStack>
          <PlatformSelect value={platform} onChange={setPlatform} />
          {/* data-tour: ProductTour 스포트라이트 타겟. */}
          <div data-tour="ocr-zone">
            <UploadZone
              acceptedTypes="PNG, JPG, WEBP"
              maxSize="10MB"
              maxCount={MAX_IMAGES}
              activePlatformLabel={PLATFORM_LABELS[platform]}
              disabled={atCapacity}
              currentCount={images.length}
              onPick={handleFileSelect}
            />
          </div>
        </UploadStack>

        {images.length > 0 && <UploadedGrid images={images} onRemove={handleRemove} />}

        <Footer>
          <span className="count">
            업로드한 이미지 <strong>{images.length}/{MAX_IMAGES}</strong>
            {images.length > 0 && (
              <>
                {" · "}
                {(Object.keys(platformCounts) as Platform[])
                  .map((p) => `${PLATFORM_LABELS[p]} ${platformCounts[p]}장`)
                  .join(", ")}
              </>
            )}
          </span>
          <Actions>
            <Button variant="ghost" size="lg" onClick={() => navigate("/upload")}>
              취소
            </Button>
            {/*
              이미지 0장이어도 버튼 자체는 클릭 가능하게 두고 handleAnalyze 안에서 안내 메시지를 띄웁니다.
              disabled는 분석 중일 때만 적용해, "왜 안 눌리는지 모르겠다"는 사용자 피드백을 명시적 안내로 대체합니다.
              시각적으로는 emptyHint가 떠있을 때 살짝 흐리게 처리해 disabled 의도도 같이 전달.
            */}
            <Button
              variant="primary"
              size="lg"
              disabled={isAnalyzing}
              onClick={handleAnalyze}
              style={images.length === 0 ? { opacity: 0.5 } : undefined}
            >
              {isAnalyzing ? "분석 중..." : "분석 시작하기"}
            </Button>
          </Actions>
        </Footer>
        {emptyHint && (
          <div
            role="status"
            style={{
              padding: "10px 12px",
              border: `1px solid ${tokens.color.warn}`,
              borderRadius: tokens.radius.control,
              background: tokens.color.warnBg ?? "#fffbf0",
              color: tokens.color.warn,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {emptyHint}
          </div>
        )}
      </Wrap>
      <PlatformConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        images={images}
        onConfirm={handleConfirmAnalyze}
      />
      <AnalysisProgressModal isOpen={isAnalyzing} progress={analysisProgress} />
      {/*
       * Platform mismatch 모달 — 분석 후 사용자 선택과 자동 감지 결과가 다른 이미지 발견 시.
       * 시그널 알고리즘은 src/utils/ocrPlatformDetect.ts 의 literal UI 라벨/배지 카운트.
       */}
      {pendingMismatchImages && (() => {
        const mismatched = pendingMismatchImages.filter(
          (img) =>
            img.detectedPlatform &&
            img.detectedPlatform !== img.platform &&
            (img.detectionConfidence ?? 0) >= 0.6,
        );
        return (
          <Modal
            isOpen
            onClose={handleMismatchKeep}
            title="플랫폼이 다른 것 같아요"
          >
            <div style={{ color: tokens.color.ink2, fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
              아래 이미지들은 분석 결과 다른 플랫폼 캡쳐로 보입니다.
              실제 플랫폼이 맞는지 확인해 주세요.
              <ul style={{ marginTop: 10, paddingLeft: 20 }}>
                {mismatched.map((img) => (
                  <li key={img.id} style={{ marginBottom: 4 }}>
                    <strong>{img.fileName}</strong>:
                    선택 <code>{PLATFORM_LABELS[img.platform]}</code>,
                    감지 <code>{PLATFORM_LABELS[img.detectedPlatform!]}</code>
                    {" "}({Math.round((img.detectionConfidence ?? 0) * 100)}% 확신)
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="secondary" size="md" onClick={handleMismatchKeep}>
                선택대로 진행
              </Button>
              <Button variant="primary" size="md" onClick={handleMismatchRerun}>
                감지된 플랫폼으로 다시 분석
              </Button>
            </div>
          </Modal>
        );
      })()}
    </AppShell>
  );
};
