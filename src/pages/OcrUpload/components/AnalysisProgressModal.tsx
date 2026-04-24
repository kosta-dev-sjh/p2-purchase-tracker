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
import { PLATFORM_LABELS } from "../../../constants/labels";
import type { OcrAnalysisProgress } from "../../../utils/ocrAnalyzeImages";
import { DEBUG_OCR_AI } from "../../../utils/ocrAiDebug";

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
 * 2차 정확도 단계에서 3~5초 간격으로 회전하며 보여줄 메시지 5종 (사용자용).
 *
 * UX 원칙: 사용자는 파이프라인 안에서 AI 가 돌고 있다는 사실을 알 필요가 없고, 결과 품질만
 * 관심입니다. 문구는 모두 "도구 이름 언급 없이" 중립적으로. 메시지 변화 자체로 "살아 있다"
 * 는 신호를 주어 대기 지루함만 완화합니다.
 */
const NEUTRAL_PROGRESS_MESSAGES = [
  "✨ 이미지를 자세히 다시 살펴보고 있어요...",
  "🔎 놓친 상품명과 가격을 하나씩 확인하는 중이에요...",
  "📋 글자가 흐릿한 부분은 원본 이미지와 대조 중입니다...",
  "⏳ 조금만 더 기다려 주세요, 정확도 올리는 중이에요...",
  "💪 거의 다 됐어요! 마지막 상품 확인 중입니다...",
];

/**
 * DEBUG-ONLY: 동일 단계지만 "AI" 단어를 드러내는 디버그용 메시지. DEBUG_OCR_AI 플래그가 켜진
 * 세션에서만 사용됩니다. 개발자가 실제로 AI 경로가 도는지 시각 확인할 때 유용.
 */
const DEBUG_AI_MESSAGES = [
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
  // DEBUG_OCR_AI=true 일 때만 "AI" 노출, 평상시에는 도구-중립적 "2차 확인 중".
  if (normalized.includes("ai-fallback")) {
    return DEBUG_OCR_AI ? "AI 보정 중" : "2차 확인 중";
  }
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
  // 디버그 모드에서는 파이프라인 세부를 보여주고, 실사용자 모드에서는 "2차 정확도 확인" 같은
  // 도구-독립적인 문구로 보여줍니다. DEBUG_OCR_AI 플래그 토글 → 페이지 새로고침 또는 리렌더로 반영.
  const debugOn = DEBUG_OCR_AI;

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

  // AI phase 중에는 subtext 로 rotating 메시지를 짧게 한 줄씩 돌려 지루함 완화. 이 위치는
  // 썸네일 우측 FileSub 에 들어가며, 사용자는 "이미지 자체를 자세히 보는 중" 정도만 인식하면 됩니다.
  const rotatingMessages = debugOn ? DEBUG_AI_MESSAGES : NEUTRAL_PROGRESS_MESSAGES;

  return (
    <>
      <Overlay aria-hidden />
      <Card role="dialog" aria-modal="true" aria-label="OCR 이미지 분석 진행률">
        <Title>이미지 분석 중{debugOn && isAiPhase ? " · AI DEBUG" : ""}</Title>
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
                {currentPlatform ? `${PLATFORM_LABELS[currentPlatform]} · ` : ""}
                {isAiPhase ? (
                  <AiPhaseSub messages={rotatingMessages} />
                ) : (
                  humanizeStatus(currentStatus)
                )}
              </FileSub>
            </FileMeta>
          </CurrentRow>
          <ProgressBar value={overallValue} tone="accent" size={8} />
        </Section>

        <Notice>
          분석이 끝나면 자동으로 편집 화면으로 이동해요. 이 창이 닫힐 때까지 기다려 주세요.
        </Notice>
      </Card>
    </>
  );
};

/**
 * AI phase 전용 서브텍스트 회전 컴포넌트. 대기 시간이 길어질 수 있는 이 구간에서 "살아 있다"
 * 신호를 주기 위해 기존 AiLoadingBlock 의 메시지 배열을 재사용하되, 단일 바 UI 에 맞게
 * 한 줄만 노출하도록 이 파일 안에서 mini 버전으로 인라인화했습니다.
 *
 * messages 배열이 props 로 바뀌면 인덱스를 리셋해 처음 메시지부터 다시 시작합니다.
 */
const AiPhaseSub: React.FC<{ messages: string[] }> = ({ messages }) => {
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
