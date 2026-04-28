/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Analysis\components\SubscriptionList.tsx
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import {
  Card,
  CardBd,
  CardFoot,
  CardHd,
  CardTitle,
} from "../../../components/primitives/Card";
import { Chip } from "../../../components/primitives/Chip";
import { tokens } from "../../../styles/tokens";
import { media } from "../../../tokens/breakpoints";
import { formatKRW } from "../../../utils/format";

/**
 * 정기결제 목록 항목의 분류 태그.
 *   - "subscription" : 사용자 명시(status="sub") 또는 가맹점 개념이 명확한 구독(넷플릭스 등)
 *                     또는 반복 패턴 자동 감지(2개월+ 동일 금액).
 *   - "utility"      : 공과금·통신비·보험 등 고정지출 개념. 1개월·1건이라도 인정.
 *   - "installment"  : 할부 결제 진행 중 (할부 승인/청구 행 포함).
 *   - "frequent"     : 같은 가맹점 3건 이상이지만 정기결제 패턴은 아닌 단골 구매.
 */
export type SubscriptionTagKind =
  | "subscription"
  | "utility"
  | "installment"
  | "frequent";

export interface SubscriptionItem {
  id: string;
  name: string;
  color: string;
  nextDate: string;
  /**
   * "월마다 빠지는 돈" 으로 표시할 금액. 일반 정기결제·공과금·할부 청구는 amount = 그대로,
   * 할부 승인(총액으로 들어온 케이스) 은 amount/installmentMonths 분할 추정값입니다.
   * KPI 합계도 이 값으로 합산되므로 표시와 합계가 같은 정의로 묶여 있습니다.
   */
  amount: number;
  /** 카드 형태의 분류 태그. 반복결제 탭에서 칩으로 노출. */
  tagKind: SubscriptionTagKind;
  /**
   * 할부 승인 행에서만 채워지는 보조 메타. UI 에서 "원금 ₩X · 할부 N개월" 함께 표시.
   * 일반 결제(구독/공과금/billing/frequent) 는 undefined.
   */
  installmentOriginalAmount?: number;
  installmentMonths?: number;
  /**
   * amount 가 "추정값" 인지 "실측값" 인지 표시.
   *  - true: 할부 승인의 amount/months 분할 추정 (이자 미포함, 실측 빌링 데이터 없음)
   *  - false: 실제 빌링 데이터가 있어 그 평균을 사용 (이자 포함, 정확)
   * UI 에서 "(추정)" 라벨을 조건부로 노출하기 위함.
   */
  isEstimated?: boolean;
  /**
   * 데이터 상으로 매월 반복 패턴이 확인됐는지 여부.
   *  - true: 같은 가맹점에서 2개월+ 결제 + 금액 ±15% 이내 일관 → "월별 반복 확인됨"
   *  - false: 1회 결제이거나 금액 변동 큼 → 신규 또는 변동성 항목
   * tagKind 와 별개로 동작. concept 으로 잡힌 항목이라도 데이터 검증되기 전까지는 false.
   */
  patternVerified?: boolean;
  /**
   * 그 달 가장 최근 결제 거래의 row.id. 항목 클릭 시 거래내역 페이지로 이동하면서
   * 검색창에 가맹점명을 자동 입력해 같은 가맹점 결제를 모두 보여 주기 위함입니다.
   */
  latestTxId?: string;
}

/**
 * 본문 스크롤 영역. 항목이 많아져도 카드가 무한히 길어지지 않도록 max-height 로 제한하고
 * overflow-y: auto 로 내부 스크롤. 다른 KPI/차트 카드들과 높이를 비슷하게 맞춰 페이지가
 * 깔끔하게 정렬되게 합니다(2026-04-28 사용자 요청).
 *
 * 모바일에서는 화면 자체가 좁아 max-height 를 살짝 줄이고, 데스크톱에선 5~6개 항목이
 * 한눈에 보이도록 ~340px 으로 잡았습니다.
 */
const ScrollArea = styled.div`
  max-height: 340px;
  overflow-y: auto;
  /*
   * 가로 스크롤 차단(2026-04-28). 좁은 카드에서 자식 그리드의 auto 컬럼(태그·금액) 이
   * 합쳐 카드 폭을 넘으면 가로 스크롤바가 떴어요. overflow-x: hidden 으로 강제 자르고,
   * Row 의 가맹점 컬럼이 ellipsis 로 자연스럽게 줄도록 함.
   */
  overflow-x: hidden;
  /* 스크롤 바가 행 위에 살짝 가려지지 않도록 우측 안쪽 여백. */
  padding-right: 4px;

  ${media.mobile} {
    max-height: 280px;
  }
`;

