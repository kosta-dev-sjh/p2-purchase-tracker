/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\ManualEntry\components\MetaFields.tsx
 */
import React from "react";
import styled from "styled-components";
import { FormField } from "../../../components/form/FormField";
import { TextInput } from "../../../components/form/TextInput";
import { AmountInput } from "../../../components/form/AmountInput";
import { AutoResizeTextarea } from "../../../components/form/AutoResizeTextarea";
import { DatePicker } from "../../../components/primitives/DatePicker";
import {
  CATEGORY_LABELS,
  MAX_CATEGORIES_PER_TX,
  PLATFORM_OPTIONS,
} from "../../../constants/labels";
import { tokens } from "../../../styles/tokens";
import { media } from "../../../tokens/breakpoints";
import { useCategoriesStore } from "../../../stores/categoriesStore";

export type CategoryKey = keyof typeof CATEGORY_LABELS;

// 표시 순서의 기준. 스토어에 동일한 id가 있으면 스토어 이름이 우선됩니다.
const CATEGORY_ORDER: CategoryKey[] = ["living", "fashion", "digital", "food", "etc"];

/**
 * 수동 입력 폼의 메타 필드들. 상위 ManualEntry 페이지가 저장 버튼을 눌렀을 때
 * 이 필드 값을 모두 collect 해서 transactionsStore에 addOne() 할 수 있도록
 * 컨트롤드 입력으로 만들었습니다. props가 없으면 undefined 기본값으로 동작합니다.
 *
 * platform 값은 TxPlatform과 동일한 키("coupang" | "naver" | "unspecified")를
 * 그대로 저장합니다. mapPlatform 유틸이 키 문자열과 한글 라벨 양쪽을 모두 받아들여 동일한
 * TxPlatform으로 수렴시키므로, 드롭다운(키) → 저장(키) 흐름에서 별도 변환이 필요 없습니다.
 */
export interface MetaFieldValues {
  title: string;
  amount: string;
  platform: string;
  date: string;
  categories: string[];
  memo: string;
}

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px 16px;
  margin-bottom: 16px;

  ${media.mobile} {
    grid-template-columns: 1fr;
  }
`;

/**
 * 플랫폼 셀렉트. TextInput/DatePicker와 높이(40px)·라운드·라인 컬러를 맞춰서
 * 폼 안에서 시각적으로 튀지 않도록 했습니다.
 */
const PlatformSelect = styled.select`
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border-radius: ${tokens.radius.controlLg};
  border: 1px solid ${tokens.color.line};
  background: ${tokens.color.panel};
  color: ${tokens.color.ink1};
  font-family: inherit;
  font-size: 13px;
  transition: border-color ${tokens.motion.fast}, box-shadow ${tokens.motion.fast};

  &:focus,
  &:focus-visible {
    border-color: ${tokens.color.accent};
    box-shadow: ${tokens.shadow.focus};
    outline: none;
  }
`;

const Field = styled.div<{ $span?: number }>`
  grid-column: span ${({ $span }) => $span ?? 1};

  ${media.mobile} {
    grid-column: span 1;
  }
