/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Transactions\components\FilterBar.tsx
 */
import { useRef, useState } from "react";
import styled, { css } from "styled-components";
import { CATEGORY_LABELS, PLATFORM_LABELS, STATUS_LABELS } from "../../../constants/labels";
import { SegmentedControl } from "../../../components/primitives/SegmentedControl";
import { tokens } from "../../../styles/tokens";
import { media } from "../../../tokens/breakpoints";
import type { TxCategory, TxPlatform, TxStatus, TxType } from "./TransactionTable";

export type TypeFilter = "all" | TxType;
export type StatusFilter = "all" | TxStatus;

interface FilterBarProps {
  search: string;
  typeFilter: TypeFilter;
  platform: "all" | TxPlatform;
  category: "all" | TxCategory;
  statusFilter: StatusFilter;
  /** 모바일 아이콘 바의 정렬 토글을 여기서 함께 다루기 위해 받아 둡니다. PC 에서는 테이블 헤더가 정렬을 담당합니다. */
  sortOrder: "desc" | "asc";
  onToggleSort: () => void;
  onSearchChange: (value: string) => void;
  onTypeChange: (value: TypeFilter) => void;
  onPlatformChange: (value: "all" | TxPlatform) => void;
  onCategoryChange: (value: "all" | TxCategory) => void;
  onStatusChange: (value: StatusFilter) => void;
}

const TYPE_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "expense", label: "지출" },
  { value: "income", label: "수입" },
];

/**
 * PC/태블릿에서는 기존 가로 정렬을, 모바일에서는 완전히 다른 "아이콘 바 + 확장 패널" 구조를
 * 보여줍니다. 두 구조를 같은 컴포넌트 안에서 display 로 토글해, 상위에서 별도 분기 없이 한 번만
 * 불러 쓸 수 있게 합니다.
 *
 * - 모바일에서 position: sticky 로 화면 상단(모바일 네비 바로 아래)에 달라붙게 해, 긴 거래 목록을
 *   스크롤하는 동안에도 검색/필터/정렬에 즉시 접근할 수 있게 합니다.
 *   top 값은 AppShell 의 MobileNav (padding 10/8 + head 30 + gap 8 + rail ~30) 높이를
 *   대략 86px 로 잡아 두었습니다. MobileNav 구조가 바뀌면 여기 상수도 같이 확인해야 합니다.
 */
const Wrap = styled.div`
  ${media.mobile} {
    position: sticky;
    top: 86px;
    z-index: 10;
    margin: -4px -2px 0;
    padding: 6px 2px 0;
    /* sticky 로 떠 있을 때 아래 콘텐츠가 비치지 않도록 배경을 깔아 둡니다. */
    background: ${tokens.color.bg};
  }
`;

const DesktopBar = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto auto;
  gap: 8px;
  align-items: center;

  ${media.tablet} {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: 10px;
  }

  ${media.mobile} {
    display: none;
  }
`;

const MobileBar = styled.div`
  display: none;

  ${media.mobile} {
    display: grid;
    gap: 8px;
  }
`;

/**
 * 모바일 상단 아이콘 줄.
 * 검색 · 필터 · 정렬 세 가지를 "작게 아이콘" 으로만 노출하고, 디테일은 각각 펼친 패널에서 다룹니다.
 * 검색과 필터는 토글이라 버튼 상태(활성/비활성)로 배경/테두리가 바뀌고,
 * 정렬은 방향만 전환되므로 같은 형태로 두되 셰브런 방향만 회전합니다.
 */
const IconRow = styled.div`
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.control};
  background: ${tokens.color.panel};
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04);

  .summary {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: ${tokens.color.ink4};
    font-size: 12px;
    font-weight: 500;
  }

  .summary strong {
    color: ${tokens.color.ink2};
    font-weight: 700;
  }
