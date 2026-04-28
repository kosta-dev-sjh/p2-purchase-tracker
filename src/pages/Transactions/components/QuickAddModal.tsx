/**
 * 역할: 거래내역 페이지의 "+ 거래 추가" FAB 에서 띄우는 가벼운 입력 모달.
 *       페이지 이동 없이 컨텍스트를 유지하면서 거래 1건을 빠르게 등록할 수 있게 합니다.
 *       복잡한 메타(결제방식·할부·상품·메모 등) 가 필요하면 "자세히 입력" 으로 수동 입력
 *       페이지로 이동.
 *
 * 위치: src/pages/Transactions/components/QuickAddModal.tsx
 */
import React, { useMemo, useState } from "react";
import styled from "styled-components";
import { Modal } from "../../../components/modal/Modal";
import { Button } from "../../../components/primitives/Button";
import { TextInput } from "../../../components/form/TextInput";
import { AmountInput } from "../../../components/form/AmountInput";
import { DatePicker } from "../../../components/primitives/DatePicker";
import { tokens } from "../../../styles/tokens";
import { sortCategoriesByStandard } from "../../../constants/labels";
import { useCategoriesStore } from "../../../stores/categoriesStore";
import { todayAsDotDate } from "../../../utils/date";
import type { TxRow, TxCategory } from "./TransactionTable";

/** 거래유형 토글. 수동 입력 페이지의 TypeToggle 과 톤 통일. */
/*
 * 모달 상단 안내 배너. "+ 거래 추가" FAB 으로 들어온 사용자가 "왜 결제방식·상품·메모 같은
 * 필드가 안 보이지?" 라고 헷갈리지 않도록, 이 모달이 의도적으로 간소화돼 있음을 명시하고
 * 자세한 입력 경로(수동 입력 페이지) 를 같이 안내합니다. (2026-04-28)
 *
 * 톤: accentSubtle 배경 + accent 테두리 — 경고가 아닌 정보성 톤이라 negSubtle 류는 피함.
 */
