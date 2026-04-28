/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 *       수동입력/거래편집 모달에서 상품 목록을 보여주고, 각 행에 "링크 이동" 버튼을 제공합니다.
 *       링크가 등록되어 있지 않으면 거래 플랫폼(쿠팡/네이버) 검색창으로 폴백합니다.
 * 위치: src\pages\ManualEntry\components\ProductRows.tsx
 */
import React from "react";
import styled from "styled-components";
import { tokens } from "../../../styles/tokens";
import type { TxPlatform } from "../../Transactions/components/TransactionTable";
import { PLATFORM_LABELS } from "../../../constants/labels";
import { resolveProductLink } from "../../../utils/productSearchUrl";

export interface ManualProduct {
  id: string;
  name: string;
  price: number;
  link?: string;
}

const Wrap = styled.div`
  margin-bottom: 16px;
  border-top: 1px solid ${tokens.color.line2};
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 120px 32px 50px 24px;
  gap: 12px;
  align-items: center;
  padding: 10px 4px;
  border-bottom: 1px solid ${tokens.color.line2};
  font-size: 13px;
`;

const Name = styled.span`
  color: ${tokens.color.ink1};
  font-weight: 500;
`;

const Price = styled.span`
  color: ${tokens.color.ink1};
  font-family: ${tokens.font.mono};
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: right;
`;

/**
 * 상품 링크/검색 버튼.
 * - $fallback=false: 사용자가 등록한 진짜 링크. accent 색으로 강조.
 * - $fallback=true: 링크 미등록 → 거래 플랫폼 검색으로 폴백. 점선 테두리 + 톤다운으로
 *   "이건 검색 보조 링크" 임을 시각적으로 구분합니다.
 * 36px → 32px 로 살짝 줄여 grid 의 50/24 컬럼과 시각적 균형을 유지합니다.
 */
const LinkIconButton = styled.button<{ $fallback?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin: 0 auto;
  border: 1px ${({ $fallback }) => ($fallback ? "dashed" : "solid")}
    ${({ $fallback }) =>
      $fallback ? tokens.color.line : tokens.color.accentBorder};
  border-radius: ${tokens.radius.control};
  background: ${({ $fallback }) =>
    $fallback ? tokens.color.panel : tokens.color.accentSubtle};
  color: ${({ $fallback }) =>
    $fallback ? tokens.color.ink4 : tokens.color.accentHover};
  cursor: pointer;
  transition:
    color ${tokens.motion.fast} ease,
    border-color ${tokens.motion.fast} ease,
    background ${tokens.motion.fast} ease;

  &:hover {
    color: ${tokens.color.accentActive};
    border-color: ${tokens.color.accent};
    background: #e5e8ff;
  }
`;

const EditButton = styled.button`
  border: none;
  background: none;
  color: ${tokens.color.ink3};
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  transition: color ${tokens.motion.fast} ease;

  &:hover {
    color: ${tokens.color.accentHover};
  }
`;

const RemoveButton = styled.button`
  border: none;
  background: none;
  color: ${tokens.color.ink4};
  cursor: pointer;
  font-size: 16px;

  &:hover {
    color: ${tokens.color.neg};
  }
`;

const Empty = styled.div`
  padding: 20px 4px;
  color: ${tokens.color.ink4};
  text-align: center;
  font-size: 12px;
`;

interface ProductRowsProps {
  products: ManualProduct[];
  /**
   * 거래 플랫폼. 링크 미등록 상품의 검색 fallback URL 을 만들 때 쓰입니다.
   * 수동입력 화면처럼 플랫폼이 아직 정해지지 않은 컨텍스트에서는 "unspecified" 또는 미전달을 허용합니다(네이버쇼핑 폴백).
   */
  platform?: TxPlatform;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}

export const ProductRows: React.FC<ProductRowsProps> = ({
  products,
  platform,
  onEdit,
  onRemove,
}) => (
  <Wrap>
    {products.length === 0 ? (
      <Empty>아직 등록된 상품이 없어요.</Empty>
    ) : (
      products.map((product) => {
        // 링크가 있으면 그대로, 없으면 거래 플랫폼 검색 URL 로 폴백.
        const { href, isFallback } = resolveProductLink(product.link, platform, product.name);
        const platformLabel = PLATFORM_LABELS[platform ?? "unspecified"];
        return (
          <Row key={product.id}>
            <Name>{product.name}</Name>
            <Price>₩{product.price.toLocaleString("ko-KR")}</Price>
            <LinkIconButton
              type="button"
              $fallback={isFallback}
              title={
                isFallback
                  ? `${platformLabel}에서 "${product.name}" 검색`
                  : "등록된 상품 링크 열기"
              }
              aria-label={
                isFallback
                  ? `${product.name} 을(를) ${platformLabel} 에서 검색합니다. 새 탭으로 열림`
                  : `${product.name} 상품 링크 새 탭으로 열기`
              }
              onClick={() => {
                window.open(href, "_blank", "noopener,noreferrer");
              }}
            >
              {isFallback ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="7" cy="7" r="5" />
                  <path d="M11 11l3 3" />
                </svg>
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9.5 2.5H13.5V6.5" />
                  <path d="M13.5 2.5L7 9" />
                  <path d="M12.5 9.5v3a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3" />
                </svg>
              )}
            </LinkIconButton>
            <EditButton type="button" onClick={() => onEdit(product.id)}>
              수정
            </EditButton>
            <RemoveButton type="button" onClick={() => onRemove(product.id)}>
              ×
            </RemoveButton>
          </Row>
        );
      })
    )}
  </Wrap>
);
