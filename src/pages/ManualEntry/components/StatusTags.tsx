/**
 * 역할: 수동 입력 폼에서 거래 상태를 고르는 토글 칩 그룹.
 *       거래 유형(지출/수입)에 따라 표시할 상태를 statusOptions.ts의 매핑에서 가져와 그립니다.
 *       옵션 리스트/헬퍼는 UI 밖(statusOptions.ts)에 두고 이 파일은 시각적 표현만 담당해,
 *       react-refresh 규칙과의 충돌을 피하고 테스트도 쉽게 만듭니다.
 * 위치: src\pages\ManualEntry\components\StatusTags.tsx
 */
import React from "react";
import styled from "styled-components";
import { tokens } from "../../../styles/tokens";
import { STATUS_LABELS } from "../../../constants/labels";
import type { TxStatus, TxType } from "../../Transactions/components/TransactionTable";
import { STATUS_OPTIONS_BY_TYPE } from "./statusOptions";

/** StatusKey를 공식 TxStatus와 별칭으로 맞춰 매핑 단계를 없앱니다. */
export type StatusKey = TxStatus;

const Row = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const Chip = styled.button<{ $on?: boolean }>`
  padding: 5px 12px;
  border: 1px solid ${({ $on }) => ($on ? tokens.color.accentBorder : tokens.color.line)};
  border-radius: 6px;
  background: ${({ $on }) => ($on ? tokens.color.accentSubtle : tokens.color.panel)};
  color: ${({ $on }) => ($on ? tokens.color.accentHover : tokens.color.ink2)};
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  transition:
    background ${tokens.motion.fast},
    border-color ${tokens.motion.fast},
    color ${tokens.motion.fast};
`;

export const StatusTags: React.FC<{
  value: StatusKey | null;
  type: TxType;
  onChange: (value: StatusKey | null) => void;
}> = ({ value, type, onChange }) => {
  const options = STATUS_OPTIONS_BY_TYPE[type];
  return (
    <Row>
      {options.map((key) => (
        <Chip
          key={key}
          type="button"
          $on={value === key}
          onClick={() => onChange(value === key ? null : key)}
        >
          {STATUS_LABELS[key]}
        </Chip>
      ))}
    </Row>
  );
};
