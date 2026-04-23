/**
 * 역할: OCR 저장 시 기존 거래와 매칭되는 후보가 있을 때, 병합할지 새 거래로 저장할지
 *       사용자에게 물어보는 모달입니다. 자동 병합은 하지 않고 항상 사용자 선택을 받습니다.
 * 위치: src\components\modal\MatchTransactionModal.tsx
 */
import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { Modal } from "./Modal";
import { Button } from "../primitives/Button";
import { Tag } from "../primitives/Tag";
import { tokens } from "../../styles/tokens";
import { formatKRW } from "../../utils/format";
import { PLATFORM_LABELS } from "../../constants/labels";
import type { TxRow } from "../../pages/Transactions/components/TransactionTable";

interface MatchTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: {
    platform: TxRow["platform"];
    date: string;
    amount: number;
    itemCount: number;
  };
  matches: TxRow[];
  onAttachToExisting: (transactionId: string) => void;
  onSaveAsNew: () => void;
}

const Description = styled.p`
  margin: 0 0 16px;
  color: ${tokens.color.ink3};
  font-size: 13px;
  line-height: 1.6;
`;

// 대상 거래 요약 블록 공통 규약: solid line 보더 + card radius + foot 배경.
// (다른 중복/확인 모달의 대상 거래 블록과 동일한 톤을 공유합니다.)
const CandidateBlock = styled.div`
  padding: 12px 14px;
  margin-bottom: 16px;
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.card};
  background: ${tokens.color.foot};

  .label {
    color: ${tokens.color.ink4};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-top: 6px;
    color: ${tokens.color.ink1};
    font-size: 13px;
  }

  .amount {
    font-family: ${tokens.font.mono};
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
`;

const MatchList = styled.div`
  display: grid;
  gap: 8px;
  margin-bottom: 16px;
`;

// 매칭 후보 행. 다른 중복/확인 모달의 요약 블록과 같은 radius/line 톤을 공유하되
// 선택 시 accent 하이라이트로 "선택됨" 상태만 분리해 보여 줍니다.
const MatchOption = styled.button<{ $selected?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid
    ${({ $selected }) => ($selected ? tokens.color.accent : tokens.color.line)};
  border-radius: ${tokens.radius.card};
  background: ${({ $selected }) =>
    $selected ? tokens.color.accentSubtle : tokens.color.panel};
  color: ${tokens.color.ink1};
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  transition:
    border-color ${tokens.motion.fast} ease,
    background ${tokens.motion.fast} ease;

  &:hover {
    border-color: ${tokens.color.accent};
  }

  &:focus-visible {
    box-shadow: ${tokens.shadow.focus};
    outline: none;
  }

  .left {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;

    .title {
      color: ${tokens.color.ink1};
      font-size: 14px;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .meta {
      color: ${tokens.color.ink4};
      font-size: 12px;
    }
  }

  .amount {
    color: ${tokens.color.ink1};
    font-family: ${tokens.font.mono};
    font-size: 13px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
`;

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;

  > button {
    min-width: 96px;
  }
`;

export const MatchTransactionModal: React.FC<MatchTransactionModalProps> = ({
  isOpen,
  onClose,
  candidate,
  matches,
  onAttachToExisting,
  onSaveAsNew,
}) => {
  const [selectedId, setSelectedId] = useState<string>(matches[0]?.id ?? "");

  useEffect(() => {
    if (isOpen) {
      setSelectedId(matches[0]?.id ?? "");
    }
  }, [isOpen, matches]);

  const canAttach = Boolean(selectedId);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="이미 기록된 결제건이 있어요">
      <Description>
        아래 거래에 OCR로 추출한 상품을 추가하거나, 별도 거래로 저장할 수 있어요.
        자동으로 병합하지 않으니 원하는 쪽을 선택해 주세요.
      </Description>

      <CandidateBlock>
        <div className="label">이번에 저장할 OCR 결과</div>
        <div className="row">
          <span>
            <Tag kind={candidate.platform}>{PLATFORM_LABELS[candidate.platform]}</Tag>
            &nbsp;· {candidate.date} · 상품 {candidate.itemCount}개
          </span>
          <span className="amount">{formatKRW(candidate.amount)}</span>
        </div>
      </CandidateBlock>

      <MatchList>
        {matches.map((row) => {
          const isSelected = row.id === selectedId;
          const existingItems = row.detail?.items.length ?? 0;
          return (
            <MatchOption
              key={row.id}
              type="button"
              $selected={isSelected}
              onClick={() => setSelectedId(row.id)}
            >
              <div className="left">
                <div className="title">{row.title}</div>
                <div className="meta">
                  {PLATFORM_LABELS[row.platform]} · {row.date}
                  {existingItems > 0 ? ` · 기존 상품 ${existingItems}개` : ""}
                </div>
              </div>
              <div className="amount">{formatKRW(Math.abs(row.amount))}</div>
            </MatchOption>
          );
        })}
      </MatchList>

      <Footer>
        <Button variant="ghost" size="md" onClick={onSaveAsNew}>
          새 거래로 저장
        </Button>
        <Button
          variant="primary"
          size="md"
          onClick={() => onAttachToExisting(selectedId)}
          disabled={!canAttach}
        >
          이 거래 수정하기
        </Button>
      </Footer>
    </Modal>
  );
};
