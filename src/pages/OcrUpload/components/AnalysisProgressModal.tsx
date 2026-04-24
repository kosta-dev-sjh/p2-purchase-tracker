/**
 * 역할: OCR 업로드 화면에서 "분석 시작하기"를 눌렀을 때 노출되는 진행률 모달입니다.
 *       Tesseract는 이미지 한 장당 수 초가 걸릴 수 있고, 여러 장을 연속 처리하는 구조라
 *       버튼 레이블만 "분석 중..."으로 바꾸는 것으로는 "멈춘 건지 도는 건지"가 구분이 안 됩니다.
 *       이 모달은 두 개의 진행률을 동시에 보여 주어 사용자의 불안감을 줄입니다.
 *         1) 전체 진행: N/Total 이미지 단위 (완료 이미지 수 / 전체 이미지 수)
 *         2) 현재 이미지: 현재 분석 중인 이미지의 Tesseract recognize 진행률 0~100%
 *
 *       ⚠️ 닫기 버튼을 제공하지 않습니다. Tesseract worker를 도중에 중단하는 API가 번거롭고,
 *       MVP에서는 "한번 시작하면 끝까지 돌고 종료"가 가장 단순하고 예측 가능합니다.
 *       필요 시 바깥 페이지에서 상태를 리셋(새로고침)하도록 안내합니다.
 *
 * 위치: src/pages/OcrUpload/components/AnalysisProgressModal.tsx
 */
import React from "react";
import styled from "styled-components";
import { tokens } from "../../../styles/tokens";
import { media } from "../../../tokens/breakpoints";
import { ProgressBar } from "../../../components/primitives/ProgressBar";
import { AiLoadingBlock } from "../../../components/primitives/AiLoadingBlock";
import { PLATFORM_LABELS } from "../../../constants/labels";
import type { OcrAnalysisProgress } from "../../../utils/ocrAnalyzeImages";

/**
 * 모달이 받는 진행률 이벤트 타입. 실제 생성은 analyzeUploadedImages 가 담당하므로
 * 타입 정의는 그쪽(utils) 을 단일 소스로 두고, 여기서는 재노출만 합니다.
 */
export type AnalysisProgress = OcrAnalysisProgress;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(11, 18, 32, 0.45);
  z-index: 1000;
`;

const Card = styled.div`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 440px;
  max-width: calc(100vw - 32px);
  background: ${tokens.color.panel};
  border-radius: ${tokens.radius.modal};
  z-index: 1001;
  box-shadow: ${tokens.shadow.modal};
  padding: 24px 28px 26px;

  ${media.mobile} {
    width: calc(100% - 24px);
    padding: 20px 18px 22px;
  }
`;

const Title = styled.h2`
  margin: 0 0 6px;
  color: ${tokens.color.ink1};
  font-size: 18px;
  font-weight: 700;
`;

const Subtitle = styled.p`
  margin: 0 0 18px;
  color: ${tokens.color.ink3};
  font-size: 13px;
  line-height: 1.55;
`;

const SectionLabel = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0 0 8px;
  font-size: 12.5px;
  color: ${tokens.color.ink3};

  strong {
    color: ${tokens.color.ink2};
    font-weight: 600;
  }
`;

const Section = styled.div`
  & + & {
    margin-top: 18px;
  }
`;

const CurrentRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 10px 0 8px;
`;

const Thumb = styled.div<{ $src?: string }>`
  width: 48px;
  height: 48px;
  border-radius: 8px;
  background-color: ${tokens.color.line2};
  background-image: ${({ $src }) => ($src ? `url(${$src})` : "none")};
  background-size: cover;
  background-position: center;
  flex-shrink: 0;
`;

const FileMeta = styled.div`
  min-width: 0;
  flex: 1;
`;

const FileName = styled.div`
  font-size: 13px;
  color: ${tokens.color.ink2};
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const FileSub = styled.div`
  margin-top: 2px;
  font-size: 11.5px;
  color: ${tokens.color.ink4};
`;

const Notice = styled.div`
  margin-top: 18px;
  padding: 10px 12px;
  background: ${tokens.color.accentSubtle};
  border: 1px solid ${tokens.color.accentBorder};
  border-radius: ${tokens.radius.control};
  color: ${tokens.color.ink3};
  font-size: 12px;
  line-height: 1.5;
`;

/**
 * AI 보정 단계에서 3~5초 간격으로 회전하며 보여줄 메시지 5종.
 * CsvUpload 의 AiLoadingIndicator 와 같은 톤(이모지 + 친근한 한국어 + pulse 애니메이션) 으로
 * 통일감을 줍니다. AI 호출이 평소보다 길어져도 "살아 있다" 는 신호가 끊기지 않도록 메시지가
 * 자연스럽게 변합니다.
 */
const AI_OCR_MESSAGES = [
  "✨ AI 가 이미지를 자세히 살펴보고 있어요...",
  "🤖 놓친 상품명과 가격을 하나씩 짚어가는 중이에요...",
  "🔎 글자가 흐릿한 부분은 원본 이미지와 대조 중입니다...",
  "⏳ 조금만 더 기다려 주세요, 정확도 올리는 중이에요...",
  "💪 거의 다 됐어요! 마지막 상품 확인 중입니다...",
];

interface AnalysisProgressModalProps {
  isOpen: boolean;
  progress: AnalysisProgress;
}

/**
 * Tesseract가 넘겨 주는 status 문자열을 사용자 친화적인 한국어로 바꿉니다.
 * Tesseract는 내부 단계를 "loading tesseract core", "initializing tesseract",
 * "loading language traineddata", "recognizing text" 등으로 돌려줍니다.
 * 내부 용어 그대로는 사용자가 "뭐가 돌고 있는지" 감이 안 오니 최소한의 의미 전달만 합니다.
 */
