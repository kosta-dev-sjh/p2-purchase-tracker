/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Transactions\components\TransactionTable.tsx
 */
import React, { memo, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import {
  getCardInstallmentLabel,
  getCardInstallmentTagKind,
  getInstallmentMonthlyEstimate,
} from "../../../utils/cardInstallment";
import {
  findApprovalLinkedToBilling,
  findBillingsLinkedToApproval,
} from "../../../utils/expenseAccounting";

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
    /**
     * 거래 상세의 출처 식별자. "OCR" 은 캡처 분석으로 들어온 거래로, 이 값일 때만 DetailPanel 의
     * "분석한 캡처 보기" 버튼이 노출됩니다. "CARD" 는 카드 CSV/XLSX 업로드, "MANUAL" 은 수동 입력.
     * 표시용 라벨은 SOURCE_LABELS 에서 변환합니다.
     */
    source?: "OCR" | "MANUAL" | "CARD";
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
      originalMerchant?: string;
      /**
       * AI 폴백 적용 표식. 카드사 헤더가 표준 양식과 달라 일시불/할부 컬럼을 자동
       * 매핑하지 못한 시트에 한해, 시트당 1회 Gemini 에 행을 보내 결제 방식을
       * 분류받습니다(2026-04-28 합의). 그 결과 paymentMode/installmentMonths 가
       * 실제로 채워진 행에만 true. 헤더로 채운 행에는 절대 안 찍힙니다 — 화면에서
       * "AI 가 손댄 것처럼 보여주는 거짓말" 금지(OCR 정책과 동일 원칙).
       */
      aiApplied?: boolean;
    };
  };
}

/*
 * 컬럼 폭 정책 (2026-04-28 개정):
 *   기존엔 고정 px 컬럼 + min-width 920/856px 두 단으로만 끊어, 데스크톱 → 태블릿
 *   사이에선 점진적으로 줄지 않고 viewport 가 좁아지면 가로 스크롤만 생기는 회귀가
 *   있었습니다. 다른 페이지(Home/Analysis 등)는 컨테이너 폭 변화에 따라 카드와
 *   라벨이 부드럽게 함께 줄어드는데, 거래내역만 통일성이 깨져 사용자 지적.
 *
 *   해결: 모든 고정 컬럼을 clamp(min, vw, max) 로 바꿔 viewport 가 줄면 컬럼도
 *   같이 줄도록 했습니다. min 값은 "텍스트가 한 줄로 들어가는 한계" 기준,
 *   max 값은 기존 데스크톱 고정값. 거래명 컬럼만 minmax(140px, 1fr) 로 남은
 *   공간을 흡수합니다. min-width 는 "정말 더 줄면 깨지기 시작하는 지점"
 *   까지만 두고, 그 아래는 가로 스크롤로 폴백.
 *
 *   컬럼 순서: 유형 / 주문일 / 플랫폼 / 거래명 / 상품(+N개) / 카테고리 / 금액 / 상태·결제.
 *   상품 컬럼은 detail.items 가 있을 때만 "+N개" 칩을 노출해 거래명을 어지럽히지 않으면서
 *   "이 거래엔 상세 상품이 따로 있다"를 한눈에 알 수 있게 합니다.
 */
