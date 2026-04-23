/**
 * 역할: 내용 길이에 맞춰 높이가 자동으로 커지는 메모/설명용 textarea.
 *       브라우저 기본 리사이즈 핸들은 디자인 일관성을 해치고 사용자가 실수로
 *       아주 크게 늘렸을 때 레이아웃이 깨질 수 있어 제거하고, 대신 내부 로직으로
 *       줄 수에 맞춰 부드럽게 확장합니다. 상한(maxHeight) 을 넘어서면 내부 스크롤로
 *       전환되어 모달/패널의 외곽 레이아웃이 흔들리지 않도록 보호합니다.
 *
 *       구현 방식: 값이 바뀔 때마다 height=auto 로 리셋 → scrollHeight 를 읽어서 재설정.
 *       React의 controlled input 규칙 안에서 동작하므로 상위 state와 충돌하지 않습니다.
 * 위치: src\components\form\AutoResizeTextarea.tsx
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import type { TextareaHTMLAttributes } from "react";
import styled from "styled-components";
import { tokens } from "../../styles/tokens";

const Styled = styled.textarea`
  width: 100%;
  min-height: 64px;
  /* maxHeight 은 JS 에서 계산해 내부 스크롤 경계로 사용하고, CSS 쪽에는 설정하지 않습니다.
     JS 경계와 CSS 경계가 이중으로 잡히면 scrollHeight 판정이 흐트러지기 때문입니다. */
  padding: 9px 12px;
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.control};
  background: ${tokens.color.panel};
  color: ${tokens.color.ink1};
  font-family: inherit;
  font-size: ${tokens.type.bodySm.size};
  line-height: 1.5;
  outline: none;
  /* 사용자 수동 리사이즈는 모두 막습니다. 늘어나는 높이는 내용에 의해서만 결정됩니다. */
  resize: none;
  /* 내용이 maxHeight 을 넘기는 순간에만 스크롤이 나타나도록 auto 유지. */
  overflow-y: auto;
  transition: border-color ${tokens.motion.fast}, box-shadow ${tokens.motion.fast};

  &:focus {
    border-color: ${tokens.color.accent};
    box-shadow: ${tokens.shadow.focus};
  }

  &::placeholder {
    color: ${tokens.color.ink5};
  }
`;

export type AutoResizeTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** 자동 확장의 상한(px). 이 값을 넘기면 내부 스크롤로 전환됩니다. 기본 160px(약 5~6줄). */
  maxHeight?: number;
};

export const AutoResizeTextarea = forwardRef<HTMLTextAreaElement, AutoResizeTextareaProps>(
  ({ maxHeight = 160, onChange, value, ...rest }, ref) => {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);

    // forwardRef로 받은 ref도 실제 DOM 과 연결해야 상위에서 focus 같은 명령이 동작합니다.
    useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement, []);

    /**
     * 높이를 내용에 맞춰 다시 계산합니다.
     * 1) 먼저 height=auto 로 리셋해 scrollHeight 가 "현재 줄 수 기준 실제 필요 높이"가 되도록 함.
     * 2) maxHeight 을 넘으면 상한에 고정하고, 내부 스크롤은 overflow-y:auto로 자동 노출됨.
     */
    const resize = useCallback(() => {
      const el = innerRef.current;
      if (!el) return;
      el.style.height = "auto";
      const next = Math.min(el.scrollHeight, maxHeight);
      el.style.height = `${next}px`;
    }, [maxHeight]);

    // 초기 마운트와 외부 value 변경(폼 초기화 등) 시 높이 동기화.
    useEffect(() => {
      resize();
    }, [resize, value]);

    return (
      <Styled
        {...rest}
        ref={innerRef}
        value={value}
        onChange={(event) => {
          // 높이 재계산은 value prop이 실제로 바뀐 뒤 useEffect 가 맡습니다.
          // 여기서 곧바로 resize 하면 아직 DOM 에 반영 전인 이전 값으로 측정되어 1프레임 뒤처집니다.
          onChange?.(event);
        }}
      />
    );
  }
);

AutoResizeTextarea.displayName = "AutoResizeTextarea";
