// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                          ⚠ 디버그 전용 영역 ⚠                             ║
// ║   DEBUG_OCR_AI 는 배포 전에 반드시 false 로 되돌려 주세요.                 ║
// ║                                                                           ║
// ║   true 일 때 노출되는 것:                                                 ║
// ║     • EditForm ImageSummary 에 "🛠 DEBUG: AI 인식됨" chip (이미지 단위)    ║
// ║       → image.aiInvoked === true 인 이미지에서만 등장                    ║
// ║     • (※ 그 외 모든 AI 관련 UI — 카드별 "AI 보정됨" 배지 / 모달 타이틀     ║
// ║       / rotating 메시지 등 — 는 사용자·개발자 모두 자동으로 가려집니다.)   ║
// ║                                                                           ║
// ║   false 로 두면 단일 chip 도 사라져 사용자 UI 와 완전히 동일한 화면이 됨.   ║
// ║                                                                           ║
// ║   정리 절차 (배포 직전, 3분 작업):                                         ║
// ║     1) 이 파일의 `DEBUG_OCR_AI = false` 로 변경 → 즉시 UI 에서 소거.       ║
// ║     2) 더 깔끔히 지우려면:                                                ║
// ║        • `grep -rn "DEBUG_OCR_AI" src/` → 조건부 JSX 블록 (대부분 하나)   ║
// ║        • EditForm.tsx 의 DebugAiChip styled + 렌더 블록 제거              ║
// ║        • data.ts 의 OcrImageItem.aiInvoked 필드 제거                     ║
// ║        • ocrAnalyzeImages.ts 의 `imageItem.aiInvoked = true;` 한 줄 제거  ║
// ║        • 이 파일 삭제 → import 라인 정리                                  ║
// ║                                                                           ║
// ║   TODO(pfe-ocr-ai): Gemini 운영 안정화 후 이 스위치 전체 제거.            ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/**
 * OCR + AI 파이프라인의 **개발자 전용 디버그 UI** 노출 여부.
 *
 * 이 플래그는 CSV 쪽 `DEBUG_CSV_UPLOAD` 와 같은 컴파일-타임 상수 패턴을 따릅니다. 배포
 * 번들에 들어가는 순간 tree-shaking 으로 조건부 JSX 블록이 죽은 가지가 되도록 설계돼 있어,
 * true 로 두고 개발해도 사용자 환경에 새어 나가지 않습니다 (`false` 로 바꾸면 즉시 UI 소거).
 *
 * 현재 이 플래그의 **유일한 소비처**: EditForm 의 "🛠 DEBUG: AI 인식됨" chip.
 */
export const DEBUG_OCR_AI = true;