const Table = styled.div`
  display: grid;
  grid-template-columns:
    clamp(60px, 6.5vw, 76px)
    clamp(88px, 9.5vw, 110px)
    clamp(84px, 9vw, 108px)
    minmax(140px, 1fr)
    clamp(64px, 7vw, 84px)
    clamp(104px, 11vw, 132px)
    clamp(124px, 14vw, 168px)
    clamp(96px, 11vw, 124px);
  font-size: 13px;
  /* 768px 이하에선 모바일 카드로 전환되니, 그 직전까지 깨지지 않을 정도로만 보장. */
  min-width: 720px;

  ${media.tablet} {
    /* 1024px 이하에선 폰트·셀 패딩이 좁아지므로 max 도 한 단 낮춤. */
    grid-template-columns:
      clamp(56px, 6.5vw, 70px)
      clamp(82px, 9.5vw, 100px)
      clamp(80px, 9vw, 100px)
      minmax(132px, 1fr)
      clamp(60px, 7vw, 80px)
      clamp(96px, 11vw, 124px)
      clamp(116px, 14vw, 152px)
      clamp(92px, 11vw, 116px);
    min-width: 700px;
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

const MobileRow = styled.button<{ $active?: boolean; $highlight?: boolean }>`
  display: grid;
  gap: 10px;
  width: 100%;
  padding: 14px;
  /*
   * active 일 때 인디고 border 로 바뀌던 효과 제거 (2026-04-28). 외곽 선이 강조될수록
   * "선택" 보다 "오류 / 경고" 처럼 읽혀 시각적 거슬림이 컸음. 배경 톤(accentSubtle) 만
   * 으로도 선택 상태는 충분히 전달됨.
   */
  border: 1px solid ${tokens.color.line2};
  border-radius: ${tokens.radius.card};
  background: ${({ $active }) => ($active ? tokens.color.accentSubtle : tokens.color.panel)};
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition:
    background ${tokens.motion.fast} ease,
    transform ${tokens.motion.fast} ease;

  /* 글로벌 button focus-visible 링(shadow.focus) 제거 — 클릭 후 인디고 링이 남아 보였던 회귀. */
  &:focus,
  &:focus-visible {
    outline: none;
    box-shadow: none;
  }

  &:active {
    transform: scale(0.996);
  }

  /*
   * 외부 진입(홈/분석 등) 의 강조는 더 이상 시각 펄스를 그리지 않습니다(2026-04-28).
   * 그동안의 1px 인디고 inset 펄스가 사용자에게 "행이 재렌더링되는 듯" 보였음.
   * 도착 표시는 selectedId 기반의 accentSubtle 배경 + scrollIntoView 만으로 충분.
   * $highlight prop 은 scrollIntoView 트리거 용도로 컴포넌트 트리에 남겨둡니다.
   */
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

const MobileCategories = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const HeaderCell = styled.div`
  /* clamp(min, vw, max) 패딩으로 viewport 와 함께 좌우 여백도 줄어들게. */
  padding: 10px clamp(8px, 1.4vw, 14px);
  background: ${tokens.color.foot};
  border-bottom: 1px solid ${tokens.color.line2};
  color: ${tokens.color.ink4};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;

  /* Tag 내부 7px 패딩만큼 헤더 텍스트 시작점도 밀어 데이터와 정렬을 맞춥니다. */
  &.tag {
    padding-left: clamp(15px, 2.1vw, 21px);
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
  /* HeaderCell 과 동일한 clamp 패딩 — 정렬 가능 헤더만 자체 padding 갖고 있어 따로 맞춤. */
  padding: 10px clamp(8px, 1.4vw, 14px);
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
 * "이미 한 번 rowEnter 애니메이션된 row.id" 를 모듈 스코프로 누적. React 컴포넌트 인스턴스
 * 외부에 있어 탭 전환·페이지 재진입으로 컴포넌트가 remount 돼도 살아 있습니다.
 * (브라우저 페이지 reload 시엔 비워짐 — 그게 "처음 데이터 로드" 시점.)
 *
 * 사용 흐름(2026-04-28):
 *   1) 페이지 첫 진입 — 빈 Set. initialIds 의 모든 행이 애니메이션됨.
 *   2) effect 에서 그 id 들을 ANIMATED_IDS 에 누적.
 *   3) 다른 탭으로 이동 → TransactionTable unmount.
 *   4) 다시 거래내역 탭 진입 → remount. 새 useState 가 rows.map(...) 로 initialIds 만들지만,
 *      그 직후 ANIMATED_IDS 에 있는 id 는 빼버려 애니메이션 대상이 0건이 됨.
 *   5) 결과: 사용자에게는 행이 가만히 있는 것처럼 보임 (재렌더 페이드 회귀 차단).
 */
const ANIMATED_IDS = new Set<string>();

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

/*
 * highlightPulse 키프레임은 의도적으로 제거됐습니다(2026-04-28). 외부 진입 강조는 더
 * 이상 시각 펄스를 그리지 않습니다 — 사용자 피드백에서 "행이 재렌더되는 것처럼 보인다"
 * 는 회귀가 반복돼, 펄스 자체를 빼고 selectedId 의 accentSubtle 배경 + scrollIntoView
 * 만으로 도착 행 식별을 처리합니다.
 */

const DataCell = styled.div<{
  $right?: boolean;
  $active?: boolean;
  $hovered?: boolean;
  /** 행의 인덱스. undefined이거나 BATCH_SIZE 이상이면 애니메이션을 적용하지 않습니다. */
  $enterIndex?: number;
  /** 외부 진입(홈 최근거래 클릭 등)으로 잠시 강조해야 할 때 true. */
  $highlight?: boolean;
}>`
  display: flex;
  align-items: center;
  /* viewport 가 좁아지면 데이터 셀 좌우 패딩도 함께 줄여 텍스트 공간을 확보. */
  padding: 12px clamp(8px, 1.4vw, 14px);
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
  ${({ $enterIndex, $highlight }) =>
    !$highlight &&
    typeof $enterIndex === "number" &&
    $enterIndex >= 0 &&
    css`
      animation: ${rowEnter} 360ms ease-out both;
      animation-delay: ${$enterIndex * 22}ms;

      @media (prefers-reduced-motion: reduce) {
        animation: none;
      }
    `}

  /*
   * 강조(highlight) 가 켜진 동안만 펄스. enter 애니메이션과 같은 animation 슬롯을 쓰므로
   * 위 enter 규칙에서 $highlight 일 때는 enter 를 비활성화해 충돌을 피했습니다.
   * 외부 진입 강조 시각 펄스 제거(2026-04-28). 사용자가 "행이 재렌더되는 듯" 보였음.
   * scrollIntoView + accentSubtle 배경(선택 상태) 만으로 도착 행 식별 충분.
   */
