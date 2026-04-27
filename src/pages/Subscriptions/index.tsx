/**
 * 역할: "정기결제" 전용 페이지의 진입 컴포넌트.
 *       분석 페이지의 SubscriptionList 카드를 더 풍성하게 펼쳐 보여주는 화면입니다.
 *       - KPI 스트립: 이번 달 합계 / 전월 대비 / 항목 수
 *       - 전체 목록: buildSubscriptions(rows, month, Infinity) 결과 그대로
 *
 *       정기결제 자동 탐지 로직(status='sub' + concept 휴리스틱 + 월간 반복) 자체는
 *       Analysis/data.ts 의 buildSubscriptions 단일 진실원을 재사용합니다 — 두 화면 사이에
 *       탐지 결과가 어긋나지 않도록 하기 위함입니다.
 *
 * 위치: src/pages/Subscriptions/index.tsx
 */
import React, { useMemo, useState } from "react";
import styled from "styled-components";
import { AppShell } from "../../components/layout/AppShell";
import { MonthPicker } from "../../components/primitives/MonthPicker";
import { Card, CardBd, CardHd, CardTitle } from "../../components/primitives/Card";
import { Chip } from "../../components/primitives/Chip";
import { tokens } from "../../styles/tokens";
import { media } from "../../tokens/breakpoints";
import { useTransactionsStore } from "../../stores/transactionsStore";
import { buildSubscriptions } from "../Analysis/data";
import {
  computeMaxMonthKey,
  computeMinYear,
  getCurrentMonthKey,
  getPrevMonthKey,
} from "../../constants/months";
import { formatKRW } from "../../utils/format";

/**
 * KPI 카드 3개를 가로로 배치하는 스트립.
 * 모바일에서는 2열 그리드(가로 좁음 → 1열) 로 자연스럽게 줄어듭니다.
 */
const KpiStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;

  ${media.tablet} {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  ${media.mobile} {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
`;

const KpiCard = styled.div`
  padding: 14px 16px;
  background: ${tokens.color.panel};
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.card};

  .label {
    color: ${tokens.color.ink4};
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .value {
    margin-top: 6px;
    color: ${tokens.color.ink1};
    font-family: ${tokens.font.mono};
    font-size: 18px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .delta {
    margin-top: 4px;
    font-size: 11.5px;
    font-weight: 600;
  }

  .delta--up {
    color: ${tokens.color.neg};
  }

  .delta--down {
    color: ${tokens.color.pos};
  }

  .delta--flat {
    color: ${tokens.color.ink4};
  }

  ${media.mobile} {
    padding: 10px 12px;

    .label {
      font-size: 10.5px;
    }

    .value {
      font-size: 15px;
    }

    .delta {
      font-size: 10.5px;
    }
  }
`;

/**
 * 정기결제 한 줄. SubscriptionList 의 행과 시각 톤을 일치시키되,
 * 전용 페이지에서는 좌측 색 칩이 조금 더 도드라지고 우측 금액 폭을 넉넉히 잡았습니다.
 */
const ListBody = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
`;

const Row = styled.li`
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px 0;

  & + & {
    border-top: 1px solid ${tokens.color.line2};
  }
`;

const Icon = styled.span<{ $color: string }>`
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: ${({ $color }) => $color};
`;

const NameCol = styled.div`
  min-width: 0;

  .name {
    color: ${tokens.color.ink1};
    font-size: 13.5px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .next {
    margin-top: 2px;
    color: ${tokens.color.ink4};
    font-size: 11.5px;
  }
`;

const AmountCol = styled.div`
  color: ${tokens.color.ink1};
  font-family: ${tokens.font.mono};
  font-size: 13.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;

const EmptyState = styled.div`
  padding: 36px 16px;
  text-align: center;
  color: ${tokens.color.ink4};
  font-size: 13px;
  line-height: 1.6;

  strong {
    display: block;
    margin-bottom: 6px;
    color: ${tokens.color.ink2};
    font-size: 14px;
    font-weight: 700;
  }
`;

/**
 * KPI 영역의 "전월 대비" 라벨/색을 결정. 변화량이 미미하면(±1%) flat 으로 두어
 * 작은 노이즈가 시각적으로 강조되지 않도록 합니다.
 */
function deltaInfo(current: number, prev: number): {
  label: string;
  modifier: "up" | "down" | "flat";
} {
  if (prev === 0 && current === 0) return { label: "변동 없음", modifier: "flat" };
  if (prev === 0) return { label: "신규", modifier: "up" };
  const diff = current - prev;
  const ratio = diff / prev;
  if (Math.abs(ratio) < 0.01) return { label: "변동 없음", modifier: "flat" };
  const sign = diff > 0 ? "+" : "−";
  return {
    label: `${sign}${formatKRW(Math.abs(diff))} (${(Math.abs(ratio) * 100).toFixed(0)}%)`,
    modifier: diff > 0 ? "up" : "down",
  };
}

export const SubscriptionsPage: React.FC = () => {
  const [month, setMonth] = useState(() => getCurrentMonthKey());
  const rows = useTransactionsStore();

  // MonthPicker 상하한 계산은 Analysis/Home 과 동일 패턴.
  const pickerMinYear = useMemo(
    () => computeMinYear(rows.map((row) => row.date)),
    [rows],
  );
  const pickerMaxMonth = useMemo(
    () => computeMaxMonthKey(rows.map((row) => row.date)),
    [rows],
  );
  // 거래가 1건이라도 있는 달을 마커로 표시(앰버 톤).
  const markedMonthKeys = useMemo(() => {
    const monthKeys = rows
      .map((row) => {
        const match = row.date.match(/(\d{4})[./-](\d{1,2})/);
        if (!match) return "";
        return `${match[1]}-${match[2].padStart(2, "0")}`;
      })
      .filter(Boolean);
    return Array.from(new Set(monthKeys));
  }, [rows]);

  // 전월 대비 비교를 위해 이번 달과 지난 달 모두 풀 목록으로 빌드.
  // 상위 5개 자르기는 전용 페이지에서는 의미가 없어 Infinity 를 넘깁니다.
  const current = useMemo(
    () => buildSubscriptions(rows, month, Infinity),
    [rows, month],
  );
  const previous = useMemo(
    () => buildSubscriptions(rows, getPrevMonthKey(month), Infinity),
    [rows, month],
  );

  const itemCount = current.items.length;
  const delta = useMemo(
    () => deltaInfo(current.total, previous.total),
    [current.total, previous.total],
  );

  return (
    <AppShell
      activeNav="subscriptions"
      crumb="정기결제"
      title="정기결제 관리"
      headerRight={
        <MonthPicker
          value={month}
          onChange={setMonth}
          minYear={pickerMinYear}
          maxMonthKey={pickerMaxMonth}
          markedMonthKeys={markedMonthKeys}
        />
      }
    >
      <KpiStrip>
        <KpiCard>
          <div className="label">이번 달 합계</div>
          <div className="value">{formatKRW(current.total)}</div>
          <div className={`delta delta--${delta.modifier}`}>
            전월 대비 {delta.label}
          </div>
        </KpiCard>
        <KpiCard>
          <div className="label">활성 항목</div>
          <div className="value">{itemCount}건</div>
          <div className="delta delta--flat">자동 감지 + 'sub' 태그</div>
        </KpiCard>
        <KpiCard>
          <div className="label">평균 항목당</div>
          <div className="value">
            {itemCount > 0
              ? formatKRW(Math.round(current.total / itemCount))
              : formatKRW(0)}
          </div>
          <div className="delta delta--flat">이번 달 기준</div>
        </KpiCard>
      </KpiStrip>

      <Card>
        <CardHd>
          <CardTitle>정기결제 목록</CardTitle>
          {/*
           * "자동 감지" 칩으로 사용자에게 "이건 직접 sub 로 표시한 것 + 휴리스틱으로 잡힌 것
           * 둘 다 섞여 있다" 를 짚어줍니다. 잘못 잡힌 항목은 거래 상세에서 status 를 바꾸면
           * 다음 새로고침에 빠집니다(분석 페이지와 동일 정책).
           */}
          <Chip $tone="info">자동 감지됨</Chip>
        </CardHd>
        <CardBd>
          {itemCount === 0 ? (
            <EmptyState>
              <strong>아직 감지된 정기결제가 없어요.</strong>
              매달 빠지는 통신비·구독·공과금·보험이 쌓이거나, 거래에서 상태를
              <span style={{ margin: "0 4px", color: tokens.color.accent, fontWeight: 700 }}>
                정기결제
              </span>
              로 표시하면 여기에 모여요.
            </EmptyState>
          ) : (
            <ListBody>
              {current.items.map((item) => (
                <Row key={item.id}>
                  <Icon $color={item.color} aria-hidden />
                  <NameCol>
                    <div className="name">{item.name}</div>
                    <div className="next">
                      {item.nextDate ? `다음 결제 ${item.nextDate}` : "결제일 미상"}
                    </div>
                  </NameCol>
                  <AmountCol>{formatKRW(item.amount)}/월</AmountCol>
                </Row>
              ))}
            </ListBody>
          )}
        </CardBd>
      </Card>
    </AppShell>
  );
};
