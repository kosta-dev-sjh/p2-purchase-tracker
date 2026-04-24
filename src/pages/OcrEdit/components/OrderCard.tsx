/**
 * 역할: OCR 편집 화면에서 "주문 한 건"을 통째로 렌더링하는 독립 카드.
 *       이전 버전의 EditForm은 한 이미지의 여러 주문을 한 카드 안에 블록으로 끼워 넣었는데,
 *       실제 저장 단위는 "주문 = TxRow 1건"이라 UI도 주문별로 완결된 카드로 끊어 주는 편이
 *       데이터 모델과 일관됩니다. 각 카드는 자기 주문의 플랫폼 · 주문일자 · 상태 · 전체 거래금액 ·
 *       상품 목록 · 카테고리까지 혼자 들고 있고, 다른 카드와 섞이지 않습니다.
 *       쿠팡/네이버처럼 플랫폼이 달라도 노출 필드는 동일하게 유지해 한 화면에서
 *       주문을 비교·편집하기 쉽도록 했습니다.
 * 위치: src\pages\OcrEdit\components\OrderCard.tsx
 */
import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { Card, CardBd } from "../../../components/primitives/Card";
import { DatePicker } from "../../../components/primitives/DatePicker";
import { Tag } from "../../../components/primitives/Tag";
import { tokens } from "../../../styles/tokens";
import { PLATFORM_LABELS, STATUS_LABELS } from "../../../constants/labels";
import type { OcrOrder, Platform, Status } from "../data";
import { ProductTable } from "./ProductTable";

/**
 * 카테고리 한 항목. key는 내부 식별용, label은 사용자에게 보이는 이름.
 * 기본 카테고리 4개는 CATEGORY_LABELS에서 주입하고, 사용자가 추가한 항목은 시간값 기반 key로 구분합니다.
 * (CategoryOption을 OrderCard에 둔 이유는 EditForm이 OrderCard에 의존하는 단방향 흐름을 만들기 위해서입니다.)
 */
export interface CategoryOption {
  key: string;
  label: string;
}

const CardWrap = styled(Card)`
  & + & {
    margin-top: 12px;
  }
`;

/**
 * 카드 최상단 행. 왼쪽에 플랫폼 태그, 오른쪽에 "삭제" 버튼이 놓입니다.
 * 플랫폼 태그를 카드마다 반복해서 보여 주는 이유는 주문별로 TxRow가 분리 저장되기 때문에
 * "이 카드에 담긴 거래가 어느 플랫폼 건인지"를 사용자가 언제든 확신할 수 있어야 해서입니다.
 */
const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 14px;
`;

const HeaderTags = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
`;

/**
 * 카드 우측 상단의 삭제 버튼. 잘못 섞여 들어간 주문 한 건만 떼어낼 때 사용합니다.
 * 평상시에는 ink 계열로 차분하게 두고 hover 시 negative 토큰으로 전환해 삭제 의도를 명확히 합니다.
 */
const DeleteButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: ${tokens.radius.control};
  background: transparent;
  color: ${tokens.color.ink4};
  cursor: pointer;
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 600;
  transition:
    background ${tokens.motion.fast},
    color ${tokens.motion.fast},
    border-color ${tokens.motion.fast};

  &:hover {
    background: ${tokens.color.negSubtle};
    color: ${tokens.color.neg};
    border-color: ${tokens.color.negBorder};
  }

  &:focus-visible {
    outline: none;
    box-shadow: ${tokens.shadow.focus};
  }

  svg {
    width: 12px;
    height: 12px;
  }
`;

const MetaRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid ${tokens.color.line2};
`;

const MetaCell = styled.div`
  .label {
    color: ${tokens.color.ink4};
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .value {
    margin-top: 2px;
    color: ${tokens.color.ink1};
    font-size: 12.5px;
    font-weight: 500;
  }
`;