function humanizeStatus(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes("ai-fallback")) return "AI 보정 중";
  if (normalized.includes("recognizing")) return "글자 인식 중";
  if (normalized.includes("initializing")) return "엔진 준비 중";
  if (normalized.includes("loading language")) return "언어 데이터 불러오는 중";
  if (normalized.includes("loading tesseract")) return "엔진 불러오는 중";
  if (normalized.includes("preprocess")) return "이미지 전처리 중";
  if (!status) return "준비 중";
  return status;
}

export const AnalysisProgressModal: React.FC<AnalysisProgressModalProps> = ({
  isOpen,
  progress,
}) => {
  if (!isOpen) return null;

  const { currentIndex, totalCount, currentFileName, currentThumbUrl, currentPlatform,
    currentProgress, currentStatus, phase } = progress;
  const isAiPhase = phase === "ai-fallback";

  // 전체 진행률 = 완료된 이미지 수 기준. currentIndex가 지금 처리 중인 이미지이므로
  // "완료 = currentIndex", "전체 = totalCount". 마지막 이미지까지 끝나면 currentIndex === totalCount 가 됩니다.
  const overallRatio = totalCount > 0 ? currentIndex / totalCount : 0;
  const overallPercentLabel = `${currentIndex}/${totalCount}`;

  // 현재 이미지 진행률은 0..1 범위 안에서 clamp. Tesseract가 최종 100%를 안 쏘는 경우가 있어
  // "거의 완료"가 오랫동안 지속돼 보일 수 있는데, 다음 이미지로 넘어갈 때 자연스럽게 풀립니다.
  const currentPercent = Math.round(Math.min(1, Math.max(0, currentProgress)) * 100);

  return (
    <>
      <Overlay aria-hidden />
      <Card role="dialog" aria-modal="true" aria-label="OCR 이미지 분석 진행률">
        <Title>{isAiPhase ? "AI 보정 중" : "이미지 분석 중"}</Title>
        <Subtitle>
          {isAiPhase
            ? "글자 인식이 흐릿한 항목을 AI 가 다시 살펴 보고 있어요. 원본 이미지를 참고해 이름·가격을 보정하는 단계입니다."
            : "업로드한 이미지를 순서대로 인식하고 있어요. 이미지 장수와 해상도에 따라 수십 초가 걸릴 수 있습니다."}
        </Subtitle>

        {isAiPhase ? (
          // AI 단계는 응답 시간이 가변적이라 진행 바 대신 공용 AiLoadingBlock 사용:
          //   - CSV 분석 로딩(AiLoadingIndicator) 과 동일한 스피너·메시지 로테이션 톤
          //   - 현재 어느 이미지 처리 중인지 썸네일/파일명은 그대로 노출해 맥락 유지
          //   - 이미지 단위 순서("N번째 / M장") 는 Section 형태로 한 줄만 보여줌
          <>
            <Section>
              <SectionLabel>
                <span>진행 이미지</span>
                <strong>
                  {Math.min(
                    Math.floor(currentProgress * Math.max(1, totalCount)) + 1,
                    Math.max(1, totalCount),
                  )}
                  {" / "}
                  {Math.max(1, totalCount)}장
                </strong>
              </SectionLabel>
              <CurrentRow>
                <Thumb $src={currentThumbUrl} aria-hidden />
                <FileMeta>
                  <FileName title={currentFileName}>
                    {currentFileName || "이미지 준비 중"}
                  </FileName>
                  <FileSub>
                    {currentPlatform ? `${PLATFORM_LABELS[currentPlatform]} · ` : ""}
                    AI 가 이미지와 텍스트를 비교 중
                  </FileSub>
                </FileMeta>
              </CurrentRow>
            </Section>
            <AiLoadingBlock
              messages={AI_OCR_MESSAGES}
              subText="이미지 복잡도에 따라 한 장당 3~10초 정도 걸릴 수 있어요."
            />
          </>
        ) : (
          <>
            <Section>
              <SectionLabel>
                <span>전체 진행</span>
                <strong>{overallPercentLabel}</strong>
              </SectionLabel>
              <ProgressBar value={overallRatio} tone="neutral" size={8} />
            </Section>

            <Section>
              <SectionLabel>
                <span>현재 이미지</span>
                <strong>{currentPercent}%</strong>
              </SectionLabel>
              <CurrentRow>
                <Thumb $src={currentThumbUrl} aria-hidden />
                <FileMeta>
                  <FileName title={currentFileName}>
                    {currentFileName || "이미지 준비 중"}
                  </FileName>
                  <FileSub>
                    {currentPlatform ? `${PLATFORM_LABELS[currentPlatform]} · ` : ""}
                    {humanizeStatus(currentStatus)}
                  </FileSub>
                </FileMeta>
              </CurrentRow>
              <ProgressBar
                value={currentProgress}
                tone="accent"
                size={8}
                indeterminate={!currentStatus.toLowerCase().includes("recognizing") && currentPercent === 0}
              />
            </Section>
          </>
        )}

        <Notice>
          {isAiPhase
            ? "AI 보정은 놓친 상품만 골라서 처리하니 오래 걸리지 않아요. 완료되면 자동으로 편집 화면으로 이동합니다."
            : "분석이 끝나면 자동으로 편집 화면으로 이동해요. 이 창이 닫힐 때까지 기다려 주세요."}
        </Notice>
      </Card>
    </>
  );
};
