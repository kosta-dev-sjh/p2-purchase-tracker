/**
 * 역할: 거래 상세 패널에서 '수정하기'를 눌렀을 때 열리는 편집용 모달.
 *       TxRow의 값을 폼에 미리 채워 넣고, 저장 시 transactionsStore.updateOne을 호출해
 *       실제 데이터가 갱신되도록 합니다. 수동 입력 화면의 하위 컴포넌트를 그대로 재사용해
 *       디자인과 동작 일관성을 유지합니다.
 *
 *       상태는 row prop을 기반으로 useState 초기자에서 한 번만 읽어들이고, 새로운 거래를
 *       편집할 때는 상위에서 key를 바꿔 컴포넌트를 remount 시켜 초기화합니다.
 *       이 방식은 useEffect에서 setState로 동기화할 때 생기는 cascading render를 피합니다.
 * 위치: src\components\modal\TransactionEditModal.tsx
 */
import React, { useState } from "react";
import styled from "styled-components";
import { Modal } from "./Modal";
import { Button } from "../primitives/Button";
import {
  ProductAddModal,
  type ProductAddPayload,
} from "./ProductAddModal";
import { TypeSegment, type TxType } from "../../pages/ManualEntry/components/TypeSegment";
import {
  MetaFields,
  type MetaFieldValues,
} from "../../pages/ManualEntry/components/MetaFields";
import {
  StatusTags,
  type StatusKey,
} from "../../pages/ManualEntry/components/StatusTags";
import {
  defaultStatusForType,
  isValidStatusForType,
} from "../../pages/ManualEntry/components/statusOptions";
import {
  ProductRows,
  type ManualProduct,
} from "../../pages/ManualEntry/components/ProductRows";
import type { TxRow } from "../../pages/Transactions/components/TransactionTable";
import { mapCategories, mapPlatform } from "../../utils/manualMapping";
import { tokens } from "../../styles/tokens";
import {
  ProductTotalWarningModal,
  type ProductTotalWarningEntry,
} from "./ProductTotalWarningModal";
import { checkProductTotal } from "../../utils/productTotalCheck";
import { checkDuplicates } from "../../utils/duplicateCheck";
import { formatKRW } from "../../utils/format";
import { useTransactionsStore } from "../../stores/transactionsStore";
import {
  MAX_AMOUNT_VALUE,
  MAX_MEMO_LENGTH,
  MAX_TITLE_LENGTH,
} from "../../constants/inputLimits";

interface Props {
  /** 편집 대상 거래. 상위에서 반드시 존재할 때만 이 컴포넌트를 마운트합니다. */
  row: TxRow;
  onClose: () => void;
  onSubmit: (id: string, patch: Partial<TxRow>) => void;
}

type RequiredMetaField = "title" | "amount" | "date";

/**
 * 모달 내부가 뷰포트보다 길어질 수 있으니, 카드 높이는 유지한 채 본문만 내부에서 스크롤되게 합니다.
 * Modal은 고정 480px 너비이지만 편집 폼은 필드가 많아 세로 스크롤이 필수입니다.
 */
const ScrollBody = styled.div`
  max-height: min(70vh, 640px);
  overflow-y: auto;
  /*
   * 스크롤바와 입력 필드가 딱 붙지 않도록 우측에 12px 여백을 둡니다. 같은 크기의 음수
   * 마진으로 상쇄해서 ScrollBody 자체 너비는 그대로 유지 — 모달 레이아웃이 밀려 나오지
   * 않으면서 오른쪽으로만 약간 튀어나와 스크롤바가 숨을 쉬는 영역을 확보합니다.
   * scrollbar-gutter 로 대체할 수도 있지만, 지원 브라우저 편차가 있어 padding 트릭을
   * 유지해 구형 Safari 에서도 동일하게 보이게 합니다.
   */
  padding-right: 12px;
  margin-right: -12px;
`;

const SectionLabel = styled.div`
  margin-bottom: 8px;
  color: ${tokens.color.ink2};
  font-size: 12px;
  font-weight: 600;
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 4px;
  margin-bottom: 8px;
`;

