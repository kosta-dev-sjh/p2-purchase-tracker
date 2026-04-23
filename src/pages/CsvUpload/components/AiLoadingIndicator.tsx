import React, { useState, useEffect } from "react";
import styled, { keyframes } from "styled-components";
import { tokens } from "../../../styles/tokens";

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
  padding: 16px;
  gap: 16px;
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
  animation: ${pulse} 2s ease-in-out infinite;
  text-align: center;
  transition: opacity 0.5s ease-in-out;
`;

const SubText = styled.div`
  color: ${tokens.color.ink4};
  font-size: 12px;
  margin-top: -8px;
`;

const messages = [
  "✨ 엑셀 파일의 구조를 스캔하고 있습니다...",
  "🤖 AI가 흩어진 결제 내역을 분석하는 중입니다...",
  "⏳ 데이터가 많을 경우 1~2분 정도 소요될 수 있습니다...",
  "📊 상호명과 결제 금액을 맞추고 있습니다...",
  "🚀 꼼꼼하게 처리 중입니다! 잠시만 더 기다려주세요..."
];

export const AiLoadingIndicator: React.FC = () => {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const intervals = [3000, 5000, 10000, 10000]; // 3초, 8초, 18초, 28초 후 전환
    
    const timers = intervals.map((_, index) => {
      const accumulatedDelay = intervals.slice(0, index + 1).reduce((a, b) => a + b, 0);
      return setTimeout(() => {
        setMsgIdx(index + 1);
      }, accumulatedDelay);
    });

    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <Container>
      <Spinner />
      <Message>{messages[msgIdx]}</Message>
      <SubText>데이터 크기(행 개수)에 따라 15초에서 최대 2분까지 소요될 수 있습니다.</SubText>
    </Container>
  );
};