const List = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
`;

/*
 * 정기결제 카드의 각 행은 클릭 시 /subscriptions 전용 페이지로 이동하는 단축
 * 동선을 가집니다. 거래내역 테이블/홈 최근거래와 같은 tint 톤 hover 로 통일성을
 * 유지하고, cursor: pointer + button role 로 키보드/스크린리더 사용자도 같은
 * 동선을 잡을 수 있게 합니다. 행간 경계선은 hover 박스에 흡수되지 않도록
 * border-top 을 투명 처리해 한 덩어리로 떠오르는 인상을 줍니다.
 */
const Row = styled.li`
  display: grid;
  /* 28px 색칩 | 가맹점명+다음결제 | 태그 칩 | 금액 — 좁아지면 가맹점명 ellipsis 로 잘림. */
  grid-template-columns: 28px minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  margin: 0 -12px;
  border-radius: ${tokens.radius.control};
  cursor: pointer;
  outline: none;
  min-width: 0;

  & + & {
    border-top: 1px solid ${tokens.color.line2};
  }

  &:hover {
    background: ${tokens.color.tint};
    border-top-color: transparent;
  }
  &:hover + & {
    border-top-color: transparent;
  }

  /* 키보드 포커스만 강조(마우스 클릭에는 트리거되지 않음). RecentTransactions 와 동일 톤. */
  &:focus-visible {
    background: ${tokens.color.tint};
    border-top-color: transparent;
  }
  &:focus-visible + & {
    border-top-color: transparent;
  }
`;

const Icon = styled.div<{ $color: string }>`
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: ${({ $color }) => $color};
`;

/**
 * 가맹점명 + 다음결제 두 줄 컨테이너. 좁은 카드에서 한 줄에 안 들어오면 ellipsis 로 자름.
 */
const NameWrap = styled.div`
  min-width: 0;
`;

const Name = styled.div`
  color: ${tokens.color.ink1};
  font-size: 13.5px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Next = styled.div`
  color: ${tokens.color.ink4};
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Amount = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  /* max-width 제거 — 좁은 카드에서 auto 컬럼이 카드 폭 넘기던 가로 스크롤 회귀 차단. */
  color: ${tokens.color.ink1};
  font-family: ${tokens.font.mono};
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;

  > span:first-child {
    white-space: nowrap;
  }

  .original {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 3px 5px;
    font-size: 10.5px;
    font-weight: 500;
    line-height: 1.4;
    text-align: right;
    white-space: nowrap;

    .principal {
      /* 메인 금액과 색 분리: accentHover 짙은 인디고. 수입·지출 내역의 원금 톤과 통일. */
      color: ${tokens.color.accentHover};
      font-weight: 700;
    }

    .months {
      color: ${tokens.color.ink4};
    }
  }
`;

/** 메인 금액 옆 "(월 추정)" 라벨 — 수입·지출 내역과 동일 톤으로 통일. */
const EstimateHint = styled.span`
  margin-left: 4px;
  color: ${tokens.color.accent};
  font-family: ${tokens.font.sans};
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
`;

/**
 * 분류 태그 칩. SubscriptionTagKind 별로 다른 색을 써서 한눈에 구분되게 합니다.
 *  - subscription : 인디고 (정기결제)
 *  - utility      : 그린/cat2 (공과금/통신비/보험)
 *  - installment  : 앰버/warn (할부 결제)
 *  - frequent     : 회색 (자주 구매)
 */
const TagChip = styled.span<{ $kind: SubscriptionTagKind }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  white-space: nowrap;
  ${({ $kind }) => {
    if ($kind === "subscription") {
      return `background: ${tokens.color.tag.installment.bg}; color: ${tokens.color.tag.installment.fg};`;
    }
    if ($kind === "utility") {
      return `background: ${tokens.color.posBg}; color: ${tokens.color.pos};`;
    }
    if ($kind === "installment") {
      return `background: ${tokens.color.warnBg}; color: ${tokens.color.warn};`;
    }
    return `background: ${tokens.color.tint}; color: ${tokens.color.ink3};`;
  }}
`;

const TAG_LABEL: Record<SubscriptionTagKind, string> = {
  subscription: "정기결제",
  utility: "공과금",
  installment: "할부 결제",
  frequent: "자주 구매",
};

/**
 * 정기결제(status === "sub") 거래가 한 건도 없을 때 본문이 빈 박스로 보이지 않도록 띄우는 안내.
 * 푸터의 "이번 달 정기결제 합계 ₩0/월"만 떠 있으면 사용자는 카드 본문이 비어 있는지 데이터 누락인지
 * 분간이 안 됩니다.
 */
const EmptyState = styled.div`
  padding: 28px 12px;
  text-align: center;
  color: ${tokens.color.ink4};
  font-size: 12.5px;
  line-height: 1.55;
