/**
 * 역할: 버튼, 카드처럼 여러 화면에서 재사용하는 기본 UI 컴포넌트입니다.
 * 위치: src\components\primitives\SegmentedControl.tsx
 */
import styled from "styled-components";
import { tokens } from "../../styles/tokens";
import { media } from "../../tokens/breakpoints";

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
}

const Wrap = styled.div`
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  background: ${tokens.color.tint};
  border-radius: ${tokens.radius.control};

  ${media.mobile} {
    width: 100%;
  }
`;

const Item = styled.button<{ $active: boolean }>`
  /*
   * 데스크톱에서는 Wrap 이 inline-flex + 자연 폭이라 각 Item 이 자기 라벨 만큼만
   * 폭을 차지해야 기존 레퍼런스(3개월 / 6개월 / 12개월 등) 비율이 유지됩니다.
   * 모바일에서는 Wrap 이 풀-폭이 되므로 그때만 flex:1 로 균등 분할해 터치 타겟을 확보합니다.
   */
  padding: 5px 12px;
  border: none;
  border-radius: 6px;
  background: ${({ $active }) => ($active ? tokens.color.panel : "transparent")};
  color: ${({ $active }) => ($active ? tokens.color.ink1 : tokens.color.ink3)};
  box-shadow: ${({ $active }) => ($active ? "0 1px 2px rgba(16,24,40,.08)" : "none")};
  cursor: pointer;
  font-family: inherit;
  font-size: ${tokens.type.caption.size};
  font-weight: 600;
  white-space: nowrap;

  ${media.mobile} {
    flex: 1;
  }
`;

export const SegmentedControl = <T extends string>({
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) => (
  <Wrap>
    {options.map((option) => (
      <Item
        key={option.value}
        type="button"
        $active={value === option.value}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </Item>
    ))}
  </Wrap>
);