const Hint = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 14px;
  padding: 10px 12px;
  /* tokens 에 별도 accent 보더 토큰이 없어 인라인 alpha 사용. accent(#4F46E5) 18% — 배경색
     accentSubtle(#EEF0FF) 위에서 1px 윤곽이 보일 정도의 옅은 보더. */
  border: 1px solid rgba(79, 70, 229, 0.18);
  border-radius: ${tokens.radius.control};
  background: ${tokens.color.accentSubtle};
  color: ${tokens.color.ink2};
  font-size: 12px;
  line-height: 1.55;

  .icon {
    flex: 0 0 16px;
    margin-top: 1px;
    color: ${tokens.color.accent};
  }
  strong {
    color: ${tokens.color.ink1};
    font-weight: 700;
  }
  button {
    border: 0;
    background: transparent;
    padding: 0;
    color: ${tokens.color.accentHover};
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
    font-weight: 700;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  button:hover {
    color: ${tokens.color.accentActive};
  }
  button:focus-visible {
    outline: none;
    box-shadow: ${tokens.shadow.focus};
    border-radius: 2px;
  }
`;

const TypeToggle = styled.div`
  display: inline-flex;
  background: ${tokens.color.tint};
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
`;

const TypeChip = styled.button<{ $active?: boolean }>`
  padding: 6px 14px;
  border: none;
  border-radius: 6px;
  background: ${({ $active }) => ($active ? tokens.color.panel : "transparent")};
  color: ${({ $active }) => ($active ? tokens.color.ink1 : tokens.color.ink3)};
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  box-shadow: ${({ $active }) =>
    $active ? "0 1px 2px rgba(16, 24, 40, .08)" : "none"};

  &:focus-visible {
    outline: none;
    box-shadow: ${tokens.shadow.focus};
  }
`;

const FieldRow = styled.div`
  display: grid;
  gap: 4px;
  margin-bottom: 14px;

  .label {
    color: ${tokens.color.ink2};
    font-size: 12px;
    font-weight: 600;
  }
  .label .req {
    margin-left: 3px;
    color: ${tokens.color.neg};
  }
  .help {
    color: ${tokens.color.ink4};
    font-size: 11px;
  }
`;

const CategoryRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const CategoryChip = styled.button<{ $active?: boolean }>`
  padding: 5px 10px;
  border: 1px solid
    ${({ $active }) => ($active ? tokens.color.accent : tokens.color.line)};
  border-radius: 999px;
  background: ${({ $active }) =>
    $active ? tokens.color.accentSubtle : tokens.color.panel};
  color: ${({ $active }) =>
    $active ? tokens.color.accentHover : tokens.color.ink2};
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  &:focus-visible {
    outline: none;
    box-shadow: ${tokens.shadow.focus};
  }
`;

const ErrorLine = styled.div`
  margin: 8px 0 12px;
  padding: 6px 10px;
  border: 1px solid ${tokens.color.negBorder};
  border-radius: ${tokens.radius.control};
  background: ${tokens.color.negSubtle};
  color: ${tokens.color.neg};
  font-size: 12px;
`;

const Footer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
`;

const FullFormLink = styled.button`
  border: 0;
  background: transparent;
  color: ${tokens.color.accentHover};
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 0;
  &:hover {
    text-decoration: underline;
  }
  &:focus-visible {
    outline: none;
    text-decoration: underline;
  }
`;

interface Props {
  onClose: () => void;
  onSubmit: (row: TxRow) => void;
  /** "자세히 입력" — 결제방식·상품 등 풀 폼이 필요할 때. */
  onOpenFullForm: () => void;
}

export const QuickAddModal: React.FC<Props> = ({
  onClose,
  onSubmit,
  onOpenFullForm,
}) => {
  const [type, setType] = useState<"expense" | "income">("expense");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayAsDotDate());
  const [category, setCategory] = useState<string>("etc");
  const [error, setError] = useState<string | null>(null);

  const storeCategories = useCategoriesStore();
  const categoryOptions = useMemo(
    () =>
      sortCategoriesByStandard(storeCategories).map((c) => ({
        key: c.id,
        label: c.name,
      })),
    [storeCategories],
  );

  const handleSave = () => {
    setError(null);
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("거래명을 입력해 주세요.");
      return;
    }
    const amountNum = Number(amount.replace(/[^0-9]/g, ""));
    if (!amountNum || Number.isNaN(amountNum)) {
      setError("금액을 숫자로 입력해 주세요.");
      return;
    }
    if (!date.trim()) {
      setError("거래일자를 선택해 주세요.");
      return;
    }
    const signedAmount = type === "expense" ? -amountNum : amountNum;
    const row: TxRow = {
      id: `manual-${Date.now()}`,
      type,
      date,
      platform: "unspecified",
      categories: [category as TxCategory],
      title: trimmedTitle,
      amount: signedAmount,
      // 모두 "기타" 폴백. 자세한 분류가 필요하면 자세히 입력 페이지로.
      status: "etc",
      source: "manual",
      detail: { items: [], source: "MANUAL" },
    };
    onSubmit(row);
  };

  return (
    <Modal isOpen onClose={onClose} title="거래 추가">
      <Hint role="note">
        <svg
          className="icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          width="16"
          height="16"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span>
          여기는 <strong>빠른 기록용</strong> 입력창이에요. 결제방식·할부·상품·메모 같은
          상세 항목까지 입력하려면{" "}
          <button type="button" onClick={onOpenFullForm}>
            수동 입력 페이지로 이동
          </button>
          해 주세요.
        </span>
      </Hint>
      <FieldRow>
        <span className="label">거래 유형</span>
        <TypeToggle role="tablist" aria-label="거래 유형">
          <TypeChip
            type="button"
            role="tab"
            aria-selected={type === "expense"}
            $active={type === "expense"}
            onClick={() => setType("expense")}
          >
            지출
          </TypeChip>
          <TypeChip
            type="button"
            role="tab"
            aria-selected={type === "income"}
            $active={type === "income"}
            onClick={() => setType("income")}
          >
            수입
          </TypeChip>
        </TypeToggle>
      </FieldRow>
      <FieldRow>
        <span className="label">
          거래명<span className="req">*</span>
        </span>
        <TextInput
          placeholder={
            type === "expense"
              ? "예: 쿠팡 주문, 스타벅스 강남점"
              : "예: 월급, 환불(쿠팡 반품)"
          }
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </FieldRow>
      <FieldRow>
        <span className="label">
          금액<span className="req">*</span>
        </span>
        <AmountInput
          placeholder="예: 30,000"
          value={amount}
          onChange={(rawDigits) => setAmount(rawDigits)}
        />
      </FieldRow>
      <FieldRow>
        <span className="label">
          거래일자<span className="req">*</span>
        </span>
        <DatePicker
          value={date}
          onChange={setDate}
          maxDate={todayAsDotDate()}
          aria-label="거래일자"
        />
      </FieldRow>
      <FieldRow>
        <span className="label">카테고리</span>
        <CategoryRow>
          {categoryOptions.map(({ key, label }) => (
            <CategoryChip
              key={key}
              type="button"
              $active={category === key}
              onClick={() => setCategory(key)}
            >
              {label}
            </CategoryChip>
          ))}
        </CategoryRow>
      </FieldRow>
      {error && <ErrorLine role="alert">{error}</ErrorLine>}
      <Footer>
        <FullFormLink type="button" onClick={onOpenFullForm}>
          + 자세히 입력 (메모·상품·결제방식)
        </FullFormLink>
        <Button variant="primary" onClick={handleSave}>
          저장
        </Button>
      </Footer>
    </Modal>
  );
};
