/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Transactions\components\TransactionTable.tsx
 */
import React, { memo, useEffect, useRef, useState } from "react";
import styled, { css, keyframes } from "styled-components";
import { Card } from "../../../components/primitives/Card";
import { Tag } from "../../../components/primitives/Tag";
import { tokens } from "../../../styles/tokens";
import { media } from "../../../tokens/breakpoints";
import { formatKRW } from "../../../utils/format";
import {
  PLATFORM_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
} from "../../../constants/labels";
import { useCategoryColorMap, useCategoriesStore } from "../../../stores/categoriesStore";

export type TxType = "expense" | "income";
/**
 * 거래가 어떤 플랫폼에서 발생했는지 나타냅니다.
 * - "unspecified"는 사용자가 수동 입력 시 플랫폼을 고르지 않았거나, 플랫폼이 없는 곳(오프라인 결제 등)에서
 *   발생한 거래를 의미합니다. 모든 거래에 플랫폼이 있다고 가정할 수 없기 때문에 열어둔 폴백입니다.
 * - 집계/도넛/분석에서는 "미지정" 라벨로 표시되고, 필터에서도 별도 선택지로 노출됩니다.
 */
export type TxPlatform = "coupang" | "naver" | "unspecified";
/**
 * 거래 상태. 유형별로 쓰이는 맥락이 다릅니다:
 * - purchase/sub/etc: 지출(expense) 쪽에서 선택 가능.
 * - refund/cancel/etc: 수입(income) 쪽에서 선택 가능.
 *   취소는 돈이 다시 들어오는 흐름이라 의미상 수입이지만, 순수입 KPI에서는 제외해야 해서
 *   Home/Analysis 집계 함수(sumIncomeAndRefund 등)가 status === "cancel"을 걸러냅니다.
 *   별도의 "취소 금액" 카드는 status === "cancel"만 모아 보여주고, 부호는 Math.abs로
 *   통일해서 구 OCR 데이터(-부호)와 신규 수입 분류(+부호)를 모두 안전하게 합산합니다.
 * - "etc"(기타): 지출·수입 모두에서 쓸 수 있는 폴백.
 */
export type TxStatus = "purchase" | "cancel" | "refund" | "sub" | "etc";
/**
 * 거래에 붙는 카테고리 ID. 표준 5종(living/fashion/digital/food/etc) 외에
 * 사용자가 설정에서 추가한 커스텀 카테고리 ID(custom_xxxx)도 허용합니다.
 * categoriesStore가 유효 ID의 단일 진실원입니다.
 */
export type TxCategory = string;

export type TxSource = "mock" | "csv" | "ocr" | "manual";

