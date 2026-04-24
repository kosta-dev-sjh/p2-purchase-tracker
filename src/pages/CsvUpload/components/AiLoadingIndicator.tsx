/**
 * 역할: 엑셀/CSV 업로드 후 AI 가 거래 행을 추출하는 동안 보여주는 로딩 블록.
 *       실제 로딩 UX(스피너·회전 메시지) 는 공용 AiLoadingBlock 에서 담당하고,
 *       여기서는 CSV 문맥에 맞는 메시지 카피만 주입합니다.
 *       OCR AI 보정 단계와 같은 톤으로 통일감 유지.
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
