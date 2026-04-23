/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\OcrEdit\components\ImagePreview.tsx
 */
import React from "react";
import styled from "styled-components";
import { Card, CardBd } from "../../../components/primitives/Card";
import { tokens } from "../../../styles/tokens";
import type { OcrImageItem } from "../data";

const Wrap = styled(Card)`
  min-height: 480px;
`;

const Body = styled(CardBd)`
  display: grid;
  min-height: 480px;
  place-items: center;
  padding: 0;
`;

const Empty = styled.div`
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 40px;
  color: ${tokens.color.ink4};
  font-size: 13px;

  svg {
    width: 40px;
    height: 40px;
    opacity: 0.5;
  }
`;

const Img = styled.img`
  display: block;
  max-width: 100%;
  max-height: 480px;
  object-fit: contain;
`;

const EmptyIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

export const ImagePreview: React.FC<{ image?: OcrImageItem }> = ({ image }) => (
  <Wrap>
    <Body>
      {image?.thumbUrl ? (
        <Img src={image.thumbUrl} alt={image.fileName} />
      ) : (
        <Empty>
          <EmptyIcon />
          <span>이미지 목록에서 선택하세요</span>
        </Empty>
      )}
    </Body>
  </Wrap>
);

