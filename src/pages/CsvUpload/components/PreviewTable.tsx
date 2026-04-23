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
  if (rows.length === 0) {
    return <Empty>반영 가능한 행이 없습니다.</Empty>;
  }

  return (
    <Table>
      <HeaderCell>주문일</HeaderCell>
      <HeaderCell>플랫폼</HeaderCell>
      <HeaderCell>거래명</HeaderCell>
      <HeaderCell className="right">금액</HeaderCell>
      {rows.slice(0, 20).map((row) => (
        <React.Fragment key={row.id}>
          <DataCell>{row.date}</DataCell>
          <DataCell>
            <Tag kind={row.platform}>{PLATFORM_LABELS[row.platform]}</Tag>
          </DataCell>
          <DataCell>{row.title}</DataCell>
          <DataCell $right>
            <Amount>
              -{formatKRW(Math.abs(row.amount))}
            </Amount>
          </DataCell>
        </React.Fragment>
      ))}
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
