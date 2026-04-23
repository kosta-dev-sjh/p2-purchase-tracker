/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\OcrUpload\components\GuideCard.tsx
 */
import React from "react";
import styled from "styled-components";
import { Card, CardBd, CardHd, CardTitle } from "../../../components/primitives/Card";
import { tokens } from "../../../styles/tokens";

const List = styled.ul`
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const Item = styled.li`
  display: grid;
  grid-template-columns: 16px 1fr;
  gap: 10px;
  align-items: start;
  color: ${tokens.color.ink2};
  font-size: 13px;
  line-height: 1.5;

  &::before {
    content: "";
    width: 4px;
    height: 4px;
    margin-top: 9px;
    margin-left: 6px;
    border-radius: 50%;
    background: ${tokens.color.accent};
  }
`;

export const GuideCard: React.FC<{ items: string[] }> = ({ items }) => (
  <Card>
    <CardHd>
      <CardTitle>업로드 가이드</CardTitle>
    </CardHd>
    <CardBd>
      <List>
        {items.map((item, index) => (
          <Item key={index}>
            <span>{item}</span>
          </Item>
        ))}
      </List>
    </CardBd>
  </Card>
);

