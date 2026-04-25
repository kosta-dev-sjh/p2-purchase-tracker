/**
 * 역할: OCR로 읽어온 원문 텍스트에서 거래 상태(statusTag)를 자동으로 추정합니다.
 *       팀 논의 결론(자동 인식 + 사용자 확정 하이브리드) 중 "자동 인식" 단계를 담당하며,
 *       추정 결과가 틀렸을 때 사용자는 OcrEdit/EditForm의 EditableStatusTag에서
 *       한 번의 클릭으로 보정할 수 있습니다.
 *
 *       현재 v1 mock 흐름에서는 실제 OCR 텍스트가 없어 호출되지 않지만, Tesseract.js
 *       등이 실제로 붙는 시점에 훅업할 수 있도록 동일 타입 시스템 위에 두었습니다.
 *
 * 위치: src\utils\ocrParse.ts
 */
import type { Status } from "../pages/OcrEdit/data";

/**
 * 상태별로 쇼핑몰 캡쳐에서 자주 노출되는 한국어 키워드.
 *
 * 한 캡쳐에 여러 상태가 섞이는 경우(예: "주문 취소 완료", "결제 완료 · 환불 요청")를
 * 고려해 우선순위를 고정합니다.
 * - 환불/취소/반품을 먼저 체크하는 이유: "구매" 관련 키워드("주문완료", "결제완료")가
 *   환불/취소 행에도 동시 노출되는 경우가 많아, 구매를 먼저 매칭하면 오판이 늘어납니다.
 * - 정기결제는 단독 라벨로 표기되는 경우가 많아 순서에 큰 영향이 없지만,
 *   일반 구매보다는 앞에 두어 우선 인식합니다.
 */
const STATUS_KEYWORDS: Array<{ status: Status; keywords: string[] }> = [
  { status: "refund", keywords: ["환불완료", "환불처리", "환불", "반품완료", "반품"] },
  { status: "cancel", keywords: ["취소완료", "취소 완료", "주문취소", "결제취소"] },
  { status: "sub", keywords: ["정기결제", "정기 결제", "구독", "자동결제"] },
  { status: "purchase", keywords: ["결제완료", "주문완료", "배송완료", "배송 완료", "배송중", "상품준비중", "상품 준비중", "구매완료", "구매확정", "구매"] },
];

/**
 * 쿠팡 전용 status 매핑 — 글로벌 STATUS_KEYWORDS 와 한 가지 다른 점:
 * **반품완료** 는 쿠팡 컨텍스트에서 "구매를 통째로 되돌린 것" 에 가까워 cancel 로 분류합니다.
 *
 * 배경:
 *   - 일반 정의: 반품 = 상품 받고 돌려주기, 환불 = 돈 돌려받기. 다른 쇼핑몰에서는 반품 ⊃ 환불
 *     관계라 refund 분류가 자연스럽습니다.
 *   - 그러나 쿠팡 "반품완료" 는 "주문 자체가 사라진 것처럼 처리됨"(전액 환원, 영수증 무효화)
 *     이라 사용자 가계부 관점에서 "취소" 로 보는 게 직관적입니다.
 *   - 사용자 메모리(spendtrack_signed_amount_convention.md): cancel 은 순지출 KPI 에서 제외,
 *     refund 는 포함. 쿠팡 반품은 "구매 자체가 없었던 것" 으로 처리하길 원하므로 cancel 매핑이
 *     KPI 의도와도 일치합니다.
 *
 * 다른 플랫폼(네이버) 에서는 글로벌 detectStatusFromOcrText 를 그대로 쓰면 됩니다.
 */
const COUPANG_STATUS_KEYWORDS: Array<{ status: Status; keywords: string[] }> = [
  // 반품을 cancel 로 우선 분류. 환불 키워드(환불완료/환불처리) 는 여전히 refund.
  { status: "cancel", keywords: ["반품완료", "반품", "취소완료", "취소 완료", "주문취소", "결제취소", "취소상세보기", "취소 상세 보기"] },
  { status: "refund", keywords: ["환불완료", "환불처리", "환불"] },
  { status: "sub", keywords: ["정기결제", "정기 결제", "구독", "자동결제"] },
  { status: "purchase", keywords: ["결제완료", "주문완료", "배송완료", "배송 완료", "배송중", "상품준비중", "상품 준비중", "구매완료", "구매확정", "구매"] },
];

