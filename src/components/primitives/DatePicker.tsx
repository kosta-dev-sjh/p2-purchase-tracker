/**
 * 역할: 날짜 하나를 고르는 커스텀 데이트피커.
 *       네이티브 <input type="date">는 브라우저마다 팝업 UI가 완전히 달라
 *       디자인 통일이 사실상 불가능해서, 앱 토큰(tokens)과 같은 선/색/그림자 체계를 쓰는
 *       자체 캘린더 팝오버로 교체합니다. MonthPicker와 생김새 결이 같아 헤더에서 월 선택,
 *       본문에서 일자 선택이 한 앱처럼 보이도록 합니다.
 *       외부 API는 "YYYY.MM.DD" 문자열 하나. utils/date의 toIsoDate/fromIsoDate 변환 없이
 *       바로 TxRow.date에 넣어도 됩니다.
 * 위치: src\components\primitives\DatePicker.tsx
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { tokens } from "../../styles/tokens";
import {
  fromIsoDate,
  isValidDotDate,
  todayAsDotDate,
  toIsoDate,
} from "../../utils/date";

interface DatePickerProps {
  id?: string;
  /** "YYYY.MM.DD" 문자열. 빈 문자열이면 선택이 없는 상태. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /**
   * 트리거 버튼의 크기.
   * - "md"(기본): 수동 입력 폼처럼 한 줄을 차지할 때. 40px 높이로 다른 TextInput과 맞춥니다.
   * - "sm": OCR 편집의 메타 바처럼 태그/구분선 사이에 끼워 넣을 때. 28px 높이로 작게.
   */
  size?: "sm" | "md";
  "aria-label"?: string;
}

/** 달력에 그리는 한 셀의 의미. outside는 앞/뒤 달에서 빌려온 채움 칸입니다. */
interface DayCell {
  key: string; // YYYY-MM-DD
  label: number;
  /** 현재 보고 있는 달에 속하는 날짜. false면 회색 처리. */
  isCurrentMonth: boolean;
  /** 오늘 날짜. 테두리로 표시. */
  isToday: boolean;
  /** 선택된 날짜. 배경색으로 표시. */
  isSelected: boolean;
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 팝오버 root. position: relative로 트리거 기준점을 만들어 둡니다.
 */
const Root = styled.div`
  position: relative;
  display: inline-flex;
  width: 100%;
`;

/**
 * 트리거 버튼. <input>과 동일한 높이/둥글기/테두리를 유지해 폼 안에서 이질감이 없게 합니다.
 * 값이 비었을 때는 placeholder 색, 값이 있으면 ink1 진한 색으로 표기해 "정해짐/미정"을 구분합니다.
 */
const Trigger = styled.button<{ $open: boolean; $empty: boolean; $size: "sm" | "md" }>`
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: ${({ $size }) => ($size === "sm" ? "28px" : "40px")};
  padding: ${({ $size }) => ($size === "sm" ? "0 8px" : "0 12px")};
  border: 1px solid
    ${({ $open }) => ($open ? tokens.color.accent : tokens.color.line)};
  border-radius: ${tokens.radius.control};
  background: ${tokens.color.panel};
  color: ${({ $empty }) => ($empty ? tokens.color.ink5 : tokens.color.ink1)};
  font-family: inherit;
  font-size: ${({ $size }) => ($size === "sm" ? "12.5px" : tokens.type.bodySm.size)};
  font-weight: 500;
  cursor: pointer;
  outline: none;
  box-shadow: ${({ $open }) => ($open ? tokens.shadow.focus : "none")};
  transition:
    border-color ${tokens.motion.fast} ease,
    box-shadow ${tokens.motion.fast} ease;

  &:hover {
    border-color: ${({ $open }) =>
      $open ? tokens.color.accent : tokens.color.ink5};
  }

  &:focus-visible {
    border-color: ${tokens.color.accent};
    box-shadow: ${tokens.shadow.focus};
  }

  .icon {
    color: ${tokens.color.ink4};
  }
`;

/**
 * 팝오버 패널. 트리거 바로 아래에 4px 간격으로 띄워 띄어보이지 않게 합니다.
 * 카드와 같은 shadow/radius를 써 '설정 · 카테고리 모달' 등 다른 플로팅 UI와 결을 맞춥니다.
 */
const Popover = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 20;
  width: 264px;
  padding: 12px;
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.card};
  background: ${tokens.color.panel};
  box-shadow: ${tokens.shadow.cardHover};
