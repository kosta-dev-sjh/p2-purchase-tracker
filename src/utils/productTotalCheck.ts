/**
 * 역할: "상품 목록이 딸린 거래"에서 상품 가격의 합과 거래 총 금액이 맞아떨어지는지 검사합니다.
 *
 *       실사용에서 가장 흔한 두 가지 실수를 잡아 주기 위한 도구입니다.
 *       (1) 상품 가격을 잘못 입력해 합이 총 금액보다 커진 경우 — 정정 없이 저장하면 가계부가
 *           꼬이므로 블로킹 에러로 막습니다.
 *       (2) 상품을 일부만 적어 합이 총 금액보다 작은 경우 — 진짜로 잊어버렸는지, 아니면 배송비
 *           같은 항목이 따로 잡혔는지 사용자만 아는 영역이라 경고 후 선택에 맡깁니다. 사용자가
 *           "이대로 등록"을 고르면 거래에 partial 플래그를 붙여 상세에서 힌트를 보여줍니다.
 *
 *       수동 입력·OCR·거래 수정 세 경로가 모두 같은 규칙을 공유하게끔 단일 함수로 뽑았습니다.
 * 위치: src/utils/productTotalCheck.ts
 */

export interface ProductLike {
  /** 단가(원). 정수로 들어옵니다. */
  price: number;
  /** 수량. 수동 입력 UI에는 수량 필드가 없어 undefined가 기본이며 1로 취급합니다. */
  quantity?: number;
}

export type ProductTotalStatus = "match" | "exceeds" | "under" | "no-products";

export interface ProductTotalCheckResult {
  status: ProductTotalStatus;
  /** 상품 가격 × 수량의 합. no-products일 땐 0. */
  productsSum: number;
  /** 총 금액 - 상품합계. 양수면 총 금액이 더 큼(=under), 음수면 상품합계가 더 큼(=exceeds). */
  diff: number;
}

/**
 * 거래 금액은 부호가 있을 수 있지만(지출=음수, 수입=양수) 여기서는 절댓값으로 비교합니다.
 * 환불·취소도 "되돌아온 금액"이 상품가 합계와 일치하는지 같은 규칙으로 검사하면 됩니다.
 *
 * 여유 톨러런스는 의도적으로 두지 않습니다. KRW는 원 단위라 반올림 오차가 없고, 배송비/포인트가
 * 끼어 생기는 차이는 "under"로 잡혀 사용자에게 확인을 받는 쪽이 안전합니다.
 */
export function checkProductTotal(params: {
  totalAmount: number;
  products: ProductLike[];
}): ProductTotalCheckResult {
  const { totalAmount, products } = params;
  if (products.length === 0) {
    return { status: "no-products", productsSum: 0, diff: totalAmount };
  }
  const productsSum = products.reduce(
    (sum, product) => sum + product.price * (product.quantity ?? 1),
    0
  );
  const absTotal = Math.abs(totalAmount);
  const diff = absTotal - productsSum;

  if (diff === 0) {
    return { status: "match", productsSum, diff: 0 };
  }
  if (diff < 0) {
    // 상품합계가 총 금액을 초과 — 잘못 입력했을 가능성이 높음.
    return { status: "exceeds", productsSum, diff };
  }
  return { status: "under", productsSum, diff };
}
