/**
 * 역할: CSV 파싱 결과 중 스토어에 반영될 행을 미리보기 테이블로 표시합니다.
 *       Transactions 페이지의 표와 동일한 톤을 유지해 시각적 일관성을 가집니다.
 * 위치: src\pages\CsvUpload\components\PreviewTable.tsx
 */
import React from "react";
import styled from "styled-components";
import { Tag } from "../../../components/primitives/Tag";
import { tokens } from "../../../styles/tokens";
import { media } from "../../../tokens/breakpoints";
import { formatKRW } from "../../../utils/format";
import { PLATFORM_LABELS } from "../../../constants/labels";
import type { TxRow } from "../../Transactions/components/TransactionTable";

const Table = styled.div`
  display: grid;
  grid-template-columns: 110px 110px 1fr 140px;
  font-size: 13px;

  ${media.tablet} {
    grid-template-columns: 96px 96px 1fr 132px;
  }
`;

/**
 * 거래명 셀 내부에서 제목 텍스트와 할부/일시불 태그를 함께 보여주기 위한 래퍼.
 * 제목이 길어지면 ellipsis 로 줄이되, 태그는 항상 우선 노출되도록 우측에 고정 배치합니다.
 * Transactions 테이블의 cardImport 태그(할부/billing)와 시각 가중치를 맞춥니다.
 */
const TitleCellInner = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;

  .title-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tags {
    display: flex;
    flex-shrink: 0;
    gap: 4px;
  }
`;

const HeaderCell = styled.div`
  padding: 10px 14px;
  background: ${tokens.color.foot};
  border-bottom: 1px solid ${tokens.color.line2};
  color: ${tokens.color.ink4};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;

  &.right {
    text-align: right;
  }
`;

const DataCell = styled.div<{ $right?: boolean }>`
  display: flex;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid ${tokens.color.line2};
  color: ${tokens.color.ink1};
  justify-content: ${({ $right }) => ($right ? "flex-end" : "flex-start")};
`;

const Amount = styled.span`
  color: ${tokens.color.ink1};
  font-family: ${tokens.font.mono};
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
`;

const Empty = styled.div`
  padding: 24px;
  color: ${tokens.color.ink4};
  text-align: center;
  font-size: 12px;
`;

export const PreviewTable: React.FC<{ rows: TxRow[] }> = ({ rows }) => {
  if (!rows || rows.length === 0) {
    return <Empty>반영 가능한 행이 없습니다.</Empty>;
  }

  return (
    <Table>
      <HeaderCell>주문일</HeaderCell>
      <HeaderCell>플랫폼</HeaderCell>
      <HeaderCell>거래명</HeaderCell>
      <HeaderCell className="right">금액</HeaderCell>
      {rows.slice(0, 20).map((row) => {
        // 데이터가 불완전해도 화면이 크래시되지 않도록 보장합니다.
        const platformKey = row.platform || "unspecified";
        const platformLabel = PLATFORM_LABELS[platformKey] || "미지정";
        const cardImport = row.detail?.cardImport;

        // 카드 청구내역(billing) 행이면 회차 정보(예: "할부 1/3회차")를 우선 노출하고,
        // 승인내역(approval)이라도 paymentMode 가 installment 이면 "할부 N개월" 태그를 보입니다.
        // Transactions 테이블의 동일 로직과 시각 가중치를 맞춰 사용자에게 일관된 경험을 제공합니다.
        const installmentTag: { kind: "billing" | "installment"; label: string } | null = (() => {
          if (!cardImport) return null;
          if (
            cardImport.recordKind === "billing" &&
            cardImport.installmentCurrentCycle &&
            cardImport.installmentCycleTotal
          ) {
            return {
              kind: "billing",
              label: `할부 ${cardImport.installmentCurrentCycle}/${cardImport.installmentCycleTotal}회차`,
            };
          }
          if (cardImport.paymentMode === "installment") {
            return {
              kind: "installment",
              label: cardImport.installmentMonths
                ? `할부 ${cardImport.installmentMonths}개월`
                : "할부",
            };
          }
          return null;
        })();

        const displayTitle = (row.title || "알 수 없음").trim();
        const displayDate = row.date || "0000.00.00";
        const absAmount = Math.abs(row.amount || 0);

        return (
          <React.Fragment key={row.id}>
            <DataCell>{displayDate}</DataCell>
            <DataCell>
              <Tag kind={platformKey}>{platformLabel}</Tag>
            </DataCell>
            <DataCell>
              <TitleCellInner>
                <span className="title-text">{displayTitle}</span>
                {installmentTag && (
                  <span className="tags">
                    <Tag kind={installmentTag.kind}>{installmentTag.label}</Tag>
                  </span>
                )}
              </TitleCellInner>
            </DataCell>
            <DataCell $right>
              <Amount>
                -{formatKRW(absAmount)}
              </Amount>
            </DataCell>
          </React.Fragment>
        );
      })}
      {rows.length > 20 && (
        <Empty
          style={{
            gridColumn: "1 / -1",
            borderBottom: "none",
            background: tokens.color.foot,
          }}
        >
          … 외 {rows.length - 20}건 (확정 시 전부 반영됩니다)
        </Empty>
      )}
    </Table>
  );
};
