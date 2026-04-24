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
import { CATEGORY_LABELS, PLATFORM_LABELS, STATUS_LABELS } from "../../../constants/labels";
import type { OcrImageItem, OcrOrder, Status } from "../data";
import { DEBUG_OCR_AI } from "../../../utils/ocrAiDebug";
import { detectTruncation } from "../../../utils/ocrTruncation";
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
 * 인식률 요약 배지 — "주문 N건 · 상품 M개" 요약 옆에 AI 보정된 카드 수를 차분한 톤으로
 * 같이 노출. 경고 배너가 아닌 단순 상태 표시라서, 사용자가 "이 캡쳐가 어느 정도 신뢰할 수
 * 있나" 를 한눈에 볼 수 있습니다.
 */
const SummaryChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: ${tokens.radius.chip};
  background: ${tokens.color.accentSubtle};
  color: ${tokens.color.accentHover};
  font-size: 11px;
  font-weight: 600;
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
   * totalAmount는 상품 목록 변경 시 상위에서 자동 동기화되므로 이 patch에는 포함하지 않습니다.
   */
  onOrderPatch?: (orderId: string, patch: Partial<Pick<OcrOrder, "orderDate" | "statusTag">>) => void;
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
        <span>
          상품 {image.orders.reduce((acc, o) => acc + o.products.length, 0)}개
        </span>
        {/* ───── DEBUG 전용 (DEBUG_OCR_AI=true 일 때만 렌더됨) ─────
            AI 보정 요약 칩. 배포 전 ocrAiDebug.ts 의 상수를 false 로 돌리거나 이 블록을
            grep 후 제거. 실사용자는 AI 가 관여했는지 알 필요가 없다는 UX 원칙. */}
        {DEBUG_OCR_AI && (() => {
          const aiCount = image.orders.reduce(
            (acc, o) => acc + o.products.filter((p) => p.aiApplied).length,
            0,
          );
          return aiCount > 0 ? (
            <SummaryChip title="[DEBUG] Tesseract 가 놓친 항목을 AI 가 보정">
              ✨ AI 보정 {aiCount}개
            </SummaryChip>
          ) : null;
        })()}
      </ImageSummary>

      <Hint>
        OCR 결과는 초안 상태예요. 같은 캡쳐에 구매·환불이 섞여 있어도 주문 단위로 카드가 분리돼
        저장 시 각각의 거래로 들어갑니다. 카드마다 주문일자 · 상태 · 카테고리를 필요한 만큼 조정해 주세요.
      </Hint>

      {(() => {
        // 잘림(truncation) 경고. detectTruncation 의 두 신호(topCut/bottomCut) 중 하나라도
        // 있으면 사용자에게 "이 캡쳐는 일부가 잘린 것 같다" 를 미리 알려 다시 캡쳐를 유도합니다.
        // 저장은 막지 않고 단순 hint — 이미 입력된 카드는 그대로 사용 가능.
        const sig = detectTruncation(image);
        if (!sig.topCut && !sig.bottomCut) return null;
        const parts: string[] = [];
        if (sig.topCut) parts.push("위쪽 (주문 헤더가 보이지 않음)");
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
          onToggleCategory={(key) => toggleCategoryFor(order.id, key)}
          onAddCategory={handleAddCategory}
          onRemoveCategory={handleRemoveCategory}
        />
      ))}
    </div>
  );
};
