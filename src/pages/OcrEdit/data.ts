/**
 * 역할: OCR 편집 화면에서 사용하는 목업 데이터와 타입 정의입니다.
 *
 *       실제 쇼핑몰 주문내역 캡쳐(쿠팡 예시)를 보면 한 화면에 "주문일자 - 상태 카드 - 상품 목록"
 *       구조가 반복됩니다. 상태 카드(예: 취소완료, 배송완료)가 하나의 "주문"에 대응하고,
 *       같은 날짜라도 서로 다른 두 주문이 별개 카드로 찍힐 수 있습니다. 그래서 한 이미지는
 *       여러 개의 주문(OcrOrder)을 가질 수 있어야 하고, 저장 시에는 주문 하나당 TxRow 하나로
 *       저장되어야 의미가 맞습니다(구매와 환불을 한 거래 안에 섞으면 가계부에서 부호가 엉킵니다).
 *
 *       v1 MVP에서는 Tesseract.js 등 실제 OCR 엔진이 아직 붙지 않았지만, 캡쳐를 OCR이 읽었다고
 *       가정한 "원문(rawText)"을 그대로 담아 두고 statusTag은 utils/ocrParse의 detect 함수로 도출
 *       해서, 진짜 OCR이 붙는 시점에 rawText만 실제 인식값으로 갈아 끼우면 되도록 설계했습니다.
 *
 * 위치: src\pages\OcrEdit\data.ts
 */
import { detectStatusFromOcrText } from "../../utils/ocrParse";

export type Platform = "coupang" | "naver" | "musinsa" | "auction" | "temu";
export type Status = "purchase" | "sub" | "cancel" | "refund";

export interface OcrProduct {
  id: string;
  name: string;
  price: number;
  /** 상품 수량. 쿠팡처럼 "1개", "2개"가 함께 찍히는 캡쳐를 감안해 기본 1. */
  quantity?: number;
  link?: string;
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
  status: "analyzed" | "pending";
  platform: Platform;
  /** 이미지 전체 OCR 원문. 각 order.rawText는 이 값의 일부 구간입니다. */
  rawText?: string;
  /** 이 캡쳐에서 추출된 주문 목록. 최소 1개 이상. */
  orders: OcrOrder[];
}

export interface OcrEditMockData {
  images: OcrImageItem[];
}

/**
 * rawText가 있으면 detectStatusFromOcrText로 statusTag을 자동 추정해 OcrOrder를 만드는 헬퍼.
 * 호출부에서 statusTag을 직접 지정하면 그대로 쓰고, 그렇지 않으면 키워드 매칭 결과를 사용합니다.
 * totalAmount은 products 가격 합계로 자동 계산합니다.
 */
function buildOrder(
  base: Omit<OcrOrder, "statusTag" | "totalAmount"> & {
    statusTag?: Status;
    totalAmount?: number;
  }
): OcrOrder {
  const detectionSource = base.rawText ?? base.statusLabel ?? "";
  const statusTag =
    base.statusTag ??
    detectStatusFromOcrText(detectionSource) ??
    "purchase";

  const totalAmount =
    base.totalAmount ??
    base.products.reduce(
      (sum, product) => sum + product.price * (product.quantity ?? 1),
      0
    );

  return { ...base, statusTag, totalAmount };
}

// ─── 시나리오 1. 쿠팡 2026.4.16 주문 · 취소완료 × 2 카드 ─────────────────────────
// 사용자 레퍼런스 캡쳐의 상단부. 같은 날짜에 두 건의 주문이 모두 취소된 케이스로,
// "하나의 캡쳐 = 하나의 거래"가 성립하지 않는 대표 사례입니다. 카드 2개는 서로 다른
// 주문(상품 구성·합계가 다름)이므로 반드시 별개 TxRow로 저장되어야 합니다.
const img1Rawtext_order1 = `취소완료
· 판매자로켓 새벽  코지엔비 곱창머리끈 5종, 1세트  6,900원 · 1개
· 판매자로켓 새벽  누엘르 12cm 대형 머리 집게핀 물결 포인트 헤어 집게핀 2개 1세트, 매트 블랙+모카 브라운  11,780원 · 1개
· 로켓 새벽  씨케이디 레티노 콜라겐 저분자 탄력크림, 40ml, 2개  17,270원 · 1개`;

const img1Rawtext_order2 = `취소완료
· 로켓 내일  삼성전자 C타입 초고속 충전기 25W + 케이블 1m 세트 PD PPS GaN, 블랙, 1개  20,700원 · 1개`;

