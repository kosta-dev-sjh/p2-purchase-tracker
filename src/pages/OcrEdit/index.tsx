/**
 * 역할: 해당 화면의 상태와 레이아웃을 조립하는 페이지 진입 파일입니다.
 *       OCR 초안을 보여주고 주문별로 주문일자/상태 태그를 수정할 수 있게 하며,
 *       저장 시에는 현재 선택된 이미지만이 아니라 업로드된 모든 이미지의 모든 주문을
 *       훑어 주문 하나당 TxRow 하나를 만들고, 매칭 후보가 있는 건만 모달을 띄우고
 *       나머지는 자동으로 저장해 여러 건을 한 번에 처리합니다.
 * 위치: src\pages\OcrEdit\index.tsx
 */
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { AppShell } from "../../components/layout/AppShell";
import { Button } from "../../components/primitives/Button";
import { MatchTransactionModal } from "../../components/modal/MatchTransactionModal";
import { Modal } from "../../components/modal/Modal";
import { tokens } from "../../styles/tokens";
import { media } from "../../tokens/breakpoints";
import { ImageList } from "./components/ImageList";
import { ImagePreview } from "./components/ImagePreview";
import { EditForm } from "./components/EditForm";
import { AddImagesModal } from "./components/AddImagesModal";
import {
  type OcrImageItem,
  type OcrOrder,
} from "./data";
import { ocrStore, useOcrStore } from "../../stores/ocrStore";
import {
  transactionsStore,
  useTransactionsStore,
} from "../../stores/transactionsStore";
import { findMatches } from "../../utils/matchTransaction";
import { checkDuplicates, autoResolveDuplicates, type SkippedItem, type MergeAction } from "../../utils/duplicateCheck";
import { combinePatches, planEnrichment } from "../../utils/mergeEnrichment";
import { SaveResultModal } from "../../components/modal/SaveResultModal";
import type {
  TxCategory,
  TxRow,
} from "../Transactions/components/TransactionTable";

/**
 * 주문의 "상품 합계"를 계산합니다. totalAmount의 단일 공급원이자,
 * OCR 편집 화면의 일관성 보장을 담당하는 함수입니다.
 *
 * 정책 배경:
 *   기존에는 totalAmount와 상품 합계를 별개로 관리해서, "상품합계 > 총 금액"이면 저장을
 *   막고 "상품합계 < 총 금액"이면 사용자에게 "이대로 등록(partial)"을 확인받는 경고 모달이
 *   붙어 있었습니다. 쿠팡 파서 개선으로 결제 섹션(총 상품가격/할인/총 결제금액)을 상품으로
 *   오인식하던 문제가 사라졌고, 파서가 수량(quantity)까지 뽑기 시작했기 때문에 이제
 *   totalAmount는 "입력값"이 아니라 "파생값"으로 둘 수 있게 됐습니다. 사용자가 상품을
 *   추가·삭제·수정하면 곧바로 totalAmount가 재계산되고, 경고 모달도 구조적으로 사라집니다.
 *
 *   quantity가 없는 상품(수동 추가 등)은 1개로 취급해 "가격 × 1"로 합산합니다.
 */
function sumProductTotal(products: OcrOrder["products"]): number {
  return products.reduce(
    (sum, product) => sum + (Number(product.price) || 0) * (product.quantity ?? 1),
    0,
  );
}

const Body = styled.div`
  display: grid;
  /* 이 화면의 주 목적은 데이터 확인/수정이므로 오른쪽 편집 폼에 가장 큰 지분을 줍니다.
   * 중앙 미리보기는 보조 역할이라 더 좁게 잡고, 왼쪽 목록은 썸네일 + 텍스트가
   * 잘리지 않을 만큼만 고정 폭을 확보합니다. */
  grid-template-columns: 240px minmax(280px, 0.9fr) minmax(440px, 1.6fr);
  gap: 16px;
  align-items: start;

  @media (max-width: 1200px) {
    grid-template-columns: 1fr;
  }
`;

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;

  ${media.mobile} {
    flex-direction: column-reverse;
  }
