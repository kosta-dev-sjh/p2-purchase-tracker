/**
 * 역할: "같은 거래로 보이는" 두 건에서 사용자가 수동으로 어느 값을 남길지 고를 수 있게 해 주는 모달.
 *       mergeEnrichment.planEnrichment가 뽑아낸 conflicts 배열을 그대로 받아, 필드마다 라디오 버튼으로
 *       "기존 값 유지" / "새 값으로 교체"를 선택하게 합니다.
 *       자동 보강(autoFills)은 사용자에게 굳이 묻지 않고 호출부에서 바로 반영하므로, 이 모달은 충돌이
 *       있을 때만 열립니다. 사용자가 한 번에 모든 충돌을 해결하도록 디자인했고, 취소하면 "이번엔 아무것도
 *       바꾸지 않기"가 되어 기존 거래는 그대로 유지됩니다.
 * 위치: src/components/modal/ConflictResolveModal.tsx
 */
import React, { useState } from "react";
import styled from "styled-components";
import { Modal } from "./Modal";
import { Button } from "../primitives/Button";
import { tokens } from "../../styles/tokens";
import {
  ENRICHABLE_FIELD_LABEL,
  type ConflictItem,
  combinePatches,
} from "../../utils/mergeEnrichment";
import type { TxRow } from "../../pages/Transactions/components/TransactionTable";

type Choice = "existing" | "incoming";

interface Props {
  isOpen: boolean;
  existing: TxRow;
  conflicts: ConflictItem[];
  /** 새 입력 측의 거래명을 헤더에 노출해서 사용자가 두 건을 구분하기 쉽게 합니다. */
  incomingTitle: string;
  /** 사용자가 선택한 대로 합쳐진 patch를 기존 거래에 적용하도록 호출부에 넘깁니다. */
  onConfirm: (patch: Partial<TxRow>) => void;
  /** 취소 = 아무것도 바꾸지 않고 닫기. */
  onCancel: () => void;
}

const IntroText = styled.p`
  margin: 0 0 16px;
  color: ${tokens.color.ink3};
  font-size: 12.5px;
  line-height: 1.55;

  strong {
    color: ${tokens.color.ink1};
    font-weight: 600;
  }
`;

const ConflictRow = styled.div`
  padding: 12px 0;
  border-top: 1px solid ${tokens.color.line2};

  &:first-of-type {
    border-top: none;
    padding-top: 4px;
  }
`;

const FieldLabel = styled.div`
  margin-bottom: 8px;
  color: ${tokens.color.ink2};
  font-size: 12px;
  font-weight: 700;
`;

const Choices = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
`;

const ChoiceCard = styled.label<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid
    ${({ $active }) => ($active ? tokens.color.accent : tokens.color.line)};
  border-radius: ${tokens.radius.control};
  background: ${({ $active }) =>
    $active ? tokens.color.accentSubtle : tokens.color.panel};
  cursor: pointer;
  transition:
    border-color ${tokens.motion.fast} ease,
    background ${tokens.motion.fast} ease;

  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
`;

const ChoiceCaption = styled.span`
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: ${tokens.color.ink4};
  text-transform: uppercase;
`;

const ChoiceValue = styled.span`
  font-size: 12.5px;
  color: ${tokens.color.ink1};
  line-height: 1.4;
  word-break: break-word;
`;

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
`;

export const ConflictResolveModal: React.FC<Props> = ({
  isOpen,
  existing,
  conflicts,
  incomingTitle,
  onConfirm,
  onCancel,
}) => {
  // 기본 선택은 "기존 값 유지" — 가장 안전한 쪽이고, 사용자가 아무것도 건드리지 않고 확인만 눌러도
  // 데이터가 바뀌지 않게 합니다. 새 값을 원하면 해당 필드만 명시적으로 클릭하면 됩니다.
  const [choices, setChoices] = useState<Record<string, Choice>>(() => {
    const initial: Record<string, Choice> = {};
    for (const conflict of conflicts) initial[conflict.field] = "existing";
    return initial;
  });

  const handleConfirm = () => {
    // 사용자가 "새 값으로 교체"를 고른 필드만 incomingPatch를 합쳐 하나의 patch로 만듭니다.
    const patches = conflicts
      .filter((conflict) => choices[conflict.field] === "incoming")
      .map((conflict) => conflict.incomingPatch);
    onConfirm(combinePatches(patches));
  };

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title="어느 값을 남길까요?">
      <IntroText>
        <strong>{existing.title}</strong>와 <strong>{incomingTitle || "새 입력"}</strong>이
        같은 거래로 보이지만, 아래 항목은 서로 다른 값을 갖고 있어요. 기존 거래에 무엇을 남길지 골라 주세요.
      </IntroText>
      {conflicts.map((conflict) => {
        const current = choices[conflict.field];
        return (
          <ConflictRow key={conflict.field}>
            <FieldLabel>{ENRICHABLE_FIELD_LABEL[conflict.field]}</FieldLabel>
            <Choices>
              <ChoiceCard $active={current === "existing"}>
                <input
                  type="radio"
                  name={`resolve-${conflict.field}`}
                  checked={current === "existing"}
                  onChange={() =>
                    setChoices((prev) => ({ ...prev, [conflict.field]: "existing" }))
                  }
                />
                <ChoiceCaption>기존 값 유지</ChoiceCaption>
                <ChoiceValue>{conflict.existingDisplay}</ChoiceValue>
              </ChoiceCard>
              <ChoiceCard $active={current === "incoming"}>
                <input
                  type="radio"
                  name={`resolve-${conflict.field}`}
                  checked={current === "incoming"}
                  onChange={() =>
                    setChoices((prev) => ({ ...prev, [conflict.field]: "incoming" }))
                  }
                />
                <ChoiceCaption>새 값으로 교체</ChoiceCaption>
                <ChoiceValue>{conflict.incomingDisplay}</ChoiceValue>
              </ChoiceCard>
            </Choices>
          </ConflictRow>
        );
      })}
      <Footer>
        <Button variant="secondary" size="md" onClick={onCancel}>
          취소
        </Button>
        <Button variant="primary" size="md" onClick={handleConfirm}>
          선택 적용
        </Button>
      </Footer>
    </Modal>
  );
};