export interface TxRow {
  id: string;
  type: TxType;
  date: string;
  platform: TxPlatform;
  /**
   * 한 거래가 속하는 카테고리 목록. 최대 MAX_CATEGORIES_PER_TX개까지 허용합니다.
   * - 첫 번째 원소를 "대표 카테고리"로 취급해서 반복구매/요약처럼 단일 라벨이 필요한 곳에서 사용합니다.
   * - 분석(카테고리별 지출) 집계는 중복 카운트 방식 — 한 거래가 2개 카테고리에 속하면 두 쪽 모두 전액을 더합니다.
   * - 빈 배열은 허용하지 않으며, 카테고리가 없는 거래는 ["etc"]로 저장합니다.
   */
  categories: TxCategory[];
  title: string;
  amount: number;
  status: TxStatus;
  /**
   * 거래가 어떤 반입 경로로 생성됐는지 표시합니다.
   * mock: 초기 시드, csv: 카드 CSV 업로드, ocr: OCR 저장, manual: 수동 입력.
   */
  source?: TxSource;
  /** 수동 입력 시 작성한 메모. 레퍼런스 상세 패널에 노출됩니다. */
  memo?: string;
  detail?: {
    items: { name: string; price: number; link?: string }[];
    source?: "OCR" | "MANUAL";
    /**
     * OCR 경로로 저장된 거래일 때, 분석에 사용된 원본 캡쳐의 URL(또는 data URL).
     * 거래내역 상세에서 "OCR 분석한 이미지 보기" 모달이 이 값을 읽어 원본을 그대로 띄웁니다.
     * 값이 비어 있으면 모달은 "저장된 이미지가 없다" 플레이스홀더로 떨어집니다.
     */
    sourceImageUrl?: string;
    /**
     * 상품 합계가 거래 총 금액보다 작은데도 사용자가 "이대로 등록"을 선택한 경우 "partial"로 찍힙니다.
     * 생략되면 "full"(완전히 맞는다 혹은 상품 목록 자체가 없어 비교 대상 없음)로 해석합니다.
     * DetailPanel은 이 값을 읽어 "상품 내역이 일부만 입력되어 있어요" 힌트를 띄웁니다.
     */
    itemsCoverage?: "full" | "partial";
    /**
     * 사용자가 OCR 수정 화면에서 입력한 주문단위 차감액(쿠폰·포인트·카드 할인 등).
     * 상품 합계와 실제 결제액의 차이를 보정하는 단일 슬롯이며, 자동 상품별 배분 없이
     * order 레벨에서만 저장합니다(정책 docs/Naver_OCR_Parsing_Strategy.md §12-3).
     * 거래 상세에서는 "상품합계 / 차감액 / 최종 거래금액" 세 줄로 분리해 보여줍니다.
     */
    discountAmount?: number;
    /**
     * 네이버 접힌 주문에서 저장된 거래임을 표시하는 메타. true 면 DetailPanel 에 "접힌 주문 ·
     * 상세 미확인 · 외 n건 숨김" 안내가 추가로 노출됩니다.
     */
    folded?: boolean;
    /** "포함 총 n건" 에서 추출한 실제 상품 개수 힌트. folded 일 때만 채워집니다. */
    itemCountHint?: number;
    /** "외 n건 숨김" 에 사용되는 숨겨진 상품 수. folded 가 아니거나 신호가 없으면 비어 있음. */
    hiddenItemCount?: number;
    /**
     * OCR 이 읽은 결제 섹션 합계("총 n원"). folded 주문에서는 amount 계산 기준이 되고,
     * 펼친 주문에서도 정합성 점검 용도로 함께 보존합니다.
     */
    sectionTotal?: number;
    /**
     * 카드 CSV/XLSX import 원본 메타. 승인 원거래와 월 청구행(할부 회차)을 구분해
     * OCR 상품 매칭과 월별 카드값 추적이 서로 꼬이지 않도록 보존합니다.
     */
    cardImport?: {
      recordKind: "approval" | "billing";
      paymentMode: "lump_sum" | "installment" | "unknown";
      installmentMonths?: number;
      installmentCurrentCycle?: number;
      installmentCycleTotal?: number;
      approvedAmount?: number;
      billedAmount?: number;
      remainingBalance?: number;
      approvalNumber?: string;
      cardLabel?: string;
      dueDate?: string;
      sourceSheet?: string;
      rawRowFingerprint?: string;
    };
  };
}

const Table = styled.div`
  display: grid;
  /* 7번째 컬럼(카테고리 색)은 거래명과 금액 사이에 좁게 끼워 넣어서, 색 박스 + hover 툴팁만 담당합니다. */
  grid-template-columns: 76px 110px 108px 1fr 52px 140px 96px;
  font-size: 13px;
  min-width: 730px;

  ${media.tablet} {
    grid-template-columns: 76px 96px 100px 1fr 44px 132px 96px;
    min-width: 680px;
  }
`;

const TableScroll = styled.div`
  overflow-x: auto;
  overflow-y: hidden;

  ${media.mobile} {
    display: none;
  }
`;