`;

const PopoverHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
`;

const MonthLabel = styled.div`
  color: ${tokens.color.ink1};
  font-size: 13px;
  font-weight: 600;
`;

const StepButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.control};
  background: ${tokens.color.panel};
  color: ${tokens.color.ink2};
  font-size: 14px;
  cursor: pointer;
  transition:
    background ${tokens.motion.fast} ease,
    border-color ${tokens.motion.fast} ease;

  &:hover {
    background: ${tokens.color.foot};
    border-color: ${tokens.color.accentBorder};
  }
`;

const StepGroup = styled.div`
  display: inline-flex;
  gap: 4px;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
`;

const WeekdayCell = styled.div<{ $weekend: "sat" | "sun" | "weekday" }>`
  height: 24px;
  display: grid;
  place-items: center;
  color: ${({ $weekend }) =>
    $weekend === "sun"
      ? tokens.color.neg
      : $weekend === "sat"
        ? tokens.color.accent
        : tokens.color.ink4};
  font-size: 11px;
  font-weight: 600;
`;

/**
 * 날짜 셀. 시각적 상태가 세 가지(평범/오늘/선택)로 겹칠 수 있어 각각을 독립 prop으로 받아
 * background-color는 selected에, border는 today에 분리해 적용합니다.
 */
const DayButton = styled.button<{
  $currentMonth: boolean;
  $selected: boolean;
  $today: boolean;
  $dayOfWeek: number; // 0=일, 6=토
}>`
  height: 32px;
  border: 1px solid ${({ $today }) => ($today ? tokens.color.accent : "transparent")};
  border-radius: ${tokens.radius.control};
  background: ${({ $selected }) =>
    $selected ? tokens.color.accent : "transparent"};
  color: ${({ $selected, $currentMonth, $dayOfWeek }) => {
    if ($selected) return "#fff";
    if (!$currentMonth) return tokens.color.ink5;
    if ($dayOfWeek === 0) return tokens.color.neg;
    if ($dayOfWeek === 6) return tokens.color.accent;
    return tokens.color.ink1;
  }};
  font-family: inherit;
  font-size: 12.5px;
  font-weight: ${({ $selected, $today }) =>
    $selected || $today ? 700 : 500};
  cursor: pointer;
  transition:
    background ${tokens.motion.fast} ease,
    border-color ${tokens.motion.fast} ease,
    color ${tokens.motion.fast} ease;

  &:hover:not(:disabled) {
    background: ${({ $selected }) =>
      $selected ? tokens.color.accentHover : tokens.color.foot};
  }
`;

const Footer = styled.div`
  margin-top: 10px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
`;

const FooterButton = styled.button<{ $primary?: boolean }>`
  flex: 1;
  height: 28px;
  border: 1px solid
    ${({ $primary }) => ($primary ? tokens.color.accent : tokens.color.line)};
  border-radius: ${tokens.radius.control};
  background: ${({ $primary }) =>
    $primary ? tokens.color.accentSubtle : tokens.color.panel};
  color: ${({ $primary }) =>
    $primary ? tokens.color.accentHover : tokens.color.ink2};
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background ${tokens.motion.fast} ease,
    border-color ${tokens.motion.fast} ease;

  &:hover {
    border-color: ${tokens.color.accent};
  }