`;

const IconButton = styled.button<{ $active?: boolean }>`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: ${tokens.radius.control};
  border: 1px solid ${({ $active }) => ($active ? tokens.color.accentBorder : tokens.color.line)};
  background: ${({ $active }) => ($active ? tokens.color.accentSubtle : tokens.color.foot)};
  color: ${({ $active }) => ($active ? tokens.color.accentHover : tokens.color.ink3)};
  cursor: pointer;
  transition:
    background ${tokens.motion.fast} ease,
    border-color ${tokens.motion.fast} ease,
    color ${tokens.motion.fast} ease;

  &:hover:not(:disabled) {
    color: ${tokens.color.ink1};
    border-color: ${tokens.color.accentBorder};
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const Badge = styled.span`
  position: absolute;
  top: 3px;
  right: 3px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${tokens.color.accent};
  border: 2px solid ${tokens.color.panel};
`;

const SortChevron = styled.span<{ $dir: "desc" | "asc" }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transform: ${({ $dir }) => ($dir === "desc" ? "rotate(0deg)" : "rotate(180deg)")};
  transition: transform ${tokens.motion.fast} ease;
`;

const panelOpen = css`
  max-height: 400px;
  opacity: 1;
  transform: translateY(0);
`;

const panelClosed = css`
  max-height: 0;
  opacity: 0;
  transform: translateY(-4px);
  pointer-events: none;
`;

/**
 * 검색/필터 패널 모두 공통으로 쓰는 "위에서 펼쳐지는" 컨테이너입니다.
 * max-height + opacity 로 부드럽게 열리고 닫히며, 닫힐 때는 pointer-events 를 꺼 키보드/터치가
 * 숨겨진 영역에 닿지 않게 합니다.
 */
const CollapsiblePanel = styled.div<{ $open: boolean }>`
  overflow: hidden;
  transition:
    max-height ${tokens.motion.fast} ease,
    opacity ${tokens.motion.fast} ease,
    transform ${tokens.motion.fast} ease;
  ${({ $open }) => ($open ? panelOpen : panelClosed)}
`;

const SearchPanel = styled.div`
  display: grid;
  gap: 8px;
  padding: 10px 2px 0;
`;

const FilterPanel = styled.div`
  display: grid;
  gap: 10px;
  padding: 12px;
  margin-top: 8px;
  border: 1px solid ${tokens.color.line2};
  border-radius: ${tokens.radius.card};
  background: ${tokens.color.panel};
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05);
`;

const FilterGroupLabel = styled.div`
  margin-top: 2px;
  color: ${tokens.color.ink4};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
`;

const Search = styled.div`
  position: relative;

  .input {
    width: 100%;
    height: 34px;
    padding: 0 12px 0 34px;
    border: 1px solid ${tokens.color.line};
    border-radius: ${tokens.radius.control};
    background: ${tokens.color.panel};
    color: ${tokens.color.ink1};
    font-size: ${tokens.type.bodySm.size};
    outline: none;
    transition: border-color ${tokens.motion.fast}, box-shadow ${tokens.motion.fast};
  }

  .input:hover {
    border-color: ${tokens.color.ink5};
  }

  .input:focus,
  .input:focus-visible {
    border-color: ${tokens.color.accent};
    box-shadow: ${tokens.shadow.focus};
  }

  .input:focus ~ .icon {
    color: ${tokens.color.accent};
  }

  .input::placeholder {
    color: ${tokens.color.ink5};
  }

  .icon {
    position: absolute;
    left: 10px;
    top: 50%;
    width: 14px;
    height: 14px;
    transform: translateY(-50%);
    color: ${tokens.color.ink4};
    pointer-events: none;
    transition: color ${tokens.motion.fast} ease;
  }
`;

/** 레퍼런스의 `btn-ghost ▾` 드롭다운 버튼 느낌으로 스타일한 네이티브 select. */
const Select = styled.select`
  height: 34px;
  padding: 0 28px 0 12px;
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.control};
  background-color: ${tokens.color.panel};
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none' stroke='%238A94A6' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'><path d='M1 1l4 4 4-4'/></svg>");
  background-repeat: no-repeat;
  background-position: right 10px center;
  color: ${tokens.color.ink2};
  font-family: inherit;
  font-size: ${tokens.type.caption.size};
  font-weight: 600;
  outline: none;
  cursor: pointer;
  appearance: none;
  transition:
    border-color ${tokens.motion.fast} ease,
    box-shadow ${tokens.motion.fast} ease,
    color ${tokens.motion.fast} ease;

  &:hover {
    border-color: ${tokens.color.ink5};
    color: ${tokens.color.ink1};
  }

  &:focus,
  &:focus-visible {
    border-color: ${tokens.color.accent};
    box-shadow: ${tokens.shadow.focus};
  }
