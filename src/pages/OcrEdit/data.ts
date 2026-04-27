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
  /** 주문/결제일. 같은 주문 안의 모든 상품이 공유하며, AI 가 개별 카드에서 회복해 올 수 있습니다. */
  date?: string;
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
  /**
   * 이 주문의 최종 거래금액. 일반 주문은 상품합계(가격 × 수량) - 차감액, 접힌 주문은
   * sectionTotal - 차감액으로 자동 계산됩니다(`deriveOrderTotal` 참고).
   */
  totalAmount: number;
  products: OcrProduct[];
  /**
   * 해당 주문 블록에서 OCR이 읽어온 원문 조각. 전체 이미지 rawText의 하위 섹션이며,
   * statusTag 추정과 디버깅·회귀 테스트에 활용합니다.
   */
  rawText?: string;
  /**
   * 네이버 "접힌 주문" 메타. parser 가 `포함 총 n건` / `주문 펼쳐보기` 같은 신호를 감지하면
   * true 로 들어옵니다. true 인 주문은:
   *   - products[] 는 대표 상품 1개만 들어있을 수 있고 가격이 미확정일 수 있음
   *   - totalAmount 는 sectionTotal 기반으로 계산
   *   - UI 에 "접힌 주문 / 외 n건 숨김" 안내가 노출됨
   * 자세한 정책은 docs/Naver_OCR_Parsing_Strategy.md §6, §12-5 참조.
   */
  folded?: boolean;
  /** "포함 총 n건" 에서 추출한 실제 상품 개수 힌트. folded 일 때만 의미 있습니다. */
  itemCountHint?: number;
  /**
   * 결제 섹션 합계("총 n원"). folded 주문에서 totalAmount 계산의 기준이 되며,
   * 펼친 주문에서도 OCR 이 결제 합계를 읽었다면 정합성 점검용 메타로 보존합니다.
   */
  sectionTotal?: number;
  /**
   * 사용자가 OCR 수정 화면에서 "쿠폰/추가 할인 적용" 체크박스를 켰는지. 체크하면 아래
   * `discountAmount` 입력칸이 노출됩니다. 금액이 0 이어도 "토글한 의도" 를 보존하기 위해
   * 별도 플래그로 둡니다.
   */
  couponEnabled?: boolean;
  /**
   * 주문단위 차감액(쿠폰/포인트/카드사 할인 등). 상품합계와 결제액의 차이를 사용자가 보정하는
   * 단일 슬롯입니다. 자동 배분하지 않고 order 레벨에서만 보존합니다(정책 §12-3).
   */
  discountAmount?: number;
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
   * Tesseract rawText 기반으로 자동 감지된 platform. 사용자가 platform 을 잘못 골랐을 가능성이
   * 있으면 OcrUpload 가 분석 후 confirm 모달을 띄움.
   *
   * 정책: literal UI 라벨/배지 시그널만 사용 — wordlist 하드코딩(상품명) 아님.
   * 자세한 알고리즘은 src/utils/ocrPlatformDetect.ts 참고.
   */
  detectedPlatform?: Platform | null;
  /** 0~1 — 자동 감지 confidence. < 0.55 이거나 detectedPlatform === null 이면 mismatch 판정 안 함. */
  detectionConfidence?: number;
}
