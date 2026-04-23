/**
 * 역할: 수동 입력 폼의 거래유형별 허용 상태 목록과 관련 헬퍼.
 *       StatusTags(UI)와 ManualEntry(검증/디폴트 계산)가 함께 참조하므로
 *       UI 컴포넌트 파일 바깥으로 분리해 react-refresh 규칙과의 충돌을 피합니다.
 * 위치: src\pages\ManualEntry\components\statusOptions.ts
 */
import type {
  TxStatus,
  TxType,
} from "../../Transactions/components/TransactionTable";

/**
 * 거래 유형별로 노출할 상태 목록. 쇼핑 중심 컨셉에 맞춰
 * - 지출: 구매 / 정기결제 / 기타
 * - 수입: 환불 / 취소 / 기타
 * 로 분기합니다.
 *
 * '취소'가 수입 쪽에 있는 이유: 상품 주문이 취소되면 돈이 다시 들어오는 흐름이라
 * 의미상 수입(inflow)에 가깝습니다. 다만 "진짜 번 돈"은 아니므로, 집계 단계에서는
 * Home/Analysis의 순수입 계산(sumIncomeAndRefund)에서 status === "cancel"을 제외합니다.
 * 별도 "취소 금액" 카드는 status === "cancel"만 모아 독립적으로 보여줍니다.
 */
export const STATUS_OPTIONS_BY_TYPE: Record<TxType, TxStatus[]> = {
  expense: ["purchase", "sub", "etc"],
  income: ["refund", "cancel", "etc"],
};

/**
 * 사용자가 상태를 고르지 않은 채 저장했을 때의 안전한 디폴트.
 * 지출은 "구매", 수입은 "환불"로 수렴시켜 쇼핑 컨텍스트에서 가장 흔한 케이스로 맞춥니다.
 */
export function defaultStatusForType(type: TxType): TxStatus {
  return type === "expense" ? "purchase" : "refund";
}

/**
 * 상태가 현재 거래 유형의 허용 목록에 포함되는지 검사.
 * 수입 ↔ 지출 전환 시 반대편 전용 상태(예: 지출의 '구매', 수입의 '취소')가
 * 남아있지 않도록 가드합니다.
 */
export function isValidStatusForType(status: TxStatus, type: TxType): boolean {
  return STATUS_OPTIONS_BY_TYPE[type].includes(status);
}
