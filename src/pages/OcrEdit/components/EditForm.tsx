/**
 * 역할: OCR 편집 화면 오른쪽 영역의 컨테이너.
 *       한 이미지 안에 주문이 여러 개 있을 때, 각 주문을 독립된 OrderCard로 분리해서
 *       세로로 쌓습니다. 예전 버전은 "한 카드 = 한 이미지"에 주문 블록을 내장하는 식이었지만
 *       실제 DB 저장 단위(= TxRow)가 주문별이라서, UI도 주문별 카드로 나눠 두는 편이
 *       저장 모델과 일관되고 카테고리/상태 편집도 서로 섞이지 않게 됩니다.
 *       EditForm 자체는 얇은 컨테이너 역할만 하고, 실제 렌더링은 OrderCard에 위임합니다.
 * 위치: src\pages\OcrEdit\components\EditForm.tsx
 */
import React, { useState } from "react";
import styled from "styled-components";
import { Card, CardBd } from "../../../components/primitives/Card";
import { Tag } from "../../../components/primitives/Tag";
import { tokens } from "../../../styles/tokens";
import { PLATFORM_LABELS, STATUS_LABELS } from "../../../constants/labels";
import type { OcrImageItem, OcrOrder, Status } from "../data";
import { detectTruncation } from "../../../utils/ocrTruncation";
import { useCategoriesStore } from "../../../stores/categoriesStore";
import { OrderCard, type CategoryOption } from "./OrderCard";

const ImageSummary = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: ${tokens.color.ink4};
  font-size: 11.5px;
`;

const Hint = styled.div`
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid ${tokens.color.line2};
  border-radius: ${tokens.radius.card};
  background: ${tokens.color.tint};
  color: ${tokens.color.ink3};
  font-size: 11.5px;
  line-height: 1.55;
`;


/**
 * 일괄 상태 변경 툴바. 한 캡쳐에 주문이 2건 이상일 때만 노출되며, 사용자가 OrderCard 마다
 * statusTag 드롭다운을 일일이 클릭하지 않아도 한 번에 같은 상태로 바꿀 수 있게 합니다.
 *
 * 트리거 시나리오:
 *   1) 쿠팡 "주문 취소 내역" 페이지: 한 캡쳐에 취소된 주문이 5~10건 — 모두 cancel 로.
 *   2) 쿠팡 "반품완료" 묶음 페이지: 동일 (코드상으로는 이미 cancel 로 자동 매핑됐지만 사용자가
 *      재확인하거나 실수로 잘못 잡힌 케이스를 한 번에 정정할 때 유용).
 *   3) 신규 플랫폼이 자동 감지에 약해 모든 카드가 기본값 purchase 로 잡혔을 때 일괄 변경.
 */
const BulkActionBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  padding: 8px 10px;
  border: 1px dashed ${tokens.color.line};
  border-radius: ${tokens.radius.card};
  background: ${tokens.color.tint};
  font-size: 11.5px;
  color: ${tokens.color.ink3};
`;

const BulkLabel = styled.span`
  color: ${tokens.color.ink2};
  font-weight: 600;
  margin-right: 4px;
`;

const BulkButton = styled.button`
  padding: 4px 9px;
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.chip};
  background: ${tokens.color.panel};
  color: ${tokens.color.ink2};
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background ${tokens.motion.fast}, border-color ${tokens.motion.fast};

  &:hover {
    border-color: ${tokens.color.accent};
    color: ${tokens.color.accentHover};
    background: ${tokens.color.accentSubtle};
  }
`;

/** 일괄 변경 후보 status — 일반 사용자에게 의미 있는 4종. */
const BULK_STATUS_OPTIONS: Status[] = ["purchase", "cancel", "refund", "sub"];

/**
 * 잘림 경고 배너. 캡쳐 위/아래가 잘려 보이면 노출. 사용자가 잘린 부분을 보지 못하면
 * 가격·이름이 누락된 채 저장될 수 있으므로 미리 알려 다시 캡쳐를 안내합니다.
 *
 * 색은 warn 톤(노랑계열) — 저장을 막지는 않는 soft warning.
 */
const TruncationBanner = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid #fcd34d;
  border-radius: ${tokens.radius.card};
  background: ${tokens.color.warnBg};
  color: #92400e;
  font-size: 11.5px;
  line-height: 1.55;

  strong {
    font-weight: 700;
  }