`;

/**
 * 주문(OcrOrder) 하나를 TxRow 하나로 변환합니다.
 *
 * - 환불(refund)·취소(cancel)는 돈이 다시 들어오는 흐름이라 type="income"·양수로 저장합니다.
 *   b341470에서 수동 입력/CSV 임포트 경로가 이미 같은 규약으로 수렴했고, OCR 경로만
 *   이전 리팩토링에서 빠져 있었습니다. 이렇게 맞춰 둬야 Home/Analysis의 순수입 집계
 *   (sumIncomeAndRefund에서 status !== "cancel"로 취소를 따로 걸러내는 로직)와 부호 규약이
 *   어긋나지 않습니다. 구매/정기결제/기타는 종전대로 type="expense"·음수.
 * - 카테고리는 OCR만으로 단정할 수 없어 ["etc"]로 시작합니다. EditForm의
 *   카테고리 체크박스가 상위로 승격되면 여기서 선택값을 주입하게 됩니다.
 * - id에는 주문 id 일부를 섞어 같은 캡쳐에서 나온 여러 TxRow가 식별 가능하도록 합니다.
 */
function buildCandidateFromOrder(
  image: OcrImageItem,
  order: OcrOrder,
): TxRow {
  const categories: TxCategory[] = ["etc"];
  const title = order.products[0]?.name ?? "OCR 거래";
  const isIncome = order.statusTag === "refund" || order.statusTag === "cancel";
  const signedAmount = isIncome
    ? Math.abs(order.totalAmount)
    : -Math.abs(order.totalAmount);

  return {
    id: `ocr-${image.id}-${order.id}-${Date.now()}`,
    type: isIncome ? "income" : "expense",
    date: order.orderDate,
    platform: image.platform,
    categories,
    title,
    amount: signedAmount,
    status: order.statusTag,
    source: "ocr",
    detail: {
      items: order.products.map((product) => ({
        name: product.name,
        price: product.price,
      })),
      source: "OCR",
      // 거래내역 상세에서 "OCR 분석한 이미지 보기"로 원본 캡쳐를 그대로 띄우기 위한 경로입니다.
      // 편집 페이지로 이동시키지 않고 이미지만 보여 주는 쪽으로 단순화하면서 추가된 필드로,
      // mock 데이터에서는 빈 문자열이 들어갈 수 있고 그럴 때 모달은 플레이스홀더로 떨어집니다.
      sourceImageUrl: image.thumbUrl,
      // totalAmount를 상품 합계로 강제 동기화하면서, "상품 일부만 입력된" 상태가 구조적으로
      // 발생하지 않게 됐기 때문에 itemsCoverage 플래그는 OCR 경로에서 더 이상 붙지 않습니다.
    },
  };
}

/**
 * 모든 이미지의 모든 주문을 평탄화해 TxRow 후보 배열로 만듭니다.
 * 저장 시점에는 "현재 보고 있는 이미지"가 아니라 업로드해 둔 캡쳐 전체가 한 번에
 * 거래내역으로 넘어가야 하므로, images 전체를 순회해 주문별 후보를 수집합니다.
 */
function buildCandidatesFromImages(
  images: OcrImageItem[],
): Array<{
  image: OcrImageItem;
  order: OcrOrder;
  candidate: TxRow;
}> {
  return images.flatMap((image) =>
    image.orders.map((order) => ({
      image,
      order,
      candidate: buildCandidateFromOrder(image, order),
    }))
  );
}

/**
 * 매칭 후보가 있어 사용자 확인이 필요한 큐 엔트리.
 * 모달이 한 번에 한 건씩 처리하므로 대기열 형태로 저장하고, 처리한 만큼
 * shift하면서 남은 건을 이어서 보여 줍니다.
 */
interface MatchQueueEntry {
  candidate: TxRow;
  matches: TxRow[];
  productCount: number;
}

/**
 * 삭제 확인 모달 상태.
 *
 * UX 규칙:
 * - 이미지 통째 삭제는 한 번에 여러 주문이 날아가므로 항상 확인 모달을 띄웁니다.
 * - 주문 블록 삭제는 같은 이미지에 다른 주문이 남아 있으면 바로 삭제(실수 복구 용이).
 *   단, 마지막 주문을 지우면 이미지까지 함께 사라지므로 이때만 확인 모달을 띄웁니다.
 *
 * 이 두 케이스 모두 결과적으로 "이미지가 사라진다"는 점이 공통이라 같은 모달 포맷에
 * 얹되, title/message로 맥락만 다르게 표현합니다.
 */
interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

export const OcrEditPage: React.FC = () => {
  const navigate = useNavigate();
  const allRows = useTransactionsStore();
  const storeImages = useOcrStore();

  // 초기 시드는 오직 ocrStore에서 가져옵니다. 스토어가 비어 있으면 이 페이지에
  // 보여 줄 게 아예 없는 상태이므로, 이전의 mock 폴백을 없애고 빈 상태 UI를 유지합니다.
  // (사용자 플로우: OcrUpload에서 분석을 돌리면 ocrStore.setImages로 시드가 채워집니다.)
  const [images, setImages] = useState<OcrImageItem[]>(storeImages);
  const [selectedId, setSelectedId] = useState<string>(images[0]?.id ?? "");
  const selected = images.find((image) => image.id === selectedId);

  // 매칭 후보가 있는 주문을 순차적으로 처리하기 위한 큐. 0번 인덱스가 현재 모달에 뜨는 건.
  const [matchQueue, setMatchQueue] = useState<MatchQueueEntry[]>([]);

  // 삭제 확인 모달 상태. null이면 모달 닫힘.
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  /** 저장 완료 후 결과 모달. matchQueue가 모두 소진된 뒤 세팅됩니다. */
  const [saveResult, setSaveResult] = useState<{
    savedRows: TxRow[];
    mergedActions: MergeAction[];
    skipped: SkippedItem[];
  } | null>(null);

  /** matchQueue 처리 중 최종 집계를 위한 컨텍스트. */
  const [pendingSaveContext, setPendingSaveContext] = useState<{
    autoSaved: TxRow[];
    modalSaved: TxRow[];
    mergedActions: MergeAction[];
    skipped: SkippedItem[];
  } | null>(null);

  /**
   * "+ 이미지 추가" 모달 오픈 상태. 과거에는 OcrUpload 로 navigate 해 append 모드로
   * 재분석을 돌리고 돌아왔지만, 편집 도중 페이지가 갈아엎히는 UX 가 별로라 모달 인라인으로 바꿨습니다.
   */
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  /**
   * 주문 필드(주문일자·상태 태그) 변경을 이미지 상태에 반영합니다.
   * totalAmount는 더 이상 사용자가 직접 수정하지 않고 handleProductsChange에서
   * 상품 합계로 자동 동기화되므로 이 patch 타입에서는 제외했습니다.
   */
  const handleOrderPatch = (
    orderId: string,
    patch: Partial<Pick<OcrOrder, "orderDate" | "statusTag">>
  ) => {
    setImages((prev) =>
      prev.map((image) => {
        if (image.id !== selectedId) return image;
        return {
          ...image,
          orders: image.orders.map((order) =>
            order.id === orderId ? { ...order, ...patch } : order
          ),
        };
      })
    );
  };

  /**
   * ProductTable에서 상품 추가·수정·삭제 시 images 상태에 반영합니다.
   *
   * 정책: totalAmount는 "상품 합계의 파생값"이므로, 상품이 바뀔 때마다 여기서
   *       `sumProductTotal(products)`로 함께 갱신합니다. 이렇게 두면:
   *         - OCR 단계에서 총액을 못 뽑아낸 캡쳐라도 상품만 있으면 총액이 자동으로 계산되고,
   *         - 사용자가 상품을 추가/삭제/가격 수정할 때마다 카드 상단의 "전체 거래금액"이
   *           즉시 반영돼 상품 합계 ≠ 총액 상태가 구조적으로 발생하지 않습니다.
   *
   * 참고: 이 핸들러가 없으면 ProductTable의 변경이 로컬 state에만 머물러
   *       저장 시 buildCandidatesFromImages가 원본 products를 읽어 변경사항이 날아갑니다.
   */
  const handleProductsChange = (orderId: string, products: OcrOrder["products"]) => {
    setImages((prev) =>
      prev.map((image) => {
        if (image.id !== selectedId) return image;
        return {
          ...image,
          orders: image.orders.map((order) =>
            order.id === orderId
              ? { ...order, products, totalAmount: sumProductTotal(products) }
              : order
          ),
        };
      })
    );
  };

  /**
   * 이미지 목록에서 특정 이미지를 제거한 뒤, 현재 선택된 이미지가 사라졌다면
   * 남아 있는 이미지 중 가장 인접한 후보로 selection을 옮깁니다.
   *
   * 삭제 전 인덱스를 기준으로 다음 이미지를 우선 고르고, 없으면 그 앞을 고릅니다.
   * 모두 지워진 경우 빈 문자열을 세팅해 EditForm/ImagePreview의 빈 상태를 활용합니다.
   *
   * 사용자가 확인 모달에서 '삭제'를 누른 직후 호출되므로 현재 렌더의 images 스냅샷을
   * 그대로 사용해도 안전합니다. 이렇게 하면 setImages updater 안에서 setSelectedId를
   * 호출하는 중첩 구조를 피할 수 있습니다.
   */
  const removeImage = (id: string) => {
    const removedIndex = images.findIndex((image) => image.id === id);
    if (removedIndex < 0) return;
    const next = images.filter((image) => image.id !== id);
    setImages(next);
    if (selectedId === id) {
      const fallback = next[removedIndex] ?? next[removedIndex - 1] ?? next[0];
      setSelectedId(fallback?.id ?? "");
    }
  };

  /**
   * 이미지 삭제 요청. 캡쳐 전체(주문 N건)가 날아가는 동작이라 항상 확인 모달을 거칩니다.
   */
  const handleDeleteImage = (id: string) => {
    const target = images.find((image) => image.id === id);
    if (!target) return;
    const orderCount = target.orders.length;
    setConfirmState({
      title: "이미지를 삭제할까요?",
      message:
        orderCount > 1
          ? `이 캡쳐 안의 주문 ${orderCount}건이 모두 사라집니다. 되돌릴 수 없어요.`
          : "이 캡쳐와 안의 주문이 함께 삭제됩니다. 되돌릴 수 없어요.",
      confirmLabel: "이미지 삭제",
      onConfirm: () => {
        removeImage(id);
        setConfirmState(null);
      },
    });
  };

  /**
   * 주문 블록 삭제 요청.
   *
   * - 같은 이미지에 다른 주문이 남아 있으면 즉시 삭제(모달 없음). 다른 블록이 시각적으로
   *   남아 있어 실수를 바로 알 수 있고, 재업로드가 큰 부담이 아니라 속도를 우선합니다.
   * - 마지막 주문을 지우면 이미지 자체가 의미를 잃어 함께 삭제되므로, 이때만 확인 모달을 띄웁니다.
   */
  const handleDeleteOrder = (orderId: string) => {
    if (!selected) return;
    const isLastOrder = selected.orders.length <= 1;

    if (!isLastOrder) {
      setImages((prev) =>
        prev.map((image) => {
          if (image.id !== selected.id) return image;
          return {
            ...image,
            orders: image.orders.filter((order) => order.id !== orderId),
          };
        })
      );
      return;
    }

    // 마지막 주문이면 이미지까지 캐스케이드 삭제. 메시지에서 이 사실을 명시해 놀라지 않게 합니다.
    setConfirmState({
      title: "이 주문을 삭제하면 이미지도 함께 삭제돼요",
      message:
        "이 캡쳐에는 이 주문 하나만 남아 있어서, 주문을 지우면 캡쳐 자체도 같이 사라져요. 계속할까요?",
      confirmLabel: "주문과 이미지 삭제",
      onConfirm: () => {
        removeImage(selected.id);
        setConfirmState(null);
      },
    });
  };

  /**
   * OCR 저장 시 필수 값 누락을 미리 걸러냅니다.
   * 주문일자/금액/거래명(첫 상품 이름)이 비어 있으면 어느 이미지·몇 번째 주문에서 문제가 있는지
   * 사용자에게 바로 알려 주고 저장을 중단합니다. 예전에는 title이 비면 "OCR 거래"라는 placeholder로
   * 조용히 저장됐지만, 거래내역에 정체불명의 "OCR 거래"가 쌓이는 걸 막기 위해 명시 에러로 바꿨습니다.
   */
  const validateBeforeSave = (): { message: string; imageId: string; targetId: string } | null => {
    for (const image of images) {
      for (let orderIdx = 0; orderIdx < image.orders.length; orderIdx += 1) {
        const order = image.orders[orderIdx];
        const orderLabel = `${image.fileName} · 주문 ${orderIdx + 1}`;
        if (!order.orderDate || !order.orderDate.trim()) {
          return {
            message: `${orderLabel}의 주문일자가 비어 있어요.`,
            imageId: image.id,
            targetId: `ocr-order-date-${order.id}`,
          };
        }
        if (!order.totalAmount || Number.isNaN(order.totalAmount)) {
          return {
            message: `${orderLabel}의 금액이 비어 있거나 0이에요.`,
            imageId: image.id,
            targetId: `ocr-order-amount-${order.id}`,
          };
        }
        const firstName = order.products[0]?.name?.trim() ?? "";
        if (!firstName) {
          return {
            message: `${orderLabel}의 거래명(상품)이 비어 있어요.`,
            imageId: image.id,
            targetId: `ocr-order-${order.id}-name-${order.products[0]?.id ?? "missing"}`,
          };
        }
      }
    }
    return null;
  };
  const [saveValidationError, setSaveValidationError] = useState<string | null>(null);
  const focusOrderField = (imageId: string, targetId: string) => {
    if (selectedId !== imageId) {
      setSelectedId(imageId);
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const target = document.getElementById(targetId);
        if (target instanceof HTMLElement) {
          target.focus();
        }
      });
    });
  };

  const handleSave = () => {
    // 저장은 "현재 보고 있는 이미지"가 아니라 업로드해 둔 이미지 전체가 대상입니다.
    if (images.length === 0) return;

    const validationError = validateBeforeSave();
    if (validationError) {
      setSaveValidationError(validationError.message);
      focusOrderField(validationError.imageId, validationError.targetId);
      return;
    }

    // totalAmount가 상품 합계의 파생값으로 바뀌면서 "상품합계 ≠ 총액" 상태가
    // 구조적으로 발생하지 않게 됐기 때문에, 기존 ProductTotalWarningModal 게이트는 제거했습니다.
    // validateBeforeSave가 "totalAmount > 0"을 이미 체크하므로 상품이 하나도 없거나
    // 전부 0원인 주문은 여기에 도달하지 않습니다.

    performSaveFlow();
  };

  /**
   * 필수값 검증을 통과한 뒤 실제 저장 흐름을 돌립니다.
   * totalAmount가 products의 파생값으로 동기화되면서 "부분 저장(itemsCoverage)"
   * 분기도 함께 사라졌습니다.
   */
  const performSaveFlow = () => {
    const flat = buildCandidatesFromImages(images);
    const allCandidates = flat.map((f) => f.candidate);

    // ── 0단계: 침묵 자동 보강(silent auto-fill) ─────────────────
    // 사용자가 이전에 "미지정(unspecified)" 플랫폼으로 수동 입력해 뒀던 거래가 있고,
    // 지금 OCR이 같은 날짜+금액으로 해당 거래의 더 풍부한 정보(플랫폼·카테고리·상품)를 들고
    // 왔다면, 기존 거래에 조용히 합쳐 줍니다. OCR은 배치 저장 흐름이라 여러 건의 충돌 모달을
    // 일일이 띄우면 흐름이 끊깁니다. 그래서 "확실히 안전할 때"만 머지하고, 조금이라도 충돌이
    // 있으면 머지를 포기하고 정상 플로우로 흘려보냅니다(체크·중복·매칭을 거쳐 새 거래로 저장).
    //
    // 안전 조건:
    //   (1) 같은 date + |amount|를 가진 기존 행이 있고,
    //   (2) 그 행의 platform === "unspecified"이며,
    //   (3) planEnrichment의 conflicts가 0건이어야 함.
    //       (플랫폼만 비어 있다면 autoFills로 잡히고, categories/memo가 실제로 부딪치면 포기.)
    const existingByDateAmount = new Map<string, TxRow[]>();
    for (const row of allRows) {
      if (row.platform !== "unspecified") continue;
      const key = `${row.date}|${Math.abs(row.amount)}`;
      const list = existingByDateAmount.get(key) ?? [];
      list.push(row);
      existingByDateAmount.set(key, list);
    }
    const enrichedExistingIds = new Set<string>();
    const candidates: TxRow[] = [];
    for (const candidate of allCandidates) {
      const key = `${candidate.date}|${Math.abs(candidate.amount)}`;
      const pool = existingByDateAmount.get(key);
      // 이미 이번 저장에서 보강한 기존 행은 제외 — 같은 타겟을 두 OCR 건이 덮어쓰지 않도록.
      const target = pool?.find((row) => !enrichedExistingIds.has(row.id));
      if (!target) {
        candidates.push(candidate);
        continue;
      }
      const plan = planEnrichment(candidate, target);
      if (plan.conflicts.length > 0) {
        // 충돌이 있으면 전통적인 플로우로 넘깁니다. 사용자는 나중에 거래내역에서 수동으로
        // 정리할 수 있고, 배치 저장 중 여러 모달을 강요하는 것보다 이쪽이 덜 거슬립니다.
        candidates.push(candidate);
        continue;
      }
      if (plan.autoFills.length > 0) {
        transactionsStore.updateOne(
          target.id,
          combinePatches(plan.autoFills.map((fill) => fill.patch))
        );
      }
      if (plan.newItems.length > 0) {
        transactionsStore.appendItemsToTransaction(target.id, plan.newItems, "OCR");
      }
      enrichedExistingIds.add(target.id);
      // 이 OCR 건은 기존 행에 흡수됐으므로 저장 큐에서 떨어뜨립니다.
    }

    // ── 1단계: 중복 감지 + 자동 해결 ────────────────────────────
    const dupResult = checkDuplicates(candidates, allRows);
    const resolved = autoResolveDuplicates(dupResult);

    // toMerge: 신규 아이템만 있는 itemDiff → 기존 거래에 즉시 병합
    for (const action of resolved.toMerge) {
      transactionsStore.appendItemsToTransaction(action.existingId, action.newItems, "OCR");
    }

    // toSave 중 원래 fresh였던 것만 findMatches 흐름으로 넘깁니다.
    // (가격 변경 itemDiff는 새 거래로 직접 저장합니다.)
    const freshIds = new Set(dupResult.fresh.map((r) => r.id));
    const freshToMatch = resolved.toSave.filter((r) => freshIds.has(r.id));
    const changedItemsToSave = resolved.toSave.filter((r) => !freshIds.has(r.id));

    if (changedItemsToSave.length > 0) {
      // OCR 파생 거래는 카테고리가 비거나 etc로 들어오므로 자동추정 경계를 태운다.
      transactionsStore.addFromImport(changedItemsToSave);
    }

    proceedSave(freshToMatch, resolved.skipped, resolved.toMerge, flat);
  };

  /**
   * 중복 처리 이후 fresh 거래들을 CSV 매칭 흐름으로 저장합니다.
   * 매칭 없는 것은 즉시 저장하고, 매칭 후보가 있는 것은 MatchTransactionModal 큐로 넘깁니다.
   */
  const proceedSave = (
    freshRows: TxRow[],
    skipped: SkippedItem[],
    mergedActions: MergeAction[],
    flat: ReturnType<typeof buildCandidatesFromImages>
  ) => {
    if (freshRows.length === 0) {
      setSaveResult({ savedRows: [], mergedActions, skipped });
      return;
    }

    // ── 2단계: 기존 CSV 매칭 흐름 (OCR ↔ 카드 내역 연결) ─────────
    const entries = flat
      .filter((f) => freshRows.some((r) => r.id === f.candidate.id))
      .map(({ image, order, candidate }) => {
        const matches = findMatches(allRows, {
          platform: image.platform,
          amount: Math.abs(candidate.amount),
          date: candidate.date,
        });
        return { candidate, matches, productCount: order.products.length };
      });

    const needsModal = entries.filter((entry) => entry.matches.length > 0);
    const canAutoSave = entries.filter((entry) => entry.matches.length === 0);
    const autoSaved = canAutoSave.map((entry) => entry.candidate);

    if (autoSaved.length > 0) {
      transactionsStore.addFromImport(autoSaved);
    }

    if (needsModal.length === 0) {
      setSaveResult({ savedRows: autoSaved, mergedActions, skipped });
      return;
    }

    setMatchQueue(needsModal);
    setPendingSaveContext({ autoSaved, modalSaved: [], mergedActions, skipped });
  };

  /**
   * 큐에서 한 건을 처리한 뒤 다음 상태를 계산합니다.
   * rest가 비어 있으면 전체 흐름이 끝난 것이므로 SaveResultModal을 표시합니다.
   */
  const advanceQueue = (rest: MatchQueueEntry[], extraSavedRow?: TxRow) => {
    setMatchQueue(rest);
    if (rest.length === 0) {
      const ctx = pendingSaveContext;
      const matchSaved = [
        ...(ctx?.modalSaved ?? []),
        ...(extraSavedRow ? [extraSavedRow] : []),
      ];
      setSaveResult({
        savedRows: [...(ctx?.autoSaved ?? []), ...matchSaved],
        mergedActions: ctx?.mergedActions ?? [],
        skipped: ctx?.skipped ?? [],
      });
      setPendingSaveContext(null);
      return;
    }

    if (extraSavedRow) {
      setPendingSaveContext((current) =>
        current
          ? { ...current, modalSaved: [...current.modalSaved, extraSavedRow] }
          : current
      );
    }
  };

  /** 현재 모달 건을 기존 거래에 붙이고 다음 큐 항목으로 넘어갑니다. */
  const handleAttach = (transactionId: string) => {
    const [current, ...rest] = matchQueue;
    if (!current) return;
    transactionsStore.appendItemsToTransaction(
      transactionId,
      current.candidate.detail?.items ?? [],
      "OCR"
    );
    advanceQueue(rest);
  };

  /** 현재 모달 건을 새 거래로 저장하고 다음 큐 항목으로 넘어갑니다. */
  const handleSaveAsNew = () => {
    const [current, ...rest] = matchQueue;
    if (!current) return;
    // OCR 경로에서 새로 저장하는 한 건도 자동추정 대상.
    transactionsStore.addFromImport([current.candidate]);
    advanceQueue(rest, current.candidate);
  };

  /**
   * 사용자가 모달 X를 눌러 흐름을 중단. 현재 주문만 저장하지 않고 큐 전체를 비우며,
   * 이미 addMany로 저장된 "매칭 없는 주문들"은 그대로 유지됩니다. 페이지에 머물러
   * 필요한 편집 후 재저장할 수 있게 navigate를 일부러 하지 않습니다.
   */
  const handleCloseModal = () => {
    setMatchQueue([]);
    setPendingSaveContext(null);
  };

  const currentMatch = matchQueue[0];

  return (
    <AppShell activeNav="upload" crumb="입력 · OCR" title="OCR 결과 확인 및 수정">
      <Body>
        {/* OCR 편집 화면은 목록, 미리보기, 수정 폼의 3단 구성을 사용합니다. */}
        <ImageList
          images={images}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAdd={() => setIsAddModalOpen(true)}
          onDelete={handleDeleteImage}
        />
        <ImagePreview image={selected} />
        <EditForm
          image={selected}
          onOrderPatch={handleOrderPatch}
          onProductsChange={handleProductsChange}
          onDeleteOrder={handleDeleteOrder}
        />
      </Body>
      <Footer>
        <Button variant="ghost" size="lg" onClick={() => navigate("/ocr-upload")}>
          다시 OCR 분석
        </Button>
        <Button variant="primary" size="lg" onClick={handleSave}>
          저장
        </Button>
      </Footer>

      {saveResult && (
        <SaveResultModal
          isOpen
          savedRows={saveResult.savedRows}
          mergedActions={saveResult.mergedActions}
          allRows={allRows}
          skipped={saveResult.skipped}
          onConfirm={() => {
            ocrStore.clear();
            navigate("/transactions");
          }}
        />
      )}
      {currentMatch && (
        <MatchTransactionModal
          isOpen
          onClose={handleCloseModal}
          candidate={{
            platform: currentMatch.candidate.platform,
            date: currentMatch.candidate.date,
            amount: Math.abs(currentMatch.candidate.amount),
            itemCount: currentMatch.productCount,
          }}
          matches={currentMatch.matches}
          onAttachToExisting={handleAttach}
          onSaveAsNew={handleSaveAsNew}
        />
      )}
      {saveValidationError && (
        <Modal
          isOpen
          onClose={() => setSaveValidationError(null)}
          title="저장 전에 확인이 필요해요"
        >
          <div
            style={{
              color: tokens.color.ink2,
              fontSize: 13,
              lineHeight: 1.6,
              marginBottom: 20,
            }}
          >
            {saveValidationError}
            <div style={{ marginTop: 8, color: tokens.color.ink4, fontSize: 12 }}>
              거래명·금액·주문일자는 모든 주문에서 반드시 있어야 저장할 수 있어요.
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button
              variant="primary"
              size="md"
              onClick={() => setSaveValidationError(null)}
            >
              확인
            </Button>
          </div>
        </Modal>
      )}
      <AddImagesModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        // 편집 화면에 이미 들어와 있는 이미지 개수를 함께 넘겨, 모달 내부의 업로드 상한이
        // "이번 배치"가 아니라 "OCR 결과 전체 기준"으로 잡히도록 합니다. 기존에는 모달이
        // 로컬 버퍼 5장까지 받아 버려, 이미 5장이 있는 상태에서도 5장을 더 올릴 수 있어
        // MAX_IMAGES 상한이 실질적으로 깨지는 문제가 있었습니다.
        existingCount={images.length}
        onComplete={(newImages) => {
          // 분석 결과를 기존 images 뒤에 append. 방금 들어온 첫 이미지로 selection 을 옮겨
          // "내가 방금 추가한 이미지가 어느 건지" 바로 보이게 합니다.
          const next = [...images, ...newImages];
          setImages(next);
          if (newImages[0]) {
            setSelectedId(newImages[0].id);
          }
          // 다음에 저장 버튼을 눌렀을 때 ocrStore 에서 원본이 꺼내지는 일이 없도록
          // 스토어에도 최신 스냅샷을 반영해 둡니다.
          ocrStore.setImages(next);
          setIsAddModalOpen(false);
        }}
      />
      {confirmState && (
        <Modal
          isOpen
          onClose={() => setConfirmState(null)}
          title={confirmState.title}
        >
          <div
            style={{
              color: tokens.color.ink2,
              fontSize: 13,
              lineHeight: 1.6,
              marginBottom: 20,
            }}
          >
            {confirmState.message}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <Button
              variant="secondary"
              size="md"
              onClick={() => setConfirmState(null)}
            >
              취소
            </Button>
            <Button
              variant="danger"
              size="md"
              onClick={confirmState.onConfirm}
            >
              {confirmState.confirmLabel}
            </Button>
          </div>
        </Modal>
      )}

    </AppShell>
  );
};