`;

const CheckGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

/**
 * 하나의 거래가 여러 카테고리에 걸칠 수 있어서 셀렉트 대신 체크박스 칩으로 다중 선택을 받습니다.
 * 네이티브 체크박스를 숨기고 label 자체에 선택 상태 스타일을 입혀 '토글 가능한 칩' 느낌을 냅니다.
 * $disabled인 경우(상한 도달)는 투명도/커서만 바꿔 "지금은 더 못 고른다"는 상태를 부드럽게 전달합니다.
 */
const CheckChip = styled.label<{ $checked: boolean; $disabled?: boolean }>`
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 1px solid
    ${({ $checked }) => ($checked ? tokens.color.accent : tokens.color.line)};
  border-radius: ${tokens.radius.chip};
  background: ${({ $checked }) =>
    $checked ? tokens.color.accentSubtle : tokens.color.panel};
  color: ${({ $checked }) =>
    $checked ? tokens.color.accentHover : tokens.color.ink2};
  font-size: ${tokens.type.caption.size};
  font-weight: 600;
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
  opacity: ${({ $disabled }) => ($disabled ? 0.45 : 1)};
  user-select: none;
  transition:
    background ${tokens.motion.fast} ease,
    border-color ${tokens.motion.fast} ease,
    color ${tokens.motion.fast} ease,
    opacity ${tokens.motion.fast} ease;

  &:hover {
    border-color: ${({ $disabled, $checked }) =>
      $disabled
        ? $checked
          ? tokens.color.accent
          : tokens.color.line
        : tokens.color.accent};
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

/**
 * 카테고리 체크박스 상단에 현재 선택 개수/상한을 안내하는 캡션.
 * 사용자가 더 못 고르는 이유를 UI에서 명확히 밝혀 의도적인 제약임을 드러냅니다.
 */
const CategoryCounter = styled.span<{ $atLimit: boolean }>`
  margin-left: 6px;
  color: ${({ $atLimit }) => ($atLimit ? tokens.color.neg : tokens.color.ink4)};
  font-size: 11px;
  font-weight: 600;
`;

export const MetaFields: React.FC<{
  value: MetaFieldValues;
  onChange: (next: MetaFieldValues) => void;
  fieldIdPrefix?: string;
}> = ({ value, onChange, fieldIdPrefix = "meta" }) => {
  const patch = (partial: Partial<MetaFieldValues>) =>
    onChange({ ...value, ...partial });

  // 카테고리 목록은 스토어 전체 항목을 사용합니다.
  // 표준 카테고리는 기존 순서(CATEGORY_ORDER)로 먼저 정렬하고, 커스텀 카테고리는 뒤에 이어 붙입니다.
  const storeCategories = useCategoriesStore();
  const categoryOptions = [
    ...CATEGORY_ORDER.flatMap((key) => {
      const entry = storeCategories.find((c) => c.id === key);
      return entry ? [{ key: entry.id, label: entry.name }] : [];
    }),
    ...storeCategories
      .filter((c) => !CATEGORY_ORDER.includes(c.id as CategoryKey))
      .map((c) => ({ key: c.id, label: c.name })),
  ];

  // 카테고리 상한(MAX_CATEGORIES_PER_TX)에 도달했으면 새로 추가하는 토글은 무시합니다.
  // 이미 체크된 항목을 끄는 동작은 항상 허용되어야 하므로 가드는 "체크 시도"에만 걸립니다.
  const atLimit = value.categories.length >= MAX_CATEGORIES_PER_TX;
  const toggle = (key: string) => {
    const isChecked = value.categories.includes(key);
    if (!isChecked && atLimit) return;
    patch({
      categories: isChecked
        ? value.categories.filter((k) => k !== key)
        : [...value.categories, key],
    });
  };

  return (
    <Grid>
      <Field>
        <FormField label="거래명" required>
          <TextInput
            id={`${fieldIdPrefix}-title`}
            placeholder="예: 쿠팡 주문, 네이버 환불"
            value={value.title}
            onChange={(event) => patch({ title: event.target.value })}
          />
        </FormField>
      </Field>
      <Field>
        <FormField label="금액" required>
          {/* 저장 형태는 기존과 동일한 raw digit 문자열("129000"). 표시만 콤마가 붙습니다.
              parsePrice()와 자연스럽게 호환되므로 상위 로직 변경이 불필요합니다. */}
          <AmountInput
            id={`${fieldIdPrefix}-amount`}
            placeholder="예: 129,000"
            value={value.amount}
            onChange={(rawDigits) => patch({ amount: rawDigits })}
          />
        </FormField>
      </Field>
      <Field>
        {/*
         * 플랫폼은 "쿠팡/네이버쇼핑" 2개 + "미지정"으로 제한합니다.
         * 수동 입력은 플랫폼이 없는 곳(오프라인 결제 등)도 커버해야 하므로 "미지정"을 기본 선택지로 두고
         * 필수 값에서 빠졌습니다. 기존에는 자유 텍스트라 "쿠팡 위클리" 같은 변형이 들어오면
         * mapPlatform 기본값(coupang)으로 엉뚱하게 수렴되던 문제가 있어 드롭다운으로 제한했습니다.
         */}
        <FormField label="플랫폼" helpText="선택 항목 · 플랫폼이 없는 결제는 '미지정'">
          <PlatformSelect
            value={value.platform || "unspecified"}
            onChange={(event) => patch({ platform: event.target.value })}
            aria-label="플랫폼"
          >
            {PLATFORM_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </PlatformSelect>
        </FormField>
      </Field>
      <Field>
        <FormField label="거래일자" required>
          {/* 저장 포맷("YYYY.MM.DD")을 그대로 주고받을 수 있는 커스텀 DatePicker.
              네이티브 <input type="date">는 브라우저마다 팝업 UI가 달라 디자인 통일이 어려워
              앱 토큰과 같은 결을 쓰는 자체 캘린더로 교체했습니다. */}
          <DatePicker
            id={`${fieldIdPrefix}-date`}
            value={value.date}
            onChange={(next) => patch({ date: next })}
            aria-label="거래일자"
          />
        </FormField>
      </Field>
      <Field $span={2}>
        <FormField
          label={
            <>
              카테고리
              <CategoryCounter $atLimit={atLimit}>
                {value.categories.length}/{MAX_CATEGORIES_PER_TX}
              </CategoryCounter>
            </>
          }
          helpText={`하나의 거래가 여러 카테고리에 걸칠 수 있어요. 최대 ${MAX_CATEGORIES_PER_TX}개까지 선택할 수 있어요.`}
        >
          <CheckGroup>
            {categoryOptions.map(({ key, label }) => {
              const checked = value.categories.includes(key);
              // 상한 도달 + 아직 체크되지 않은 칩만 비활성화. 이미 켠 칩은 항상 끌 수 있어야 합니다.
              const disabled = !checked && atLimit;
              return (
                <CheckChip
                  key={key}
                  $checked={checked}
                  $disabled={disabled}
                  title={
                    disabled
                      ? `카테고리는 최대 ${MAX_CATEGORIES_PER_TX}개까지만 선택할 수 있어요`
                      : undefined
                  }
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(key)}
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
                  {label}
                </CheckChip>
              );
            })}
          </CheckGroup>
        </FormField>
      </Field>
      <Field $span={2}>
        <FormField label="메모" helpText="선택 항목">
          {/* 사용자가 수동 리사이즈 핸들을 드래그하지 않고도 내용에 맞춰 높이가 늘어납니다.
              상한(maxHeight) 에 닿으면 내부 스크롤로 전환되어 폼 전체 레이아웃은 안정적으로 유지. */}
          <AutoResizeTextarea
            placeholder="거래에 대한 메모를 남겨보세요."
            value={value.memo}
            onChange={(event) => patch({ memo: event.target.value })}
          />
        </FormField>
      </Field>
    </Grid>
  );
};
