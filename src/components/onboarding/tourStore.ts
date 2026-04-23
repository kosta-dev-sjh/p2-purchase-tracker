/**
 * 역할: 스포트라이트 ProductTour의 "열려있는가" 여부를 앱 어디서든 조작할 수 있도록
 *       하는 아주 얇은 pub/sub 스토어입니다. transactionsStore / profileStore와 같은
 *       패턴을 써서 Context 없이 컴포넌트 간 신호만 전달합니다.
 * 위치: src/components/onboarding/tourStore.ts
 *
 * TODO(auth): 실제 인증 플로우로 넘어갈 때 이 스토어는 그대로 두어도 됩니다.
 *             목업과 무관하게 "기능 투어 트리거" 용도로 쓸 수 있기 때문입니다.
 */
import { useEffect, useState } from "react";

type Listener = (isOpen: boolean) => void;
const listeners = new Set<Listener>();
let _isOpen = false;

export const tourStore = {
  start(): void {
    if (_isOpen) return;
    _isOpen = true;
    listeners.forEach((l) => l(_isOpen));
  },
  stop(): void {
    if (!_isOpen) return;
    _isOpen = false;
    listeners.forEach((l) => l(_isOpen));
  },
  isOpen(): boolean {
    return _isOpen;
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

/**
 * React 훅. 컴포넌트가 `tourStore`의 열림/닫힘 상태를 구독합니다.
 */
export function useTour(): boolean {
  const [open, setOpen] = useState<boolean>(() => tourStore.isOpen());
  useEffect(() => tourStore.subscribe(setOpen), []);
  return open;
}
