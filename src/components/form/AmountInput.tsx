/**
 * 역할: 원화 금액 입력 전용 인풋. 표시만 천단위 콤마로 포맷하고, 상위로 넘어가는 값은
 *       숫자(digit)만 담긴 문자열을 유지합니다. 기존 TextInput과 동일한 디자인을
 *       그대로 계승해 폼 안에서 시각 일관성이 깨지지 않게 했습니다.
 *
 *       상위 컴포넌트는 지금까지처럼 amount를 "129000" 같은 문자열로 보관하면 되고,
 *       parsePrice() 도 Number(value.replace(/[^\d]/g, "")) 라서 자연스럽게 호환됩니다.
 * 위치: src\components\form\AmountInput.tsx
 */
import type { InputHTMLAttributes } from "react";
import { useLayoutEffect, useMemo, useRef } from "react";
import styled from "styled-components";
import { tokens } from "../../styles/tokens";

const StyledInput = styled.input`
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.control};
  background: ${tokens.color.panel};
  color: ${tokens.color.ink1};
  font-family: inherit;
  font-size: ${tokens.type.bodySm.size};
  /* 숫자 칼럼이 오른쪽 정렬되면 가독성이 좋아지지만, 기존 UI와의 일관성을 위해 좌측 정렬 유지.
     대신 mono 폰트로 자릿수를 고정해 콤마가 섞여도 숫자가 미끄러지지 않도록 합니다. */
  font-variant-numeric: tabular-nums;
  box-sizing: border-box;
  transition: border-color ${tokens.motion.fast}, box-shadow ${tokens.motion.fast};

  &::placeholder {
    color: ${tokens.color.ink5};
  }

  &:focus {
    border-color: ${tokens.color.accent};
    box-shadow: ${tokens.shadow.focus};
    outline: none;
  }
`;

/**
 * "1000000" → "1,000,000"
 * 빈 문자열/숫자 아님은 그대로 통과시켜 사용자의 입력 리듬을 깨지 않습니다.
 */
function formatWithCommas(rawDigits: string): string {
  if (!rawDigits) return "";
  // 선행 0은 사용자가 의도적으로 입력한 경우를 제외하곤 보통 없어야 자연스럽습니다.
  // 단 "0"만 입력한 경우는 그대로 "0"으로 보여 주는 편이 예측 가능합니다.
  const normalized = rawDigits.replace(/^0+(?=\d)/, "");
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * 외부 value 는 숫자 문자열. 내부 표시(input.value)는 콤마 포함.
 * value/onChange 가 필수라 InputHTMLAttributes에서 제외합니다.
 */
export type AmountInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "inputMode"
> & {
  /** raw digit 문자열. 예: "129000". 상위 상태는 이 포맷을 유지합니다. */
  value: string;
  /** 상위로 넘겨줄 raw digit 값. 콤마·기타 문자는 이미 제거된 상태로 전달됩니다. */
  onChange: (rawDigits: string) => void;
};

export const AmountInput = ({ value, onChange, ...rest }: AmountInputProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  // 캐럿 위치를 복원할 때 "앞쪽에 있는 digit 개수"로 환산해서 새 포맷 문자열의 같은
  // 자릿수 위치에 다시 놓습니다. 콤마가 추가/제거되면서 인덱스가 달라지는 문제를 피하기 위함.
  const pendingCaretRef = useRef<number | null>(null);

  const displayed = useMemo(() => formatWithCommas(value ?? ""), [value]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    const digitsBefore = pendingCaretRef.current;
    pendingCaretRef.current = null;
    if (!input || digitsBefore === null) return;

    // 새 displayed 문자열에서 "앞에서부터 digit N개"까지의 위치를 찾아 캐럿을 거기에 둡니다.
    let seen = 0;
    let nextIndex = displayed.length;
    for (let i = 0; i < displayed.length; i += 1) {
      if (/\d/.test(displayed[i])) {
        if (seen === digitsBefore) {
          nextIndex = i;
          break;
        }
        seen += 1;
      }
    }
    input.setSelectionRange(nextIndex, nextIndex);
  }, [displayed]);

  return (
    <StyledInput
      ref={inputRef}
      {...rest}
      type="text"
      inputMode="numeric"
      value={displayed}
      onChange={(event) => {
        // 사용자가 숫자 외 문자를 쳐도 무시하고, 콤마 포함 여부와 상관없이 같은 자릿수를 유지.
        const nextRaw = event.target.value.replace(/[^0-9]/g, "");
        // 캐럿 앞쪽에 있었던 "digit 개수"만 기억해 두면, 포맷 후에도 같은 논리 위치로 돌아갈 수 있음.
        const selectionStart = event.target.selectionStart ?? event.target.value.length;
        const digitsBeforeCaret = event.target.value
          .slice(0, selectionStart)
          .replace(/[^0-9]/g, "").length;
        pendingCaretRef.current = digitsBeforeCaret;

        onChange(nextRaw);
      }}
    />
  );
};
