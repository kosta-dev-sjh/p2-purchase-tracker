/**
 * 역할: 저장 완료 후 무엇이 추가됐고 무엇이 건너뛰어졌는지 상세히 알려주는 모달.
 *       확인 버튼을 누르면 거래내역 페이지로 이동합니다.
 *       인라인 배너 대신 모달로 보여줘야 사용자가 결과를 인지하고 다음 화면으로 넘어갑니다.
 * 위치: src/components/modal/SaveResultModal.tsx
 */
import React from "react";
import styled from "styled-components";
import { Modal } from "./Modal";
import { Button } from "../primitives/Button";
import { tokens } from "../../styles/tokens";
import { formatKRW } from "../../utils/format";
import type { TxRow } from "../../pages/Transactions/components/TransactionTable";
import type { SkippedItem, MergeAction } from "../../utils/duplicateCheck";

// ─── 섹션 공통 ────────────────────────────────────────────────

const Section = styled.div`
  & + & {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid ${tokens.color.line2};
  }
`;

const SectionHead = styled.div<{ $color?: string }>`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 700;
  color: ${({ $color }) => $color ?? tokens.color.ink1};
`;

const ItemList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ItemRow = styled.li`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 6px;
  background: ${tokens.color.tint};
  font-size: 12.5px;
`;

const ItemTitle = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${tokens.color.ink1};
`;

const ItemMeta = styled.span`
  flex-shrink: 0;
  color: ${tokens.color.ink4};
  font-size: 11.5px;
  font-family: ${tokens.font.mono};
  font-variant-numeric: tabular-nums;
`;

const ItemReason = styled.span`
  flex-shrink: 0;
  color: ${tokens.color.ink4};
  font-size: 11px;
`;

const MoreHint = styled.div`
  margin-top: 4px;
  padding-left: 8px;
  color: ${tokens.color.ink4};
  font-size: 11.5px;
`;

// ─── 하단 액션 ────────────────────────────────────────────────

// 다른 중복/확인 모달과 같은 규약: flex-end + gap 8px + 버튼 min-width 96px.
const Footer = styled.div`
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;

  > button {
    min-width: 96px;
  }
`;

// ─── 타입 ─────────────────────────────────────────────────────

export interface SaveResultModalProps {
  isOpen: boolean;
  /** 새로 저장된 TxRow 목록 */
  savedRows: TxRow[];
  /** 기존 거래에 병합된 건 (existingId + newItems) */
  mergedActions: MergeAction[];
  /** 기존 거래 조회용 (병합 시 제목을 표시하기 위해) */
  allRows: TxRow[];
  /** 건너뛴 항목 목록 */
  skipped: SkippedItem[];
  /** "거래내역 보기" 클릭 시 호출 */
  onConfirm: () => void;
  /** X 버튼으로 닫을 때 호출. 미전달 시 onConfirm 사용 */
  onClose?: () => void;
}

const MAX_LIST = 6;

export const SaveResultModal: React.FC<SaveResultModalProps> = ({
  isOpen,
  savedRows,
  mergedActions,
  allRows,
  skipped,
  onConfirm,
  onClose,
}) => {
  const totalAdded = savedRows.length + mergedActions.length;

  // 모달 타이틀: 뭔가 추가됐으면 성공, 전부 건너뛰면 알림
  const title =
    totalAdded > 0
      ? `${totalAdded}건 처리됐어요`
      : "추가된 내역이 없어요";

  return (
    <Modal isOpen={isOpen} onClose={onClose ?? onConfirm} title={title}>
      {/* ── 새로 저장된 거래 ── */}
      {savedRows.length > 0 && (
        <Section>
          <SectionHead $color={tokens.color.pos ?? "#059669"}>
            <span>✓</span>
            <span>{savedRows.length}건 새로 추가됨</span>
          </SectionHead>
          <ItemList>
            {savedRows.slice(0, MAX_LIST).map((row) => (
              <ItemRow key={row.id}>
                <ItemTitle>{row.title}</ItemTitle>
                <ItemMeta>
                  {row.date} · {formatKRW(Math.abs(row.amount))}
                </ItemMeta>
              </ItemRow>
            ))}
          </ItemList>
          {savedRows.length > MAX_LIST && (
            <MoreHint>… 외 {savedRows.length - MAX_LIST}건</MoreHint>
          )}
        </Section>
      )}

      {/* ── 기존 거래에 상품 병합 ── */}
      {mergedActions.length > 0 && (
        <Section>
          <SectionHead $color={tokens.color.accent}>
            <span>↔</span>
            <span>{mergedActions.length}건 기존 내역에 상품 병합됨</span>
          </SectionHead>
          <ItemList>
            {mergedActions.slice(0, MAX_LIST).map((action) => {
              const existing = allRows.find((r) => r.id === action.existingId);
              return (
                <ItemRow key={action.existingId}>
                  <ItemTitle>
                    {existing?.title ?? "알 수 없는 거래"}
                  </ItemTitle>
                  <ItemMeta>
                    +{action.newItems.length}개 상품
                    {existing ? ` · ${existing.date}` : ""}
                  </ItemMeta>
                </ItemRow>
              );
            })}
          </ItemList>
          {mergedActions.length > MAX_LIST && (
            <MoreHint>… 외 {mergedActions.length - MAX_LIST}건</MoreHint>
          )}
        </Section>
      )}

      {/* ── 건너뛴 항목 ── */}
      {skipped.length > 0 && (
        <Section>
          <SectionHead $color={tokens.color.ink3}>
            <span>—</span>
            <span>{skipped.length}건 건너뜀</span>
          </SectionHead>
          <ItemList>
            {skipped.slice(0, MAX_LIST).map((item, idx) => (
              <ItemRow key={idx}>
                <ItemTitle>{item.title}</ItemTitle>
                <ItemReason>{item.reason}</ItemReason>
              </ItemRow>
            ))}
          </ItemList>
          {skipped.length > MAX_LIST && (
            <MoreHint>… 외 {skipped.length - MAX_LIST}건</MoreHint>
          )}
        </Section>
      )}

      <Footer>
        <Button variant="primary" size="md" onClick={onConfirm}>
          거래내역 보기
        </Button>
      </Footer>
    </Modal>
  );
};
