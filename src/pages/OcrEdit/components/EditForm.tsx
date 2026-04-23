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
import { CATEGORY_LABELS, PLATFORM_LABELS } from "../../../constants/labels";
import type { OcrImageItem, OcrOrder } from "../data";
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
 * 기본 카테고리 목록. CATEGORY_LABELS의 key/label을 그대로 펼쳐 두고,
 * 사용자가 추가한 항목은 시간값 기반 key로 뒤에 쌓입니다.
 */
const DEFAULT_CATEGORIES: CategoryOption[] = Object.entries(CATEGORY_LABELS).map(
  ([key, label]) => ({ key, label })
);

interface EditFormProps {
  image?: OcrImageItem;
  /**
   * 주문 블록 내부 필드(주문일자·상태 태그)를 수정했을 때 상위(OcrEditPage)로 patch를 올립니다.
   */
  onOrderPatch?: (orderId: string, patch: Partial<Pick<OcrOrder, "orderDate" | "statusTag" | "totalAmount">>) => void;
  /**
   * 상품 목록 변경. ProductTable에서 추가·수정·삭제 시 orderId + 최신 목록으로 올라옵니다.
   */
  onProductsChange?: (orderId: string, products: OcrOrder["products"]) => void;
  /**
   * 주문 블록 삭제 요청. 실제 삭제(마지막 1건이면 이미지 캐스케이드 + 확인 모달)는 OcrEditPage에서 처리합니다.
   */
  onDeleteOrder?: (orderId: string) => void;
}

export const EditForm: React.FC<EditFormProps> = ({ image, onOrderPatch, onProductsChange, onDeleteOrder }) => {
  /**
   * 카테고리 목록 자체는 화면 전체에서 공유합니다. 사용자가 한 주문 카드에서 "뷰티"를 추가해도
   * 같은 이미지 안 다른 카드에 곧바로 칩이 보여야 자연스럽고, 다른 이미지를 선택했을 때도
   * 직전까지 쓰던 목록이 그대로 남아 있어야 재입력 비용이 없어집니다.
   * 반면 어떤 카테고리를 "체크했는가"는 주문 단위로 저장되어야 해서 selectedByOrder를 orderId 키로 둡니다.
   */
  const [categories, setCategories] = useState<CategoryOption[]>(DEFAULT_CATEGORIES);
  const [selectedByOrder, setSelectedByOrder] = useState<Record<string, string[]>>({});

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

  const toggleCategoryFor = (orderId: string, key: string) => {
    setSelectedByOrder((prev) => {
      const current = prev[orderId] ?? [];
      const next = current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key];
      return { ...prev, [orderId]: next };
    });
  };

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
    // 삭제한 카테고리가 선택 상태였던 주문이 있다면 그 선택 목록에서도 제거해 둡니다.
    setSelectedByOrder((prev) => {
      const next: Record<string, string[]> = {};
      for (const [orderId, keys] of Object.entries(prev)) {
        next[orderId] = keys.filter((selectedKey) => selectedKey !== key);
      }
      return next;
    });
  };

  return (
    <div>
      {/* 이미지 한 건을 요약하는 상단 띠. 플랫폼은 주문 카드마다 다시 보여 주지만,
       * "이 캡쳐에 주문이 몇 건 있는지"는 전역 맥락이라 여기서 한 번만 표시합니다. */}
      <ImageSummary>
        <Tag kind={image.platform}>{PLATFORM_LABELS[image.platform]}</Tag>
        <span>주문 {image.orders.length}건</span>
      </ImageSummary>

      <Hint>
        OCR 결과는 초안 상태예요. 같은 캡쳐에 구매·환불이 섞여 있어도 주문 단위로 카드가 분리돼
        저장 시 각각의 거래로 들어갑니다. 카드마다 주문일자 · 상태 · 카테고리를 필요한 만큼 조정해 주세요.
      </Hint>

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
          onToggleCategory={(key) => toggleCategoryFor(order.id, key)}
          onAddCategory={handleAddCategory}
          onRemoveCategory={handleRemoveCategory}
        />
      ))}
    </div>
  );
};
