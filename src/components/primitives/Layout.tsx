/**
 * 역할: 버튼, 카드처럼 여러 화면에서 재사용하는 기본 UI 컴포넌트입니다.
 * 위치: src\components\primitives\Layout.tsx
 */
import styled from "styled-components";

export const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

interface StackProps {
  gap?: number;
}

export const Stack = styled.div<StackProps>`
  display: flex;
  flex-direction: column;
  gap: ${({ gap }) => `${gap || 0}px`};
`;

interface GridProps {
  columns?: string;
  gap?: number;
}

export const Grid = styled.div<GridProps>`
  display: grid;
  grid-template-columns: ${({ columns }) => columns || "1fr"};
  gap: ${({ gap }) => `${gap || 0}px`};
`;