const SectionHint = styled.div`
  margin-bottom: 10px;
  color: ${tokens.color.ink4};
  font-size: 11.5px;
`;

const AddButton = styled.button`
  border: none;
  background: none;
  color: ${tokens.color.accentHover};
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
`;

const ErrorLine = styled.div`
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid ${tokens.color.neg};
  border-radius: ${tokens.radius.control};
  background: ${tokens.color.negBg};
  color: ${tokens.color.neg};
  font-size: 12px;
  font-weight: 500;
`;

const SaveBar = styled.div`
  margin-top: 16px;
`;

// 중복 제안 카드(ManualEntry SuggestionCard)와 동일한 톤·규약으로 맞춰 둡니다.
// warn 보더 + warnBg 배경 + card radius + 12×14 padding.
const DuplicateNotice = styled.div`
  margin-bottom: 16px;
  padding: 12px 14px;
  border: 1px solid ${tokens.color.warn};
  border-radius: ${tokens.radius.card};
  background: ${tokens.color.warnBg ?? "#fffbf0"};
  color: ${tokens.color.ink2};
  font-size: 12.5px;
  line-height: 1.6;
`;

const DuplicateList = styled.ul`
  margin: 10px 0 0;
  padding-left: 18px;
  color: ${tokens.color.ink3};
  font-size: 12px;
`;

// 액션 버튼 규약(다른 확인/중복 모달과 동일): flex-end + gap 8px + 버튼 min-width 96px.
const DuplicateActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;

  > button {
    min-width: 96px;
  }
`;

/*
 * "정말 수정하시겠어요?" 컨펌 모달의 본문.
 * 삭제 모달(Transactions/index.tsx)과 톤·구조를 통일해 "값을 바꾸기 전에 한 번 더 의식하고 누른다"
 * 는 보호막을 만듭니다. lead 한 줄 + 변경 대상 요약 박스 + 액션 버튼 두 개.
 */
const ConfirmBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const ConfirmLead = styled.p`
  margin: 0;
  color: ${tokens.color.ink2};
  font-size: 13.5px;
  line-height: 1.55;
`;

const ConfirmTarget = styled.div`
  padding: 12px 14px;
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.card};
  background: ${tokens.color.foot};
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ConfirmTargetTitle = styled.div`
  color: ${tokens.color.ink1};
  font-size: 14px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ConfirmTargetMeta = styled.div`
  color: ${tokens.color.ink4};
  font-size: 12px;
  font-family: ${tokens.font.mono};
  font-variant-numeric: tabular-nums;
`;

const ConfirmActions = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  flex-wrap: wrap;

  > button {
    min-width: 96px;
  }
`;

/**
 * 상품(items)에는 원래 ID가 없어서 편집 UI에서 개별 행을 식별하기 위한 임시 ID를 붙여 둡니다.
 * 저장 시 ID는 떨어뜨리고 다시 { name, price, link } 형태로 직렬화해서 돌려줍니다.
 */
type ProductModalMode = { type: "add" } | { type: "edit"; id: string };

function rowToMeta(row: TxRow): MetaFieldValues {
  const cardImport = row.detail?.cardImport;
  return {
    title: row.title,
    // TxRow.amount는 부호 있는 숫자(지출은 음수). UI에서는 양수값으로 보여주고,
    // 저장 시 type에 따라 다시 부호를 붙입니다.
    amount: String(Math.abs(row.amount)),
    // 드롭다운은 TxPlatform 키("coupang" 등)를 그대로 value로 사용합니다. mapPlatform이 키/라벨을
    // 모두 받아들이므로 왕복 변환이 안전합니다. "unspecified"도 PlatformSelect의 옵션 중 하나라 자연스럽게 표시됩니다.
    platform: row.platform,
    date: row.date,
    categories: [...row.categories],
    memo: row.memo ?? "",
    installmentKind:
      cardImport?.paymentMode === "installment"
        ? "installment"
        : cardImport?.paymentMode === "lump_sum"
          ? "lump_sum"
          : "none",
    installmentMonths: cardImport?.installmentMonths ? String(cardImport.installmentMonths) : "",
    // 회차 입력 surface 가 제거돼 폼이 더 이상 해당 키를 읽지 않습니다(2026-04-28).
    // cardImport 에 회차가 들어 있어도 편집 폼에는 노출되지 않고, 다른 필드 편집 시에도
    // patch 로 다시 쓰이지 않으므로 그대로 보존됩니다.
    billedAmount: cardImport?.billedAmount ? String(cardImport.billedAmount) : "",
    dueDate: cardImport?.dueDate ?? "",
  };
}

