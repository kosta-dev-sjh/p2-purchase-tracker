/**
 * 역할: 상품 합계와 거래 총 금액이 어긋날 때 사용자에게 상황을 알려주는 공용 모달.
 *
 *       두 가지 모드를 지원합니다.
 *       - mode="exceeds": 상품합계가 총 금액을 초과하는 경우. 이 상태로는 저장할 수 없다는 취지를
 *         분명히 전달하려 확인 버튼만 두고(블로킹), 톤은 경고(negative)로 뽑습니다.
 *       - mode="under": 상품합계가 총 금액보다 작은 경우. 배송비·포인트처럼 사용자만 아는 차액일
 *         수 있어 저장을 막지는 않고, "이대로 등록" / "다시 확인" 두 선택지를 제공합니다. 저장을
 *         고르면 거래에 partial 플래그가 붙어 상세 화면에서 힌트가 뜹니다.
 *
 *       OCR은 한 번에 여러 주문을 저장하므로, 문제 주문이 여러 건일 수 있도록 entries prop을
 *       배열로 받아 모달 본문에 한꺼번에 나열합니다. 수동 입력/거래 수정은 단건이라 entries가
 *       1개짜리 배열로 들어옵니다.
 * 위치: src/components/modal/ProductTotalWarningModal.tsx
 */
import React from "react";
import styled from "styled-components";
import { Modal } from "./Modal";
import { Button } from "../primitives/Button";
import { tokens } from "../../styles/tokens";
import { formatKRW } from "../../utils/format";

export interface ProductTotalWarningEntry {
  /** 화면 식별용 라벨(예: 거래명, 또는 "coupang-04-11.png · 주문 2"). */
  label: string;
  totalAmount: number;
  productsSum: number;
  /** 총 금액 - 상품 합계. 양수면 under, 음수면 exceeds. */
  diff: number;
}

interface Props {
  isOpen: boolean;
  mode: "exceeds" | "under";
  entries: ProductTotalWarningEntry[];
  /** "이대로 등록"을 눌렀을 때 호출됩니다. mode="exceeds"일 때는 렌더되지 않습니다. */
  onConfirm?: () => void;
  /** mode="exceeds"에서는 "확인"(닫기), mode="under"에서는 "다시 확인" 라벨을 갖습니다. */
  onCancel: () => void;
}

// 경고/에러 intro 공통 규약: 중복 제안 카드와 같은 card radius + 12×14 padding.
// tone만 error(neg) / warn으로 분리해 경고 톤을 달리합니다.
const Intro = styled.p<{ $tone: "error" | "warn" }>`
  margin: 0 0 14px;
  padding: 12px 14px;
  border-radius: ${tokens.radius.card};
  border: 1px solid
    ${({ $tone }) => ($tone === "error" ? tokens.color.neg : tokens.color.warn)};
  background: ${({ $tone }) =>
    $tone === "error" ? tokens.color.negBg : tokens.color.warnBg};
  color: ${({ $tone }) =>
    $tone === "error" ? tokens.color.neg : tokens.color.ink2};
  font-size: 12.5px;
  line-height: 1.55;
`;

const EntryList = styled.ul`
  margin: 0 0 16px;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

// 다른 중복/확인 모달의 요약 블록과 같은 규약: solid line 보더 + card radius + foot 배경.
const EntryRow = styled.li`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.card};
  background: ${tokens.color.foot};
  font-size: 12.5px;
`;

const EntryLabel = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${tokens.color.ink1};
  font-size: 14px;
  font-weight: 700;
`;

const EntryFigures = styled.span`
  color: ${tokens.color.ink4};
  font-family: ${tokens.font.mono};
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  white-space: nowrap;
`;

// 다른 중복/확인 모달과 같은 규약: flex-end + gap 8px + 버튼 min-width 96px.
const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;

  > button {
    min-width: 96px;
  }
`;

/**
 * 모드별 문구는 사용자 요청 그대로 유지합니다.
 * exceeds는 블로킹 톤이라 느낌표를 붙이고, under는 가능성을 제시하는 물음표 톤으로 맞춥니다.
 */
function buildTitle(mode: "exceeds" | "under", count: number): string {
  if (mode === "exceeds") {
    return count > 1
      ? "상품 합계가 총 금액보다 큰 주문이 있어요"
      : "잘못 입력된 것 같아요";
  }
  return count > 1
    ? "상품 합계가 총 금액보다 작은 주문이 있어요"
    : "상품 금액이 총 금액보다 작아요";
}

function buildIntro(mode: "exceeds" | "under", count: number): string {
  if (mode === "exceeds") {
    return count > 1
      ? "아래 주문들은 상품 가격의 합이 총 금액을 초과합니다. 상품 또는 총 금액을 다시 확인해 주세요."
      : "상품 가격의 합이 총 금액을 초과합니다. 잘못 입력된 것 같습니다. 다시 한 번 확인해 주세요.";
  }
  return count > 1
    ? "아래 주문들은 상품이 누락되거나 금액을 잘못 입력했을 수 있어요. 이대로 등록하면 각 거래의 상세에서 '상품 내역이 일부만 입력됨'으로 표시됩니다."
    : "현재 상품이 누락되거나 금액을 잘못 입력하셨을 경우가 있습니다. 이대로 등록할까요? 등록 시 상세 내역에 '상품 내역이 일부만 입력됨'으로 표시돼요.";
}

export const ProductTotalWarningModal: React.FC<Props> = ({
  isOpen,
  mode,
  entries,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;
  const title = buildTitle(mode, entries.length);
  const intro = buildIntro(mode, entries.length);
  const tone = mode === "exceeds" ? "error" : "warn";

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title}>
      <Intro $tone={tone}>{intro}</Intro>
      <EntryList>
        {entries.map((entry) => {
          const absTotal = Math.abs(entry.totalAmount);
          const diff = Math.abs(entry.diff);
          const diffLabel =
            mode === "exceeds"
              ? `총 금액보다 ${formatKRW(diff)} 많음`
              : `총 금액보다 ${formatKRW(diff)} 적음`;
          return (
            <EntryRow key={entry.label}>
              <EntryLabel title={entry.label}>{entry.label}</EntryLabel>
              <EntryFigures>
                상품 {formatKRW(entry.productsSum)} / 총 {formatKRW(absTotal)}
                {" · "}
                {diffLabel}
              </EntryFigures>
            </EntryRow>
          );
        })}
      </EntryList>
      <Footer>
        {mode === "exceeds" ? (
          <Button variant="primary" size="md" onClick={onCancel}>
            확인
          </Button>
        ) : (
          <>
            <Button variant="secondary" size="md" onClick={onCancel}>
              다시 확인할게요
            </Button>
            <Button variant="primary" size="md" onClick={onConfirm}>
              이대로 등록
            </Button>
          </>
        )}
      </Footer>
    </Modal>
  );
};
