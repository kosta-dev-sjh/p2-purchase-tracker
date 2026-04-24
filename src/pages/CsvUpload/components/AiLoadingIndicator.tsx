/**
 * 역할: 엑셀/CSV 업로드 후 파일 구조를 해석하는 동안 보여주는 로딩 블록.
 *       실제 로딩 UX(스피너·회전 메시지)는 공용 AiLoadingBlock 에서 담당하고,
 *       여기서는 CSV 문맥에 맞는 메시지 카피만 주입합니다.
 *       OCR 2차 확인 단계와 같은 톤으로 통일감 유지.
 *
 *       UX 원칙: 사용자는 파이프라인에서 AI 가 도는지 알 필요가 없습니다. 결과만 중요.
 *       기본 메시지는 도구 이름을 드러내지 않고, aiDebug 플래그가 켜진 세션에서만 "AI"
 *       단어를 드러내는 디버그용 문구를 보여줍니다.
 *
 * 위치: src/pages/CsvUpload/components/AiLoadingIndicator.tsx
 */
import React from "react";
import { AiLoadingBlock } from "../../../components/primitives/AiLoadingBlock";
import { isAiDebugMode } from "../../../utils/aiDebug";

/** 사용자에게 노출되는 기본 메시지. "AI" 언급 없음. */
const NEUTRAL_MESSAGES = [
  "✨ 엑셀 파일의 구조를 스캔하고 있습니다...",
  "📋 흩어진 결제 내역을 정리하는 중이에요...",
  "⏳ 데이터가 많을 경우 1~2분 정도 소요될 수 있습니다...",
  "📊 상호명과 결제 금액을 맞추고 있어요...",
  "🚀 꼼꼼하게 처리 중입니다! 잠시만 더 기다려주세요...",
];

/** DEBUG-ONLY: 개발자가 AI 경로 확인 시 쓰는 문구. aiDebug 플래그 활성 시에만 사용. */
const DEBUG_AI_MESSAGES = [
  "✨ 엑셀 파일의 구조를 스캔하고 있습니다...",
  "🤖 AI가 흩어진 결제 내역을 분석하는 중입니다...",
  "⏳ 데이터가 많을 경우 1~2분 정도 소요될 수 있습니다...",
  "📊 상호명과 결제 금액을 맞추고 있습니다...",
  "🚀 꼼꼼하게 처리 중입니다! 잠시만 더 기다려주세요...",
];

export const AiLoadingIndicator: React.FC = () => {
  const messages = isAiDebugMode() ? DEBUG_AI_MESSAGES : NEUTRAL_MESSAGES;
  return (
    <AiLoadingBlock
      messages={messages}
      subText="데이터 크기(행 개수)에 따라 15초에서 최대 2분까지 소요될 수 있습니다."
    />
  );
};
