/**
 * 역할: OCR 업로드 화면에서 분석된 이미지 및 텍스트 데이터를 OCR 편집 화면으로 전달하기 위한 인메모리 스토어입니다.
 *       File 객체를 포함해야 하므로 localStorage 대신 인메모리로 관리합니다. (새로고침 시 초기화됨)
 * 위치: src/stores/ocrStore.ts
 */
import { useState, useEffect } from "react";
import type { OcrImageItem } from "../pages/OcrEdit/data";

let memoryImages: OcrImageItem[] = [];

type Listener = (images: OcrImageItem[]) => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener(memoryImages));
}

export const ocrStore = {
  getImages(): OcrImageItem[] {
    return memoryImages;
  },
  setImages(images: OcrImageItem[]): void {
    memoryImages = images;
    notify();
  },
  clear(): void {
    memoryImages = [];
    notify();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/**
 * 컴포넌트에서 스토어 상태를 구독하기 위한 훅.
 */
export function useOcrStore(): OcrImageItem[] {
  const [images, setImages] = useState<OcrImageItem[]>(() => ocrStore.getImages());

  useEffect(() => {
    const unsubscribe = ocrStore.subscribe(setImages);
    return () => {
      unsubscribe();
    };
  }, []);

  return images;
}