`;

/**
 * 돋보기/필터/화살표 아이콘. 인라인으로 두어 별도 아이콘 팩 의존을 피합니다.
 */
const SearchIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="7" cy="7" r="5" />
    <path d="M11 11l3 3" />
  </svg>
);

const FilterIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 4h12" />
    <path d="M4 8h8" />
    <path d="M6 12h4" />
  </svg>
);

const ChevronIcon = () => (
  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 4.5 6 7.5 9 4.5" />
  </svg>
);

export const FilterBar = ({
  search,
  typeFilter,
  platform,
  category,
  statusFilter,
  sortOrder,
  onToggleSort,
  onSearchChange,
  onTypeChange,
  onPlatformChange,
  onCategoryChange,
  onStatusChange,
}: FilterBarProps) => {
  // 모바일 아이콘 바 상태. 검색/필터 패널은 서로 독립적으로 열고 닫힐 수 있습니다.
  // 검색어가 이미 들어가 있는 상태로 페이지에 다시 들어오면 검색 패널을 자동으로 펼쳐 두어,
  // 사용자가 "왜 필터링이 되어 있지?" 하고 당황하지 않게 합니다.
  const [searchOpen, setSearchOpen] = useState(() => search.trim().length > 0);
  const [filterOpen, setFilterOpen] = useState(false);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  const handleSearchToggle = () => {
    setSearchOpen((current) => {
      const next = !current;
      if (next) {
        // 검색 패널을 열 때 자동으로 포커스가 잡히도록, 다음 프레임에 input.focus() 호출
        requestAnimationFrame(() => mobileSearchInputRef.current?.focus());
      }
      return next;
    });
  };

  // 필터 배지: type/platform/category/status 중 하나라도 "all" 이 아니면 활성으로 간주합니다.
  // 검색어는 별도 아이콘(search)의 활성 표시로 나타나기 때문에 여기 계산에서는 제외합니다.
  const activeFilterCount = [
    typeFilter !== "all",
    platform !== "all",
    category !== "all",
    statusFilter !== "all",
  ].filter(Boolean).length;

  return (
    <Wrap>
      <DesktopBar>
        <Search>
          <input
            className="input"
            placeholder="주문명·상품명 검색"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          <svg
            className="icon"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="5" />
            <path d="M11 11l3 3" />
          </svg>
        </Search>
        <SegmentedControl value={typeFilter} options={TYPE_OPTIONS} onChange={onTypeChange} />
        <Select
          value={platform}
          onChange={(event) => onPlatformChange(event.target.value as "all" | TxPlatform)}
        >
          <option value="all">플랫폼 전체</option>
          <option value="coupang">{PLATFORM_LABELS.coupang}</option>
          <option value="naver">{PLATFORM_LABELS.naver}</option>
          <option value="musinsa">{PLATFORM_LABELS.musinsa}</option>
          {/* 수동 입력에서 플랫폼을 고르지 않은 거래도 따로 걸러 볼 수 있게 "미지정" 옵션을 둡니다. */}
          <option value="unspecified">{PLATFORM_LABELS.unspecified}</option>
        </Select>
        <Select
          value={category}
          onChange={(event) => onCategoryChange(event.target.value as "all" | TxCategory)}
        >
          <option value="all">카테고리 전체</option>
          <option value="living">{CATEGORY_LABELS.living}</option>
          <option value="fashion">{CATEGORY_LABELS.fashion}</option>
          <option value="digital">{CATEGORY_LABELS.digital}</option>
          <option value="food">{CATEGORY_LABELS.food}</option>
          {/* "기타"는 카테고리 미지정 거래를 걸러볼 수 있는 단일 진입점입니다. */}
          <option value="etc">{CATEGORY_LABELS.etc}</option>
        </Select>
        <Select
          value={statusFilter}
          onChange={(event) => onStatusChange(event.target.value as StatusFilter)}
        >
          <option value="all">상태 전체</option>
          <option value="purchase">{STATUS_LABELS.purchase}</option>
          <option value="cancel">{STATUS_LABELS.cancel}</option>
          <option value="refund">{STATUS_LABELS.refund}</option>
          <option value="sub">{STATUS_LABELS.sub}</option>
          {/* "기타" 상태는 지출·수입 양쪽 폴백이라 상태 필터에도 노출해 수동 입력 정리에 쓰도록 합니다. */}
          <option value="etc">{STATUS_LABELS.etc}</option>
        </Select>
      </DesktopBar>

      <MobileBar>
        {/* 한 줄짜리 아이콘 바: 검색 · 필터 · (현재 필터 요약) · 정렬.
            사용자가 한 손으로 쥔 상태에서 엄지로 빠르게 닿는 위치를 가정하고 34px 타겟으로 크게 잡았습니다. */}
        <IconRow>
          <IconButton
            type="button"
            $active={searchOpen || search.trim().length > 0}
            aria-label={searchOpen ? "검색 패널 닫기" : "검색 열기"}
            aria-pressed={searchOpen}
            onClick={handleSearchToggle}
          >
            <SearchIcon />
            {search.trim().length > 0 && <Badge aria-hidden="true" />}
          </IconButton>
          <IconButton
            type="button"
            $active={filterOpen || activeFilterCount > 0}
            aria-label={filterOpen ? "필터 패널 닫기" : "필터 열기"}
            aria-pressed={filterOpen}
            onClick={() => setFilterOpen((current) => !current)}
          >
            <FilterIcon />
            {activeFilterCount > 0 && <Badge aria-hidden="true" />}
          </IconButton>
          <span className="summary">
            {/* 현재 활성화된 주요 필터(유형/정렬)를 한 줄로 요약해, 패널을 열지 않아도 지금 보고 있는
                거래 목록의 조건을 바로 읽을 수 있게 합니다. */}
            {typeFilter !== "all" ? (
              <>
                <strong>{typeFilter === "expense" ? "지출" : "수입"}</strong>만 보기
              </>
            ) : (
              <>전체 거래</>
            )}
            {activeFilterCount > 1 && <> · 필터 {activeFilterCount}개</>}
          </span>
          <IconButton
            type="button"
            aria-label={
              sortOrder === "desc"
                ? "최신순 정렬 중. 누르면 과거순으로 바뀝니다."
                : "과거순 정렬 중. 누르면 최신순으로 바뀝니다."
            }
            aria-pressed={sortOrder === "asc"}
            onClick={onToggleSort}
          >
            <SortChevron $dir={sortOrder}>
              <ChevronIcon />
            </SortChevron>
          </IconButton>
        </IconRow>

        <CollapsiblePanel $open={searchOpen}>
          <SearchPanel>
            <Search>
              <input
                ref={mobileSearchInputRef}
                className="input"
                placeholder="주문명·상품명 검색"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
              />
              <svg
                className="icon"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="7" cy="7" r="5" />
                <path d="M11 11l3 3" />
              </svg>
            </Search>
          </SearchPanel>
        </CollapsiblePanel>

        <CollapsiblePanel $open={filterOpen}>
          <FilterPanel>
            <FilterGroupLabel>유형</FilterGroupLabel>
            <SegmentedControl value={typeFilter} options={TYPE_OPTIONS} onChange={onTypeChange} />
            <FilterGroupLabel>플랫폼</FilterGroupLabel>
            <Select
              value={platform}
              onChange={(event) => onPlatformChange(event.target.value as "all" | TxPlatform)}
            >
              <option value="all">플랫폼 전체</option>
              <option value="coupang">{PLATFORM_LABELS.coupang}</option>
              <option value="naver">{PLATFORM_LABELS.naver}</option>
              <option value="musinsa">{PLATFORM_LABELS.musinsa}</option>
              <option value="unspecified">{PLATFORM_LABELS.unspecified}</option>
            </Select>
            <FilterGroupLabel>카테고리</FilterGroupLabel>
            <Select
              value={category}
              onChange={(event) => onCategoryChange(event.target.value as "all" | TxCategory)}
            >
              <option value="all">카테고리 전체</option>
              <option value="living">{CATEGORY_LABELS.living}</option>
              <option value="fashion">{CATEGORY_LABELS.fashion}</option>
              <option value="digital">{CATEGORY_LABELS.digital}</option>
              <option value="food">{CATEGORY_LABELS.food}</option>
              <option value="etc">{CATEGORY_LABELS.etc}</option>
            </Select>
            <FilterGroupLabel>상태</FilterGroupLabel>
            <Select
              value={statusFilter}
              onChange={(event) => onStatusChange(event.target.value as StatusFilter)}
            >
              <option value="all">상태 전체</option>
              <option value="purchase">{STATUS_LABELS.purchase}</option>
              <option value="cancel">{STATUS_LABELS.cancel}</option>
              <option value="refund">{STATUS_LABELS.refund}</option>
              <option value="sub">{STATUS_LABELS.sub}</option>
              <option value="etc">{STATUS_LABELS.etc}</option>
            </Select>
          </FilterPanel>
        </CollapsiblePanel>
      </MobileBar>
    </Wrap>
  );
};
