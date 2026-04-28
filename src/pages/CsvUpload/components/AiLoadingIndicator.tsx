/**
 * 역할: 엑셀/CSV 업로드 후 파일 구조를 해석하는 동안 보여주는 로딩 블록.
 *       실제 로딩 UX(스피너·회전 메시지)는 공용 AiLoadingBlock 에서 담당하고,
 *       여기서는 CSV 문맥에 맞는 메시지 카피만 주입합니다.
 *
 *       CSV 쪽은 업로드 플로우 자체가 "AI 가 분석한다"는 맥락을 자연스럽게 드러내고 있어
 *       로딩 문구에서 AI를 숨길 필요는 없습니다. OCR 쪽의 "2차 확인 중" 식 중립화는
 *       OCR 특유의 UX 원칙(이미지 인식 파이프라인 세부를 사용자에게 숨김) 때문.
 *
 * 위치: src/pages/CsvUpload/components/AiLoadingIndicator.tsx
 */
import React from "react";
import { AiLoadingBlock } from "../../../components/primitives/AiLoadingBlock";

const CSV_MESSAGES = [
  "✨ 엑셀 파일의 구조를 스캔하고 있습니다...",
  "🤖 AI가 흩어진 결제 내역을 분석하는 중입니다...",
  "⏳ 데이터가 많을 경우 1~2분 정도 소요될 수 있습니다...",
  "📊 상호명과 결제 금액을 맞추고 있습니다...",
  "🚀 꼼꼼하게 처리 중입니다! 잠시만 더 기다려주세요...",
];

export const AiLoadingIndicator: React.FC = () => (
  <AiLoadingBlock
    messages={CSV_MESSAGES}
    subText="데이터 크기(행 개수)에 따라 15초에서 최대 2분까지 소요될 수 있습니다."
  />
);
