/**
 * 역할: AI 가 시간이 걸리는 작업(OCR fallback / CSV 파싱 등) 중일 때 공통으로 쓰는 로딩 블록.
 *       실제 진행률을 측정하기 어려운 AI 호출 특성상 진행 바 대신 회전 스피너 + 일정 시간
 *       간격으로 바뀌는 안내 메시지로 "살아 있다" 는 신호를 주어 사용자 지루함을 완화합니다.
 *
 * 위치: src/components/primitives/AiLoadingBlock.tsx
 *
 * 재사용처:
 *   - CsvUpload: 엑셀/CSV 업로드 후 AI 가 거래 행을 추출하는 동안 (페이지 인라인).
 *   - OcrUpload AnalysisProgressModal: OCR 결과 중 bad 카드가 있을 때 AI 보정 단계
 *     (모달 안 Section).
 *
 * 통일감 원칙: 이 블록을 쓰는 모든 화면이 동일한 스피너·메시지 로테이션·서브텍스트 톤을
 * 공유하도록, 메시지 배열만 caller 가 주입하고 나머지는 컴포넌트가 책임집니다.
 */

import React, { useEffect, useState } from "react";
import styled, { keyframes } from "styled-components";
import { tokens } from "../../styles/tokens";

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const pulse = keyframes`
  0% { opacity: 0.6; }
  50% { opacity: 1; }
  100% { opacity: 0.6; }
`;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px 12px;
  gap: 14px;
  min-height: 120px;
`;

const Spinner = styled.div`
  width: 32px;
  height: 32px;
  border: 3px solid ${tokens.color.line};
  border-top: 3px solid ${tokens.color.accent};
  border-radius: 50%;
  animation: ${spin} 1s linear infinite;
`;

const Message = styled.div`
  color: ${tokens.color.accent};
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
  text-align: center;
  animation: ${pulse} 2s ease-in-out infinite;
  transition: opacity 0.4s ease-in-out;
`;

const SubText = styled.div`
  color: ${tokens.color.ink4};
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
`;

interface AiLoadingBlockProps {
  /**
   * 시간 경과에 따라 돌아가며 보여줄 메시지 목록. 최소 1개, 권장 4~6개.
   * 이모지를 앞에 붙여 시각 변화를 강조하면 "살아 있음" 인상이 강해집니다.
   */
  messages: string[];
  /**
   * 고정으로 보여줄 서브텍스트(예상 소요 시간 안내 등). 빈 문자열이면 렌더하지 않습니다.
   */
  subText?: string;
  /**
   * 각 메시지가 머무는 시간(ms) 배열. messages.length - 1 만큼만 있으면 됩니다.
   * 끝까지 다 쓰고 나면 마지막 메시지가 작업이 끝날 때까지 유지됩니다.
   * 기본값: [3000, 5000, 10000, 10000] — CSV 쪽 AiLoadingIndicator 와 동일 타이밍.
   */
  intervalsMs?: number[];
}

export const AiLoadingBlock: React.FC<AiLoadingBlockProps> = ({
  messages,
  subText,
  intervalsMs = [3000, 5000, 10000, 10000],
}) => {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    // 메시지 회전을 setTimeout 누적합으로 스케줄링. intervals 가 messages 보다 길면 뒷쪽은
    // 무시되고, 짧으면 마지막 메시지가 계속 유지됩니다.
    setMsgIdx(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let accum = 0;
    const maxStep = Math.min(intervalsMs.length, Math.max(0, messages.length - 1));
    for (let i = 0; i < maxStep; i += 1) {
      accum += intervalsMs[i];
      const step = i + 1;
      timers.push(
        setTimeout(() => {
          setMsgIdx(step);
        }, accum),
      );
    }
    return () => {
      timers.forEach(clearTimeout);
    };
    // messages 자체가 바뀌면 처음부터 다시. intervalsMs 는 caller 가 안정적으로 준다고 가정.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.join("|")]);

  const current = messages[Math.min(msgIdx, messages.length - 1)] ?? "";

  return (
    <Container role="status" aria-live="polite">
      <Spinner aria-hidden />
      <Message>{current}</Message>
      {subText && <SubText>{subText}</SubText>}
    </Container>
  );
};