`;

/**
 * 카드 부제. "고정지출"의 가계부 뉘앙스를 보조 설명으로 살리되, 라벨·라우트는 코드베이스
 * 표준인 "정기결제"로 통일했습니다(2026-04-28 결정). 자세한 배경은 CLAUDE.md / 사이드바
 * 메뉴와 일치시키기 위함입니다.
 */
const Hint = styled.div`
  margin-bottom: 6px;
  color: ${tokens.color.ink4};
  font-size: 12px;
  line-height: 1.5;
`;

export interface SubscriptionListProps {
  items: SubscriptionItem[];
  total: number;
  /** 카드 제목. 기본 "반복결제". 분석 페이지에서 좁은 카드용으로 "정기결제" 등으로 override. */
  title?: string;
  /** 본문 상단 안내 한 줄. 기본은 "매월 고정으로 빠지는 결제 ..." */
  description?: string;
  /** 푸터 합계 라벨. 기본 "이번 달 반복결제 합계". */
  footerLabel?: string;
  /** 빈 상태 안내 첫 줄 / 둘째 줄. 화면별로 카피를 다르게 주고 싶을 때. */
  emptyTitle?: string;
  emptyBody?: string;
}

export const SubscriptionList: React.FC<SubscriptionListProps> = ({
  items,
  total,
  title = "반복결제",
  description = "매월 고정으로 빠지는 결제 · 항목을 누르면 거래내역에서 같은 가맹점 결제를 모두 보여줍니다.",
  footerLabel = "이번 달 반복결제 합계",
  emptyTitle = "아직 감지된 반복결제가 없어요.",
  emptyBody = "구독·공과금·보험·통신비·할부처럼 매월 고정으로 빠지는 결제가 쌓이면 여기에 모여요.",
}) => {
  const navigate = useNavigate();
  /**
   * 항목 클릭 동선 (2026-04-28 변경):
   * 거래내역으로 이동하면서 검색창에 가맹점명을 자동 입력합니다. 이러면 그 결제와 관련된
   * 모든 거래(과거·현재 회차 다)를 한눈에 볼 수 있고, "어떤 식으로 반복되고 있는지"를
   * 사용자가 직접 확인할 수 있습니다. 단일 거래 스크롤은 검색 결과로 충분히 좁혀지므로
   * 별도 scrollToTransactionId 동작은 떼어 냅니다.
   */
  const handleClick = (item: SubscriptionItem) => {
    navigate("/transactions", {
      state: { searchTransactionName: item.name },
    });
  };

  return (
    <Card>
      <CardHd>
        <CardTitle>{title}</CardTitle>
        <Chip $tone="info">자동 감지됨</Chip>
      </CardHd>
      <CardBd>
        {items.length === 0 ? (
          <EmptyState>
            {emptyTitle}
            <br />
            {emptyBody}
          </EmptyState>
        ) : (
          <>
            <Hint>{description}</Hint>
            <ScrollArea>
            <List>
              {items.map((item) => (
                <Row
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleClick(item)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleClick(item);
                    }
                  }}
                  aria-label={`${item.name} 결제 거래 보기`}
                >
                  <Icon $color={item.color} />
                  <NameWrap>
                    <Name title={item.name}>{item.name}</Name>
                    <Next>다음 결제 {item.nextDate}</Next>
                  </NameWrap>
                  <TagChip $kind={item.tagKind}>{TAG_LABEL[item.tagKind]}</TagChip>
                  <Amount>
                    <span>
                      {formatKRW(item.amount)}
                      {item.isEstimated ? (
                        <EstimateHint>(월 추정)</EstimateHint>
                      ) : (
                        "/월"
                      )}
                    </span>
                    {item.installmentOriginalAmount && item.installmentMonths ? (
                      <span className="original">
                        <span className="principal">
                          원금 {formatKRW(item.installmentOriginalAmount)}
                        </span>
                        <span className="months">· {item.installmentMonths}개월</span>
                      </span>
                    ) : null}
                  </Amount>
                </Row>
              ))}
            </List>
            </ScrollArea>
          </>
        )}
      </CardBd>
      <CardFoot>
        <span>{footerLabel}</span>
        <span
          className="tnum"
          style={{ fontWeight: 600, color: tokens.color.ink2, fontFamily: tokens.font.mono }}
        >
          {formatKRW(total)}/월
        </span>
      </CardFoot>
    </Card>
  );
};
