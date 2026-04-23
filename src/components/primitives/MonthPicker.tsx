/**
 * 역할: 버튼, 카드처럼 여러 화면에서 재사용하는 기본 UI 컴포넌트입니다.
 * 위치: src\components\primitives\MonthPicker.tsx
 */
import styled from "styled-components";
import { tokens } from "../../styles/tokens";
import { MONTH_OPTIONS } from "../../constants/months";
import { media } from "../../tokens/breakpoints";

interface MonthPickerProps {
  value: string;
  onChange: (value: string) => void;
}

const Wrap = styled.div`
  display: inline-flex;
  align-items: center;
  gap: ${tokens.space[2]};

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
 * 레퍼런스 스크린샷처럼 월 선택 pill 안쪽 왼쪽에 작은 브랜드 컬러 점을 올립니다.
 * 네이티브 <select>는 내부 컨텐츠를 커스터마이즈하기 어려우므로 relative 컨테이너 위에
 * 절대 위치 dot를 얹어 같은 pill 안에 있는 것처럼 보이게 했습니다.
 */
const SelectWrap = styled.div`
  position: relative;
  display: inline-flex;
  align-items: center;

  ${media.mobile} {
    flex: 1;
    min-width: 0;
  }
`;

const SelectDot = styled.span`
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

const Select = styled.select`
  height: 32px;
  min-width: 132px;
  /* 왼쪽에 6px 점 + 여백을 두기 위해 padding-left를 26px로 늘렸습니다. */
  padding: 0 32px 0 26px;
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.control};
  background: ${tokens.color.panel};
  color: ${tokens.color.ink2};
  font-family: inherit;
  font-size: ${tokens.type.bodySm.size};
  font-weight: 500;
  outline: none;
  cursor: pointer;

  &:focus,
  &:focus-visible {
    border-color: ${tokens.color.accent};
    box-shadow: ${tokens.shadow.focus};
  }

  ${media.mobile} {
    width: 100%;
    min-width: 0;
  }
`;

export const MonthPicker = ({ value, onChange }: MonthPickerProps) => {
  const currentIndex = MONTH_OPTIONS.findIndex((option) => option.key === value);

  return (
    <Wrap>
      <StepButton
        type="button"
        onClick={() => onChange(MONTH_OPTIONS[currentIndex - 1].key)}
        disabled={currentIndex <= 0}
        aria-label="이전 달"
      >
        ‹
      </StepButton>
      <SelectWrap>
        <SelectDot aria-hidden />
        <Select value={value} onChange={(event) => onChange(event.target.value)} aria-label="월 선택">
          {MONTH_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </Select>
      </SelectWrap>
      <StepButton
        type="button"
        onClick={() => onChange(MONTH_OPTIONS[currentIndex + 1].key)}
        disabled={currentIndex >= MONTH_OPTIONS.length - 1}
        aria-label="다음 달"
      >
        ›
      </StepButton>
    </Wrap>
  );
};
