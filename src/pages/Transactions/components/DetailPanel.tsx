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
  PLATFORM_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
} from "../../../constants/labels";
import { useCategoryColorMap, useCategoriesStore } from "../../../stores/categoriesStore";
import { getCardInstallmentKind, getCardInstallmentLabel } from "../../../utils/cardInstallment";
import { resolveProductLink } from "../../../utils/productSearchUrl";

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
 * 상품 행 우측의 외부링크 아이콘 버튼.
 *
 * 두 가지 상태를 지원합니다.
 * - $fallback=false: 사용자가 등록한 진짜 상품 링크가 걸려 있는 경우. accent 색으로 강조.
 * - $fallback=true: 링크 미등록이라 플랫폼 검색창으로 폴백된 경우. 톤다운 + 점선 테두리로
 *   "이건 등록된 링크가 아니라 검색 보조" 라는 점을 시각적으로 구분합니다.
 *   클릭 시 상품명으로 그 거래의 플랫폼(쿠팡/네이버) 검색 결과 페이지가 열립니다.
 */
const ItemLink = styled.a<{ $fallback?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px ${({ $fallback }) => ($fallback ? "dashed" : "solid")}
    ${({ $fallback }) =>
      $fallback ? tokens.color.line : tokens.color.accentBorder};
  border-radius: ${tokens.radius.control};
  color: ${({ $fallback }) =>
    $fallback ? tokens.color.ink4 : tokens.color.accentHover};
  background: ${({ $fallback }) =>
    $fallback ? tokens.color.panel : tokens.color.accentSubtle};
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
 * 접힌 주문(folded) 안내 — DetailPanel 버전. OcrEdit 의 FoldedBanner 와 동일한 정보를
 * 거래 상세에서도 일관되게 보여주기 위해 같은 시각 톤(tint + ink3 dashed)으로 통일했습니다.
 * 구현은 화면이 다르므로 컴포넌트는 분리되어 있지만, 사용자 입장에서 "어디서 보든 같은
 * 모양으로 같은 의미" 를 받게 만드는 것이 목적입니다(strategy doc §12-5).
 */
const FoldedNotice = styled.div`
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
 * "상품합계 / 차감액 / 최종 거래금액" 분해 표시 영역.
 *
 * 정책: docs/Naver_OCR_Parsing_Strategy.md §12-3 — 차감액을 별도 슬롯으로 보존해야 사용자가
 * "왜 상품합계와 결제 금액이 다른지" 를 사후에 다시 확인할 수 있습니다. 단순 amount 한 줄로는
 * 그 정보가 사라집니다.
 *
 * 차감액이 0/없으면 이 영역 자체가 렌더되지 않습니다(노이즈 방지).
 */
const AmountBreakdown = styled.div`
  display: grid;
  gap: 4px;
  margin-top: 6px;
  padding: 8px 10px;
  border: 1px solid ${tokens.color.line2};
  border-radius: ${tokens.radius.control};
  background: ${tokens.color.bg};
  color: ${tokens.color.ink3};
  font-size: 12px;
  line-height: 1.45;

  .row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-variant-numeric: tabular-nums;
  }

  .row.minus {
    color: ${tokens.color.neg};
  }

  .row.total {
    margin-top: 4px;
    padding-top: 6px;
    border-top: 1px dashed ${tokens.color.line2};
    color: ${tokens.color.ink1};
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

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 8px 12px;

  .key {
    color: ${tokens.color.ink4};
    font-size: 12px;
  }

  .value {
    color: ${tokens.color.ink2};
    font-size: 13px;
    font-weight: 600;
  }
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
  // 카테고리 색상과 이름은 설정 화면에서 변경할 수 있으므로 스토어에서 구독해 실시간으로 반영합니다.
  const categoryColorMap = useCategoryColorMap();
  const storeCategories = useCategoriesStore();
  const getCategoryName = (id: string): string =>
    storeCategories.find((c) => c.id === id)?.name ?? id;
  // 메모는 빈 문자열/공백만 있는 경우 섹션을 숨겨, 불필요한 빈 박스가 패널을 지저분하게 만들지 않게 합니다.
  const memoText = row.memo?.trim() ?? "";
  const hasMemo = memoText.length > 0;
  const hasCategories = row.categories.length > 0;
  const cardImport = row.detail?.cardImport;
  const installmentKind = getCardInstallmentKind(cardImport);
  const installmentLabel = getCardInstallmentLabel(cardImport);
  const isInstallment =
    installmentKind === "installment_billing" ||
    installmentKind === "installment_approval";

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
          {isInstallment ? (
            <Tag kind="installment">{installmentLabel ?? "할부"}</Tag>
          ) : installmentKind === "lump_sum" ? (
            <Tag kind="purchase">일시불</Tag>
          ) : null}
        </Tags>
        <Title>{row.title}</Title>
        <DateAmount>
          <span className="date">{row.date}</span>
          <span className="amount" style={{ color: row.amount > 0 ? tokens.color.pos : tokens.color.ink1 }}>
            {row.amount > 0 ? "+" : "-"}
            {formatKRW(Math.abs(row.amount))}
          </span>
        </DateAmount>

        {/*
         * 차감액이 있는 거래는 "상품합계 / 차감액 / 최종 거래금액" 3 줄로 분해해 보여줍니다.
         * 상품합계는 amount + discount 로 역산 — 저장 시점에 amount 가 이미 차감 후 값으로
         * 들어와 있기 때문(OcrEdit/buildCandidateFromOrder 의 deriveOrderTotal 결과를 그대로 사용).
         * folded 거래는 base 가 sectionTotal 이지만, 거래 상세에서는 사용자에게 보여줄 단일
         * 라벨이 필요하므로 일반 주문은 "상품 합계", folded 는 "결제 섹션 합계" 로 분기합니다.
         */}
        {(() => {
          const discount = row.detail?.discountAmount ?? 0;
          if (!(discount > 0)) return null;
          const finalAmount = Math.abs(row.amount);
          const baseAmount = finalAmount + discount;
          const baseLabel = row.detail?.folded ? "결제 섹션 합계" : "상품 합계";
          return (
            <AmountBreakdown aria-label="거래금액 분해">
              <div className="row">
                <span>{baseLabel}</span>
                <span>{formatKRW(baseAmount)}</span>
              </div>
              <div className="row minus">
                <span>주문단위 차감액</span>
                <span>-{formatKRW(discount)}</span>
              </div>
              <div className="row total">
                <span>최종 거래금액</span>
                <span>{formatKRW(finalAmount)}</span>
              </div>
            </AmountBreakdown>
          );
        })()}

        {row.detail?.folded && (
          /*
           * 거래 상세에서 "이 거래는 접힌 주문에서 저장됐다" 는 사실을 한 번 더 알리는 안내.
           * 상품 목록이 있어도 일부만 보일 수 있고, hiddenItemCount 가 있으면 함께 명시합니다.
           */
          <FoldedNotice role="status" aria-live="polite">
            <span aria-hidden="true">🔒</span>
            <span>
              <strong>접힌 주문 · 상세 미확인</strong>
              {typeof row.detail.hiddenItemCount === "number" &&
                row.detail.hiddenItemCount > 0 &&
                ` · 외 ${row.detail.hiddenItemCount}건 숨김`}
              <div style={{ marginTop: 4 }}>
                네이버에서 펼쳐지지 않은 주문이라 상품 상세가 일부만 저장됐을 수 있어요.
                결제 섹션 합계는 별도로 보존돼 있고, 차감액은 거래금액에 이미 반영돼 있습니다.
              </div>
            </span>
          </FoldedNotice>
        )}

        {hasCategories && (
          <Section>
            <div className="label">카테고리</div>
            {/* 표에서는 좁은 컬럼 때문에 색 정사각형 + 툴팁으로 압축하지만,
                상세 패널은 공간에 여유가 있으므로 색 + 이름을 함께 드러내 한 번에 읽히게 합니다. */}
            <CategoryList>
              {row.categories.map((cat) => (
                <CategoryChip key={cat} $color={categoryColorMap[cat]}>
                  {getCategoryName(cat)}
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
            {row.detail.items.map((item, index) => {
              // 사용자가 링크를 직접 달지 않은 상품은 거래 플랫폼(쿠팡/네이버) 검색창으로 폴백.
              // 미지정 플랫폼이면 네이버쇼핑으로 보내 줍니다(productSearchUrl 정책).
              const { href, isFallback } = resolveProductLink(item.link, row.platform, item.name);
              const platformLabel = PLATFORM_LABELS[row.platform];
              return (
                <ItemRow key={`${item.name}-${index}`}>
                  <span className="name">{item.name}</span>
                  <span className="price">{formatKRW(item.price)}</span>
                  <ItemLink
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    $fallback={isFallback}
                    title={
                      isFallback
                        ? `${platformLabel}에서 "${item.name}" 검색`
                        : "등록된 상품 링크 열기"
                    }
                    aria-label={
                      isFallback
                        ? `${item.name} 을(를) ${platformLabel} 에서 검색합니다. 새 탭으로 열림`
                        : `${item.name} 상품 링크 새 탭으로 열기`
                    }
                  >
                    {/*
                     * 외부 링크(↗) 박스 아이콘. fallback / 정식링크 모두 같은 모양을 쓰고,
                     * 의미 차이는 ItemLink 의 테두리(dashed↔solid)·배경·색으로 구분합니다.
                     * 이전에 fallback 은 돋보기 아이콘이었지만, "상품 바로가기" 라는 의미가
                     * 사용자에겐 검색이 아니라 "그 상품 페이지로 이동" 으로 읽히도록
                     * 박스 모양 외부링크 버튼으로 통일했습니다.
                     */}
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
                  </ItemLink>
                </ItemRow>
              );
            })}
          </Section>
        ) : null}

        <Section>
          <div className="label">거래 상태</div>
          <Tag kind={row.status}>{STATUS_LABELS[row.status]}</Tag>
        </Section>

        {cardImport && (
          <Section>
            <div className="label">결제 정보</div>
            <InfoGrid>
              <div className="key">결제방식</div>
              <div className="value">
                {isInstallment
                  ? "할부"
                  : installmentKind === "lump_sum"
                      ? "일시불"
                      : "미기록"}
              </div>
              {isInstallment && cardImport.installmentMonths ? (
                <>
                  <div className="key">총 할부기간</div>
                  <div className="value">{cardImport.installmentMonths}개월</div>
                </>
              ) : null}
              {/*
               * "현재 회차 X/Y" 행은 의도적으로 표시하지 않습니다(2026-04-28).
               * 입력 경로(수동입력 / CSV) 마다 회차 캡처율이 들쭉날쭉해 같은 데이터셋에서
               * 어떤 거래는 회차가 보이고 어떤 건 안 보이는 일관성 문제가 있었습니다.
               * 회차 자체는 cardImport 에 남아 있을 수 있어 호환성은 유지됩니다.
               */}
              {cardImport.approvedAmount ? (
                <>
                  <div className="key">{isInstallment ? "원 결제금액" : "결제금액"}</div>
                  <div className="value">{formatKRW(cardImport.approvedAmount)}</div>
                </>
              ) : null}
              {cardImport.billedAmount ? (
                <>
                  <div className="key">이번 달 반영금액</div>
                  <div className="value">{formatKRW(cardImport.billedAmount)}</div>
                </>
              ) : null}
              {cardImport.remainingBalance ? (
                <>
                  <div className="key">남은 잔액</div>
                  <div className="value">{formatKRW(cardImport.remainingBalance)}</div>
                </>
              ) : null}
              {cardImport.dueDate ? (
                <>
                  <div className="key">결제예정일</div>
                  <div className="value">{cardImport.dueDate}</div>
                </>
              ) : null}
            </InfoGrid>
          </Section>
        )}

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
            분석한 캡처 보기
          </LinkButton>
        )}
      </CardBd>
    </Card>
  );
};

export const DetailPanel = React.memo(DetailPanelInner);

DetailPanel.displayName = "DetailPanel";
