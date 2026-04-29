interface FirebaseLikeError {
  code?: string;
  message?: string;
}

type AuthErrorContext =
  | "password-login"
  | "google-login"
  | "auth-session"
  | "email-register"
  | "password-reset";

export interface NormalizedAuthError {
  code: string;
  message: string;
  silent?: boolean;
}

export function extractErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  return ((error as FirebaseLikeError).code ?? "").trim();
}

export interface NormalizedSessionSyncError {
  code: string;
  message: string;
  retriable: boolean;
}

export function normalizeAuthError(
  error: unknown,
  context: AuthErrorContext,
): NormalizedAuthError {
  const code = extractErrorCode(error);

  if (context === "password-reset" && code === "auth/user-not-found") {
    return { code, message: "없는 이메일입니다." };
  }

  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return {
      code,
      message: "로그인이 취소되었어요.",
      silent: true,
    };
  }

  switch (code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return { code, message: "이메일이나 비밀번호가 일치하지 않습니다." };
    case "auth/invalid-email":
      return { code, message: "올바른 이메일 형식을 입력해 주세요." };
    case "auth/email-already-in-use":
      return { code, message: "이미 가입된 이메일이에요. 로그인하거나 비밀번호 재설정을 이용해 주세요." };
    case "auth/email-not-verified":
      return { code, message: "이메일 인증 후 로그인해 주세요." };
    case "auth/email-already-verified":
      return { code, message: "이미 이메일 인증이 완료된 계정이에요. 다시 로그인해 주세요." };
    case "auth/missing-password":
      return { code, message: "비밀번호를 입력해 주세요." };
    case "auth/missing-email":
      return { code, message: "이메일 정보를 확인할 수 없어요. 관리자에게 문의해 주세요." };
    case "auth/weak-password":
      return { code, message: "비밀번호가 너무 약해요. 더 안전한 비밀번호로 다시 입력해 주세요." };
    case "auth/user-disabled":
      return { code, message: "이 계정은 사용이 중지되었어요." };
    case "auth/too-many-requests":
      return { code, message: "너무 많은 요청이 들어와 잠시 후 다시 시도해 주세요." };
    case "auth/network-request-failed":
      return { code, message: "네트워크 연결을 확인한 뒤 다시 시도해 주세요." };
    case "auth/popup-blocked":
      return { code, message: "브라우저가 팝업을 차단했어요. 팝업 허용 후 다시 시도해 주세요." };
    case "auth/account-exists-with-different-credential":
      return { code, message: "이미 다른 로그인 방식으로 가입된 이메일이에요. 기존 방법으로 로그인해 주세요." };
    case "auth/credential-already-in-use":
      return { code, message: "이 Google 계정은 다른 사용자에게 이미 연결되어 있어요." };
    case "auth/unauthorized-domain":
      return {
        code,
        message: "현재 도메인에서 Google 로그인이 허용되어 있지 않아요. 관리자에게 문의해 주세요.",
      };
    case "auth/web-storage-unsupported":
      return {
        code,
        message: "브라우저 저장소를 사용할 수 없어요. 시크릿 모드나 추적 방지 설정을 확인해 주세요.",
      };
    case "auth/operation-not-allowed":
      return { code, message: "현재 이 로그인 방식이 비활성화되어 있어요. 관리자에게 문의해 주세요." };
    case "auth/invalid-api-key":
    case "auth/app-not-authorized":
    case "auth/invalid-app-credential":
      return { code, message: "로그인 설정에 문제가 있어 로그인할 수 없어요. 관리자에게 문의해 주세요." };
    case "auth/internal-error":
      return { code, message: "인증 처리 중 내부 오류가 발생했어요. 잠시 후 다시 시도해 주세요." };
    case "functions/unavailable":
      return { code, message: "서버에 연결할 수 없어 로그인 후 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." };
    case "functions/deadline-exceeded":
      return { code, message: "서버 응답이 지연되고 있어요. 잠시 후 다시 시도해 주세요." };
    case "functions/internal":
      return { code, message: "서버 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요." };
    case "functions/unauthenticated":
      return { code, message: "로그인 상태를 확인하지 못했어요. 다시 로그인해 주세요." };
    case "functions/permission-denied":
      return { code, message: "로그인 후 필요한 권한을 확인하지 못했어요. 관리자에게 문의해 주세요." };
    default:
      break;
  }

  if (context === "google-login") {
    return { code, message: "Google 로그인에 실패했어요. 잠시 후 다시 시도해 주세요." };
  }
  if (context === "email-register") {
    return { code, message: "회원가입에 실패했어요. 입력 내용을 확인한 뒤 다시 시도해 주세요." };
  }
  if (context === "password-reset") {
    return { code, message: "비밀번호 재설정 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  if (context === "auth-session") {
    return { code, message: "로그인 후 계정 정보를 준비하지 못했어요. 다시 시도해 주세요." };
  }
  return { code, message: "로그인에 실패했어요. 잠시 후 다시 시도해 주세요." };
}

export function normalizeSessionSyncError(error: unknown): NormalizedSessionSyncError {
  const code = extractErrorCode(error);

  switch (code) {
    case "auth/network-request-failed":
    case "functions/unavailable":
    case "functions/deadline-exceeded":
    case "unavailable":
    case "cancelled":
    case "aborted":
      return {
        code,
        message: "인터넷 연결 또는 서버 상태가 불안정해 데이터를 동기화하지 못하고 있어요.",
        retriable: true,
      };
    case "permission-denied":
    case "functions/permission-denied":
      return {
        code,
        message: "계정 데이터를 읽을 권한이 없어 동기화를 계속할 수 없어요. 관리자에게 문의해 주세요.",
        retriable: false,
      };
    case "unauthenticated":
    case "functions/unauthenticated":
      return {
        code,
        message: "로그인 상태를 확인하지 못해 데이터를 동기화할 수 없어요. 다시 로그인해 주세요.",
        retriable: false,
      };
    case "failed-precondition":
      return {
        code,
        message: "서비스 설정이 아직 완전히 준비되지 않아 데이터를 불러오지 못하고 있어요.",
        retriable: false,
      };
    default:
      return {
        code,
        message: "계정 데이터를 준비하는 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.",
        retriable: false,
      };
  }
}
