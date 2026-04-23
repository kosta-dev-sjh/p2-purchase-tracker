/**
 * 역할: Vite 환경변수 접근을 한 곳으로 모아 AI/Firebase 설정 누락을 빨리 드러냅니다.
 * 위치: src/lib/env.ts
 */

function readEnv(name: string): string {
  return (import.meta.env[name] as string | undefined)?.trim() ?? "";
}

export const env = {
  geminiApiKey: readEnv("VITE_GEMINI_API_KEY"),
  geminiTextModel: readEnv("VITE_GEMINI_MODEL_TEXT") || "gemini-2.5-flash-lite",
  geminiVisionModel: readEnv("VITE_GEMINI_MODEL_VISION") || "gemini-2.0-flash",
  aiDirectBrowser: readEnv("VITE_AI_DIRECT_BROWSER") !== "false",
  firebaseApiKey: readEnv("VITE_FIREBASE_API_KEY"),
  firebaseAuthDomain: readEnv("VITE_FIREBASE_AUTH_DOMAIN"),
  firebaseProjectId: readEnv("VITE_FIREBASE_PROJECT_ID"),
  firebaseStorageBucket: readEnv("VITE_FIREBASE_STORAGE_BUCKET"),
  firebaseMessagingSenderId: readEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  firebaseAppId: readEnv("VITE_FIREBASE_APP_ID"),
};

export function assertGeminiConfigured(): void {
  if (!env.geminiApiKey) {
    throw new Error(
      "Gemini API 키가 없습니다. .env.local에 VITE_GEMINI_API_KEY를 추가해 주세요."
    );
  }
}
