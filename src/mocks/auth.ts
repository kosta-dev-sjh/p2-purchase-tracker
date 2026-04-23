/**
 * 역할: 로그인 화면에서 "신규 계정" 시나리오를 흉내 내기 위한 테스트 전용 목업 상수/헬퍼.
 *       실제 인증(예: Firebase Auth, Supabase, 자체 서버) 연결 전까지만 사용합니다.
 * 위치: src/mocks/auth.ts
 *
 * ⚠️ 테스트 전용 목업 자격 증명
 * - 이 파일은 실제 비밀번호를 저장하지 않습니다. 평문 상수는 오직 "비어있는 신규 계정" 분기를
 *   식별하기 위한 플래그 용도일 뿐, 운영 자격 증명으로 사용해서는 안 됩니다.
 * - 실제 인증을 붙일 때는 이 파일을 삭제하고 LoginForm/RegisterForm 등의 import 지점과
 *   `isNewAccountCredential` 호출부를 실제 auth SDK 호출로 교체하세요.
 * - 교체 체크리스트는 docs/collaboration/SpendTrack_MockAuth_Replacement.md 를 참고.
 */

/** 신규 계정 시나리오를 트리거하는 목업 이메일. 실 운영에서는 쓰지 않습니다. */
export const NEW_ACCOUNT_EMAIL = "1111@test.com";

/** 신규 계정 시나리오를 트리거하는 목업 비밀번호. 실 운영에서는 쓰지 않습니다. */
export const NEW_ACCOUNT_PASSWORD = "1111";

/** Home 진입 시 튜토리얼 자동 표시 여부를 판단하기 위한 localStorage 플래그 키. */
export const ONBOARDING_SEEN_KEY = "spendtrack:onboarding:seen";

/**
 * 입력된 이메일/비밀번호 조합이 "신규 계정 취급" 규칙에 해당하는지 판별합니다.
 * - 정확히 NEW_ACCOUNT_EMAIL / NEW_ACCOUNT_PASSWORD 인 경우에만 true
 * - 그 외(빈 값, 다른 문자열, 대소문자가 섞인 유사 값 등)는 false
 */
export function isNewAccountCredential(email: string, password: string): boolean {
  return email === NEW_ACCOUNT_EMAIL && password === NEW_ACCOUNT_PASSWORD;
}

/**
 * 입력이 "기존 계정 로그인"으로 취급될 자격 증명인지 판별합니다.
 * - 이메일/비밀번호 모두 비어있지 않아야 함
 * - 신규 계정 자격 증명(1111@test.com / 1111)은 제외
 * 이 조건을 만족하면 "튜토리얼 자동 표시는 건너뛴다"는 시그널로 동작합니다.
 * (과거에는 이 경로에서 시드 거래를 강제로 채워 넣었지만, 실제 입력만 저장하는
 * 정책으로 바뀌면서 현재는 거래 데이터를 건드리지 않습니다.)
 */
export function isSeededDemoCredential(email: string, password: string): boolean {
  if (!email || !password) return false;
  return !isNewAccountCredential(email, password);
}