/**
 * 메타 행은 주문일자·상품수·상태 태그를 좁은 가로 바에 병렬로 배치하므로
 * DatePicker 트리거 기본 너비(100%)로 두면 행이 밀립니다. 여기서는 140px로
 * 고정해 원래의 DateInput과 같은 슬롯 크기를 유지합니다.
 */
const DatePickerSlot = styled.div`
  margin-top: 2px;
  width: 140px;
`;

const MetaSeparator = styled.span`
  width: 1px;
  height: 24px;
  background: ${tokens.color.line2};
`;

/**
 * statusTag을 클릭으로 편집할 수 있게 감싸는 래퍼.
 *
 * 디자인 요구사항: 기존 Tag의 외형(크기·색·라운드)을 그대로 보여주되,
 * "클릭해서 바꿀 수 있다"는 사실만 전달되어야 합니다.
 *  - resting 상태: Tag 그대로, 테두리/배경 추가 없음
 *  - hover 상태: accent 색의 옅은 외곽 링을 살짝 띄워 상호작용 힌트
 *  - open 상태: 조금 더 진한 링으로 "지금 편집 중"을 표시
 */
const StatusTagWrapper = styled.div`
  position: relative;
  display: inline-flex;
`;

const StatusTagTrigger = styled.button`
  display: inline-flex;
  align-items: center;
  padding: 0;
  margin: 0;
  border: none;
  border-radius: ${tokens.radius.tag};
  background: transparent;
  cursor: pointer;
  line-height: 0;
  transition: box-shadow ${tokens.motion.fast} ease;

  &:hover {
    box-shadow: 0 0 0 2px ${tokens.color.accentSubtle};
  }

  &[aria-expanded="true"] {
    box-shadow: 0 0 0 2px ${tokens.color.accent};
  }

  &:focus-visible {
    outline: none;
    box-shadow: ${tokens.shadow.focus};
  }
`;

const StatusPopover = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  min-width: 116px;
  padding: 4px;
  background: ${tokens.color.panel};
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.control};
  box-shadow: ${tokens.shadow.cardHover};
`;

const StatusOptionButton = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border: none;
  border-radius: ${tokens.radius.tag};
  background: ${({ $active }) =>
    $active ? tokens.color.accentSubtle : "transparent"};
  color: ${({ $active }) =>
    $active ? tokens.color.accentHover : tokens.color.ink2};
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition: background ${tokens.motion.fast} ease;

  &:hover {
    background: ${tokens.color.tint};
  }
`;

/**
 * OCR 편집 화면에서 사용자에게 노출할 상태 선택지.
 * 구매/정기결제/취소/환불 4개로 쇼핑 플랫폼 대부분의 케이스를 커버합니다.
 */
const STATUS_EDIT_OPTIONS: Status[] = ["purchase", "sub", "cancel", "refund"];

interface EditableStatusTagProps {
  value: Status;
  onChange: (next: Status) => void;
}

const EditableStatusTag: React.FC<EditableStatusTagProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    // 팝오버 바깥 클릭/Esc로 닫기. open일 때만 리스너를 걸어 불필요한 이벤트 구독을 피합니다.
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <StatusTagWrapper ref={wrapperRef}>
      <StatusTagTrigger
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`거래유형 ${STATUS_LABELS[value]} · 클릭해서 변경`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Tag kind={value}>{STATUS_LABELS[value]}</Tag>
      </StatusTagTrigger>
      {open && (
        <StatusPopover role="listbox">
          {STATUS_EDIT_OPTIONS.map((option) => (
            <StatusOptionButton
              key={option}
              type="button"
              role="option"
              aria-selected={option === value}
              $active={option === value}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
            >
              <span>{STATUS_LABELS[option]}</span>
              {option === value && (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 8.5 6.5 12 13 4.5" />
                </svg>
              )}
            </StatusOptionButton>
          ))}
        </StatusPopover>
      )}
    </StatusTagWrapper>
  );
};

