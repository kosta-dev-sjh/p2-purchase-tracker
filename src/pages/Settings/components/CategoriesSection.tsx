/**
 * 역할: 설정 화면의 카테고리 관리 블록.
 *       - 목록/색상은 categoriesStore에서 구독하므로, 이 화면에서 편집한 값이
 *         분석(카테고리별 지출)과 거래 내역(카테고리 색상 컬럼)에 즉시 반영됩니다.
 *       - "기타"는 모든 미지정 거래의 폴백이라 삭제할 수 없게 잠가두고, 목록 맨 위에 고정합니다.
 *       - 그 외 카테고리는 언제든 삭제할 수 있고, 사용자가 원하는 이름/색으로 추가할 수도 있습니다.
 *       - 각 행의 건수는 transactionsStore를 구독해 실제 거래 수를 반영합니다.
 *         사용자 정의 카테고리는 아직 거래와 연결되지 않으므로 0건으로 표시됩니다.
 * 위치: src\pages\Settings\components\CategoriesSection.tsx
 */
import React, { useMemo, useState } from "react";
import styled from "styled-components";
import { tokens } from "../../../styles/tokens";
import { SettingsBlock } from "./SettingsSection";
import { Button } from "../../../components/primitives/Button";
import { useTransactionsStore } from "../../../stores/transactionsStore";
import {
  categoriesStore,
  useCategoriesStore,
} from "../../../stores/categoriesStore";
import type { TxCategory } from "../../../pages/Transactions/components/TransactionTable";
import type { ConceptId } from "../../../data/categoryConcepts";
import { CategoryAddModal, type CategoryAddPayload } from "./CategoryAddModal";

const HeaderBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
`;

const HeaderNote = styled.span`
  color: ${tokens.color.ink4};
  font-size: 12px;
`;

const List = styled.div`
  display: grid;
`;

/**
 * 한 줄짜리 카테고리 행. 잠긴(isLocked) 행은 배경과 텍스트를 한 톤 내려서
 * "이 줄은 고정 항목"이라는 점을 한눈에 알 수 있게 합니다.
 * 그리드 마지막 두 칼럼은 "수정"과 "삭제" 버튼 자리입니다(잠긴 행에서는 삭제 칼럼이 빈 공간으로 남음).
 */
const Row = styled.div<{ $locked?: boolean }>`
  display: grid;
  grid-template-columns: 16px 1fr auto auto auto;
  gap: 10px;
  align-items: center;
  padding: 12px 12px;
  border-bottom: 1px solid ${tokens.color.line2};
  background: ${({ $locked }) => ($locked ? tokens.color.foot : "transparent")};
  color: ${({ $locked }) => ($locked ? tokens.color.ink4 : "inherit")};
  border-radius: ${({ $locked }) => ($locked ? tokens.radius.control : "0")};
  margin: ${({ $locked }) => ($locked ? "0 -12px" : "0")};

  &:last-of-type {
    border-bottom: none;
  }
`;

const Dot = styled.span<{ $color: string; $muted?: boolean }>`
  width: 12px;
  height: 12px;
  border-radius: 3px;
  background: ${({ $color }) => $color};
  opacity: ${({ $muted }) => ($muted ? 0.7 : 1)};
`;

const NameCell = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`;

const Name = styled.span`
  color: ${tokens.color.ink1};
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const LockBadge = styled.span`
  padding: 2px 8px;
  border-radius: ${tokens.radius.chip};
  background: ${tokens.color.tint};
  color: ${tokens.color.ink4};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
