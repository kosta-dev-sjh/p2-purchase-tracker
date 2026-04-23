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
import type { OcrProduct } from "../data";

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

function toRow(p: OcrProduct): ProductRow {
  return { ...p, priceRaw: String(p.price) };
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
  return {
    id: row.id,
    name: row.name,
    price: row.priceRaw ? Number(row.priceRaw) : 0,
    link: row.link || undefined,
    ...(row.quantity !== undefined ? { quantity: row.quantity } : {}),
  };
}

export const ProductTable: React.FC<{
  products: OcrProduct[];
  /** 상품 목록이 변경될 때마다 부모에게 최신 목록을 올려줍니다. */
  onChange?: (products: OcrProduct[]) => void;
  fieldIdPrefix?: string;
}> = ({ products, onChange, fieldIdPrefix = "ocr-product" }) => {
  const [rows, setRows] = useState<ProductRow[]>(products.map(toRow));

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
  };

  const handleRemove = (id: string) => {
    setRowsAndNotify((current) => current.filter((row) => row.id !== id));
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
      {rows.map((row) => (
        <Row key={row.id}>
          <div>
            <Input
              id={`${fieldIdPrefix}-name-${row.id}`}
              value={row.name}
              onChange={(e) => patch(row.id, { name: e.target.value })}
            />
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
          </div>
          <div>
            <Input
              className="link"
              placeholder="URL (선택)"
              value={row.link ?? ""}
              onChange={(e) => patch(row.id, { link: e.target.value })}
            />
          </div>
          {/* 링크가 있으면 새 탭으로 열기 아이콘을 표시합니다 */}
          <div style={{ display: "grid", placeItems: "center" }}>
            {row.link ? (
              <LinkButton
                href={row.link}
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
          <div style={{ display: "grid", placeItems: "center" }}>
            <RemoveButton type="button" onClick={() => handleRemove(row.id)}>
              ×
            </RemoveButton>
          </div>
        </Row>
      ))}
      <AddRow type="button" onClick={handleAdd}>
        + 상품 직접 추가하기
      </AddRow>
    </Table>
  );
};