`;

/**
 * 한 거래의 카테고리(최대 MAX_CATEGORIES_PER_TX=3개)를 모두 줄 단위로 보여주는 컨테이너.
 * 이전엔 1순위만 라벨 + "+N" 카운트로 압축했지만, 사용자가 모든 카테고리를 한눈에 확인하길
 * 원해서 세로 스택으로 풀어 줬습니다. 라벨이 길면 ellipsis 로 잘리지만 title 속성으로 풀텍스트
 * 확인이 가능합니다.
 */
const CategoryCell = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  min-width: 0;
`;

const CategoryItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-width: 0;
`;

const CategoryLabel = styled.span`
  color: ${tokens.color.ink2};
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

/**
 * 카테고리 색을 보여주는 정사각형. 각 행에서 "이 거래가 어느 카테고리인지"를
 * 최소 시각 노이즈로 전달하는 역할이라 테두리 없이 배경색만 씁니다.
 * PC 표에서는 옆에 텍스트 라벨이 함께 나오므로 툴팁이 더 이상 필요하지 않습니다(접근성용 aria-label만 유지).
 * 모바일 카드에서는 라벨 없이 정사각형만 노출되지만, ColorSquare 의 aria-label 로 충분히 식별됩니다.
 */
const ColorSquare = styled.span<{ $color: string }>`
  flex: 0 0 auto;
  width: 11px;
  height: 11px;
  border-radius: 3px;
  background: ${({ $color }) => $color};
  /* 배경과 섞이지 않도록 아주 연한 윤곽선을 깔아 둡니다. 흰 배경에도, hover 배경에도 안정적입니다. */
  box-shadow: inset 0 0 0 1px rgba(16, 24, 40, 0.08);
`;

const Amount = styled.span<{ $positive?: boolean }>`
  color: ${({ $positive }) => ($positive ? tokens.color.pos : tokens.color.neg)};
  font-family: ${tokens.font.mono};
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
`;

/**
 * 할부 승인 행에서 "원본 총액" 아래 추정 월 분할분을 한 줄 더 보여주기 위한 스택 컨테이너.
 * 할부 승인 행은 amount 가 "총 약속 금액(예: 60만원)" 이라 그 자체로는 "이번 달 빠지는 돈"
 * 이 아닙니다. KPI 합산은 분할 추정으로 들어가니, 같은 추정값을 행에서도 보여 줘 사용자가
 * "왜 KPI 에는 10만원이지?" 를 헷갈리지 않게 합니다.
 */
const AmountStack = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  line-height: 1.3;
  /* 셀 안에서 충분한 폭을 확보. 셀 자체보다 살짝 좁게 두고, sub 라인이 길면 줄바꿈. */
  min-width: 0;
  width: 100%;
