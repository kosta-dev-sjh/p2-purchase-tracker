export interface PasswordPolicyResult {
  isValid: boolean;
  error?: string;
}

export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  if (!password) {
    return { isValid: false, error: "비밀번호를 입력해 주세요." };
  }
  if (/\s/.test(password)) {
    return { isValid: false, error: "비밀번호에 공백을 포함할 수 없어요." };
  }
  if (password.length < 8) {
    return { isValid: false, error: "비밀번호는 8자 이상이어야 해요." };
  }
  if (!/\d/.test(password)) {
    return { isValid: false, error: "비밀번호에 숫자를 포함해 주세요." };
  }
  return { isValid: true };
}

export function scorePassword(value: string): 0 | 1 | 2 | 3 | 4 {
  if (!value) {
    return 0;
  }

  let score = 0;
  if (value.length >= 8) score++;
  if (/[A-Z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;

  return score as 0 | 1 | 2 | 3 | 4;
}
