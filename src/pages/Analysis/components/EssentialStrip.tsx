/**
 * 역할: 분석 페이지 "가계부 필수 항목" 4종 합계 스트립.
 *       공과금·관리비·교육비·정기결제 4가지 흐름은 가계부 사용자가 따로 추적하고 싶다는
 *       피드백(2026-04-28) 으로 별도 섹션 카드로 노출합니다. 카테고리별 지출과 별도 — 거기엔
 *       8+ 카테고리가 한꺼번에 잡혀 있어서, "고정 흐름 핵심 4가지" 라는 시선이 뭉쳐지지 않아요.
 *
 * 디자인 변경 이력:
 *   - 1차(좌측 4px strip + bold 숫자): "디버그용 같다" 피드백 → 폐기.
 *   - 2차(현재): 항목별 옅은 라벤더/그린/앰버 배경 + 아이콘 + soft pill — KpiStrip 카드와
 *     같은 패널 톤(panel) 위에 작은 색 칩을 올린 형태. 강한 보더선·strip 색은 모두 제거해
 *     "분석 페이지의 다른 카드들과 같은 가족" 으로 보이게.
 *
 * 위치: src/pages/Analysis/components/EssentialStrip.tsx
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { Card, CardBd, CardHd, CardSub, CardTitle } from "../../../components/primitives/Card";
import { tokens } from "../../../styles/tokens";
import { media } from "../../../tokens/breakpoints";
import { formatKRW } from "../../../utils/format";
import type { EssentialBucket } from "../data";

const Strip = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;

  ${media.tablet} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  ${media.mobile} {
    grid-template-columns: 1fr;
    gap: 10px;
  }
`;

/*
 * 항목별 톤 — 강한 색 strip 대신 옅은 배경 + 아이콘 색만 입혀 카드의 시각 노이즈를 줄였습니다.
 *  - utility:     라벤더 (인디고 패밀리, 공과금 = 정기성 흐름)
 *  - maintenance: 옅은 그린 (관리비 = 거주 비용)
 *  - education:   옅은 앰버 (교육비 = 자기계발 톤)
 *  - subscription: 라벤더 strong (정기결제 = 인디고 accent 와 통일)
 *
 * 배경/아이콘 색은 "이미 정해진 토큰 팔레트(accentSubtle/posBg/markerBg/tint)" 에서만 가져와
 * 다른 카드들과 톤이 어긋나지 않게 합니다.
 */
interface ItemStyle {
  iconBg: string;
  iconFg: string;
  // 인라인 svg 패스 — lucide 라이트 톤 직접 그려넣기 (외부 deps 없이 일관성).
  icon: React.ReactNode;
}