const img1Orders: OcrOrder[] = [
  buildOrder({
    id: "img1-order1",
    orderDate: "2026.04.16",
    statusLabel: "취소완료",
    rawText: img1Rawtext_order1,
    products: [
      { id: "img1-o1-p1", name: "코지엔비 곱창머리끈 5종, 1세트", price: 6900 },
      {
        id: "img1-o1-p2",
        name: "누엘르 12cm 대형 머리 집게핀 물결 포인트, 매트 블랙+모카 브라운",
        price: 11780,
      },
      {
        id: "img1-o1-p3",
        name: "씨케이디 레티노 콜라겐 저분자 탄력크림, 40ml, 2개",
        price: 17270,
      },
    ],
  }),
  buildOrder({
    id: "img1-order2",
    orderDate: "2026.04.16",
    statusLabel: "취소완료",
    rawText: img1Rawtext_order2,
    products: [
      {
        id: "img1-o2-p1",
        name: "삼성전자 C타입 초고속 충전기 25W + 케이블 1m 세트, 블랙",
        price: 20700,
      },
    ],
  }),
];

// ─── 시나리오 2. 쿠팡 2026.4.8 주문 · 배송완료 단일 카드 ─────────────────────────
// 같은 캡쳐의 하단부. 깨끗한 구매 건 하나이고, "배송완료 · 4/9(목) 도착"처럼 쇼핑몰이
// 상세 라벨을 함께 보여주는 케이스. detect 함수는 "배송완료"에서 purchase로 매핑합니다.
const img2Rawtext_order1 = `배송완료 · 4/9(목) 도착
· 로켓 새벽  에스트라 아토베리어 365 로션 플러스, 180ml, 1개  28,890원 · 1개`;

const img2Orders: OcrOrder[] = [
  buildOrder({
    id: "img2-order1",
    orderDate: "2026.04.08",
    statusLabel: "배송완료 · 4/9(목) 도착",
    rawText: img2Rawtext_order1,
    products: [
      {
        id: "img2-o1-p1",
        name: "에스트라 아토베리어 365 로션 플러스, 180ml",
        price: 28890,
      },
    ],
  }),
];

// ─── 시나리오 3. 네이버페이 2026.4.11 · 구매 + 환불 혼합 캡쳐 ───────────────────
// 한 화면에 구매 주문과 환불 주문이 같이 찍힌 혼합 케이스. 과거 논의의 핵심 시나리오로,
// 이전 구현에서 "한 블록 안에 환불 행을 섞어 넣던" 문제를 카드 분리로 해소합니다.
// 저장 시 order1은 지출(-89,000원), order2는 수입(+29,000원)으로 각각 TxRow가 됩니다.
const img3Rawtext_order1 = `주문완료
캔버스 백 화이트  89,000원 · 1개`;
const img3Rawtext_order2 = `환불완료
데일리 티셔츠 2팩  29,000원 · 1개`;

const img3Orders: OcrOrder[] = [
  buildOrder({
    id: "img3-order1",
    orderDate: "2026.04.11",
    statusLabel: "주문완료",
    rawText: img3Rawtext_order1,
    products: [{ id: "img3-o1-p1", name: "캔버스 백 화이트", price: 89000 }],
  }),
  buildOrder({
    id: "img3-order2",
    orderDate: "2026.04.11",
    statusLabel: "환불완료",
    rawText: img3Rawtext_order2,
    products: [{ id: "img3-o2-p1", name: "데일리 티셔츠 2팩", price: 29000 }],
  }),
];

export const ocrEditMockData: OcrEditMockData = {
  images: [
    {
      id: "img1",
      fileName: "coupang-2026-04-16.png",
      thumbUrl: "",
      status: "analyzed",
      platform: "coupang",
      rawText: [
        "2026. 4. 16 주문",
        img1Rawtext_order1,
        img1Rawtext_order2,
      ].join("\n\n"),
      orders: img1Orders,
    },
    {
      id: "img2",
      fileName: "coupang-2026-04-08.png",
      thumbUrl: "",
      status: "analyzed",
      platform: "coupang",
      rawText: ["2026. 4. 8 주문", img2Rawtext_order1].join("\n\n"),
      orders: img2Orders,
    },
    {
      id: "img3",
      fileName: "naver-mixed-2026-04-11.png",
      thumbUrl: "",
      status: "analyzed",
      platform: "naver",
      rawText: [
        "네이버페이 주문내역 · 2026.04.11",
        img3Rawtext_order1,
        img3Rawtext_order2,
      ].join("\n\n"),
      orders: img3Orders,
    },
  ],
};
