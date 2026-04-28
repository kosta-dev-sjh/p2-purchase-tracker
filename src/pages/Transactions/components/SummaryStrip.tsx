/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Transactions\components\SummaryStrip.tsx
 */
import React from "react";
import styled from "styled-components";
import { tokens } from "../../../styles/tokens";
import { media } from "../../../tokens/breakpoints";
import { formatKRW } from "../../../utils/format";

export interface SummaryDelta {
  /** 양수면 전월 대비 증가 (지출 기준에서는 나쁨), 음수면 감소(좋음). */
  percent: number;
  direction: "up" | "down" | "flat";
}

export interface SummaryData {
  total: number;
  spendCount: number;
  incomeCount: number;
  totalSpend: number;
  /** 수입 + 환불 (status !== "cancel"). 순지출 계산용. */
  incomeAndRefund: number;
  /**
   * 순수 수입 합계(type==="income" && status!=="refund" && status!=="cancel").
   * "수입" 카드 표시 전용 — 환불·취소는 별도 카드(refundCancelAmount) 로 노출.
   */
  pureIncome: number;
  /** 순수 수입 행 개수 — pureIncome 과 같은 필터. */
  pureIncomeCount: number;
  refundCount: number;
  cancelCount: number;
  cancelAmount: number;
  /** 환불 + 취소 합산. UI 의 "환불·취소" 카드 표시용. */
  refundCancelAmount: number;
  netSpend: number;
  countLabel: string;
  spendDelta?: SummaryDelta;
}

const Strip = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  background: ${tokens.color.panel};
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.card};
  box-shadow: ${tokens.shadow.card};
  overflow: hidden;

  ${media.tablet} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  ${media.mobile} {
    grid-template-columns: 1fr;
  }
`;

const Cell = styled.div`
  /* Home/Analysis KpiStrip과 동일한 16px 20px 패딩으로 통일. 셀 내부 리듬이 페이지 간 동일하게 느껴지도록 맞췄습니다. */
  padding: 16px 20px;
  border-right: 1px solid ${tokens.color.line2};

  &:last-child {
    border-right: none;
  }

  ${media.tablet} {
    &:nth-child(2n) {
      border-right: none;
    }
    &:nth-child(odd) {
      border-right: 1px solid ${tokens.color.line2};
    }
    &:nth-child(-n + 2) {
      border-bottom: 1px solid ${tokens.color.line2};
    }
  }

  ${media.mobile} {
    border-right: none;
    border-bottom: 1px solid ${tokens.color.line2};

    &:last-child {
      border-bottom: none;
    }
  }
`;

const Label = styled.div`
  /* Home KpiStrip LabelRow(12px)와 통일해 상단 스트립 라벨 톤을 맞춥니다. */
  color: ${tokens.color.ink3};
  font-size: 12px;
  font-weight: 500;
`;

const Value = styled.div<{ $color?: string }>`
  /* KpiStrip 비-primary 셀과 동일한 22px/margin 6px로 통일. 페이지 간 상단 숫자 크기 인상이 맞도록. */
  margin-top: 6px;
  color: ${({ $color }) => $color ?? tokens.color.ink1};
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
`;

const Sub = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  /* Analysis KpiStrip SubRow와 통일(caption 12px). */
  margin-top: 4px;
  color: ${tokens.color.ink4};
  font-size: ${tokens.type.caption.size};
`;

const Chip = styled.span<{ $tone: "up" | "down" | "flat" }>`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 6px;
  border-radius: ${tokens.radius.chip};
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  background: ${({ $tone }) =>
    $tone === "up"
      ? tokens.color.negBg
      : $tone === "down"
        ? tokens.color.posBg
        : tokens.color.tint};
  color: ${({ $tone }) =>
    $tone === "up"
      ? tokens.color.neg
      : $tone === "down"
        ? tokens.color.pos
        : tokens.color.ink3};
`;

const formatDelta = (delta: SummaryDelta) => {
  if (delta.direction === "flat") return "0%";
  const sign = delta.direction === "up" ? "+" : "−";
  return `${sign}${Math.abs(delta.percent)}%`;
};

interface SummaryStripProps {
  summary: SummaryData;
  /**
   * 현재 필터 결과로 노출 중인 거래 수. 월 전체 KPI는 그대로 두되 사용자가 필터를 적용했을 때
   * "지금 보이는 건 전체가 아니다"라는 점을 첫 번째 셀의 보조 라벨로 알려줍니다.
   * 미지정이거나 summary.total과 같으면 표시하지 않습니다.
   */
  filteredCount?: number;
}

export const SummaryStrip = React.memo(({ summary, filteredCount }: SummaryStripProps) => {
  // filteredCount가 summary.total과 같으면 필터가 비어있는 상태이므로 안내를 숨겨 시각 노이즈를 줄입니다.
  const isFiltered =
    typeof filteredCount === "number" && filteredCount !== summary.total;

  return (
  <Strip>
    <Cell>
      <Label>전체 거래</Label>
      <Value className="tnum">{summary.total}건</Value>
      <Sub>
        {isFiltered
          ? `필터 결과 ${filteredCount}건 · 월 전체 ${summary.total}건`
          : `지출 ${summary.spendCount} · 수입 ${summary.incomeCount}`}
      </Sub>
    </Cell>
    {/*
      카드 재배치(2026-04-28): "총 지출" 카드를 통째로 빼고 그 자리에 "수입" 카드를 둡니다.
      사용자 피드백 — 거래내역 상단에서 가장 보고 싶은 두 숫자는 "순 지출" 과 "수입".
      총 지출(gross)은 순 지출 카드의 sub 라인에 함께 노출해 한 카드로 묶였습니다.
    */}
    <Cell>
      <Label>수입</Label>
      <Value className="tnum" $color={tokens.color.pos}>
        {formatKRW(summary.pureIncome)}
      </Value>
      <Sub>
        {summary.pureIncomeCount === 0
          ? "수입 내역 없음"
          : `수입 ${summary.pureIncomeCount}건`}
      </Sub>
    </Cell>
    <Cell>
      <Label>환불·취소</Label>
      <Value className="tnum" $color={tokens.color.neg}>
        {formatKRW(summary.refundCancelAmount)}
      </Value>
      <Sub>
        {summary.refundCount + summary.cancelCount === 0
          ? "환불·취소 내역 없음"
          : `환불 ${summary.refundCount}건 · 취소 ${summary.cancelCount}건`}
      </Sub>
    </Cell>
    <Cell>
      <Label>순 지출</Label>
      <Value className="tnum">{formatKRW(summary.netSpend)}</Value>
      {/*
        sub 라인: 총 지출(=gross) 을 같이 보여 사용자가 "총·순" 두 숫자를 한 카드에서
        비교할 수 있게. 전월 대비 chip 도 같은 줄에 — 너무 길어지면 줄바꿈으로 자연스럽게.
      */}
      <Sub>
        지출 {formatKRW(summary.totalSpend)}
        {summary.spendDelta && (
          <Chip $tone={summary.spendDelta.direction}>{formatDelta(summary.spendDelta)}</Chip>
        )}
      </Sub>
    </Cell>
  </Strip>
  );
});

SummaryStrip.displayName = "SummaryStrip";