const MobileList = styled.div`
  display: none;

  ${media.mobile} {
    display: grid;
    gap: 10px;
    padding: 12px;
  }
`;

/**
 * 모바일에서 한 행 + (활성 시) 바로 아래 "거래 상세" 드롭다운이 시각적으로 한 덩어리처럼
 * 붙어 보이도록 감싸는 컨테이너입니다. 이전에는 MobileList 가 gap: 10px 로 모든 행을
 * 일정 간격으로 벌렸지만, 아코디언 구조에서는 "펼쳐진 행"과 그 아래 "상세 카드"가
 * 간격 없이 하나의 그룹처럼 보여야 사용자가 "이 행을 열었다"는 걸 즉시 인지합니다.
 */
const MobileGroup = styled.div<{ $active?: boolean }>`
  display: grid;
  gap: ${({ $active }) => ($active ? "8px" : "0")};
  transition: gap ${tokens.motion.fast} ease;
`;

/**
 * 아코디언을 펼칠 때 살짝 슬라이드-다운하며 등장하는 키프레임.
 * "이 행을 눌러서 방금 열렸다"는 피드백을 최소한의 모션으로 전달합니다.
 * prefers-reduced-motion 환경에서는 MobileDetailSlot 쪽에서 애니메이션을 비활성화합니다.
 */
const accordionEnter = keyframes`
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
`;

/**
 * 아코디언 내용물(DetailPanel)을 감싸는 박스.
 * 단일 행 아래에 펼쳐져, 사용자가 "이 행을 열었다"는 맥락을 잃지 않게 합니다.
 */
const MobileDetailSlot = styled.div`
  animation: ${accordionEnter} 220ms ease-out both;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const MobileRow = styled.button<{ $active?: boolean }>`
  display: grid;
  gap: 10px;
  width: 100%;
  padding: 14px;
  border: 1px solid ${({ $active }) => ($active ? tokens.color.accentBorder : tokens.color.line2)};
  border-radius: ${tokens.radius.card};
  background: ${({ $active }) => ($active ? tokens.color.accentSubtle : tokens.color.panel)};
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition:
    border-color ${tokens.motion.fast} ease,
    background ${tokens.motion.fast} ease,
    transform ${tokens.motion.fast} ease;

  &:active {
    transform: scale(0.996);
  }
`;

const MobileTop = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
`;

const MobileTitle = styled.div`
  min-width: 0;

  .title {
    color: ${tokens.color.ink1};
    font-size: 14px;
    font-weight: 700;
    line-height: 1.35;
  }

  .meta {
    margin-top: 4px;
    color: ${tokens.color.ink4};
    font-size: 12px;
  }
`;

const MobileAmount = styled.div<{ $positive?: boolean }>`
  color: ${({ $positive }) => ($positive ? tokens.color.pos : tokens.color.neg)};
  font-family: ${tokens.font.mono};
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
`;

const MobileTags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const MobileFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

function getInstallmentLabel(row: TxRow): string | null {
  const cardImport = row.detail?.cardImport;
  if (!cardImport) return null;
  if (
    cardImport.recordKind === "billing" &&
    cardImport.installmentCurrentCycle &&
    cardImport.installmentCycleTotal
  ) {
    return `${cardImport.installmentCurrentCycle}/${cardImport.installmentCycleTotal}회차`;
  }
  if (cardImport.paymentMode === "installment" && cardImport.installmentMonths) {
    return `${cardImport.installmentMonths}개월`;
  }
  if (cardImport.paymentMode === "lump_sum") {
    return "일시불";
  }
  return null;
}

const MobileCategories = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const HeaderCell = styled.div`
  padding: 10px 14px;
  background: ${tokens.color.foot};
  border-bottom: 1px solid ${tokens.color.line2};
  color: ${tokens.color.ink4};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;

  /* Tag 내부 7px 패딩만큼 헤더 텍스트 시작점도 밀어 데이터와 정렬을 맞춥니다. */
  &.tag {
    padding-left: 21px;
  }

  &.right {
    text-align: right;
  }
`;