/**
 * OCR 원문 전체에서 상태 키워드를 찾아 첫 매칭값을 반환합니다.
 * 키워드가 아무것도 매칭되지 않으면 undefined를 돌려주어, 호출부가
 * 기본값(쇼핑 컨텍스트에서는 보통 "purchase")을 결정하거나 사용자에게
 * 명시적으로 고르도록 유도할 수 있게 합니다.
 *
 * 실제 서비스에서는 쇼핑몰별 파서(쿠팡/네이버페이/11번가 등)를 먼저 태우고,
 * 폴백으로 이 키워드 매칭을 태우는 2단 구조가 자연스럽습니다.
 */
export function detectStatusFromOcrText(text: string): Status | undefined {
  return detectStatusWith(STATUS_KEYWORDS, text);
}

/**
 * 쿠팡 전용 status 추정. buildCoupangOrders 에서만 사용. 다른 호출자가 잘못 사용하지 않도록
 * 함수 이름에 platform 명시.
 */
export function detectCoupangStatusFromOcrText(text: string): Status | undefined {
  return detectStatusWith(COUPANG_STATUS_KEYWORDS, text);
}

function detectStatusWith(
  table: Array<{ status: Status; keywords: string[] }>,
  text: string,
): Status | undefined {
  if (!text) return undefined;
  // 공백/개행 차이로 매칭이 어긋나지 않도록 정규화 후 포함 여부만 확인합니다.
  const normalized = text.replace(/\s+/g, "");

  for (const { status, keywords } of table) {
    const hit = keywords.some((keyword) =>
      normalized.includes(keyword.replace(/\s+/g, ""))
    );
    if (hit) return status;
  }
  return undefined;
}

/**
 * 한 캡쳐 안에 여러 상태가 섞여 있을 때, 상품/행 단위로 상태를 추정합니다.
 * 라인별 OCR 결과(예: 각 상품 카드에서 추출한 텍스트 조각)를 넘기면 동일
 * 길이의 결과 배열을 돌려줍니다. 추후 라인 단위 OCR이 붙는 시점에 바로
 * 사용할 수 있도록 타입을 고정해 두었습니다.
 */
export function detectStatusPerLine(lines: string[]): Array<Status | undefined> {
  return lines.map((line) => detectStatusFromOcrText(line));
}

/**
 * 캡쳐 한 장의 "대표 상태"를 결정합니다.
 *
 * 혼합 캡쳐(예: 네이버페이 주문내역에 구매와 환불이 같이 찍힘) 처리가 핵심이라,
 * 단순히 rawText 전체에 detect를 거는 방식은 순서 우선순위(환불 > 취소 > ...)에
 * 걸려 실제 주요 거래유형과 다른 값을 뱉을 수 있습니다. 그래서 상품 단위로
 * 추정해 둔 상태를 모아 다수결로 결정하고, 동률이거나 상품 상태가 비어 있으면
 * rawText 전체에 대한 detectStatusFromOcrText로 폴백합니다.
 *
 * - productStatuses: 상품 단위로 미리 추정해 둔 상태 배열
 * - rawText: 상품 정보가 비어 있을 때 폴백용 전체 원문
 *
 * 다수결이 동률이면 배열 순서상 먼저 본 값이 유지되므로 "캡쳐에 먼저 등장한"
 * 상품의 상태가 자연스럽게 대표값이 됩니다.
 */
export function deriveImageStatus(
  productStatuses: Array<Status | undefined>,
  rawText?: string
): Status | undefined {
  const valid = productStatuses.filter((status): status is Status => status !== undefined);

  if (valid.length > 0) {
    const counts = new Map<Status, number>();
    for (const status of valid) {
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }

    let best: Status | undefined = undefined;
    let maxCount = 0;
    for (const [status, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        best = status;
      }
    }
    if (best) return best;
  }

  if (rawText) return detectStatusFromOcrText(rawText);
  return undefined;
}