`;

/**
 * ISO 문자열을 내부에서 다룰 수 있는 Date 객체로 변환.
 * 유효하지 않으면 null을 돌려 대안(오늘/첫 날)으로 그릴 수 있게 합니다.
 */
function parseIso(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function toIsoKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 6주(42칸) 달력 그리드를 만드는 헬퍼.
 * 달의 1일이 속한 주의 일요일부터 시작해 42일을 채우고, 앞뒤 달 날짜는 isCurrentMonth=false로 표기합니다.
 */
function buildMonthGrid(
  viewYear: number,
  viewMonth: number,
  selectedIso: string | null,
  todayIso: string
): DayCell[] {
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startOffset = firstOfMonth.getDay(); // 0=일요일
  const gridStart = new Date(viewYear, viewMonth, 1 - startOffset);

  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const current = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + i
    );
    const key = toIsoKey(current);
    cells.push({
      key,
      label: current.getDate(),
      isCurrentMonth: current.getMonth() === viewMonth,
      isToday: key === todayIso,
      isSelected: selectedIso !== null && key === selectedIso,
    });
  }
  return cells;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  id,
  value,
  onChange,
  placeholder = "날짜 선택",
  size = "md",
  "aria-label": ariaLabel,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // 외부에서 들어온 저장 포맷(YYYY.MM.DD)을 내부에서는 ISO로 다뤄 Date 연산을 편하게 합니다.
  const selectedIso = isValidDotDate(value) ? toIsoDate(value) : "";

  // '보고 있는 달'을 별도 상태로 두어, 선택 없이 월만 넘길 수 있게 합니다.
  const [view, setView] = useState<{ year: number; month: number }>(() => {
    const parsed = parseIso(selectedIso);
    const base = parsed ?? new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  // useEffect로 selectedIso → view를 동기화하면 react-hooks/set-state-in-effect 경고가 뜨고
  // 팝오버가 열려 있을 때 달이 멋대로 튀는 UX 이슈도 있습니다.
  // 사용자가 팝오버를 "열 때"만 현재 선택값에 맞춰 달력을 맞춰주는 게 더 자연스럽습니다.
  const toggleOpen = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const parsed = parseIso(selectedIso);
    if (parsed) {
      setView({ year: parsed.getFullYear(), month: parsed.getMonth() });
    }
    setOpen(true);
  };

  // 팝오버가 열린 동안 바깥을 클릭하거나 Esc를 누르면 자연스럽게 닫히도록 전역 리스너 연결.
  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const todayIso = toIsoDate(todayAsDotDate());
  const cells = useMemo(
    () => buildMonthGrid(view.year, view.month, selectedIso || null, todayIso),
    [view.year, view.month, selectedIso, todayIso]
  );

  const goMonth = (offset: number) => {
    setView((current) => {
      const next = new Date(current.year, current.month + offset, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const pickByIsoKey = (isoKey: string) => {
    // 셀 클릭 시 표시 달도 그 날짜가 속한 달로 바꿔줘 "다음 달 첫 날" 선택 같은 케이스에서 달력이 따라옵니다.
    const [y, m] = isoKey.split("-").map(Number);
    setView({ year: y, month: m - 1 });
    onChange(fromIsoDate(isoKey));
    setOpen(false);
  };

  const handleTodayClick = () => {
    const today = todayAsDotDate();
    onChange(today);
    const iso = toIsoDate(today);
    const [y, m] = iso.split("-").map(Number);
    setView({ year: y, month: m - 1 });
    setOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setOpen(false);
  };

  const triggerLabel = value || placeholder;

  return (
    <Root ref={rootRef}>
      <Trigger
        id={id}
        type="button"
        $open={open}
        $empty={!value}
        $size={size}
        onClick={toggleOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel ?? "날짜 선택"}
      >
        <span>{triggerLabel}</span>
        <svg
          className="icon"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
          <path d="M2.5 6.5h11" />
          <path d="M5.5 2v3" />
          <path d="M10.5 2v3" />
        </svg>
      </Trigger>
      {open && (
        <Popover role="dialog" aria-label="달력">
          <PopoverHeader>
            <MonthLabel>
              {view.year}년 {view.month + 1}월
            </MonthLabel>
            <StepGroup>
              <StepButton type="button" onClick={() => goMonth(-1)} aria-label="이전 달">
                ‹
              </StepButton>
              <StepButton type="button" onClick={() => goMonth(1)} aria-label="다음 달">
                ›
              </StepButton>
            </StepGroup>
          </PopoverHeader>
          <Grid>
            {WEEKDAY_LABELS.map((label, index) => (
              <WeekdayCell
                key={label}
                $weekend={index === 0 ? "sun" : index === 6 ? "sat" : "weekday"}
              >
                {label}
              </WeekdayCell>
            ))}
            {cells.map((cell, index) => {
              const dayOfWeek = index % 7;
              return (
                <DayButton
                  key={cell.key}
                  type="button"
                  $currentMonth={cell.isCurrentMonth}
                  $selected={cell.isSelected}
                  $today={cell.isToday}
                  $dayOfWeek={dayOfWeek}
                  onClick={() => pickByIsoKey(cell.key)}
                  aria-label={cell.key}
                  aria-pressed={cell.isSelected}
                >
                  {cell.label}
                </DayButton>
              );
            })}
          </Grid>
          <Footer>
            <FooterButton type="button" onClick={handleClear}>
              지우기
            </FooterButton>
            <FooterButton type="button" $primary onClick={handleTodayClick}>
              오늘
            </FooterButton>
          </Footer>
        </Popover>
      )}
    </Root>
  );
};