`;

const Count = styled.span`
  color: ${tokens.color.ink4};
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
`;

/**
 * 행 액션 버튼의 공통 베이스. "수정"은 뉴트럴 hover, "삭제"는 위험 hover로 분기해 쓰도록
 * variant를 받아 색만 바꿔줍니다.
 */
const RowActionButton = styled.button<{ $variant: "edit" | "delete" }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 10px;
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.control};
  background: ${tokens.color.panel};
  color: ${tokens.color.ink3};
  cursor: pointer;
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 600;
  transition:
    background ${tokens.motion.fast} ease,
    border-color ${tokens.motion.fast} ease,
    color ${tokens.motion.fast} ease;

  &:hover:not(:disabled) {
    background: ${({ $variant }) =>
      $variant === "delete" ? tokens.color.negBg : tokens.color.tint};
    border-color: ${({ $variant }) =>
      $variant === "delete" ? tokens.color.negBorder : tokens.color.accent};
    color: ${({ $variant }) =>
      $variant === "delete" ? tokens.color.neg : tokens.color.accentHover};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

/**
 * 표준 카테고리 키인지 판별합니다. custom_ 접두사가 붙지 않은 값은 표준 키로 간주합니다.
 */
function isTxCategoryKey(id: string): id is TxCategory {
  return id === "living" || id === "fashion" || id === "digital" || id === "food" || id === "etc";
}

/**
 * 모달의 두 가지 동작 모드. addOpen=true 또는 editTarget이 채워지면 모달이 열립니다.
 * 동시에 둘 다 열리는 경우는 없습니다.
 */
type ModalState =
  | { kind: "closed" }
  | { kind: "add" }
  | {
      kind: "edit";
      id: string;
      name: string;
      color: string;
      locked: boolean;
      conceptIds: ConceptId[];
    };

export const CategoriesSection: React.FC = () => {
  const rows = useTransactionsStore();
  const categories = useCategoriesStore();
  const [modal, setModal] = useState<ModalState>({ kind: "closed" });

  /**
   * 표준 카테고리별 거래 건수 집계. 사용자 정의 카테고리는 아직 TxCategory union에 들어가지 않으므로
   * 0건으로 표시됩니다(데모 범위).
   */
  const countByCategory = useMemo(() => {
    const counter: Record<TxCategory, number> = {
      living: 0,
      fashion: 0,
      digital: 0,
      food: 0,
      etc: 0,
    };
    for (const row of rows) {
      // 다중 카테고리 정책과 동일하게, 거래 하나가 카테고리 N개에 속하면 N개 모두에 1건씩 집계합니다.
      for (const cat of row.categories) {
        counter[cat] += 1;
      }
    }
    return counter;
  }, [rows]);

  const handleSubmit = (payload: CategoryAddPayload) => {
    if (modal.kind === "edit") {
      categoriesStore.update(modal.id, {
        name: payload.name,
        color: payload.color,
        conceptIds: payload.conceptIds,
      });
    } else if (modal.kind === "add") {
      categoriesStore.addCustom(payload);
    }
  };

  const handleDelete = (id: string) => {
    categoriesStore.remove(id);
  };

  // 편집 모드일 때는 자기 자신 이름을 중복 검사 대상에서 제외해야 "이름 그대로 색만 바꾸기"가 막히지 않습니다.
  const existingNames = categories
    .filter((category) =>
      modal.kind === "edit" ? category.id !== modal.id : true
    )
    .map((category) => category.name);

  return (
    <>
      <SettingsBlock
        title="카테고리"
        subtitle="지출과 수입을 구분하는 카테고리 목록이에요. 색상은 리포트와 차트에 반영돼요. ‘기타’는 카테고리를 지정하지 않은 거래의 기본값이라 수정·삭제할 수 없어요."
      >
        <HeaderBar>
          <HeaderNote>총 {categories.length}개 · 기타 제외 수정·삭제 가능</HeaderNote>
          <Button variant="secondary" size="sm" onClick={() => setModal({ kind: "add" })}>
            + 카테고리 추가
          </Button>
        </HeaderBar>
        <List>
          {categories.map((category) => {
            const count = category.isStandard && isTxCategoryKey(category.id)
              ? countByCategory[category.id]
              : 0;
            return (
              <Row
                key={category.id}
                $locked={category.isLocked}
                aria-disabled={category.isLocked || undefined}
                title={category.isLocked ? "기타는 미지정 거래의 기본값이라 편집할 수 없어요" : undefined}
              >
                <Dot $color={category.color} $muted={category.isLocked} />
                <NameCell>
                  <Name>{category.name}</Name>
                  {category.isLocked && <LockBadge>기본</LockBadge>}
                </NameCell>
                <Count>{count}건</Count>
                {/* 잠긴(기타) 행은 시스템 디폴트라 색/이름 모두 편집 불가. 수정·삭제 버튼을 둘 다 숨기고
                    그리드 정렬만 유지하기 위해 빈 span으로 자리를 채웁니다. */}
                {category.isLocked ? (
                  <>
                    <span aria-hidden="true" />
                    <span aria-hidden="true" />
                  </>
                ) : (
                  <>
                    <RowActionButton
                      type="button"
                      $variant="edit"
                      aria-label={`${category.name} 카테고리 수정`}
                      title="수정"
                      onClick={() =>
                        setModal({
                          kind: "edit",
                          id: category.id,
                          name: category.name,
                          color: category.color,
                          locked: category.isLocked,
                          conceptIds: category.conceptIds,
                        })
                      }
                    >
                      수정
                    </RowActionButton>
                    <RowActionButton
                      type="button"
                      $variant="delete"
                      aria-label={`${category.name} 카테고리 삭제`}
                      title="삭제"
                      onClick={() => handleDelete(category.id)}
                    >
                      삭제
                    </RowActionButton>
                  </>
                )}
              </Row>
            );
          })}
        </List>
      </SettingsBlock>
      <CategoryAddModal
        key={
          modal.kind === "edit"
            ? `edit-${modal.id}`
            : modal.kind === "add"
              ? "add"
              : "closed"
        }
        isOpen={modal.kind !== "closed"}
        existingNames={existingNames}
        mode={
          modal.kind === "edit"
            ? {
                kind: "edit",
                initialName: modal.name,
                initialColor: modal.color,
                initialConceptIds: modal.conceptIds,
                nameLocked: modal.locked,
              }
            : { kind: "add" }
        }
        onClose={() => setModal({ kind: "closed" })}
        onSubmit={handleSubmit}
      />
    </>
  );
};