const Total = styled.div`
  margin-bottom: 16px;
  padding: 8px 0 4px;

  .label {
    margin-bottom: 6px;
    color: ${tokens.color.ink4};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .value {
    color: ${tokens.color.ink1};
    font-family: ${tokens.font.mono};
    font-size: 20px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  /* 아래 상품 목록에서 자동 계산된 값임을 사용자에게 알려 주는 작은 보조 문구.
   * "왜 이 칸이 비활성화되어 있지?"라는 혼란을 막기 위한 안전장치입니다. */
  .hint {
    margin-top: 4px;
    color: ${tokens.color.ink4};
    font-size: 11px;
    line-height: 1.45;
  }
`;

const SectionLabel = styled.div`
  margin-bottom: 10px;
  color: ${tokens.color.ink2};
  font-size: 12px;
  font-weight: 600;
`;

/**
 * 카테고리 체크박스 영역. ManualEntry의 CheckChip과 시각적으로 일관되게 맞추되,
 * 여기서는 각 칩에 삭제 버튼을 두어 목록 자체를 늘리거나 줄일 수 있게 합니다.
 */
const CategorySection = styled.div`
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid ${tokens.color.line2};
`;

const CategoryHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
`;

const CategoryTitle = styled.div`
  color: ${tokens.color.ink2};
  font-size: 12px;
  font-weight: 600;
`;

const CategoryHelp = styled.div`
  margin-bottom: 10px;
  color: ${tokens.color.ink4};
  font-size: 11.5px;
  line-height: 1.5;
`;

const CheckGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const CheckChip = styled.label<{ $checked: boolean }>`
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px 6px 12px;
  border: 1px solid
    ${({ $checked }) => ($checked ? tokens.color.accent : tokens.color.line)};
  border-radius: ${tokens.radius.chip};
  background: ${({ $checked }) =>
    $checked ? tokens.color.accentSubtle : tokens.color.panel};
  color: ${({ $checked }) =>
    $checked ? tokens.color.accentHover : tokens.color.ink2};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  transition:
    background ${tokens.motion.fast} ease,
    border-color ${tokens.motion.fast} ease,
    color ${tokens.motion.fast} ease;

  &:hover {
    border-color: ${tokens.color.accent};
  }

  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
    width: 0;
    height: 0;
  }

  .mark {
    display: grid;
    place-items: center;
    width: 14px;
    height: 14px;
    border-radius: 4px;
    background: ${({ $checked }) =>
      $checked ? tokens.color.accent : "transparent"};
    border: 1.5px solid
      ${({ $checked }) => ($checked ? tokens.color.accent : tokens.color.ink5)};
    color: #fff;
    transition:
      background ${tokens.motion.fast} ease,
      border-color ${tokens.motion.fast} ease;
  }
`;

const RemoveChipButton = styled.button`
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
  margin-left: 2px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: ${tokens.color.ink4};
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  transition:
    background ${tokens.motion.fast} ease,
    color ${tokens.motion.fast} ease;

  &:hover {
    background: ${tokens.color.line2};
    color: ${tokens.color.ink1};
  }
`;

const AddArea = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
`;

const AddInput = styled.input`
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.control};
  background: ${tokens.color.panel};
  color: ${tokens.color.ink1};
  font-family: inherit;
  font-size: 12.5px;
  outline: none;
  transition: border-color ${tokens.motion.fast}, box-shadow ${tokens.motion.fast};

  &::placeholder {
    color: ${tokens.color.ink5};
  }

  &:focus {
    border-color: ${tokens.color.accent};
    box-shadow: ${tokens.shadow.focus};
  }
`;

