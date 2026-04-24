// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                          ⚠ 디버그 전용 영역 ⚠                             ║
// ║   DEBUG_OCR_AI 는 배포 전에 반드시 false 로 되돌려 주세요.                 ║
// ║   true 일 때 노출되는 것:                                                 ║
// ║     • ProductTable 에 "✨ AI 보정됨" 배지 (카드별) + [DEBUG] 툴팁        ║
// ║     • EditForm ImageSummary 의 "✨ AI 보정 N개" 요약 칩                  ║
// ║     • AnalysisProgressModal Title 꼬리에 "· AI DEBUG" + 🤖 메시지        ║
// ║     • "humanizeStatus" 에서 "ai-fallback" → "AI 보정 중" (평소 "2차 확인") ║
// ║   false 로 두면 유저 UI 는 완전히 깔끔해지고 파이프라인 동작만 남습니다.    ║
// ║   정리 절차 (배포 전):                                                    ║
// ║     1) 이 파일의 DEBUG_OCR_AI 를 false 로 바꾸거나                          ║
// ║     2) 프로젝트에서 `DEBUG_OCR_AI` 전역 grep → 조건부 JSX 블록 제거 →       ║
// ║        이 파일 삭제 → import 한 줄 정리. 3분 작업.                         ║
// ║   TODO(pfe-ocr-ai): Gemini 운영 안정화 후 이 스위치 전체 제거.            ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/**
 * OCR + AI 파이프라인의 **개발자 전용 디버그 UI** 노출 여부.
 *
 * 이 플래그는 CSV 쪽 `DEBUG_CSV_UPLOAD` 와 같은 컴파일-타임 상수 패턴을 따릅니다. 배포
 * 번들에 들어가는 순간 tree-shaking 으로 조건부 JSX 블록이 죽은 가지가 되도록 설계돼 있어,
 * true 로 두고 개발해도 사용자 환경에 새어 나가지 않습니다 (`false` 로 바꾸면 즉시 UI 소거).
 *
 * 이 플래그가 켜져 있을 때 UI 가 어떻게 바뀌는지는 상단 박스 주석 참조.
 */
export const DEBUG_OCR_AI = true;