/**
 * 정렬이 가능한 헤더 셀. 버튼 형태로 포커스/호버 피드백을 주고
 * 화살표 아이콘이 붙어 현재 정렬 방향을 시각적으로 표시합니다.
 */
const SortableHeader = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 14px;
  background: ${tokens.color.foot};
  border: none;
  border-bottom: 1px solid ${tokens.color.line2};
  color: ${tokens.color.ink4};
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-align: left;
  text-transform: uppercase;
  transition: color ${tokens.motion.fast} ease;

  &:hover,
  &:focus-visible {
    color: ${tokens.color.ink1};
    outline: none;
  }

  &:focus-visible {
    box-shadow: ${tokens.shadow.focus};
  }
`;

const SortIcon = styled.span<{ $dir: "desc" | "asc" }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${tokens.color.accent};
  /* desc(내림차순): 아래 화살표, asc(오름차순): 위로 뒤집어 보여줍니다. */
  transform: ${({ $dir }) => ($dir === "desc" ? "rotate(0deg)" : "rotate(180deg)")};
  transition: transform ${tokens.motion.fast} ease;
`;

/**
 * 첫 렌더에서 등장하는 행들에 위에서 살짝 내려앉는 효과를 주기 위한 키프레임입니다.
 * 방금 추가된 것처럼 보이도록 6px → 0px로 올라오며 opacity가 차오릅니다.
 */
const rowEnter = keyframes`
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
`;

const DataCell = styled.div<{
  $right?: boolean;
  $active?: boolean;
  $hovered?: boolean;
  /** 행의 인덱스. undefined이거나 BATCH_SIZE 이상이면 애니메이션을 적용하지 않습니다. */
  $enterIndex?: number;
}>`
  display: flex;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid ${tokens.color.line2};
  color: ${tokens.color.ink1};
  transition: background ${tokens.motion.fast} ease;
  ${({ $right }) =>
    $right &&
    css`
      justify-content: flex-end;
    `}
  ${({ $active, $hovered }) =>
    $active
      ? css`
          background: ${tokens.color.accentSubtle};
        `
      : $hovered
        ? css`
            background: ${tokens.color.foot};
          `
        : ""}
  /* $enterIndex가 들어온 행(첫 배치)만 지연 시간을 누적해 순차 등장하게 합니다. */
  ${({ $enterIndex }) =>
    typeof $enterIndex === "number" &&
    $enterIndex >= 0 &&
    css`
      animation: ${rowEnter} 360ms ease-out both;
      animation-delay: ${$enterIndex * 22}ms;

      @media (prefers-reduced-motion: reduce) {
        animation: none;
      }
    `}
`;

/**
 * 카테고리 색상 셀의 hover 범위. 한 거래가 여러 카테고리에 속할 수 있어
 * 정사각형들을 수평으로 나란히 배치합니다(최대 MAX_CATEGORIES_PER_TX개).
 * 부모 DataCell 폭을 가득 채워 정사각형 묶음이 컬럼 정중앙에 오게 합니다.
 */
const CategoryCell = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
`;

/**
 * 정사각형 + 툴팁을 묶는 wrapper. 각 정사각형마다 자기 카테고리 툴팁이 떠야 해서
 * 툴팁 기준점이 정사각형 단위로 잡혀야 합니다.
 */
const SquareWrap = styled.span`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

/**
 * 카테고리 색을 보여주는 정사각형. 각 행에서 "이 거래가 어느 카테고리인지"를
 * 최소 시각 노이즈로 전달하는 역할이라 테두리 없이 배경색만 씁니다.
 * 다중 카테고리일 때 좁은 폭에 여러 개를 욱여넣어야 해서 11px로 약간 줄였습니다.
 */