`;

interface EditFormProps {
  image?: OcrImageItem;
  /**
   * 주문 블록 내부 필드(주문일자·상태 태그·쿠폰/차감액)를 수정했을 때 상위(OcrEditPage)로 patch를
   * 올립니다. totalAmount 는 deriveOrderTotal 에서 단일 규칙으로 산출되므로 이 patch 에 포함하지
   * 않습니다.
   */
  onOrderPatch?: (
    orderId: string,
    patch: Partial<
      Pick<OcrOrder, "orderDate" | "statusTag" | "couponEnabled" | "discountAmount">
    >
  ) => void;
  /**
   * 상품 목록 변경. ProductTable에서 추가·수정·삭제 시 orderId + 최신 목록으로 올라옵니다.
   */
  onProductsChange?: (orderId: string, products: OcrOrder["products"]) => void;
  /**
   * 주문 블록 삭제 요청. 실제 삭제(마지막 1건이면 이미지 캐스케이드 + 확인 모달)는 OcrEditPage에서 처리합니다.
   */
  onDeleteOrder?: (orderId: string) => void;
  /** 주문별로 선택된 카테고리 키 목록. orderId → 선택된 키 배열. 상위(OcrEditPage)에서 관리합니다. */
  selectedByOrder: Record<string, string[]>;
  /** 특정 주문의 카테고리 체크/해제. 상위에서 상태를 보관해 저장 시 반영합니다. */
  onToggleCategoryFor: (orderId: string, key: string) => void;
}

export const EditForm: React.FC<EditFormProps> = ({ image, onOrderPatch, onProductsChange, onDeleteOrder, selectedByOrder, onToggleCategoryFor }) => {
  /**
   * 카테고리 목록은 설정(categoriesStore)에서 초기값을 가져와 세션 내에서 추가/삭제할 수 있습니다.
   * 선택 상태(selectedByOrder)는 저장 시 TxRow에 반영해야 해서 상위(OcrEditPage)에서 관리합니다.
   */
  const storeCategories = useCategoriesStore();
  const [categories, setCategories] = useState<CategoryOption[]>(() =>
    storeCategories.map((entry) => ({ key: entry.id, label: entry.name }))
  );

  if (!image) {
    return (
      <Card>
        <CardBd>
          <div style={{ fontSize: 13, color: tokens.color.ink4, textAlign: "center", padding: 40 }}>
            이미지를 선택하면 분석 결과가 표시됩니다.
          </div>
        </CardBd>
      </Card>
    );
  }

  const handleAddCategory = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    // 같은 이름이 이미 있으면 목록에는 더하지 않고 입력만 무시합니다.
    const exists = categories.some((category) => category.label === trimmed);
    if (exists) return;
    const key = `custom_${Date.now()}`;
    setCategories((prev) => [...prev, { key, label: trimmed }]);
  };

  const handleRemoveCategory = (key: string) => {
    setCategories((prev) => prev.filter((category) => category.key !== key));
    // 선택 상태는 OcrEditPage의 selectedByOrder에 보관됩니다.
    // 삭제된 키는 저장 시 buildCandidateFromOrder의 VALID_TX_CATEGORIES 필터로 걸러집니다.
  };

  return (
    <div>
      {/* 이미지 한 건을 요약하는 상단 띠. 플랫폼은 주문 카드마다 다시 보여 주지만,
       * "이 캡쳐에 주문이 몇 건 있는지"는 전역 맥락이라 여기서 한 번만 표시합니다. */}
      <ImageSummary>
        <Tag kind={image.platform}>{PLATFORM_LABELS[image.platform]}</Tag>
        <span>주문 {image.orders.length}건</span>
        <span>
          상품 {image.orders.reduce((acc, o) => acc + o.products.length, 0)}개
        </span>
      </ImageSummary>

      {/*
       * 안내 문구는 플랫폼별로 분기합니다.
       *  - 쿠팡: 한 캡쳐에 구매·환불·취소 카드가 섞이는 케이스가 흔하므로 "주문 단위 카드 분리" 강조
       *  - 네이버: list 뷰가 보통 동질 주문 묶음이거나 한 주문이라 "구매·환불 섞임" 표현이 맞지 않음
       *
       * 정책: docs/Naver_OCR_Parsing_Strategy.md §12-1 — 차이는 보조 메타와 "파서 해석" 에서
       * 만들고 공통 데이터 형식은 유지. UI 카피도 플랫폼 차이에 맞춰 분기해 둡니다.
       */}
      <Hint>
        {image.platform === "coupang"
          ? "상품별로 주문일·상태·카테고리를 확인해 주세요. 저장하면 각각의 거래로 들어가요."
          : "상품별로 주문일·상태·카테고리를 확인해 주세요. 저장하면 각각의 거래로 들어가요. 접힌 주문은 상품 일부만 보일 수 있고, 결제 차이는 카드 안 ‘쿠폰/추가 할인 적용’에서 보정해 주세요."}
      </Hint>

      {(() => {
        // 잘림(truncation) 경고. detectTruncation 의 두 신호(topCut/bottomCut) 중 하나라도
        // 있으면 사용자에게 "이 캡쳐는 일부가 잘린 것 같다" 를 미리 알려 다시 캡쳐를 유도합니다.
        // 저장은 막지 않고 단순 hint — 이미 입력된 카드는 그대로 사용 가능.
        //
        // 카피 분기:
        //   쿠팡 데스크톱 캡쳐는 상단에 "YYYY. M. DD 주문 ..." 헤더가 있어 topCut 을 "주문 헤더가
        //   보이지 않음" 으로 표현해도 의미가 맞지만, 네이버 list 뷰는 주문마다 dp 라인이 따로
        //   찍히고 단일 헤더가 없어 같은 표현이 어색합니다. 플랫폼별로 라벨만 갈아끼웁니다.
        //   detect 로직 자체는 양쪽 모두 유효(첫 주문 orderDate 결측 / 마지막 카드 priceOcrFailed).
        const sig = detectTruncation(image);
        if (!sig.topCut && !sig.bottomCut) return null;
        const parts: string[] = [];
        if (sig.topCut) {
          parts.push(
            image.platform === "coupang"
              ? "위쪽 (주문 헤더가 보이지 않음)"
              : "위쪽 (첫 주문의 날짜를 읽지 못함)"
          );
        }
        if (sig.bottomCut) parts.push("아래쪽 (마지막 상품 가격이 잘림)");
        return (
          <TruncationBanner role="status" aria-live="polite">
            <span aria-hidden="true">⚠️</span>
            <span>
              <strong>이 캡쳐의 {parts.join(" · ")}</strong>이 잘렸을 수 있어요.
              누락된 부분이 있다면 그 영역을 다시 캡쳐해 새 이미지로 추가하시면
              됩니다. 누락이 없다면 그대로 진행하셔도 됩니다.
            </span>
          </TruncationBanner>
        );
      })()}

      {image.orders.length >= 2 && onOrderPatch && (
        // 한 캡쳐 안 주문이 2건 이상일 때만 일괄 툴바 노출. 1건이면 OrderCard 의 자체 dropdown 으로 충분.
        // "주문 취소 내역" / "반품완료 묶음" 같이 한 화면에 같은 상태가 몰리는 캡쳐에서 클릭 수를 N→1 로 줄임.
        <BulkActionBar role="toolbar" aria-label="주문 상태 일괄 변경">
          <BulkLabel>이 캡쳐의 {image.orders.length}건 모두</BulkLabel>
          {BULK_STATUS_OPTIONS.map((option) => (
            <BulkButton
              key={option}
              type="button"
              onClick={() => {
                for (const order of image.orders) {
                  onOrderPatch(order.id, { statusTag: option });
                }
              }}
              title={`이 캡쳐의 모든 주문을 '${STATUS_LABELS[option]}' 상태로 일괄 변경합니다`}
            >
              {STATUS_LABELS[option]}
            </BulkButton>
          ))}
          <span style={{ color: tokens.color.ink4, marginLeft: 4 }}>로 일괄 변경</span>
        </BulkActionBar>
      )}

      {image.orders.map((order) => (
        <OrderCard
          key={order.id}
          platform={image.platform}
          order={order}
          onOrderPatch={onOrderPatch ? (patch) => onOrderPatch(order.id, patch) : undefined}
          onProductsChange={onProductsChange ? (products) => onProductsChange(order.id, products) : undefined}
          onDelete={onDeleteOrder ? () => onDeleteOrder(order.id) : undefined}
          categories={categories}
          selectedKeys={selectedByOrder[order.id] ?? []}
          onToggleCategory={(key) => onToggleCategoryFor(order.id, key)}
          onAddCategory={handleAddCategory}
          onRemoveCategory={handleRemoveCategory}
        />
      ))}
    </div>
  );
};
