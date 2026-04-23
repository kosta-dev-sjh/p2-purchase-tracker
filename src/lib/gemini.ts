/**
 * 역할: 테스트 단계에서 브라우저에서 직접 Gemini를 호출하는 최소 래퍼입니다.
 *       TODO(firebase): 공개 배포 전에는 이 구현을 Firebase Functions 경유 호출로 교체합니다.
 * 위치: src/lib/gemini.ts
 */
import { assertGeminiConfigured, env } from "./env";

const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiTextPart {
  text: string;
}

export interface GeminiInlineImagePart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

export type GeminiPart = GeminiTextPart | GeminiInlineImagePart;

export interface GeminiGenerateOptions {
  model?: string;
  parts: GeminiPart[];
  responseMimeType?: string;
  temperature?: number;
}

interface GeminiCandidate {
  content?: {
    parts?: Array<{ text?: string }>;
  };
}

interface GeminiGenerateResponse {
  candidates?: GeminiCandidate[];
}

export async function generateWithGemini({
  model = env.geminiTextModel,
  parts,
  responseMimeType,
  temperature = 0.2,
}: GeminiGenerateOptions): Promise<string> {
  assertGeminiConfigured();

  const response = await fetch(
    `${GEMINI_BASE_URL}/${model}:generateContent?key=${env.geminiApiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature,
          responseMimeType,
        },
      }),
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Gemini 요청 실패: ${response.status} ${message}`);
  }

  const payload = (await response.json()) as GeminiGenerateResponse;
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");

  if (!text) {
    throw new Error("Gemini 응답에서 텍스트를 찾지 못했습니다.");
  }

  return text;
}

export async function fileToInlineImagePart(file: File): Promise<GeminiInlineImagePart> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("이미지를 읽는 중 문제가 발생했습니다."));
    reader.readAsDataURL(file);
  });

  const [meta, base64] = dataUrl.split(",");
  const mimeType =
    meta.match(/data:(.*?);base64/)?.[1] ?? file.type ?? "image/png";

  if (!base64) {
    throw new Error("이미지 base64 변환에 실패했습니다.");
  }

  return {
    inlineData: {
      mimeType,
      data: base64,
    },
  };
}
