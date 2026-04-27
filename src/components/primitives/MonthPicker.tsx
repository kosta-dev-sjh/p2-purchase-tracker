/**
 * 역할: 모든 화면(홈/거래내역/분석)이 공유하는 "월 선택" pill.
 *
 *       기존에는 MONTH_OPTIONS (목업 4개월) 으로부터 native <select> 를 그렸지만,
 *       (1) 옵션이 1~4월에 고정돼 있던 문제, (2) 년도가 바뀌면 사용자가 직접
 *       "특정 시작년도부터 현재 월까지 자유롭게 고를" 수 있어야 한다는 요구 때문에
 *       팝업을 직접 그리는 형태로 바꿨습니다.
 *
 *       바깥 트리거(◄ pill ►) 의 외관·치수·tokens 는 기존과 동일하게 유지합니다.
 *       달라진 것은 가운데 pill 을 누르면 떠오르는 팝업뿐이며,
 *       팝업은 다음과 같이 동작합니다.
 *         - 상단 년도 네비게이터(◄ YYYY ►) — minYear/maxYear 경계에서 비활성
 *         - 하단 12개 월 그리드(4 cols × 3 rows) — 미래 월/한도 밖 월은 비활성
 *         - 월 칸을 클릭 → onChange 호출 + 팝업 닫힘
 *         - ESC, 바깥 클릭 → 닫힘
 *
 *       시간 경계 정책은 옵션이 아니라 "미래 월은 표시하지 않음" 으로 고정합니다.
 *       (가계부/카드사 UX 관행 — 아직 일어나지 않은 달을 고를 이유가 없음.)
 *
 * 위치: src\components\primitives\MonthPicker.tsx
 */
import { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { tokens } from "../../styles/tokens";
import {
  getMonthOption,
  getNextMonthKey,
  getPrevMonthKey,
} from "../../constants/months";
import { media } from "../../tokens/breakpoints";

interface MonthPickerProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * 셀렉터에 노출할 가장 오래된 년도. 미지정 시 현재년도 − 5 까지 자동 노출.
   * 페이지에서 거래 데이터 기반으로 computeMinYear() 결과를 넘기면 더 옛날 데이터까지 자동 확장됩니다.
   */
  minYear?: number;
}

const Wrap = styled.div`
  display: inline-flex;
  align-items: center;
  gap: ${tokens.space[2]};
  position: relative;

  ${media.mobile} {
    width: 100%;
  }
`;

const StepButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.control};
  background: ${tokens.color.panel};
  color: ${tokens.color.ink2};
  cursor: pointer;
  font-size: 16px;
  transition:
    border-color ${tokens.motion.fast} ease,
    background ${tokens.motion.fast} ease,
    box-shadow ${tokens.motion.fast} ease;

  &:hover:not(:disabled) {
    border-color: ${tokens.color.accentBorder};
    background: ${tokens.color.foot};
  }

  &:focus-visible {
    box-shadow: ${tokens.shadow.focus};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

/**
 * 트리거 pill — native <select> 를 직접 흉내내는 button 입니다.
 * dot, padding, 폭, 폰트 모두 기존 <Select> 토큰과 동일하게 유지해
 * 외관 회귀가 없도록 했습니다.
 */
const TriggerWrap = styled.div`
  position: relative;
  display: inline-flex;
  align-items: center;

  ${media.mobile} {
    flex: 1;
    min-width: 0;
  }
`;

const TriggerDot = styled.span`
  position: absolute;
  top: 50%;
  left: 12px;
  transform: translateY(-50%);
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${tokens.color.accent};
  pointer-events: none;
`;

const TriggerButton = styled.button<{ $open: boolean }>`
  height: 32px;
  min-width: 132px;
  padding: 0 32px 0 26px;
  border: 1px solid ${({ $open }) => ($open ? tokens.color.accent : tokens.color.line)};
  border-radius: ${tokens.radius.control};
  background: ${tokens.color.panel};
  color: ${tokens.color.ink2};
  font-family: inherit;
  font-size: ${tokens.type.bodySm.size};
  font-weight: 500;
  text-align: left;
  outline: none;
  cursor: pointer;
  box-shadow: ${({ $open }) => ($open ? tokens.shadow.focus : "none")};

  &:focus-visible {
    border-color: ${tokens.color.accent};
    box-shadow: ${tokens.shadow.focus};
  }

  ${media.mobile} {
    width: 100%;
    min-width: 0;
  }
`;

/**
 * 트리거 오른쪽 끝의 ▾ 아이콘. native <select> 가 그려주던 화살표 자리를
 * 시각적으로 대체합니다. 팝업 열림 상태에선 살짝 회전.
 */
const TriggerCaret = styled.span<{ $open: boolean }>`
  position: absolute;
  top: 50%;
  right: 12px;
  transform: translateY(-50%) ${({ $open }) => ($open ? "rotate(180deg)" : "rotate(0deg)")};
  pointer-events: none;
  font-size: 10px;
  color: ${tokens.color.ink3};
  transition: transform ${tokens.motion.fast} ease;
`;

/* --- 팝업 --- */

const Popover = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 40;
  min-width: 248px;
  padding: ${tokens.space[3]};
  background: ${tokens.color.panel};
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.card};
  box-shadow: ${tokens.shadow.modal};

  /* 모바일에서는 상위 컨테이너 폭을 가득 채우도록. */
  ${media.mobile} {
    left: 0;
    right: 0;
    min-width: 0;
  }
`;

const YearRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${tokens.space[2]};
  margin-bottom: ${tokens.space[3]};
`;

const YearLabel = styled.div`
  font-size: ${tokens.type.cardTitle.size};
  font-weight: ${tokens.type.cardTitle.weight};
  color: ${tokens.color.ink1};
  letter-spacing: ${tokens.type.cardTitle.tracking};
`;

const MonthGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: ${tokens.space[2]};
`;

const MonthCell = styled.button<{ $selected: boolean }>`
  height: 36px;
  border-radius: ${tokens.radius.control};
  border: 1px solid
    ${({ $selected }) => ($selected ? tokens.color.accent : tokens.color.line)};
  background: ${({ $selected }) =>
    $selected ? tokens.color.accentSubtle : tokens.color.panel};
  color: ${({ $selected }) =>
    $selected ? tokens.color.accent : tokens.color.ink2};
  font-family: inherit;
  font-size: ${tokens.type.bodySm.size};
  font-weight: 500;
  cursor: pointer;
  transition:
    border-color ${tokens.motion.fast} ease,
    background ${tokens.motion.fast} ease;

  &:hover:not(:disabled) {
    border-color: ${tokens.color.accentBorder};
    background: ${tokens.color.foot};
  }

  &:focus-visible {
    box-shadow: ${tokens.shadow.focus};
    outline: none;
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    background: ${tokens.color.panel};
  }
`;

/* --- 컴포넌트 --- */

/** "YYYY-MM" 키 → {year, month} 숫자 쌍. 실패 시 오늘 기준값으로 폴백. */
function parseKey(key: string): { year: number; month: number } {
  const m = key.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return { year: Number(m[1]), month: Number(m[2]) };
}

const buildKey = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, "0")}`;

export const MonthPicker = ({ value, onChange, minYear }: MonthPickerProps) => {
  // 화면 진입 시점 기준 "오늘". 미래 월 비활성 판정에 쓰입니다.
  // 팝업이 닫힌 채로 며칠 머물러도 다음 렌더링에서 다시 계산되므로 굳이 useState 로 묶지 않습니다.
  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1; // 1-based

  // minYear 미지정 시 현재년도 − 5 보장.
  const effectiveMinYear = useMemo(
    () => (typeof minYear === "number" ? minYear : todayYear - 5),
    [minYear, todayYear]
  );

  const { year: selectedYear, month: selectedMonth } = parseKey(value);

  // 팝업이 보여주는 년도. 디폴트는 현재 선택된 값의 년도.
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState<number>(selectedYear);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // 외부에서 value 가 바뀌어 다른 년도로 점프했다면 viewYear 도 따라가게 동기화.
  useEffect(() => {
    setViewYear(selectedYear);
  }, [selectedYear]);

  // 팝업 바깥 클릭 / ESC 로 닫기.
  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  /** "이 키를 선택할 수 있는가?" — minYear 보다 옛날도, 오늘 이후 미래도 거부. */
  const isSelectable = (year: number, month: number): boolean => {
    if (year < effectiveMinYear) return false;
    if (year > todayYear) return false;
    if (year === todayYear && month > todayMonth) return false;
    return true;
  };

  /** 트리거의 ◄ 버튼 — "한 달 전". */
  const goPrev = () => {
    const prev = getPrevMonthKey(value);
    const { year, month } = parseKey(prev);
    if (!isSelectable(year, month)) return;
    onChange(prev);
  };

  /** 트리거의 ► 버튼 — "한 달 뒤". */
  const goNext = () => {
    const next = getNextMonthKey(value);
    const { year, month } = parseKey(next);
    if (!isSelectable(year, month)) return;
    onChange(next);
  };

  const isAtMin = !isSelectable(
    parseKey(getPrevMonthKey(value)).year,
    parseKey(getPrevMonthKey(value)).month
  );
  const isAtMax = !isSelectable(
    parseKey(getNextMonthKey(value)).year,
    parseKey(getNextMonthKey(value)).month
  );

  const selectMonth = (month: number) => {
    const key = buildKey(viewYear, month);
    onChange(key);
    setOpen(false);
  };

  const triggerLabel = getMonthOption(value).label;

  return (
    <Wrap ref={wrapRef}>
      <StepButton
        type="button"
        onClick={goPrev}
        disabled={isAtMin}
        aria-label="이전 달"
      >
        ‹
      </StepButton>
      <TriggerWrap>
        <TriggerDot aria-hidden />
        <TriggerButton
          type="button"
          $open={open}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="월 선택"
        >
          {triggerLabel}
        </TriggerButton>
        <TriggerCaret aria-hidden $open={open}>
          ▾
        </TriggerCaret>
        {open && (
          <Popover role="dialog" aria-label="년/월 선택">
            <YearRow>
              <StepButton
                type="button"
                onClick={() => setViewYear((y) => y - 1)}
                disabled={viewYear - 1 < effectiveMinYear}
                aria-label="이전 년도"
              >
                ‹
              </StepButton>
              <YearLabel>{viewYear}년</YearLabel>
              <StepButton
                type="button"
                onClick={() => setViewYear((y) => y + 1)}
                disabled={viewYear + 1 > todayYear}
                aria-label="다음 년도"
              >
                ›
              </StepButton>
            </YearRow>
            <MonthGrid>
              {Array.from({ length: 12 }, (_, idx) => {
                const month = idx + 1;
                const enabled = isSelectable(viewYear, month);
                const selected = viewYear === selectedYear && month === selectedMonth;
                return (
                  <MonthCell
                    key={month}
                    type="button"
                    $selected={selected}
                    disabled={!enabled}
                    onClick={() => selectMonth(month)}
                    aria-label={`${viewYear}년 ${month}월`}
                    aria-pressed={selected}
                  >
                    {month}월
                  </MonthCell>
                );
              })}
            </MonthGrid>
          </Popover>
        )}
      </TriggerWrap>
      <StepButton
        type="button"
        onClick={goNext}
        disabled={isAtMax}
        aria-label="다음 달"
      >
        ›
      </StepButton>
    </Wrap>
  );
};