const AddButton = styled.button`
  height: 32px;
  padding: 0 12px;
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.control};
  background: ${tokens.color.panel};
  color: ${tokens.color.ink2};
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  transition: background ${tokens.motion.fast}, border-color ${tokens.motion.fast};

  &:hover:not(:disabled) {
    border-color: ${tokens.color.accent};
    color: ${tokens.color.accentHover};
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const ToggleAdd = styled.button`
  border: none;
  background: none;
  color: ${tokens.color.accentHover};
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
`;

export interface OrderCardProps {
  platform: Platform;
  order: OcrOrder;
  /**
   * 주문일자·상태 태그 변경. 상위(OcrEditPage)에서 해당 주문만 patch합니다.
   * totalAmount는 상품 목록의 파생값으로 자동 동기화되므로 여기서는 받지 않습니다.
   */
  onOrderPatch?: (patch: Partial<Pick<OcrOrder, "orderDate" | "statusTag">>) => void;
  /**
   * 상품 목록 변경. ProductTable에서 상품을 추가·수정·삭제할 때마다 올라옵니다.
   */
  onProductsChange?: (products: OcrOrder["products"]) => void;
  /**
   * 이 주문 블록 삭제 요청. 실제 삭제·캐스케이드 확인 모달 처리는 상위에서 담당합니다.
   */
  onDelete?: () => void;
  /**
   * 카테고리 목록 자체는 화면 전체에서 공유되므로 상위에서 내려옵니다.
   * 사용자가 한 카드에서 "뷰티"를 추가해도 다른 카드의 카테고리 칩 목록에 같이 반영돼야
   * 목록을 반복해서 만들지 않게 됩니다.
   */
  categories: CategoryOption[];
  /** 이 주문이 체크한 카테고리 키 목록. 선택 상태는 주문 단위라서 카드별로 분리됩니다. */
  selectedKeys: string[];
  onToggleCategory: (key: string) => void;
  onAddCategory: (label: string) => void;
  onRemoveCategory: (key: string) => void;
}

export const OrderCard: React.FC<OrderCardProps> = ({
  platform,
  order,
  onOrderPatch,
  onProductsChange,
  onDelete,
  categories,
  selectedKeys,
  onToggleCategory,
  onAddCategory,
  onRemoveCategory,
}) => {
  // "+ 카테고리 추가" 입력 토글 상태는 카드별로 독립. 여러 카드에서 동시에 입력 중이어도 섞이지 않게 합니다.
  const [isAdding, setIsAdding] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");

  const handleAddCategory = () => {
    const label = draftLabel.trim();
    if (!label) return;
    onAddCategory(label);
    setDraftLabel("");
    setIsAdding(false);
  };

  return (
    <CardWrap>
      <CardBd>
        <HeaderRow>
          <HeaderTags>
            <Tag kind={platform}>{PLATFORM_LABELS[platform]}</Tag>
          </HeaderTags>
          {onDelete && (
            <DeleteButton type="button" aria-label="이 주문 삭제" onClick={onDelete}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
              삭제
            </DeleteButton>
          )}
        </HeaderRow>

        <MetaRow>
          <MetaCell>
            <div className="label">주문일자 *</div>
            {onOrderPatch ? (
              /* 수동 입력과 동일한 공용 DatePicker. 내부에서 YYYY.MM.DD ↔ YYYY-MM-DD 변환을 처리합니다. */
              <DatePickerSlot>
                <DatePicker
                  id={`ocr-order-date-${order.id}`}
                  value={order.orderDate}
                  onChange={(value) => onOrderPatch({ orderDate: value })}
                  size="sm"
                  aria-label="주문일자"
                />
              </DatePickerSlot>
            ) : (
              <div className="value">{order.orderDate}</div>
            )}
          </MetaCell>
          <MetaSeparator />
          <MetaCell>
            <div className="label">상품 수</div>
            <div className="value">{order.products.length}개</div>
          </MetaCell>
          <MetaSeparator />
          <MetaCell>
            <div className="label">상태</div>
            <div className="value" style={{ marginTop: 4 }}>
              {onOrderPatch ? (
                <EditableStatusTag
                  value={order.statusTag}
                  onChange={(next) => onOrderPatch({ statusTag: next })}
                />
              ) : (
                <Tag kind={order.statusTag}>{STATUS_LABELS[order.statusTag]}</Tag>
              )}
            </div>
          </MetaCell>
        </MetaRow>

        <Total>
          <div className="label">전체 거래금액 *</div>
          {/*
            totalAmount는 아래 상품 목록의 (가격 × 수량) 합계로 자동 계산됩니다.
            과거에는 이 필드가 개별 입력 칸이었고, 상품합계와 값이 다르면 저장 시점에
            경고 모달이 떴습니다. 쿠팡 파서가 결제 섹션을 섹션 경계로 걸러내면서
            "총 결제금액"이 상품으로 오인식될 일이 없어져, totalAmount를 파생값으로
            두는 쪽이 일관성 면에서 명확해졌습니다. id는 validateBeforeSave에서
            focusOrderField가 참조하므로 유지합니다.
          */}
          <div
            id={`ocr-order-amount-${order.id}`}
            className="value"
            role="status"
            aria-live="polite"
            aria-label="전체 거래금액 (자동 계산)"
            tabIndex={-1}
          >
            ₩{order.totalAmount.toLocaleString("ko-KR")}
          </div>
          <div className="hint">
            아래 상품 목록의 (가격 × 수량) 합계로 자동 계산돼요. 상품을 추가·수정·삭제하면 즉시 반영됩니다.
          </div>
        </Total>

        <SectionLabel>상품 목록 *</SectionLabel>
        <ProductTable
          products={order.products}
          onChange={onProductsChange}
          statusTag={order.statusTag}
          fieldIdPrefix={`ocr-order-${order.id}`}
        />

        <CategorySection>
          <CategoryHeader>
            <CategoryTitle>카테고리</CategoryTitle>
            {!isAdding && (
              <ToggleAdd type="button" onClick={() => setIsAdding(true)}>
                + 카테고리 추가
              </ToggleAdd>
            )}
          </CategoryHeader>
          <CategoryHelp>
            이 주문에 붙일 카테고리예요. 하나의 거래가 여러 카테고리에 걸칠 수 있어서
            여러 개 선택할 수 있고, 오른쪽 × 버튼으로 목록에서 제거할 수도 있습니다.
          </CategoryHelp>
          <CheckGroup>
            {categories.map((category) => {
              const checked = selectedKeys.includes(category.key);
              return (
                <CheckChip key={category.key} $checked={checked}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleCategory(category.key)}
                  />
                  <span className="mark" aria-hidden="true">
                    {checked && (
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 8.5 6.5 12 13 4.5" />
                      </svg>
                    )}
                  </span>
                  {category.label}
                  <RemoveChipButton
                    type="button"
                    aria-label={`${category.label} 카테고리 삭제`}
                    onClick={(event) => {
                      // label 클릭 시 체크박스 토글이 함께 발동하는 걸 막습니다.
                      event.preventDefault();
                      event.stopPropagation();
                      onRemoveCategory(category.key);
                    }}
                  >
                    ×
                  </RemoveChipButton>
                </CheckChip>
              );
            })}
            {categories.length === 0 && (
              <div style={{ fontSize: 12, color: tokens.color.ink4 }}>
                등록된 카테고리가 없어요. 오른쪽 위 '카테고리 추가'를 눌러 만들어 보세요.
              </div>
            )}
          </CheckGroup>

          {isAdding && (
            <AddArea>
              <AddInput
                type="text"
                placeholder="예: 취미, 반려동물, 뷰티"
                value={draftLabel}
                onChange={(event) => setDraftLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleAddCategory();
                  } else if (event.key === "Escape") {
                    setIsAdding(false);
                    setDraftLabel("");
                  }
                }}
                autoFocus
                aria-label="새 카테고리 이름"
              />
              <AddButton
                type="button"
                onClick={handleAddCategory}
                disabled={!draftLabel.trim()}
              >
                추가
              </AddButton>
              <AddButton
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setDraftLabel("");
                }}
              >
                취소
              </AddButton>
            </AddArea>
          )}
        </CategorySection>
      </CardBd>
    </CardWrap>
  );
};
