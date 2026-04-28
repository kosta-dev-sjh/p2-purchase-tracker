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
import styled, { keyframes } from "styled-components";
import { tokens } from "../../../styles/tokens";
import { media } from "../../../tokens/breakpoints";
import { ProgressBar } from "../../../components/primitives/ProgressBar";
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
`;

/**
 * AI fallback 단계에서 회전 메시지 옆에 띄우는 작은 인라인 스피너.
 * Gemini 호출은 단발 fetch 라 실제 progress event 가 없어, 사용자에게는 진행률 바가 50% 에서
 * 멈춰 있는 것처럼 보일 수 있습니다. 이 스피너 + ProgressBar 의 shimmer 오버레이가 함께
 * "백엔드가 살아 있다" 신호를 줍니다.
 */
const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const InlineSpinner = styled.span`
  display: inline-block;
  width: 11px;
  height: 11px;
  border: 1.5px solid ${tokens.color.line};
  border-top-color: ${tokens.color.accent};
  border-radius: 50%;
  animation: ${spin} 0.9s linear infinite;
  flex-shrink: 0;
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
 * 2차 정확도 단계에서 3~5초 간격으로 회전하며 보여줄 메시지 5종.
 *
 * UX 원칙: 사용자·개발자 모두에게 "분석 중" 정도만 보여 주면 충분합니다. 로딩 모달에서 AI 가
 * 따로 도는지 여부는 이 자리에 드러내지 않습니다.
 */
const PROGRESS_MESSAGES = [
  "✨ 이미지를 자세히 다시 살펴보고 있어요...",
  "🔎 놓친 상품명과 가격을 하나씩 확인하는 중이에요...",
  "📋 글자가 흐릿한 부분은 원본 이미지와 대조 중입니다...",
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
  // 로딩 모달은 AI 언급 없음 — "이미지 분석 중" 맥락에서 사용자에게 자연스럽게 흘려보냅니다.
  if (normalized.includes("ai-fallback")) return "2차 확인 중";
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

  // ── 단일 진행 바 계산 ──
  //
  // 2026-04-24 재설계: Tesseract/AI 를 분리 바 2개로 보여주던 것을 단일 overall 바로 통합.
  // ocrAnalyzeImages 가 이미지 한 장을 0.0(시작) → 0.5(Tesseract 끝) → 1.0(AI 끝 또는 skip)
  // 좌표로 송출하므로, 여기서는 그대로 `(currentIndex + currentProgress) / totalCount` 를 계산.
  //
  // AI 필요 없는 이미지: 0→0.5→1.0 으로 슬롯을 즉시 차고 다음 장으로 넘어감.
  // AI 필요한 이미지: 0.5 지점에서 잠시 머물고 AI 응답이 오면 1.0 으로 마무리. rotating
  // 메시지·서브텍스트가 "살아 있다" 신호를 채워 줌.
  const safeProgress = Math.min(1, Math.max(0, currentProgress));
  const overallValue = totalCount > 0
    ? Math.min(1, (currentIndex + safeProgress) / totalCount)
    : 0;
  const overallPercentLabel = `${Math.min(currentIndex + 1, Math.max(1, totalCount))}/${Math.max(1, totalCount)}장`;

  return (
    <>
      <Overlay aria-hidden />
      <Card role="dialog" aria-modal="true" aria-label="주문 캡처 분석 진행률">
        <Title>이미지 분석 중</Title>
        <Subtitle>
          업로드한 이미지를 순서대로 인식하고 있어요. 이미지 장수와 해상도에 따라 수십 초가
          걸릴 수 있습니다.
        </Subtitle>

        <Section>
          <SectionLabel>
            <span>진행 상황</span>
            <strong>{overallPercentLabel}</strong>
          </SectionLabel>
          <CurrentRow>
            <Thumb $src={currentThumbUrl} aria-hidden />
            <FileMeta>
              <FileName title={currentFileName}>
                {currentFileName || "이미지 준비 중"}
              </FileName>
              <FileSub>
                {isAiPhase && <InlineSpinner aria-hidden />}
                <span>
                  {currentPlatform ? `${PLATFORM_LABELS[currentPlatform]} · ` : ""}
                  {isAiPhase ? (
                    <RotatingSub messages={PROGRESS_MESSAGES} />
                  ) : (
                    humanizeStatus(currentStatus)
                  )}
                </span>
              </FileSub>
            </FileMeta>
          </CurrentRow>
          {/*
            AI fallback 구간에서 progress 가 0.5 부근에서 정체될 수밖에 없는 이유로 (Gemini 호출은
            단발 fetch 라 progress event 없음) 사용자에게는 막대가 멈춰 보입니다. shimmer 를 켜서
            막대 위로 흐르는 하이라이트 + 위쪽 인라인 스피너 두 신호가 "살아 있다" 를 전달합니다.
            Tesseract 단계는 실제 progress 가 흐르므로 shimmer 비활성.
          */}
          <ProgressBar
            value={overallValue}
            tone="accent"
            size={8}
            shimmer={isAiPhase}
          />
        </Section>

        <Notice>
          분석이 끝나면 자동으로 편집 화면으로 이동해요. 이 창이 닫힐 때까지 기다려 주세요.
        </Notice>
      </Card>
    </>
  );
};

/**
 * 2차 확인 구간에서 서브텍스트를 회전시키는 mini 컴포넌트. 대기 시간이 길어질 수 있어
 * 짧은 안내 문구를 3~5초 간격으로 갈아 끼워 "살아 있다" 신호를 줍니다. 메시지 자체에는
 * 도구(AI / Tesseract) 언급이 없어 사용자 화면에서 파이프라인이 드러나지 않습니다.
 */
const RotatingSub: React.FC<{ messages: string[] }> = ({ messages }) => {
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => {
    setIdx(0);
    const intervals = [3000, 5000, 10000, 10000];
    const timers: ReturnType<typeof setTimeout>[] = [];
    let accum = 0;
    for (let i = 0; i < Math.min(intervals.length, Math.max(0, messages.length - 1)); i += 1) {
      accum += intervals[i];
      const step = i + 1;
      timers.push(setTimeout(() => setIdx(step), accum));
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.join("|")]);
  return <>{messages[Math.min(idx, messages.length - 1)] ?? ""}</>;
};
