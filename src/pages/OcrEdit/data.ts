/**
 * 역할: OCR 편집 화면에서 사용하는 도메인 타입 정의입니다.
 *
 *       실제 쇼핑몰 주문내역 캡쳐(쿠팡 예시)를 보면 한 화면에 "주문일자 - 상태 카드 - 상품 목록"
 *       구조가 반복됩니다. 상태 카드(예: 취소완료, 배송완료)가 하나의 "주문"에 대응하고,
 *       같은 날짜라도 서로 다른 두 주문이 별개 카드로 찍힐 수 있습니다. 그래서 한 이미지는
 *       여러 개의 주문(OcrOrder)을 가질 수 있어야 하고, 저장 시에는 주문 하나당 TxRow 하나로
 *       저장되어야 의미가 맞습니다(구매와 환불을 한 거래 안에 섞으면 가계부에서 부호가 엉킵니다).
 *
 *       과거에는 "OCR 엔진이 붙기 전 화면을 비워 두지 않으려는" 목적의 mock 시나리오들이
 *       이 파일에 함께 있었지만, 이제는 Tesseract.js 기반 실 업로드 흐름이 동작하므로
 *       시드 데이터를 걷어내고 타입 정의만 남겨 두었습니다. rawText에서 상태를 추정하는
 *       로직은 utils/ocrParse의 detectStatusFromOcrText가 담당합니다.
 *
 * 위치: src\pages\OcrEdit\data.ts
 */

export type Platform = "coupang" | "naver";
export type Status = "purchase" | "sub" | "cancel" | "refund";

export interface OcrProduct {
  id: string;
  name: string;
  price: number;
  /** 상품 수량. 쿠팡처럼 "1개", "2개"가 함께 찍히는 캡쳐를 감안해 기본 1. */
  quantity?: number;
  link?: string;
  /**
   * Tesseract 가 가격 라인을 아예 못 읽어서 `price` 가 0 으로 떨어진 카드 표시. `price === 0` 이
   * 두 경우를 의미할 수 있어 (사은품·쿠폰으로 진짜 0원 / OCR 실패) 구분용 플래그.
   * true 인 카드는 AI 자동 보정 대상, false/undefined 인 0원은 그대로 저장해도 되는 정상 케이스.
   */
  priceOcrFailed?: boolean;
  /**
   * 이 카드가 AI 보정을 거쳤음을 표시. UI 에서 "✨ AI 보정됨" 배지를 띄우고, 사용자가 다시
   * 편집하면 이 flag 를 떨어뜨려도 됩니다(편집 후에는 "사용자 확정" 상태라고 보면 됨).
   */
  aiApplied?: boolean;
}

/**
 * 캡쳐 안의 "상태 카드 하나"에 해당하는 단위.
 * 쿠팡의 각 주문 카드(취소완료 / 배송완료 / 주문완료 ...) 또는 네이버페이 주문내역의
 * 건별 블록이 이것에 해당합니다. 저장 시 TxRow 하나로 변환됩니다.
 */
export interface OcrOrder {
  id: string;
  /** 주문일자 (YYYY.MM.DD). 같은 캡쳐 안에서도 주문마다 다를 수 있어 주문 단위로 둡니다. */
  orderDate: string;
  /** detect/사용자 편집으로 확정되는 거래 상태 태그. */
  statusTag: Status;
  /**
   * 캡쳐에 찍힌 상태 라벨 원문(예: "취소완료", "배송완료 · 4/9(목) 도착").
   * statusTag은 내부 카테고리이고, 이 필드는 사용자에게 "쇼핑몰이 실제로 뭐라고 써 놨는지"를
   * 보여 주기 위해 원문을 그대로 남겨둡니다. detect 대상으로도 사용됩니다.
   */
  statusLabel?: string;
  /** 이 주문의 합계 금액. 상품 가격 합계로 계산해 둔 값입니다. */
  totalAmount: number;
  products: OcrProduct[];
  /**
   * 해당 주문 블록에서 OCR이 읽어온 원문 조각. 전체 이미지 rawText의 하위 섹션이며,
   * statusTag 추정과 디버깅·회귀 테스트에 활용합니다.
   */
  rawText?: string;
}

export interface OcrImageItem {
  id: string;
  fileName: string;
  thumbUrl: string;
  /**
   * 저장 후 거래내역에서 "OCR 이미지 보기" 시 사용하는 압축 data URL (base64 JPEG).
   * thumbUrl(blob URL)은 세션 종료/새로고침 시 무효화되므로, 영속이 필요한 곳에는 이 값을 씁니다.
   * 업로드 직후 canvas 압축으로 생성되며, 없으면 빈 문자열로 대체됩니다.
   */
  sourceDataUrl?: string;
  status: "analyzed" | "pending";
  platform: Platform;
  /** 이미지 전체 OCR 원문. 각 order.rawText는 이 값의 일부 구간입니다. */
  rawText?: string;
  /** 이 캡쳐에서 추출된 주문 목록. 최소 1개 이상. */
  orders: OcrOrder[];
  /**
   * 이 이미지가 AI(Gemini Vision) 2차 확인을 거쳤는지. 개발 중 디버그 chip 노출용 플래그.
   * 실제 값이 바뀐 카드가 없어도 "AI 가 이미지를 봤다" = `true`. 비용·게이트 튜닝 지표로 활용.
   * 배포 전 DEBUG_OCR_AI 와 함께 제거되는 가지 — UI 에 이 값을 읽는 곳은 debug chip 뿐.
   */
  aiInvoked?: boolean;
}