const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const ITEM_STYLE: Record<EssentialBucket["key"], ItemStyle> = {
  utility: {
    iconBg: tokens.color.accentSubtle,
    iconFg: tokens.color.accentHover,
    // 번개(공과금/전기 의미). 보편적이고 읽기 쉬운 메타포.
    icon: (
      <svg {...ICON_PROPS}>
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  maintenance: {
    iconBg: tokens.color.posBg,
    iconFg: tokens.color.pos,
    // 집(관리비). 아파트/오피스텔 거주 비용 메타포.
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z" />
      </svg>
    ),
  },
  education: {
    iconBg: tokens.color.markerBg,
    iconFg: tokens.color.markerFg,
    // 책(교육비). 학원/도서/강의 모두 포괄.
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  subscription: {
    iconBg: tokens.color.accentSubtle,
    iconFg: tokens.color.accent,
    // 회전 화살표(반복 청구).
    icon: (
      <svg {...ICON_PROPS}>
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    ),
  },
};

/*
 * 카드 클릭 동선(2026-04-28 사용자 피드백): 항목을 누르면 거래내역 페이지로 이동하면서
 * 해당 카테고리(또는 상태) 로 필터를 적용해 곧바로 그 분류의 거래만 보여 줍니다.
 *
 * 시각적으로는 평범한 카드처럼 보이되 button 으로 만들어 키보드 포커스/엔터까지 받게.
 */
const ItemCard = styled.button`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  background: ${tokens.color.panel};
  border: 1px solid ${tokens.color.line2};
  border-radius: ${tokens.radius.control};
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  color: inherit;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;

  &:hover {
    border-color: ${tokens.color.line};
    background: ${tokens.color.bg};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${tokens.shadow.focus};
  }
  &:active {
    transform: scale(0.997);
  }
`;

const Head = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const IconCircle = styled.span<{ $bg: string; $fg: string }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border-radius: 8px;
  background: ${({ $bg }) => $bg};
  color: ${({ $fg }) => $fg};
`;

const Label = styled.span`
  color: ${tokens.color.ink2};
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: -0.01em;
`;

const Value = styled.div`
  color: ${tokens.color.ink1};
  font-family: ${tokens.font.mono};
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
`;

const Meta = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  color: ${tokens.color.ink4};
  font-size: 11.5px;

  /*
   * "전월 대비" 와 같이 chip 의 의미를 풀어주는 prefix 텍스트(2026-04-28).
   * 사용자 피드백: chip 만 있으면 "+106% 가 무엇 대비인지" 안 들어옴 → ink4 보조 톤으로
   * "전월 대비" 를 항상 같이 노출해 chip 의 비교 기준이 명확해지게.
   */
  .compare-label {
    color: ${tokens.color.ink4};
  }
`;

const DeltaChip = styled.span<{ $tone: "up" | "down" | "flat" }>`
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  background: ${({ $tone }) =>
    $tone === "up"
      ? tokens.color.negBg
      : $tone === "down"
        ? tokens.color.posBg
        : tokens.color.tint};
  color: ${({ $tone }) =>
    $tone === "up"
      ? tokens.color.neg
      : $tone === "down"
        ? tokens.color.pos
        : tokens.color.ink3};
`;

/*
 * 전월 대비 라벨(2026-04-28 직관화).
 *
 * 사용자 피드백: "변동 없음 / 106%" 가 무슨 의미인지 한눈에 안 들어옴 → 카드별 상황을
 * 그대로 풀어 쓰는 카피로 바꿔, 어떤 분류에 어떤 흐름이 일어나고 있는지 한 줄로 읽히게.
 *
 *  - prev=0, current=0   → "지출 없음"     (해당 분류에 이번달도 전월도 거래 없음)
 *  - prev=0, current>0   → "이번달 신규"   (전월에는 0원, 이번달 처음 발생)
 *  - 차이 0              → "전월과 같음"   (금액이 정확히 같거나 % 반올림 0)
 *  - 차이 있음           → "+12%" / "-5%"  (% 사인은 ASCII +/- 로 통일 — 글꼴/플랫폼별
 *                                           유니코드 마이너스(U+2212) 가 hairline 처럼
 *                                           보이는 가독성 회귀를 차단)
 */
function delta(current: number, prev: number): {
  label: string;
  tone: "up" | "down" | "flat";
} {
  if (prev === 0 && current === 0) return { label: "지출 없음", tone: "flat" };
  if (prev === 0 && current > 0) return { label: "이번달 신규", tone: "up" };
  const diff = current - prev;
  if (diff === 0) return { label: "전월과 같음", tone: "flat" };
  const ratio = (diff / prev) * 100;
  const rounded = Math.round(ratio);
  if (rounded === 0) return { label: "전월과 같음", tone: "flat" };
  const sign = rounded > 0 ? "+" : "-";
  return {
    label: `${sign}${Math.abs(rounded)}%`,
    tone: rounded > 0 ? "up" : "down",
  };
}

interface EssentialStripProps {
  buckets: EssentialBucket[];
  /**
   * 분석 페이지에서 보고 있는 month 키(YYYY-MM). 카드 클릭 시 같은 month 로 필터된
   * 거래내역을 보여주려고 같이 넘깁니다. 미지정이면 거래내역 페이지의 기본 month 유지.
   */
  month?: string;
}

export const EssentialStrip: React.FC<EssentialStripProps> = ({ buckets, month }) => {
  const navigate = useNavigate();
  /*
   * 항목 클릭 → 거래내역 라우팅(2026-04-28).
   *  - utility / maintenance / education: 카테고리 필터로 좁힘.
   *  - subscription: 상태 = 정기결제(sub) 로 좁힘 (카테고리와 다른 축).
   * Transactions 의 useEffect 가 location.state.presetCategory / presetStatus 를 받아
   * 필터에 적용합니다. month 도 같이 보내 사용자가 보고 있던 달로 자동 동기화.
   */
  const handleClick = (bucket: EssentialBucket) => {
    const state: Record<string, unknown> = {};
    if (bucket.key === "subscription") {
      state.presetStatus = "sub";
      state.presetType = "expense";
    } else {
      state.presetCategory = bucket.key;
    }
    if (month) state.presetMonth = month;
    navigate("/transactions", { state });
  };

  return (
    <Card padding={0}>
      <CardHd>
        {/*
          카피 정책(2026-04-28 사용자 피드백):
            "가계부 필수 항목 / 매달 고정으로 챙겨봐야 할 흐름" 은 추상적이라 사용자가 이 카드의
            기능을 한눈에 이해하기 어려웠습니다. "지금 보고 있는 게 무엇인가" 를 직접 말로
            풀도록 변경 — 타이틀은 "이번 달 고정 지출", 부제는 "어떤 항목들이 합쳐졌는지" 와
            "왜 따로 보는지" 를 한 줄에. 사용자 단어("생활추적") 의 결과 결을 맞춤.
        */}
        <div>
          <CardTitle>이번 달 고정 지출</CardTitle>
          <CardSub>생활과 직결된 4가지 항목 · 카드 클릭 시 거래내역에서 보기</CardSub>
        </div>
      </CardHd>
      <CardBd>
        <Strip>
          {buckets.map((b) => {
            const style = ITEM_STYLE[b.key];
            const d = delta(b.amount, b.prevAmount);
            return (
              <ItemCard
                key={b.key}
                type="button"
                onClick={() => handleClick(b)}
                aria-label={`${b.label} 거래 보기 (${formatKRW(b.amount)})`}
              >
                <Head>
                  <IconCircle $bg={style.iconBg} $fg={style.iconFg} aria-hidden="true">
                    {style.icon}
                  </IconCircle>
                  <Label>{b.label}</Label>
                </Head>
                <Value>{formatKRW(b.amount)}</Value>
                <Meta>
                  {b.count}건
                  {/*
                    chip 앞에 "전월 대비" 라벨을 같이 노출 — chip 의 % 가 무엇 대비인지
                    한눈에 들어오게. "지출 없음/이번달 신규/전월과 같음" 같은 서술형
                    라벨일 때는 그 자체로 의미가 통하니 prefix 를 숨겨 시각 노이즈 줄임.
                  */}
                  {/^[+-]\d/.test(d.label) && (
                    <span className="compare-label">전월 대비</span>
                  )}
                  <DeltaChip $tone={d.tone}>{d.label}</DeltaChip>
                </Meta>
              </ItemCard>
            );
          })}
        </Strip>
      </CardBd>
    </Card>
  );
};