`;

const AmountSub = styled.span`
  /*
   * 원금/할부개월 보조 라인. 추정 라벨은 메인 옆 AmountInlineHint 한 곳에만 노출.
   * sub 에는 "원금 ₩X · N개월" 핵심 메타만 — 라벨 중복 회귀(2026-04-28) 차단.
   */
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 3px 5px;
  width: 100%;
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
  line-height: 1.4;

  .principal {
    /* 메인 빨강·검정 금액과 색 분리: accentHover 짙은 인디고로 "이건 보조 정보" 톤. */
    color: ${tokens.color.accentHover};
    font-weight: 700;
  }

  .months {
    color: ${tokens.color.ink4};
  }
`;

/**
 * 메인 금액 옆 작은 "(월 추정)" 인라인 힌트. 인디고 톤으로 색 분리 — 빨간 메인 + sub 라인
 * 사이의 시선 다리 역할. 사용자가 "이 빨간 숫자는 추정값" 임을 즉시 알아볼 수 있도록.
 */
const AmountInlineHint = styled.span`
  margin-left: 4px;
  color: ${tokens.color.accent};
  font-family: ${tokens.font.sans};
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
`;

/**
 * 대각선 화살표(↗) SVG. 청구 행 → 승인 행 점프 버튼 안에 들어갑니다.
 * "이 거래는 다른 거래로 연결돼 있다" 를 시각적으로 한눈에 표시.
 */
const DiagonalArrow: React.FC = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
    <path
      d="M3.5 8.5L8.5 3.5M8.5 3.5H4.5M8.5 3.5V7.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * 청구 행에서 원 승인 거래로 점프하는 대각선 화살표 버튼.
 * 행 자체에서도 클릭 가능하도록 stopPropagation 으로 부모 onClick 을 막고,
 * 자체 onClick 으로 navigate(=같은 가맹점 검색·하이라이트) 를 트리거합니다.
 */
const LinkedJumpButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-left: 6px;
  padding: 0;
  border: 1px solid ${tokens.color.line};
  border-radius: 6px;
  background: ${tokens.color.panel};
  color: ${tokens.color.accentHover};
  cursor: pointer;
  transition:
    background ${tokens.motion.fast} ease,
    border-color ${tokens.motion.fast} ease;

  &:hover {
    background: ${tokens.color.accentSubtle};
    border-color: ${tokens.color.accentBorder};
  }

  &:focus-visible {
    outline: none;
    box-shadow: ${tokens.shadow.focus};
  }
`;

/**
 * "+N개" 형태로 거래에 묶인 상품 수를 표시하는 칩.
 * 상품이 0개인 거래(단일 결제·청구건 등)는 셀을 비워 두어 시각 노이즈를 줄입니다.
 */
const ItemCountChip = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: ${tokens.color.posBg};
  color: ${tokens.color.pos};
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.5;
  white-space: nowrap;