const ColorSquare = styled.span<{ $color: string }>`
  width: 11px;
  height: 11px;
  border-radius: 3px;
  background: ${({ $color }) => $color};
  /* 배경과 섞이지 않도록 아주 연한 윤곽선을 깔아 둡니다. 흰 배경에도, hover 배경에도 안정적입니다. */
  box-shadow: inset 0 0 0 1px rgba(16, 24, 40, 0.08);
`;

/**
 * 카테고리 이름을 카테고리 색으로 보여주는 툴팁.
 * 평소엔 hidden, 부모(SquareWrap) hover 시에만 opacity/translate로 부드럽게 등장합니다.
 * 색상 가독성을 위해 흰 배경/그림자를 깔고 글씨만 해당 카테고리 색으로 강조합니다.
 */
const CategoryTooltip = styled.span<{ $color: string }>`
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translate(-50%, 4px);
  padding: 4px 8px;
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.control};
  background: ${tokens.color.panel};
  box-shadow: ${tokens.shadow.cardHover};
  color: ${({ $color }) => $color};
  font-size: 11px;
  font-weight: 700;
  letter-spacing: -0.01em;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity ${tokens.motion.fast} ease,
    transform ${tokens.motion.fast} ease;
  z-index: 2;

  ${SquareWrap}:hover & {
    opacity: 1;
    transform: translate(-50%, 0);
  }
`;

