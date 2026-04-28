/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 *       한 주문(OcrOrder)의 상품 목록을 수정 가능한 표 형태로 보여줍니다.
 *       상태 태그는 주문 레벨에서 관리되기 때문에 이 테이블은 순수하게
 *       상품명 · 금액 · 링크만 다루고, 상태 배지는 상단 주문 블록의 몫입니다.
 * 위치: src\pages\OcrEdit\components\ProductTable.tsx
 */
import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { tokens } from "../../../styles/tokens";
import type { OcrProduct, Status } from "../data";
import { classifyOcrCardQuality } from "../../../utils/ocrQuality";
import { sanitizeHref } from "../../../utils/safeUrl";

/** "1000000" → "1,000,000" */
function formatWithCommas(digits: string): string {
  if (!digits) return "";
  const normalized = digits.replace(/^0+(?=\d)/, "");
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const Table = styled.div`
  display: grid;
  /* 상품명(1.1fr) | 금액(120px) | 링크 입력(1fr) | 링크 열기 아이콘(24px) | 삭제 버튼(28px) */
  grid-template-columns: minmax(0, 1.1fr) 120px minmax(0, 1fr) 24px 28px;
  column-gap: 8px;
  font-size: ${tokens.type.caption.size};
`;

const HeaderCell = styled.div`
  padding: 8px 4px;
  border-bottom: 1px solid ${tokens.color.line2};
  color: ${tokens.color.ink4};
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;

  &.right {
    text-align: right;
  }
`;

const Row = styled.div`
  display: contents;

  & > * {
    padding: 8px 4px;
    border-bottom: 1px solid ${tokens.color.line2};
  }
`;

const Input = styled.input`
  width: 100%;
  padding: 6px 8px;
  border: 1px solid ${tokens.color.line};
  border-radius: 6px;
  background: ${tokens.color.panel};
  color: ${tokens.color.ink1};
  font-family: inherit;
  font-size: 12.5px;
  outline: none;
  transition: border-color ${tokens.motion.fast}, box-shadow ${tokens.motion.fast};

  &:focus {
    border-color: ${tokens.color.accent};
    box-shadow: ${tokens.shadow.focus};
  }

  &.amount {
    text-align: right;
    font-family: ${tokens.font.mono};
    font-variant-numeric: tabular-nums;
  }

  &.link {
    color: ${tokens.color.ink4};
    font-size: 11px;
  }
`;

const RemoveButton = styled.button`
  border: none;
  background: none;
  color: ${tokens.color.ink4};
  cursor: pointer;
  font-size: 14px;

  &:hover {
    color: ${tokens.color.neg};
  }
`;

/**
 * "0원" 배지. 두 가지 상태를 가집니다.
 *   - 미확인(warn 톤, 노랑): OCR 이 가격을 놓쳤을 가능성을 알림. "사은품/이벤트" 라면
 *     이대로 저장해도 괜찮다는 걸 사용자에게 알려 주고, 한 번 확인 버튼을 눌러
 *     의도된 0원임을 표시하게 합니다.
 *   - 확인됨(중립 ink 톤): 사용자가 "이대로 저장" 을 찍은 뒤. 가계부가 기록용으로도
 *     쓰이는 걸 감안해, 확인 후에는 경고 톤을 빼고 "0원으로 기록" 이라는 사실만
 *     남깁니다. 되돌리기도 제공해 실수로 눌렀을 때 원상복귀 가능.
 *
 * 저장을 막지 않는 soft-badge 라, 확인 여부는 UI 표시용으로만 쓰이고 실제 저장 흐름
 * (OcrEdit → transactionsStore) 은 처음부터 0원을 그대로 넘깁니다.
 */
const ZeroPriceHint = styled.span<{ $acknowledged?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  padding: 1px 6px;
  border-radius: 4px;
  background: ${({ $acknowledged }) =>
    $acknowledged ? tokens.color.tint : tokens.color.warnBg};
  color: ${({ $acknowledged }) =>
    $acknowledged ? tokens.color.ink4 : tokens.color.warn};
  font-size: 10px;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
`;

/**
 * 배지 안에 들어가는 인라인 액션 버튼("이대로 저장" / "되돌리기").
 * 배지의 시각 톤을 해치지 않기 위해 배경 없는 텍스트 버튼으로 둡니다.
 */
/**
 * 2026-04-25 UX 재정리: 카드별 "AI 보정됨" 배지는 제거. 사용자에겐 결과 품질만 관심이라
 * AI 흔적은 시각적으로 노출하지 않습니다. 여기 ProductTable row 에는 **기능 경고** 성격의
 * BadHint 와 ZeroPriceHint 만 유지합니다.
 */
const BadHint = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  padding: 1px 6px;
  border-radius: 4px;
  background: ${tokens.color.negSubtle};
  color: ${tokens.color.neg};
  font-size: 10px;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
`;

const ZeroPriceAction = styled.button`
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.4;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;

  &:hover {
    opacity: 0.75;
  }

  &:focus-visible {
    outline: 1px solid currentColor;
    outline-offset: 1px;
  }
`;

/**
 * 링크가 입력된 row에 표시되는 "새 탭으로 열기" 아이콘 버튼.
 * 링크가 비어있으면 보이지 않도록 컨테이너에서 제어합니다.
 */
const LinkButton = styled.a`
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  color: ${tokens.color.ink4};
  text-decoration: none;
  transition: color ${tokens.motion.fast}, background ${tokens.motion.fast};

  &:hover {
    color: ${tokens.color.accent};
    background: ${tokens.color.accentSubtle};
  }

  svg {
    width: 13px;
    height: 13px;
  }
`;

const AddRow = styled.button`
  grid-column: 1 / -1;
  margin-top: 10px;
  padding: 10px;
  border: 1px dashed ${tokens.color.line};
  border-radius: 8px;
  background: ${tokens.color.panel};
  color: ${tokens.color.ink3};
  cursor: pointer;
  font-family: inherit;
  font-size: ${tokens.type.caption.size};
  font-weight: 600;

  &:hover {
    border-color: ${tokens.color.accent};
    color: ${tokens.color.accentHover};
  }
`;

/** 내부 row 타입. price는 콤마 없는 digit 문자열로 관리합니다. */
type ProductRow = Omit<OcrProduct, "price"> & { priceRaw: string };

/**
 * 외부에서 들어오는 price 가 number 가 아닌 케이스(예: AI 응답·import 경로에서 콤마
 * 끼인 문자열) 를 안전하게 흡수합니다. Number() 가 NaN 으로 떨어지면 전체 거래금액이
 * 0 으로 빠지는 회귀(2026-04-25)를 막기 위한 정규화입니다.
 */
function toPriceRaw(value: unknown): string {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "0";
  }
  if (typeof value === "string") {
    const digits = value.replace(/[^\d]/g, "");
    return digits || "0";
  }
  return "0";
}

function toRow(p: OcrProduct): ProductRow {
  return { ...p, priceRaw: toPriceRaw(p.price) };
}

/**
 * ProductRow → OcrProduct 역변환 (저장 시 부모에 올려줄 때 사용).
 *
 * quantity는 현재 표에서 직접 편집하지 않지만, OCR 파서가 "· N개"로 잡아낸 값을
 * 사용자가 다른 필드를 고칠 때도 보존해야 합니다(안 그러면 OcrEdit 상위에서 돌리는
 * sumProductTotal이 qty=1로 오해해 전체 거래금액이 줄어듭니다). 그래서 quantity를
 * 항상 그대로 넘겨 줍니다.
 */
function toProduct(row: ProductRow): OcrProduct {
  // priceRaw 는 onChange 단계에서 [^0-9] 를 strip 해 두지만, 초기 toRow 진입 직후나
  // 외부 patch 가 직접 들어오는 케이스를 막기 위해 한 번 더 sanitize 합니다.
  const priceDigits = row.priceRaw.replace(/[^\d]/g, "");
  const priceNum = priceDigits ? Number(priceDigits) : 0;
  return {
    id: row.id,
    name: row.name,
    price: Number.isFinite(priceNum) ? priceNum : 0,
    link: row.link || undefined,
    ...(row.quantity !== undefined ? { quantity: row.quantity } : {}),
    ...(row.priceOcrFailed ? { priceOcrFailed: true } : {}),
    ...(row.aiApplied ? { aiApplied: true } : {}),
  };
}

export const ProductTable: React.FC<{
  products: OcrProduct[];
  /** 상품 목록이 변경될 때마다 부모에게 최신 목록을 올려줍니다. */
  onChange?: (products: OcrProduct[]) => void;
  /**
   * 이 주문의 상태 태그. OCR 품질 분류에서 "price=0 이 취소/환불이면 정상" 판정 용도.
   * 없으면 purchase 로 간주합니다.
   */
  statusTag?: Status;
  fieldIdPrefix?: string;
}> = ({ products, onChange, statusTag, fieldIdPrefix = "ocr-product" }) => {
  const [rows, setRows] = useState<ProductRow[]>(products.map(toRow));

  /**
   * "이 0원은 내가 의도한 게 맞다" 고 사용자가 확인한 row id 집합.
   * 저장 페이로드에는 전혀 영향이 없는 순수 UI 표시 상태로, row 자체에 저장하면
   * OcrProduct → props 사이클에서 사라져 버리기 때문에 여기서 별도로 관리합니다.
   *
   * 가격이 다시 0 이 아니게 바뀌면 "확인됨" 표시가 필요 없어지고, 또 다시 0 으로
   * 돌아오는 일은 실수일 확률이 높아 재확인을 받는 쪽이 안전합니다. 그래서
   * 가격 변경 시 해당 id 를 집합에서 빼 줍니다(priceRaw 가 변할 때의 패치 경로 참고).
   */
  const [acknowledgedZeroIds, setAcknowledgedZeroIds] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    setRows(products.map(toRow));
  }, [products]);

  /** rows를 업데이트하고 동시에 부모에 변경 사실을 알립니다. */
  const setRowsAndNotify = (updater: (current: ProductRow[]) => ProductRow[]) => {
    setRows((current) => {
      const next = updater(current);
      onChange?.(next.map(toProduct));
      return next;
    });
  };

  const patch = (id: string, partial: Partial<ProductRow>) => {
    setRowsAndNotify((current) =>
      current.map((row) => (row.id === id ? { ...row, ...partial } : row))
    );
    // 가격을 건드렸다면 "확인됨" 표시를 해제합니다. 0 → 다른 값 → 0 흐름에서 이전 확인
    // 상태를 그대로 가져가면 "왜 경고 없이 0원이 조용히 넘어갔지?" 가 될 수 있어요.
    if (Object.prototype.hasOwnProperty.call(partial, "priceRaw")) {
      setAcknowledgedZeroIds((current) => {
        if (!current.has(id)) return current;
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  /** 사용자가 "이대로 저장" 을 눌렀을 때 호출. row 가 확인됨 집합에 들어갑니다. */
  const acknowledgeZero = (id: string) => {
    setAcknowledgedZeroIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  };

  /** 확인을 되돌릴 때 호출. 경고 톤으로 다시 돌아갑니다. */
  const revokeZero = (id: string) => {
    setAcknowledgedZeroIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };

  const handleRemove = (id: string) => {
    setRowsAndNotify((current) => current.filter((row) => row.id !== id));
    // 삭제된 row 의 확인 상태도 함께 정리해, 같은 id 가 재사용될 때 잔상이 남지 않게 합니다.
    setAcknowledgedZeroIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };

  const handleAdd = () => {
    setRowsAndNotify((current) => [
      ...current,
      { id: `local-${Date.now()}`, name: "새 상품", priceRaw: "0", link: "" },
    ]);
  };

  return (
    <Table>
      <HeaderCell>상품명 *</HeaderCell>
      <HeaderCell className="right">상품 금액 *</HeaderCell>
      <HeaderCell>상품 링크</HeaderCell>
      <HeaderCell />
      <HeaderCell />
      {rows.map((row) => {
        // 품질 분류는 row 의 현재 값(사용자가 편집 중이면 반영된 상태) 으로 매번 재계산합니다.
        // 이렇게 하면 사용자가 이름을 손으로 고쳐 깨끗해지면 배지도 곧바로 사라집니다.
        const quality = classifyOcrCardQuality({
          name: row.name,
          price: row.priceRaw ? Number(row.priceRaw) : 0,
          quantity: row.quantity,
          statusTag,
          priceOcrFailed: row.priceOcrFailed,
          aiApplied: row.aiApplied,
        });
        // bad hint 는 사용자 확인용으로 계속 노출. AI 보정 흔적 배지는 여기선 보여주지
        // 않습니다(2026-04-25 UX 정리).
        const showBadHint = !row.aiApplied && quality.tier === "bad";
        return (
        <Row key={row.id}>
          <div>
            <Input
              id={`${fieldIdPrefix}-name-${row.id}`}
              value={row.name}
              onChange={(e) => patch(row.id, { name: e.target.value })}
            />
            {showBadHint && (
              <BadHint title={quality.reasons.join(" · ")}>
                ⚠ 내용 확인 권장
              </BadHint>
            )}
          </div>
          <div>
            {/* 숫자만 입력 가능, 콤마 포맷 표시 */}
            <Input
              id={`${fieldIdPrefix}-amount-${row.id}`}
              className="amount"
              value={formatWithCommas(row.priceRaw)}
              inputMode="numeric"
              onChange={(e) => {
                const digits = e.target.value.replace(/[^0-9]/g, "");
                patch(row.id, { priceRaw: digits });
              }}
            />
            {/*
              priceRaw 가 빈 값이거나 "0" 으로 떨어지는 경우에만 배지를 띄웁니다.
              저장 흐름 자체는 0원을 그대로 넘기기 때문에(사은품/이벤트 등 "기록 목적"
              케이스를 막지 않음), 이 배지는 UI 표시용일 뿐입니다. 확인 버튼을 눌러
              "의도한 0원" 임을 표시하면 톤이 부드러워집니다.
            */}
            {(row.priceRaw === "" || Number(row.priceRaw) === 0) &&
              // 3-way 분기:
              //   (a) priceOcrFailed && !aiApplied : Tesseract 실패 상태가 남아있음 — AI 보정이
              //       스텁이거나 실패한 경우. 가격을 직접 입력하라고 분명히 요청.
              //   (b) acknowledgedZero 또는 !priceOcrFailed : 진짜 0원(사은품/이벤트) 이거나 사용자
              //       가 이미 확정한 경우. 부드러운 톤.
              //   (c) 그 외 (드문 경로): 기존 "확인 필요" 배지.
              (row.priceOcrFailed && !row.aiApplied ? (
                <ZeroPriceHint title="이 행의 가격 숫자가 흐릿하게 인식됐어요. 이미지에서 확인 후 직접 입력해 주세요.">
                  ⚠ 가격 인식 실패
                </ZeroPriceHint>
              ) : acknowledgedZeroIds.has(row.id) ? (
                <ZeroPriceHint
                  $acknowledged
                  title="0원으로 기록돼요. 다시 확인이 필요하면 되돌리기를 누르세요."
                >
                  0원으로 기록
                  <ZeroPriceAction
                    type="button"
                    onClick={() => revokeZero(row.id)}
                    aria-label="0원 확인 되돌리기"
                  >
                    되돌리기
                  </ZeroPriceAction>
                </ZeroPriceHint>
              ) : (
                <ZeroPriceHint title="사은품/이벤트 등으로 실제 0원이라면 '이대로 저장' 을 눌러 주세요.">
                  0원 · 확인 필요
                  <ZeroPriceAction
                    type="button"
                    onClick={() => acknowledgeZero(row.id)}
                    aria-label="0원 상품으로 이대로 저장"
                  >
                    이대로 저장
                  </ZeroPriceAction>
                </ZeroPriceHint>
              ))}
          </div>
          <div>
            <Input
              className="link"
              placeholder="URL (선택)"
              value={row.link ?? ""}
              onChange={(e) => patch(row.id, { link: e.target.value })}
            />
          </div>
          {/* 링크가 있으면 새 탭으로 열기 아이콘을 표시합니다.
              row.link 는 사용자/OCR 입력이라 sanitizeHref 로 검증 — 위험 스킴이면 버튼 자체를 숨겨
              `<a href="javascript:...">` 가 새지 않게 합니다. */}
          {(() => {
            const safeLink = sanitizeHref(row.link);
            return (
              <div style={{ display: "grid", placeItems: "center" }}>
                {safeLink ? (
                  <LinkButton
                    href={safeLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="새 탭으로 열기"
                  >
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3" />
                      <path d="M9 2h5v5" />
                      <path d="M14 2 8 8" />
                    </svg>
                  </LinkButton>
                ) : (
                  <span />
                )}
              </div>
            );
          })()}
          <div style={{ display: "grid", placeItems: "center" }}>
            <RemoveButton type="button" onClick={() => handleRemove(row.id)}>
              ×
            </RemoveButton>
          </div>
        </Row>
        );
      })}
      <AddRow type="button" onClick={handleAdd}>
        + 상품 직접 추가하기
      </AddRow>
    </Table>
  );
};