function rowToProducts(row: TxRow): ManualProduct[] {
  return (
    row.detail?.items.map((item, index) => ({
      id: `${row.id}-item-${index}`,
      name: item.name,
      price: item.price,
      link: item.link,
    })) ?? []
  );
}

export const TransactionEditModal: React.FC<Props> = ({ row, onClose, onSubmit }) => {
  const allRows = useTransactionsStore();
  // row는 마운트 시점의 prop으로만 초기화됩니다. 새로운 거래를 편집하려면 상위에서 key를 바꿔
  // 이 컴포넌트를 다시 마운트하도록 합니다. 이렇게 하면 사용자가 편집 중 값이 엉뚱하게 튀는
  // 동기화 문제도 사라지고, useEffect + setState 안티패턴도 없어집니다.
  const [type, setType] = useState<TxType>(row.type);
  const [status, setStatus] = useState<StatusKey | null>(row.status);
  const [meta, setMeta] = useState<MetaFieldValues>(() => rowToMeta(row));
  const [products, setProducts] = useState<ManualProduct[]>(() => rowToProducts(row));
  const [productModal, setProductModal] = useState<ProductModalMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * 상품 합계 경고 모달 상태. 수동 입력과 같은 규칙으로 저장 직전에 한 번 더 검사합니다.
   * 편집에서는 특히 "상품 가격을 잘못 수정"해 총 금액과 어긋나는 상황이 생기기 쉬워서,
   * 저장 직전에 한 번 더 짚어 주는 것이 가치 있습니다. pendingPatch는 under 승인 후
   * 그대로 onSubmit에 넘기는 용도입니다.
   */
  const [totalWarning, setTotalWarning] = useState<{
    mode: "exceeds" | "under";
    entries: ProductTotalWarningEntry[];
    pendingPatch?: Partial<TxRow>;
  } | null>(null);
  const [pendingDuplicatePatch, setPendingDuplicatePatch] = useState<Partial<TxRow> | null>(null);
  const [duplicateSummary, setDuplicateSummary] = useState<{
    exactDup: TxRow[];
    itemDiff: TxRow[];
  } | null>(null);
  /**
   * 변경사항 컨펌 모달 상태. 저장 버튼 → "정말 수정하시겠어요?" → 진짜 저장 흐름으로 1단계 추가.
   * 삭제 모달과 톤을 통일해 "값이 바뀌면 사용자가 의식하고 누른다" 는 보호막을 만듭니다.
   * 변경사항이 실제로 없으면 (폼만 열어 보고 닫는 흐름) 컨펌 없이 그대로 onClose 합니다.
   */
  const [pendingConfirmPatch, setPendingConfirmPatch] = useState<Partial<TxRow> | null>(null);

  const focusMetaField = (field: RequiredMetaField) => {
    const target = document.getElementById(`edit-${field}`);
    if (target instanceof HTMLElement) {
      target.focus();
    }
  };

  const editingProduct =
    productModal?.type === "edit"
      ? products.find((product) => product.id === productModal.id) ?? null
      : null;

  const handleProductSubmit = (payload: ProductAddPayload) => {
    if (productModal?.type === "edit") {
      setProducts((current) =>
        current.map((product) =>
          product.id === productModal.id ? { ...product, ...payload } : product
        )
      );
    } else {
      setProducts((current) => [
        ...current,
        { ...payload, id: `new_${Date.now()}` },
      ]);
    }
    setProductModal(null);
  };

  /**
   * 카드 메타(cardImport) 를 폼 값으로 재구성합니다.
   *
   * 정책:
   *   - 폼이 노출하는 4개 필드(installmentKind / installmentMonths / billedAmount / dueDate)
   *     는 사용자 입력으로 덮어씁니다 — 카드사 CSV 가 잘못 인식한 경우의 도망갈 길.
   *   - 폼에 없는 audit 필드(approvedAmount / approvalNumber / cardLabel / sourceSheet /
   *     rawRowFingerprint / originalMerchant / installmentCurrentCycle / installmentCycleTotal /
   *     remainingBalance / recordKind) 는 기존 값을 그대로 유지합니다.
   *     이 필드들은 사용자가 폼에서 손댈 surface 가 없으므로 의도치 않게 잃어버리는 회귀를 막기 위함.
   *   - 카드 신호가 전혀 없는 거래(installmentKind=none + dueDate 비움 + 기존 cardImport 없음)
   *     는 cardImport 자체를 만들지 않습니다.
   *
   * 회귀 배경: 이전에는 buildPatch 가 detail 을 재구성하면서 cardImport 를 통째로 빠뜨렸고,
   * 카드 거래는 items=[] 라 detail 이 undefined 로 떨어져 cardImport 가 사라졌습니다.
   * 그래서 사용자 입장에서 "폼에 입력해도 저장이 안 되는 수정 불가 필드" 처럼 보였습니다.
   */
  const buildCardImportPatch = (): NonNullable<NonNullable<TxRow["detail"]>["cardImport"]> | undefined => {
    const existing = row.detail?.cardImport;
    const installmentMonthsNum = Number(meta.installmentMonths.replace(/[^0-9]/g, ""));
    const billedAmountNumber = Number(meta.billedAmount.replace(/[^0-9]/g, ""));
    const dueDateTrimmed = meta.dueDate.trim();
    const hasFormCardSignal =
      meta.installmentKind !== "none" || dueDateTrimmed !== "";
    if (!existing && !hasFormCardSignal) return undefined;

    // 폼의 installmentKind 가 "none" 이면 사용자가 의도적으로 "선택 안 함" 을 고른 것이므로
    // unknown 으로 떨어뜨립니다(기존 lump_sum/installment 값을 유지하면 사용자 의도와 어긋남).
    // recordKind 는 폼에 surface 가 없어 audit 차원에서 기존 값을 그대로 유지합니다.
    const paymentMode =
      meta.installmentKind === "lump_sum"
        ? "lump_sum"
        : meta.installmentKind === "installment"
          ? "installment"
          : "unknown";
    const recordKind = existing?.recordKind ?? (billedAmountNumber > 0 ? "billing" : "approval");

    const next: NonNullable<NonNullable<TxRow["detail"]>["cardImport"]> = {
      recordKind,
      paymentMode,
    };
    if (installmentMonthsNum > 0) next.installmentMonths = installmentMonthsNum;
    if (billedAmountNumber > 0) next.billedAmount = billedAmountNumber;
    if (dueDateTrimmed) next.dueDate = dueDateTrimmed;
    // audit 필드는 기존 값 보존 (폼에 surface 없음 = 사용자가 바꿀 의도가 없음).
    if (existing) {
      if (existing.installmentCurrentCycle !== undefined)
        next.installmentCurrentCycle = existing.installmentCurrentCycle;
      if (existing.installmentCycleTotal !== undefined)
        next.installmentCycleTotal = existing.installmentCycleTotal;
      if (existing.approvedAmount !== undefined)
        next.approvedAmount = existing.approvedAmount;
      if (existing.remainingBalance !== undefined)
        next.remainingBalance = existing.remainingBalance;
      if (existing.approvalNumber) next.approvalNumber = existing.approvalNumber;
      if (existing.cardLabel) next.cardLabel = existing.cardLabel;
      if (existing.sourceSheet) next.sourceSheet = existing.sourceSheet;
      if (existing.rawRowFingerprint) next.rawRowFingerprint = existing.rawRowFingerprint;
      if (existing.originalMerchant) next.originalMerchant = existing.originalMerchant;
    }
    return next;
  };

  const buildPatch = (): Partial<TxRow> | null => {
    const amountNumber = Number(meta.amount.replace(/[^0-9]/g, ""));
    if (!meta.title.trim()) {
      setError("거래명을 입력해 주세요.");
      focusMetaField("title");
      return null;
    }
    if (!amountNumber || Number.isNaN(amountNumber)) {
      setError("금액을 숫자로 입력해 주세요.");
      focusMetaField("amount");
      return null;
    }
    if (!meta.date.trim()) {
      setError("거래일자를 선택해 주세요.");
      focusMetaField("date");
      return null;
    }
    // 길이/금액 한도 검증. 신규 입력과 동일 정책으로 한도 위반 시 차단합니다.
    if (meta.title.trim().length > MAX_TITLE_LENGTH) {
      setError(`거래명은 ${MAX_TITLE_LENGTH}자 이내로 입력해 주세요.`);
      focusMetaField("title");
      return null;
    }
    if (meta.memo.trim().length > MAX_MEMO_LENGTH) {
      setError(`메모는 ${MAX_MEMO_LENGTH}자 이내로 입력해 주세요.`);
      return null;
    }
    if (Math.abs(amountNumber) > MAX_AMOUNT_VALUE) {
      setError("금액이 너무 커요. 한도를 확인해 주세요.");
      focusMetaField("amount");
      return null;
    }

    const signedAmount =
      type === "expense" ? -Math.abs(amountNumber) : Math.abs(amountNumber);

    const cardImport = buildCardImportPatch();
    const hasDetailSignal =
      products.length > 0 ||
      cardImport !== undefined ||
      row.detail?.sourceImageUrl ||
      row.detail?.itemsCoverage ||
      typeof row.detail?.discountAmount === "number" ||
      row.detail?.folded ||
      typeof row.detail?.itemCountHint === "number" ||
      typeof row.detail?.hiddenItemCount === "number" ||
      typeof row.detail?.sectionTotal === "number";

    return {
      type,
      title: meta.title.trim(),
      amount: signedAmount,
      date: meta.date.trim(),
      platform: mapPlatform(meta.platform),
      categories: mapCategories(meta.categories),
      status:
        status && isValidStatusForType(status, type)
          ? status
          : defaultStatusForType(type),
      memo: meta.memo.trim() || undefined,
      // 상품이 하나라도 있거나, cardImport / 기타 detail 메타가 살아 있으면 detail 을
      // 재구성합니다. 카드내역 거래는 items=[] 라도 cardImport 가 살아 있으므로 이 경로로
      // detail 이 보존돼야 결제 정보 섹션이 회귀 없이 유지됩니다.
      //
      // 다음 order-level 메타들은 편집 화면에 노출되지 않더라도 저장 시 보존합니다 —
      // 이 모달에서 수정할 수 없는 값이라 사용자가 의도치 않게 잃어버리는 회귀를 막기 위함입니다.
      //   - itemsCoverage : 부분 입력 플래그
      //   - discountAmount : 주문단위 차감액(쿠폰/포인트/카드 할인)
      //   - folded / itemCountHint / hiddenItemCount / sectionTotal : 네이버 접힌 주문 메타
      //   - cardImport : 카드 CSV 원본 메타 (audit 필드는 기존 값, 폼 노출 필드는 사용자 입력)
      // 정책 근거: docs/Naver_OCR_Parsing_Strategy.md §12-3 — 차감액은 별도 슬롯으로 보존,
      //         §12-5 — 접힌 주문은 메타와 안내를 남긴다.
      detail: hasDetailSignal
        ? {
            items: products.map((product) => ({
              name: product.name,
              price: product.price,
              link: product.link,
            })),
            source: row.detail?.source ?? "MANUAL",
            ...(row.detail?.sourceImageUrl
              ? { sourceImageUrl: row.detail.sourceImageUrl }
              : {}),
            ...(row.detail?.itemsCoverage
              ? { itemsCoverage: row.detail.itemsCoverage }
              : {}),
            ...(typeof row.detail?.discountAmount === "number"
              ? { discountAmount: row.detail.discountAmount }
              : {}),
            ...(row.detail?.folded ? { folded: true } : {}),
            ...(typeof row.detail?.itemCountHint === "number"
              ? { itemCountHint: row.detail.itemCountHint }
              : {}),
            ...(typeof row.detail?.hiddenItemCount === "number"
              ? { hiddenItemCount: row.detail.hiddenItemCount }
              : {}),
            ...(typeof row.detail?.sectionTotal === "number"
              ? { sectionTotal: row.detail.sectionTotal }
              : {}),
            ...(cardImport ? { cardImport } : {}),
          }
        : undefined,
    };
  };

  const submitPatch = (patch: Partial<TxRow>) => {
    const nextRow: TxRow = { ...row, ...patch, detail: patch.detail };
    const otherRows = allRows.filter((candidate) => candidate.id !== row.id);
    const dupResult = checkDuplicates([nextRow], otherRows);
    if (dupResult.exactDup.length > 0 || dupResult.itemDiff.length > 0) {
      setPendingDuplicatePatch(patch);
      setDuplicateSummary({
        exactDup: dupResult.exactDup,
        itemDiff: dupResult.itemDiff.map((entry) => entry.existing),
      });
      return;
    }

    onSubmit(row.id, patch);
    onClose();
  };

  /**
   * key 순서가 다른 객체끼리 비교해도 결과가 같도록 안정적인 직렬화를 수행합니다.
   * row.detail (스토어에서 hydrate) 와 patch.detail (방금 빌드) 의 key 순서가 다를 수 있어
   * 단순 JSON.stringify 로는 false-positive 변경 감지가 일어납니다.
   */
  const stableStringify = (value: unknown): string => {
    if (value === null || value === undefined) return JSON.stringify(value ?? null);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  };

  /**
   * patch 가 row 와 비교해 실제 의미 있는 변경을 담고 있는지 판정.
   * 폼만 열어 보고 닫는 흐름(저장 버튼 눌렀지만 아무것도 안 바꿈)은 컨펌 없이 통과해야 마찰이 적습니다.
   */
  const hasMeaningfulChanges = (patch: Partial<TxRow>): boolean => {
    if ((patch.type ?? row.type) !== row.type) return true;
    if ((patch.title ?? row.title) !== row.title) return true;
    if ((patch.amount ?? row.amount) !== row.amount) return true;
    if ((patch.date ?? row.date) !== row.date) return true;
    if ((patch.platform ?? row.platform) !== row.platform) return true;
    if ((patch.status ?? row.status) !== row.status) return true;
    if ((patch.memo ?? "") !== (row.memo ?? "")) return true;
    const beforeCats = row.categories.join("|");
    const afterCats = (patch.categories ?? row.categories).join("|");
    if (beforeCats !== afterCats) return true;
    if (stableStringify(patch.detail) !== stableStringify(row.detail)) return true;
    return false;
  };

  /**
   * 컨펌 통과 후 실행되는 본격 저장 흐름. 기존 handleSave 의 "검증 → 합계 점검 → submit" 단계를
   * 그대로 옮겼습니다.
   *
   * 흐름: 컨펌 모달 → continueSave → (상품이 있으면) 합계 점검 → submitPatch (중복 감지 포함).
   */
  const continueSave = (patch: Partial<TxRow>) => {
    const signedAmount = patch.amount ?? row.amount;

    // 상품이 있을 때만 합계 검증을 실행합니다. (수동 입력과 동일한 규약)
    if (products.length > 0) {
      const totalCheck = checkProductTotal({
        totalAmount: signedAmount,
        products,
      });
      if (totalCheck.status === "exceeds") {
        setTotalWarning({
          mode: "exceeds",
          entries: [
            {
              label: meta.title.trim(),
              totalAmount: signedAmount,
              productsSum: totalCheck.productsSum,
              diff: totalCheck.diff,
            },
          ],
        });
        return;
      }
      if (totalCheck.status === "under") {
        // under 승인 시 detail에 partial 플래그를 덧붙여 저장합니다.
        const partialPatch: Partial<TxRow> = {
          ...patch,
          detail: patch.detail
            ? { ...patch.detail, itemsCoverage: "partial" }
            : patch.detail,
        };
        setTotalWarning({
          mode: "under",
          entries: [
            {
              label: meta.title.trim(),
              totalAmount: signedAmount,
              productsSum: totalCheck.productsSum,
              diff: totalCheck.diff,
            },
          ],
          pendingPatch: partialPatch,
        });
        return;
      }
    }

    submitPatch(patch);
  };

  const handleSave = () => {
    // 수동 입력과 동일한 규칙: 거래명·금액·거래일자는 모두 필수입니다.
    // 편집 모달은 초기값이 이미 존재하지만, 사용자가 실수로 필드를 비운 채 저장하려는 흐름을 막습니다.
    const patch = buildPatch();
    if (!patch) {
      return;
    }
    // 변경사항이 없으면 컨펌 없이 그냥 모달 닫기 (폼만 열어 본 흐름).
    if (!hasMeaningfulChanges(patch)) {
      onClose();
      return;
    }
    // 변경이 있으면 universal confirm 모달을 먼저 띄움. 사용자가 "예, 수정할게요" 를 누르면
    // continueSave 가 기존 합계 점검 / 중복 감지 흐름을 그대로 이어 받습니다.
    setPendingConfirmPatch(patch);
  };

  return (
    <>
      <Modal isOpen onClose={onClose} title="거래 수정">
        <ScrollBody>
          <SectionLabel>거래 유형</SectionLabel>
          <div style={{ marginBottom: 16 }}>
            <TypeSegment
              value={type}
              onChange={(nextType) => {
                setType(nextType);
                // 지출 ↔ 수입 전환 시 유효하지 않게 된 상태는 자동으로 안전 디폴트로 돌립니다.
                setStatus((current) =>
                  current && isValidStatusForType(current, nextType)
                    ? current
                    : defaultStatusForType(nextType)
                );
              }}
            />
          </div>

          <MetaFields
            fieldIdPrefix="edit"
            value={meta}
            onChange={(next) => {
              setMeta(next);
              if (error) setError(null);
            }}
            // 카드 CSV 로 들어온 거래(cardImport 존재) 만 결제 메타 위에 출처 안내 배너 표시.
            // 사용자가 카드사 원본 값과 달라진다는 점을 의식하고 손대도록 유도하는 용도.
            cardSourceNotice={Boolean(row.detail?.cardImport)}
          />

          <SectionLabel>상태 태그</SectionLabel>
          <div style={{ marginBottom: 16 }}>
            <StatusTags value={status} type={type} onChange={setStatus} />
          </div>

          <SectionHeader>
            <SectionLabel style={{ margin: 0 }}>등록된 상품</SectionLabel>
            <AddButton type="button" onClick={() => setProductModal({ type: "add" })}>
              + 상품 추가
            </AddButton>
          </SectionHeader>
          <SectionHint>
            상품을 추가하거나 각 행의 '수정'을 눌러 개별 상품을 고칠 수 있어요.
          </SectionHint>
          <ProductRows
            products={products}
            // 편집 중인 거래의 플랫폼을 그대로 넘겨, 링크 미등록 상품을 그 플랫폼 검색창으로 보낼 수 있게 합니다.
            platform={row.platform}
            onEdit={(id) => setProductModal({ type: "edit", id })}
            onRemove={(id) =>
              setProducts((current) => current.filter((p) => p.id !== id))
            }
          />

          {error && <ErrorLine role="alert">{error}</ErrorLine>}

          <SaveBar>
            <Button variant="primary" size="lg" block onClick={handleSave}>
              수정 저장하기
            </Button>
          </SaveBar>
        </ScrollBody>
      </Modal>

      {/* 편집 중에도 '상품 추가/수정'을 쓸 수 있어야 해서 Modal을 중첩합니다. 두 모달 모두
          같은 z-index를 쓰지만 후에 렌더되는 쪽이 DOM 순서상 위에 얹혀지므로 겹침이 자연스럽습니다. */}
      <ProductAddModal
        key={
          productModal
            ? `${productModal.type}-${productModal.type === "edit" ? productModal.id : "new"}`
            : "closed"
        }
        isOpen={productModal !== null}
        initialValues={editingProduct}
        onClose={() => setProductModal(null)}
        onSubmit={handleProductSubmit}
      />

      {/* 상품 합계 경고. handleSave가 exceeds/under를 감지하면 이 모달로 이어지고,
          under에서 "이대로 등록"을 누르면 pendingPatch를 그대로 onSubmit에 넘겨 저장합니다. */}
      {totalWarning && (
        <ProductTotalWarningModal
          isOpen
          mode={totalWarning.mode}
          entries={totalWarning.entries}
          onConfirm={() => {
            const pending = totalWarning.pendingPatch;
            setTotalWarning(null);
            if (pending) {
              submitPatch(pending);
            }
          }}
          onCancel={() => setTotalWarning(null)}
        />
      )}
      {duplicateSummary && pendingDuplicatePatch && (
        <Modal
          isOpen
          onClose={() => {
            setDuplicateSummary(null);
            setPendingDuplicatePatch(null);
          }}
          title="이미 있는 거래와 비슷해 보여요"
        >
          <DuplicateNotice>
            수정 후 값이 이미 저장된 거래와 많이 비슷합니다. 정말 이 값이 맞다면 그대로 저장하고,
            중복이라고 판단되면 이번 수정은 취소한 뒤 거래 목록에서 직접 정리해 주세요.
            <DuplicateList>
              {duplicateSummary.exactDup.map((match) => (
                <li key={`exact-${match.id}`}>
                  동일한 값으로 보이는 거래: {match.title} · {match.date} · {formatKRW(Math.abs(match.amount))}
                </li>
              ))}
              {duplicateSummary.itemDiff.map((match) => (
                <li key={`diff-${match.id}`}>
                  같은 결제로 보이는 거래: {match.title} · {match.date} · {formatKRW(Math.abs(match.amount))}
                </li>
              ))}
            </DuplicateList>
          </DuplicateNotice>
          <DuplicateActions>
            <Button
              variant="ghost"
              size="md"
              onClick={() => {
                setDuplicateSummary(null);
                setPendingDuplicatePatch(null);
                onClose();
              }}
            >
              아, 중복이네요
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                onSubmit(row.id, pendingDuplicatePatch);
                setDuplicateSummary(null);
                setPendingDuplicatePatch(null);
                onClose();
              }}
            >
              맞아요, 이 값으로 수정할게요
            </Button>
          </DuplicateActions>
        </Modal>
      )}
      {/* universal confirm — buildPatch 가 반환한 patch 가 실제로 row 와 다를 때만 뜸.
          삭제 모달(/transactions 의 정말 삭제하시겠습니까?) 과 톤 통일. */}
      {pendingConfirmPatch && (
        <Modal
          isOpen
          onClose={() => setPendingConfirmPatch(null)}
          title="정말 수정하시겠어요?"
        >
          <ConfirmBody>
            <ConfirmLead>
              값을 바꿔서 저장하면 이전 정보로 되돌릴 수 없어요. 변경할 거래를 한 번 더 확인해 주세요.
            </ConfirmLead>
            <ConfirmTarget>
              <ConfirmTargetTitle>
                {(pendingConfirmPatch.title ?? row.title)}
              </ConfirmTargetTitle>
              <ConfirmTargetMeta>
                {(pendingConfirmPatch.date ?? row.date)} ·{" "}
                {formatKRW(Math.abs(pendingConfirmPatch.amount ?? row.amount))}
              </ConfirmTargetMeta>
            </ConfirmTarget>
            <ConfirmActions>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setPendingConfirmPatch(null)}
              >
                취소
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  const patch = pendingConfirmPatch;
                  setPendingConfirmPatch(null);
                  if (patch) continueSave(patch);
                }}
              >
                수정할게요
              </Button>
            </ConfirmActions>
          </ConfirmBody>
        </Modal>
      )}
    </>
  );
};