const Amount = styled.span<{ $positive?: boolean }>`
  color: ${({ $positive }) => ($positive ? tokens.color.pos : tokens.color.neg)};
  font-family: ${tokens.font.mono};
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  color: ${tokens.color.ink4};
  font-size: 12px;
`;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const Spinner = styled.span`
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: 8px;
  border: 2px solid ${tokens.color.line};
  border-top-color: ${tokens.color.accent};
  border-radius: 50%;
  animation: ${spin} 600ms linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

interface Props {
  rows: TxRow[];
  totalCount: number;
  selectedId: string;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
  /** "desc"면 최신이 위, "asc"면 과거가 위에 옵니다. */
  sortOrder: "desc" | "asc";
  /** 정렬 방향을 뒤집습니다. */
  onToggleSort: () => void;
  /**
   * 모바일에서 활성 행 바로 아래에 펼쳐질 "거래 상세" 내용을 렌더하는 함수입니다.
   * PC에서는 기존대로 오른쪽 패널(DetailPanel)에 상세가 표시되므로 이 값이 없어도 동작합니다.
   * 모바일 아코디언 경로에서만 주입되며, 사용자가 같은 행을 다시 탭하면 onSelect("") 로 닫힙니다.
   */
  renderMobileDetail?: (row: TxRow) => React.ReactNode;
}

export const TransactionTable = memo<Props>(({
  rows,
  totalCount,
  selectedId,
  onSelect,
  onLoadMore,
  sortOrder,
  onToggleSort,
  renderMobileDetail,
}) => {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<string>("");
  // 카테고리 색상과 이름은 설정 화면에서 변경할 수 있으므로, 스토어를 구독해 즉시 반영합니다.
  const categoryColorMap = useCategoryColorMap();
  const storeCategories = useCategoriesStore();
  const getCategoryName = (id: string): string =>
    storeCategories.find((c) => c.id === id)?.name ?? id;
  const hasMore = rows.length < totalCount;
  const loadMoreRef = useRef(onLoadMore);
  useEffect(() => {
    loadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  /**
   * 첫 마운트 시 노출된 행 ID들만 기록해 둡니다.
   * 이후 인피니트 스크롤로 추가되는 행은 이 집합에 들어있지 않으므로 애니메이션을 받지 않고,
   * 필터/월 변경으로 리셋된 경우에도 이전에 본 행은 다시 애니메이션하지 않습니다.
   */
  const [initialIds] = useState(() => new Set(rows.map((row) => row.id)));

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreRef.current();
        }
      },
      { rootMargin: "240px 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore]);

  return (
    <Card padding={0}>
      <TableScroll>
        <Table>
          <HeaderCell className="tag">유형</HeaderCell>
          <SortableHeader
            type="button"
            onClick={onToggleSort}
            aria-label={
              sortOrder === "desc"
                ? "주문일 내림차순, 오름차순으로 바꾸기"
                : "주문일 오름차순, 내림차순으로 바꾸기"
            }
            aria-pressed={sortOrder === "asc"}
          >
            주문일
            <SortIcon $dir={sortOrder} aria-hidden="true">
              <svg width={12} height={12} viewBox="0 0 12 12">
                {/* 기본 방향은 아래를 가리키는 셰브런. asc일 때 CSS 회전으로 뒤집습니다. */}
                <polyline
                  points="3 4.5 6 7.5 9 4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </SortIcon>
          </SortableHeader>
          <HeaderCell className="tag">플랫폼</HeaderCell>
          <HeaderCell>거래명</HeaderCell>
          {/* 카테고리 컬럼은 색상 정사각형만 표시하고 제목도 짧게 표기합니다. */}
          <HeaderCell style={{ textAlign: "center", padding: "10px 0" }}>분류</HeaderCell>
          <HeaderCell className="right">금액</HeaderCell>
          <HeaderCell className="tag">상태</HeaderCell>
          {rows.map((row, rowIndex) => {
            const active = row.id === selectedId;
            const hovered = row.id === hoveredId && !active;
            /**
             * 첫 렌더에서 잡힌 행 중 현재 위치에 있는 경우에만 stagger 인덱스를 내려보냅니다.
             * 인피니트 스크롤로 추가된 행이나 필터 변경 후 새로 등장한 행은 undefined가 되어
             * 애니메이션이 발동하지 않습니다.
             */
            const enterIndex = initialIds.has(row.id) ? rowIndex : undefined;
            const common = {
              $active: active,
              $hovered: hovered,
              $enterIndex: enterIndex,
              onClick: () => onSelect(row.id),
              onMouseEnter: () => setHoveredId(row.id),
              onMouseLeave: () =>
                setHoveredId((current) => (current === row.id ? "" : current)),
              style: { cursor: "pointer" },
            };

            return (
              <React.Fragment key={row.id}>
                <DataCell {...common}>
                  <Tag kind={row.type === "expense" ? "expense" : "income"}>
                    {TYPE_LABELS[row.type]}
                  </Tag>
                </DataCell>
                <DataCell {...common}>{row.date}</DataCell>
                <DataCell {...common}>
                  <Tag kind={row.platform}>{PLATFORM_LABELS[row.platform]}</Tag>
                </DataCell>
                <DataCell {...common}>{row.title}</DataCell>
                <DataCell {...common} style={{ ...common.style, padding: "12px 0" }}>
                  {/* 색상 정사각형 + hover 툴팁. 거래에 연결된 카테고리만큼 정사각형이 늘어납니다. */}
                  <CategoryCell>
                    {row.categories.map((cat) => (
                      <SquareWrap key={cat}>
                        <ColorSquare
                          $color={categoryColorMap[cat]}
                          aria-label={getCategoryName(cat)}
                        />
                        <CategoryTooltip role="tooltip" $color={categoryColorMap[cat]}>
                          {getCategoryName(cat)}
                        </CategoryTooltip>
                      </SquareWrap>
                    ))}
                  </CategoryCell>
                </DataCell>
                <DataCell {...common} $right>
                  <Amount $positive={row.amount > 0}>
                    {row.amount > 0 ? "+" : "-"}
                    {formatKRW(Math.abs(row.amount))}
                  </Amount>
                </DataCell>
                <DataCell {...common}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Tag kind={row.status}>{STATUS_LABELS[row.status]}</Tag>
                    {row.detail?.cardImport?.recordKind === "billing" ? (
                      <Tag kind="billing">할부 {getInstallmentLabel(row) ?? ""}</Tag>
                    ) : row.detail?.cardImport?.paymentMode === "installment" ? (
                      <Tag kind="installment">할부 {getInstallmentLabel(row) ?? ""}</Tag>
                    ) : null}
                  </div>
                </DataCell>
              </React.Fragment>
            );
          })}
        </Table>
      </TableScroll>
      <MobileList>
        {rows.map((row) => {
          const isActive = row.id === selectedId;
          return (
            <MobileGroup key={row.id} $active={isActive}>
              <MobileRow
                type="button"
                $active={isActive}
                aria-expanded={isActive}
                aria-controls={`mobile-detail-${row.id}`}
                // 같은 행을 다시 탭하면 닫히는 "토글" 동작. 사용자가 한 행에 대한
                // 상세를 열었다가 바로 닫을 수 있어야 여러 거래를 빠르게 스캔할 수 있습니다.
                onClick={() => onSelect(isActive ? "" : row.id)}
              >
                <MobileTop>
                  <MobileTitle>
                    <div className="title">{row.title}</div>
                    <div className="meta">{row.date}</div>
                  </MobileTitle>
                  <MobileAmount $positive={row.amount > 0}>
                    {row.amount > 0 ? "+" : "-"}
                    {formatKRW(Math.abs(row.amount))}
                  </MobileAmount>
                </MobileTop>
                <MobileTags>
                  <Tag kind={row.type === "expense" ? "expense" : "income"}>
                    {TYPE_LABELS[row.type]}
                  </Tag>
                  <Tag kind={row.platform}>{PLATFORM_LABELS[row.platform]}</Tag>
                  <Tag kind={row.status}>{STATUS_LABELS[row.status]}</Tag>
                  {row.detail?.cardImport?.recordKind === "billing" ? (
                    <Tag kind="billing">할부 {getInstallmentLabel(row) ?? ""}</Tag>
                  ) : row.detail?.cardImport?.paymentMode === "installment" ? (
                    <Tag kind="installment">할부 {getInstallmentLabel(row) ?? ""}</Tag>
                  ) : null}
                </MobileTags>
                <MobileFooter>
                  <MobileCategories aria-label="카테고리">
                    {row.categories.map((cat) => (
                      <ColorSquare
                        key={cat}
                        $color={categoryColorMap[cat]}
                        aria-label={getCategoryName(cat)}
                      />
                    ))}
                  </MobileCategories>
                  {/* 활성 상태에서는 아래쪽으로 펼쳐진 것처럼 셰브런을 180° 뒤집어 "열림" 상태를 전달합니다. */}
                  <SortIcon $dir={isActive ? "asc" : "desc"} aria-hidden="true">
                    <svg width={14} height={14} viewBox="0 0 12 12">
                      <polyline
                        points="3 4.5 6 7.5 9 4.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </SortIcon>
                </MobileFooter>
              </MobileRow>
              {/* 활성 행 바로 밑에 상세 카드를 아코디언처럼 펼칩니다.
                  PC 에서는 renderMobileDetail 을 넘기지 않으므로 이 영역은 렌더되지 않습니다. */}
              {isActive && renderMobileDetail && (
                <MobileDetailSlot id={`mobile-detail-${row.id}`}>
                  {renderMobileDetail(row)}
                </MobileDetailSlot>
              )}
            </MobileGroup>
          );
        })}
      </MobileList>
      {rows.length === 0 ? (
        <Footer>조건에 맞는 거래가 없어요</Footer>
      ) : hasMore ? (
        <Footer ref={sentinelRef}>
          <Spinner aria-hidden="true" />
          거래를 불러오는 중…
        </Footer>
      ) : (
        <Footer>모든 거래를 확인했어요 · 총 {totalCount}건</Footer>
      )}
    </Card>
  );
});

TransactionTable.displayName = "TransactionTable";
