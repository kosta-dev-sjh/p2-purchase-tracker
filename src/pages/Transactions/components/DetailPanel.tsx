/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Transactions\components\DetailPanel.tsx
 */
import React from "react";
import styled from "styled-components";
import { Card, CardBd, CardHd } from "../../../components/primitives/Card";
import { Tag } from "../../../components/primitives/Tag";
import { Button } from "../../../components/primitives/Button";
import { tokens } from "../../../styles/tokens";
import { formatKRW } from "../../../utils/format";
import type { TxRow } from "./TransactionTable";
import {
  CATEGORY_LABELS,
  PLATFORM_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
} from "../../../constants/labels";
import { useCategoryColorMap } from "../../../stores/categoriesStore";

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;

  .title {
    color: ${tokens.color.ink2};
    font-size: 13px;
    font-weight: 600;
  }

  .close {
    border: none;
    background: none;
    color: ${tokens.color.ink4};
    cursor: pointer;
    font-size: 16px;
  }
`;

const Tags = styled.div`
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
`;

const Title = styled.div`
  margin-bottom: 4px;
  color: ${tokens.color.ink1};
  font-size: 15px;
  font-weight: 600;
`;

const DateAmount = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 16px;

  .date {
    color: ${tokens.color.ink4};
    font-size: 12px;
  }

  .amount {
    color: ${tokens.color.ink1};
    font-family: ${tokens.font.mono};
    font-size: 16px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
`;

const Section = styled.div`
  padding: 12px 0;
  border-top: 1px solid ${tokens.color.line2};

  &:first-child {
    padding-top: 0;
    border-top: none;
  }

  .label {
    margin-bottom: 8px;
    color: ${tokens.color.ink4};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
`;

const ItemRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  padding: 6px 0;
  color: ${tokens.color.ink2};
  font-size: 13px;

  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .price {
    color: ${tokens.color.ink1};
    font-family: ${tokens.font.mono};
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
`;

/**
 * 상품에 link가 걸려있을 때만 노출되는 외부링크 아이콘 버튼입니다.
 * 새 탭으로 열어 탐색 흐름을 끊지 않고, 호버 시 accent 색으로 전환되어 클릭 가능성을 보여줍니다.
 */
const ItemLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.control};
  color: ${tokens.color.ink3};
  background: ${tokens.color.panel};
  transition:
    color ${tokens.motion.fast} ease,
    border-color ${tokens.motion.fast} ease,
    background ${tokens.motion.fast} ease;

  &:hover {
    color: ${tokens.color.accentHover};
    border-color: ${tokens.color.accentBorder};
    background: ${tokens.color.accentSubtle};
  }
`;

const ItemLinkPlaceholder = styled.span`
  display: inline-block;
  width: 24px;
  height: 24px;
`;

/**
 * 상품 합계가 거래 총 금액보다 작을 때 사용자에게 "이 상품 목록은 전부가 아니다"라는 사실을
 * 조용히 상기시켜 주는 힌트 배너입니다.
 * 저장 당시 사용자가 "이대로 등록"을 명시적으로 선택했을 때만 detail.itemsCoverage="partial"
 * 플래그가 붙어 이 배너가 노출됩니다. 단정적인 에러 톤(warn) 대신 부드러운 ink3 톤으로 두어,
 * "정보"에 가깝다는 걸 시각적으로도 전달합니다.
 */
const PartialNotice = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 10px;
  padding: 10px 12px;
  border: 1px dashed ${tokens.color.line};
  border-radius: ${tokens.radius.control};
  background: ${tokens.color.tint};
  color: ${tokens.color.ink3};
  font-size: 12px;
  line-height: 1.5;

  strong {
    color: ${tokens.color.ink2};
    font-weight: 700;
  }
`;

/**
 * 카테고리 칩은 표의 "분류" 컬럼처럼 색만 보여주는 대신,
 * 상세 패널에선 색 + 이름을 함께 노출해 의미가 한눈에 읽히게 합니다.
 * 여러 카테고리가 가로로 자연스럽게 줄바꿈될 수 있도록 flex-wrap을 씁니다.
 */
const CategoryList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const CategoryChip = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 8px;
  border: 1px solid ${tokens.color.line};
  border-radius: 999px;
  background: ${tokens.color.panel};
  color: ${tokens.color.ink2};
  font-size: 12px;
  font-weight: 600;

  &::before {
    content: "";
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: ${({ $color }) => $color};
    box-shadow: inset 0 0 0 1px rgba(16, 24, 40, 0.08);
  }
`;

/**
 * 메모는 사용자가 자유롭게 적은 문장이라 줄바꿈(preserve)과 긴 텍스트 랩이 둘 다 자연스러워야 합니다.
 * 배경은 panel보다 한 톤 눌러둔 subtle 계열을 써서 본문(Title/DateAmount)과 시각적으로 분리합니다.
 */
const MemoBody = styled.p`
  margin: 0;
  padding: 10px 12px;
  border: 1px solid ${tokens.color.line2};
  border-radius: ${tokens.radius.control};
  background: ${tokens.color.bg};
  color: ${tokens.color.ink2};
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
`;

const Actions = styled.div`
  display: grid;
  gap: 8px;
  margin-top: 4px;
`;

const LinkButton = styled.button`
  margin-top: 10px;
  border: none;
  background: transparent;
  padding: 0;
  color: ${tokens.color.accentHover};
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
`;

interface DetailPanelProps {
  row: TxRow;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenSource: () => void;
}

const DetailPanelInner = ({
  row,
  onClose,
  onEdit,
  onDelete,
  onOpenSource,
}: DetailPanelProps) => {
  // 카테고리 색은 설정 화면에서 사용자가 바꿀 수 있으므로 스토어에서 구독해 실시간으로 반영합니다.
  const categoryColorMap = useCategoryColorMap();
  // 메모는 빈 문자열/공백만 있는 경우 섹션을 숨겨, 불필요한 빈 박스가 패널을 지저분하게 만들지 않게 합니다.
  const memoText = row.memo?.trim() ?? "";
  const hasMemo = memoText.length > 0;
  const hasCategories = row.categories.length > 0;

  return (
    <Card padding={0}>
      <CardHd>
        <HeaderRow>
          <span className="title">거래 상세</span>
          <button className="close" type="button" onClick={onClose}>
            ×
          </button>
        </HeaderRow>
      </CardHd>
      <CardBd>
        <Tags>
          <Tag kind={row.platform}>{PLATFORM_LABELS[row.platform]}</Tag>
          <Tag kind={row.type === "expense" ? "expense" : "income"}>{TYPE_LABELS[row.type]}</Tag>
        </Tags>
        <Title>{row.title}</Title>
        <DateAmount>
          <span className="date">{row.date}</span>
          <span className="amount" style={{ color: row.amount > 0 ? tokens.color.pos : tokens.color.ink1 }}>
            {row.amount > 0 ? "+" : "-"}
            {formatKRW(Math.abs(row.amount))}
          </span>
        </DateAmount>

        {hasCategories && (
          <Section>
            <div className="label">카테고리</div>
            {/* 표에서는 좁은 컬럼 때문에 색 정사각형 + 툴팁으로 압축하지만,
                상세 패널은 공간에 여유가 있으므로 색 + 이름을 함께 드러내 한 번에 읽히게 합니다. */}
            <CategoryList>
              {row.categories.map((cat) => (
                <CategoryChip key={cat} $color={categoryColorMap[cat]}>
                  {CATEGORY_LABELS[cat]}
                </CategoryChip>
              ))}
            </CategoryList>
          </Section>
        )}

        {row.detail?.items.length ? (
          <Section>
            <div className="label">상품 목록</div>
            {row.detail.itemsCoverage === "partial" && (
              <PartialNotice>
                <span aria-hidden="true">ℹ️</span>
                <span>
                  <strong>상품 내역이 일부만 입력되어 있어요.</strong>
                  {" "}
                  저장 시 상품 합계가 총 금액보다 작아 누락된 항목이 있을 수 있습니다.
                </span>
              </PartialNotice>
            )}
            {row.detail.items.map((item, index) => (
              <ItemRow key={`${item.name}-${index}`}>
                <span className="name">{item.name}</span>
                <span className="price">{formatKRW(item.price)}</span>
                {item.link ? (
                  <ItemLink
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="상품 링크 열기"
                    aria-label={`${item.name} 상품 링크 새 탭으로 열기`}
                  >
                    <svg
                      width="12"
                      height="12"
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
                  </ItemLink>
                ) : (
                  <ItemLinkPlaceholder aria-hidden="true" />
                )}
              </ItemRow>
            ))}
          </Section>
        ) : null}

        <Section>
          <div className="label">거래 상태</div>
          <Tag kind={row.status}>{STATUS_LABELS[row.status]}</Tag>
        </Section>

        {hasMemo && (
          <Section>
            <div className="label">메모</div>
            {/* 사용자가 직접 입력한 자유 텍스트이므로 줄바꿈을 보존하고, 너무 긴 단어는 안전하게 쪼갭니다. */}
            <MemoBody>{memoText}</MemoBody>
          </Section>
        )}

        {row.detail?.source && (
          <Section>
            <div className="label">입력 방식</div>
            <Tag kind="purchase">{SOURCE_LABELS[row.detail.source]}</Tag>
          </Section>
        )}

        <Actions>
          <Button variant="primary" size="lg" block onClick={onEdit}>
            수정하기
          </Button>
          <Button variant="danger" size="lg" block onClick={onDelete}>
            거래 삭제
          </Button>
        </Actions>

        {row.detail?.source === "OCR" && (
          // 이전에는 OCR 편집 페이지로 이동시켰지만, 이 거래는 이미 파싱이 끝나 수정 모달로 편집되기 때문에
          // 편집 페이지 재방문은 불필요한 왕복이 됩니다. 대신 "분석에 사용된 원본 이미지만 보여 주기"로
          // 역할을 좁혀, 필요한 사용자는 캡쳐 원본을 한 번 더 확인할 수 있게 합니다.
          <LinkButton type="button" onClick={onOpenSource}>
            OCR 분석한 이미지 보기
          </LinkButton>
        )}
      </CardBd>
    </Card>
  );
};

export const DetailPanel = React.memo(DetailPanelInner);

DetailPanel.displayName = "DetailPanel";