`;

const StatusCell = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  white-space: nowrap;
  overflow: hidden;
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
  /**
   * 외부 진입(홈 최근거래 클릭 등)으로 잠깐 강조할 행 id. 이 값이 들어오면
   * 해당 행을 부드럽게 화면 중앙으로 스크롤하고 펄스 링을 한 번 그립니다.
   */
  highlightId?: string | null;
  /**
   * 같은 highlightId 가 연달아 들어와도 펄스를 다시 트리거하기 위한 카운터.
   * 부모가 갱신할 때마다 useEffect 가 다시 실행되어 scrollIntoView 가 발동합니다.
   */
  pulseToken?: number;
  /**
   * 청구 행이 같은 결제의 승인 행으로 점프하는 ↗ 화살표를 그릴 때 패턴 매칭에 쓸 전체 풀.
   * 미지정이면 rows(필터된 슬라이스) 안에서만 매칭 시도. cross-month 매칭을 위해
   * 보통 store 의 전체 rows 를 같이 넘깁니다.
   */
  allRows?: TxRow[];
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
  highlightId,
  pulseToken,
  allRows,
}) => {
  const navigate = useNavigate();
  const sentinelRef = useRef<HTMLDivElement>(null);
  /**
   * 강조 진입 시 scrollIntoView 대상 노드를 찾기 위한 행별 ref 맵.
   * PC 표(TableScroll 안의 DataCell)와 모바일 카드(MobileRow) 는 둘 다 항상 마운트되고
   * media query 로 한쪽만 보이게 하기 때문에, 같은 키 공간을 공유하면 안 됩니다.
   * 두 맵을 따로 두고 스크롤 시 "현재 보이는 쪽" 의 노드를 우선 사용합니다(offsetParent 로 판단).
   */
  const desktopRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const mobileRowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (!highlightId) return;
    // 표가 visibleCount 변경에 따라 막 늘어난 경우를 대비해 다음 페인트 후 스크롤.
    const raf = requestAnimationFrame(() => {
      const desktopEl = desktopRowRefs.current.get(highlightId);
      const mobileEl = mobileRowRefs.current.get(highlightId);
      // offsetParent === null 이면 display:none 또는 그런 조상 안에 있어 화면에 안 보입니다.
      const visible = (el?: HTMLElement | null): el is HTMLElement => !!el && el.offsetParent !== null;
      const target = visible(desktopEl) ? desktopEl : visible(mobileEl) ? mobileEl : (desktopEl ?? mobileEl);
      if (target && typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [highlightId, pulseToken]);

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
   * 첫 마운트 시 노출된 행 ID 들만 기록해 둡니다.
   * 인피니트 스크롤로 추가된 행은 이 집합에 없어 애니메이션 안 받고, 필터/월 변경 후
   * 다시 등장한 행도 애니메이션 안 받습니다.
   *
   * 회귀 차단(2026-04-28): 다른 탭 갔다가 돌아오면 페이지가 remount → useState 초기화로
   * 다시 모든 행이 "처음 본 행" 으로 잡혀 rowEnter 가 재발동, 윗줄만 다시 페이드 인 되어
   * 사용자에게 "행이 잘렸다 다시 올라온다" 처럼 보였습니다. 모듈 스코프 ANIMATED_IDS 에
   * 이미 한 번이라도 애니메이션된 row.id 를 누적해 두고, 후속 mount 에서는 거기 없는
   * 행만 애니메이션. 새로 추가된 거래는 기존 정책대로 (initialIds 에 안 들어와) 애니메이션
   * 안 받음 — 결과적으로 첫 데이터 로드 외에는 행이 가만히 있습니다.
   */
  const [initialIds] = useState(() => {
    const ids = new Set(rows.map((row) => row.id));
    // 이미 한 번이라도 애니메이션된 행은 제외 (탭 복귀 시 재발동 방지).
    for (const id of ANIMATED_IDS) ids.delete(id);
    return ids;
  });
  // 마운트 후 이번 묶음을 "이미 애니메이션된" 로 기록. 모듈 변수라 페이지 reload 전엔 유지됨.
  useEffect(() => {
    for (const id of initialIds) ANIMATED_IDS.add(id);
  }, [initialIds]);

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
          <HeaderCell className="tag">상품</HeaderCell>
          <HeaderCell style={{ padding: "10px 12px" }}>카테고리</HeaderCell>
          <HeaderCell className="right">금액</HeaderCell>
          <HeaderCell className="tag">상태/결제</HeaderCell>
          {rows.map((row, rowIndex) => {
            const active = row.id === selectedId;
            const hovered = row.id === hoveredId && !active;
            const isHighlighted = !!highlightId && row.id === highlightId;
            // amount 를 같이 넘겨 5만원 미만은 자동 일시불 폴백.
            const installmentLabel = getCardInstallmentLabel(
              row.detail?.cardImport,
              row.amount,
            );
            const installmentTagKind = getCardInstallmentTagKind(
              row.detail?.cardImport,
              row.amount,
            );
            const monthlyEstimate = getInstallmentMonthlyEstimate(
              row.detail?.cardImport,
              row.amount,
            );
            // 승인 행에 연결된 빌링 행이 있으면 그 평균을 "실제 월 청구액(이자 포함)" 으로
            // 사용. 없으면 monthlyEstimate(원금 ÷ 개월수, 이자 미포함) 추정.
            const linkedBillings = monthlyEstimate
              ? findBillingsLinkedToApproval(row, allRows ?? rows)
              : [];
            const billingAvg =
              linkedBillings.length > 0
                ? Math.round(
                    linkedBillings.reduce((s, b) => s + Math.abs(b.amount), 0) /
                      linkedBillings.length,
                  )
                : null;
            const monthlyDisplay = billingAvg ?? monthlyEstimate;
            // "추정" 라벨은 빌링 매칭 없을 때만 노출. 매칭되면 실측이라 라벨 안 붙음.
            const monthlyIsEstimated = monthlyEstimate !== null && billingAvg === null;
            // 청구 행이면 같은 결제의 승인 행 id 를 미리 찾아둠. 있으면 ↗ 화살표 노출.
            // 매칭 풀은 allRows(전체) 우선, 없으면 현재 슬라이스 사용.
            const linkedApprovalId =
              installmentTagKind === "installment"
                ? findApprovalLinkedToBilling(row, allRows ?? rows)?.id ?? null
                : null;
            /*
             * 청구 행의 원금 메타 — sub 라인에 "원금 ₩X · 5회차" 같이 표시하기 위함.
             * 1차: cardImport.approvedAmount (CSV 의 "이용금액" 같은 원본 총액)
             * 2차: 청구액(amount) × 총 회차 = 원금 추정 (이자 미포함)
             */
            const billingCi = row.detail?.cardImport;
            const isBilling =
              installmentTagKind === "installment" && monthlyEstimate === null;
            const billingCycleTotal =
              billingCi?.installmentCycleTotal ?? billingCi?.installmentMonths ?? 0;
            const billingCycleCurrent = billingCi?.installmentCurrentCycle ?? null;
            const billingOriginal = isBilling
              ? billingCi?.approvedAmount ??
                (billingCycleTotal > 1
                  ? Math.round(Math.abs(row.amount) * billingCycleTotal)
                  : null)
              : null;
            // approvedAmount 는 CSV 가 직접 줬으면 정확값(추정 X), 아니면 우리가 곱해 만든 추정값.
            const billingOriginalIsEstimated = isBilling
              ? billingCi?.approvedAmount === undefined
              : false;
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
              $highlight: isHighlighted,
              onClick: () => onSelect(row.id),
              onMouseEnter: () => setHoveredId(row.id),
              onMouseLeave: () =>
                setHoveredId((current) => (current === row.id ? "" : current)),
              style: { cursor: "pointer" },
            };
            // 첫 셀에만 ref 를 달아 scrollIntoView 의 타겟으로 사용합니다.
            // 같은 grid row 의 다른 셀들은 자동으로 함께 화면에 들어옵니다.
            const setRowRef = (el: HTMLDivElement | null) => {
              if (el) desktopRowRefs.current.set(row.id, el);
              else desktopRowRefs.current.delete(row.id);
            };

            return (
              <React.Fragment key={row.id}>
                <DataCell ref={setRowRef} {...common}>
                  <Tag kind={row.type === "expense" ? "expense" : "income"}>
                    {TYPE_LABELS[row.type]}
                  </Tag>
                </DataCell>
                <DataCell {...common}>{row.date}</DataCell>
                <DataCell {...common}>
                  <Tag kind={row.platform}>{PLATFORM_LABELS[row.platform]}</Tag>
                </DataCell>
                <DataCell {...common}>{row.title}</DataCell>
                <DataCell {...common}>
                  {(row.detail?.items?.length ?? 0) > 0 && (
                    <ItemCountChip>+{row.detail!.items.length}개</ItemCountChip>
                  )}
                </DataCell>
                <DataCell {...common} style={{ ...common.style, padding: "10px 12px" }}>
                  <CategoryCell>
                    {row.categories.map((cat) => (
                      <CategoryItem key={cat}>
                        <ColorSquare
                          $color={categoryColorMap[cat]}
                          aria-label={getCategoryName(cat)}
                        />
                        <CategoryLabel title={getCategoryName(cat)}>
                          {getCategoryName(cat)}
                        </CategoryLabel>
                      </CategoryItem>
                    ))}
                  </CategoryCell>
                </DataCell>
                <DataCell {...common} $right>
                  {/*
                   * 표시 정책(2026-04-28 swap + 추정 라벨 조건부):
                   *   - 할부 승인 행: 메인 = monthlyDisplay (실측 빌링 매칭되면 평균, 아니면
                   *     원금/개월수 추정). 추정일 때만 "(월 추정)" 라벨 노출.
                   *   - 일반(청구/일시불/non-card) 은 amount 그대로 한 줄.
                   */}
                  {monthlyDisplay ? (
                    <AmountStack>
                      <Amount $positive={row.amount > 0}>
                        {row.amount > 0 ? "+" : "-"}
                        {formatKRW(monthlyDisplay)}
                        {monthlyIsEstimated ? (
                          <AmountInlineHint>(월 추정)</AmountInlineHint>
                        ) : null}
                      </Amount>
                      <AmountSub>
                        <span className="principal">
                          원금 {formatKRW(Math.abs(row.amount))}
                        </span>
                        <span className="months">
                          · 할부 {row.detail?.cardImport?.installmentMonths}개월
                        </span>
                      </AmountSub>
                    </AmountStack>
                  ) : isBilling && billingOriginal ? (
                    <AmountStack>
                      <Amount $positive={row.amount > 0}>
                        {row.amount > 0 ? "+" : "-"}
                        {formatKRW(Math.abs(row.amount))}
                        {linkedApprovalId ? (
                          <LinkedJumpButton
                            type="button"
                            aria-label="원 승인 거래로 이동"
                            title="원 승인 거래로 이동"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate("/transactions", {
                                state: { scrollToTransactionId: linkedApprovalId },
                              });
                            }}
                          >
                            <DiagonalArrow />
                          </LinkedJumpButton>
                        ) : null}
                      </Amount>
                      <AmountSub>
                        <span className="principal">
                          원금 {formatKRW(billingOriginal)}
                          {billingOriginalIsEstimated ? (
                            <AmountInlineHint>(추정)</AmountInlineHint>
                          ) : null}
                        </span>
                        {billingCycleTotal > 0 ? (
                          <span className="months">
                            ·{" "}
                            {billingCycleCurrent
                              ? `${billingCycleCurrent}/${billingCycleTotal}회차`
                              : `${billingCycleTotal}회차`}
                          </span>
                        ) : null}
                      </AmountSub>
                    </AmountStack>
                  ) : (
                    <Amount $positive={row.amount > 0}>
                      {row.amount > 0 ? "+" : "-"}
                      {formatKRW(Math.abs(row.amount))}
                      {linkedApprovalId ? (
                        <LinkedJumpButton
                          type="button"
                          aria-label="원 승인 거래로 이동"
                          title="원 승인 거래로 이동"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate("/transactions", {
                              state: { scrollToTransactionId: linkedApprovalId },
                            });
                          }}
                        >
                          <DiagonalArrow />
                        </LinkedJumpButton>
                      ) : null}
                    </Amount>
                  )}
                </DataCell>
                <DataCell {...common}>
                  <StatusCell>
                    <Tag kind={row.status}>{STATUS_LABELS[row.status]}</Tag>
                    {/* 결제 방식 태그: 일시불(회색) / 할부(인디고). 카드 거래일 때만. */}
                    {installmentTagKind && installmentLabel ? (
                      <Tag kind={installmentTagKind}>{installmentLabel}</Tag>
                    ) : null}
                  </StatusCell>
                </DataCell>
              </React.Fragment>
            );
          })}
        </Table>
      </TableScroll>
      <MobileList>
        {rows.map((row) => {
          const isActive = row.id === selectedId;
          const isHighlighted = !!highlightId && row.id === highlightId;
          const installmentLabel = getCardInstallmentLabel(
            row.detail?.cardImport,
            row.amount,
          );
          const installmentTagKind = getCardInstallmentTagKind(
            row.detail?.cardImport,
            row.amount,
          );
          const monthlyEstimate = getInstallmentMonthlyEstimate(
            row.detail?.cardImport,
            row.amount,
          );
          const linkedBillings = monthlyEstimate
            ? findBillingsLinkedToApproval(row, allRows ?? rows)
            : [];
          const billingAvg =
            linkedBillings.length > 0
              ? Math.round(
                  linkedBillings.reduce((s, b) => s + Math.abs(b.amount), 0) /
                    linkedBillings.length,
                )
              : null;
          const monthlyDisplay = billingAvg ?? monthlyEstimate;
          const monthlyIsEstimated = monthlyEstimate !== null && billingAvg === null;
          const linkedApprovalId =
            installmentTagKind === "installment"
              ? findApprovalLinkedToBilling(row, allRows ?? rows)?.id ?? null
              : null;
          // 청구 행의 원금 메타(데스크톱과 동일 로직).
          const billingCi = row.detail?.cardImport;
          const isBilling =
            installmentTagKind === "installment" && monthlyEstimate === null;
          const billingCycleTotal =
            billingCi?.installmentCycleTotal ?? billingCi?.installmentMonths ?? 0;
          const billingCycleCurrent = billingCi?.installmentCurrentCycle ?? null;
          const billingOriginal = isBilling
            ? billingCi?.approvedAmount ??
              (billingCycleTotal > 1
                ? Math.round(Math.abs(row.amount) * billingCycleTotal)
                : null)
            : null;
          const billingOriginalIsEstimated = isBilling
            ? billingCi?.approvedAmount === undefined
            : false;
          const setMobileRowRef = (el: HTMLButtonElement | null) => {
            if (el) mobileRowRefs.current.set(row.id, el);
            else mobileRowRefs.current.delete(row.id);
          };
          return (
            <MobileGroup key={row.id} $active={isActive}>
              <MobileRow
                ref={setMobileRowRef}
                type="button"
                $active={isActive}
                $highlight={isHighlighted}
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
                  {monthlyDisplay ? (
                    <AmountStack>
                      <MobileAmount $positive={row.amount > 0}>
                        {row.amount > 0 ? "+" : "-"}
                        {formatKRW(monthlyDisplay)}
                        {monthlyIsEstimated ? (
                          <AmountInlineHint>(월 추정)</AmountInlineHint>
                        ) : null}
                      </MobileAmount>
                      <AmountSub>
                        <span className="principal">
                          원금 {formatKRW(Math.abs(row.amount))}
                        </span>
                        <span className="months">
                          · 할부 {row.detail?.cardImport?.installmentMonths}개월
                        </span>
                      </AmountSub>
                    </AmountStack>
                  ) : isBilling && billingOriginal ? (
                    <AmountStack>
                      <MobileAmount $positive={row.amount > 0}>
                        {row.amount > 0 ? "+" : "-"}
                        {formatKRW(Math.abs(row.amount))}
                        {linkedApprovalId ? (
                          <LinkedJumpButton
                            type="button"
                            aria-label="원 승인 거래로 이동"
                            title="원 승인 거래로 이동"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate("/transactions", {
                                state: { scrollToTransactionId: linkedApprovalId },
                              });
                            }}
                          >
                            <DiagonalArrow />
                          </LinkedJumpButton>
                        ) : null}
                      </MobileAmount>
                      <AmountSub>
                        <span className="principal">
                          원금 {formatKRW(billingOriginal)}
                          {billingOriginalIsEstimated ? (
                            <AmountInlineHint>(추정)</AmountInlineHint>
                          ) : null}
                        </span>
                        {billingCycleTotal > 0 ? (
                          <span className="months">
                            ·{" "}
                            {billingCycleCurrent
                              ? `${billingCycleCurrent}/${billingCycleTotal}회차`
                              : `${billingCycleTotal}회차`}
                          </span>
                        ) : null}
                      </AmountSub>
                    </AmountStack>
                  ) : (
                    <MobileAmount $positive={row.amount > 0}>
                      {row.amount > 0 ? "+" : "-"}
                      {formatKRW(Math.abs(row.amount))}
                      {linkedApprovalId ? (
                        <LinkedJumpButton
                          type="button"
                          aria-label="원 승인 거래로 이동"
                          title="원 승인 거래로 이동"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate("/transactions", {
                              state: { scrollToTransactionId: linkedApprovalId },
                            });
                          }}
                        >
                          <DiagonalArrow />
                        </LinkedJumpButton>
                      ) : null}
                    </MobileAmount>
                  )}
                </MobileTop>
                <MobileTags>
                  <Tag kind={row.type === "expense" ? "expense" : "income"}>
                    {TYPE_LABELS[row.type]}
                  </Tag>
                  <Tag kind={row.platform}>{PLATFORM_LABELS[row.platform]}</Tag>
                  <Tag kind={row.status}>{STATUS_LABELS[row.status]}</Tag>
                  {/* 결제 방식 태그: 일시불(회색) / 할부 승인(인디고) / 할부 청구(주황). 카드 거래일 때만. */}
                  {installmentTagKind && installmentLabel ? (
                    <Tag kind={installmentTagKind}>{installmentLabel}</Tag>
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
