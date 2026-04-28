/**
 * 역할: OCR 분석된 이미지가 위/아래가 잘렸는지(=일부만 캡쳐됐는지) 와, 두 이미지가 연속된
 *       캡쳐일 가능성이 높은지를 추정하는 휴리스틱 모음. 자동 머지는 위험하므로 사용자에게
 *       힌트로만 노출하고 실제 결합 여부는 사용자가 결정합니다.
 *
 * 위치: src/utils/ocrTruncation.ts
 *
 * 신호 정의:
 *   - topCut    : 첫 주문의 orderDate 가 비어 있음 (= 위쪽이 잘려 헤더가 누락됨).
 *                 모바일 캡쳐의 orphan 카드 패턴(파서가 priceOrcFailed 와 함께 만든 카드) 을 감지.
 *   - bottomCut : 마지막 카드가 priceOcrFailed = true 인 경우 (= 가격 라인이 잘림).
 *                 또는 rawText 마지막 라인이 미완성 패턴(쉼표·콤마·온점 없이 한글 중간으로 끝).
 *   - continuation: 직전 이미지가 bottomCut 이고 현재 이미지가 topCut 인 경우 강한 신호.
 *                   같은 날짜의 카드가 두 이미지에 걸쳐 있을 때도 약한 신호.
 *
 * 자동 머지를 안 하는 이유:
 *   캡쳐 사이에 다른 화면(알림, 카루셀)이 끼었을 수 있고, 사용자가 의도적으로 다른 주문을
 *   따로 올렸을 수 있어 잘못된 머지는 가계부 무결성을 해칩니다. UI 힌트로 사용자가 명시적으로
 *   "이 둘은 연속이다" 를 인정하게 하는 편이 안전합니다.
 */

import type { OcrImageItem } from "../pages/OcrEdit/data";

export interface TruncationSignal {
  /** 이미지 위쪽이 잘려 첫 주문에 헤더가 없는 것으로 보임. */
  topCut: boolean;
  /** 이미지 아래쪽이 잘려 마지막 카드의 가격이 누락된 것으로 보임. */
  bottomCut: boolean;
}

/**
 * 한 이미지에 대해 잘림 신호를 추정합니다. OCR 결과만 보고 판단하므로 실제 이미지 픽셀 분석은
 * 하지 않습니다(브라우저에서 추가 비용 회피).
 *
 * 플랫폼 분기 (2026-04-27 추가):
 *   topCut 신호 정의는 **쿠팡 데스크톱 캡쳐 가정**으로 만들어졌습니다 — 화면 상단에 큰
 *   "YYYY. M. DD 주문" 헤더가 한 번 있고 그 아래로 그 날짜의 카드들이 깔리는 구조라, 캡쳐
 *   위가 잘려 헤더가 사라지면 첫 카드의 orderDate 가 빈 채로 들어옵니다.
 *
 *   네이버는 단일 헤더가 없고 주문마다 자체 날짜 라인을 가지므로, "첫 주문 orderDate 결측
 *   = 캡쳐 잘림" 이 성립하지 않습니다. 단순히 그 카드의 날짜 OCR 이 실패했거나 파서가 못
 *   잡은 것일 수 있어요. 따라서 네이버에서는 topCut 을 강제로 false 로 둡니다(strategy doc
 *   §10 — UI drift 대응 전략 / Codex 후속 작업으로 네이버 전용 신호 정의 예정).
 *
 *   bottomCut(마지막 카드 priceOcrFailed) 은 두 플랫폼 모두에서 의미가 있어 그대로 유지.
 */
export function detectTruncation(image: OcrImageItem): TruncationSignal {
  if (image.orders.length === 0) {
    return { topCut: false, bottomCut: false };
  }

  const firstOrder = image.orders[0];
  const lastOrder = image.orders[image.orders.length - 1];

  // topCut: 쿠팡 데스크톱 한정. 네이버에서는 신호 의미가 달라 강제로 false.
  const topCut =
    image.platform === "coupang"
      ? (firstOrder.orderDate ?? "").trim() === ""
      : false;

  // bottomCut: 마지막 주문의 마지막 상품이 priceOcrFailed (Tesseract 가 가격 라인을 못 읽음).
  //   가격이 캡쳐 영역을 넘어 잘린 경우의 전형적 신호. 두 플랫폼 모두에서 동일하게 의미가
  //   있어 platform 분기 없이 유지합니다.
  //   AI 보정 후에도 priceOcrFailed 플래그 자체는 유지되므로(원본 시그널), 보수적으로 마지막
  //   카드가 aiApplied=false (= AI 가 못 살림) 일 때만 잘림으로 봅니다.
  const lastProduct = lastOrder.products[lastOrder.products.length - 1];
  const bottomCut = Boolean(
    lastProduct &&
      lastProduct.priceOcrFailed &&
      !lastProduct.aiApplied,
  );

  return { topCut, bottomCut };
}

/**
 * 두 이미지가 연속된 캡쳐(앞 이미지 끝 ↔ 뒤 이미지 시작) 일 가능성을 추정합니다.
 * 반환값은 0..1 점수가 아닌 단순 boolean 으로, 힌트 노출 여부에만 사용합니다.
 */
export function detectContinuation(
  prev: OcrImageItem | undefined,
  current: OcrImageItem,
): boolean {
  if (!prev) return false;
  if (prev.platform !== current.platform) return false; // 서로 다른 쇼핑몰이면 연속일 수 없음.

  const prevSignal = detectTruncation(prev);
  const currSignal = detectTruncation(current);

  // 강한 신호: 앞이 bottomCut + 뒤가 topCut.
  if (prevSignal.bottomCut && currSignal.topCut) return true;

  // 약한 신호: 앞 이미지의 마지막 주문 날짜와 뒤 이미지의 첫 주문 날짜가 같은 날 (사용자가
  // 같은 날 주문 묶음을 두 캡쳐로 나눈 케이스). topCut 이 같이 있어야 머지 후보.
  const prevLastDate = prev.orders[prev.orders.length - 1]?.orderDate;
  const currFirstDate = current.orders[0]?.orderDate;
  if (
    currSignal.topCut &&
    prevLastDate &&
    currFirstDate &&
    prevLastDate === currFirstDate
  ) {
    return true;
  }

  return false;
}
