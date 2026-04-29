/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Settings\components\DangerSection.tsx
 */
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { PasswordTextInput } from "../../../components/form/TextInput";
import { Button } from "../../../components/primitives/Button";
import { tokens } from "../../../styles/tokens";
import { SettingsBlock } from "./SettingsSection";
import {
  deleteCurrentAccount,
  getAccountDeletionProvider,
} from "../../../lib/firebaseSync";
import { useAuthSession } from "../../../stores/authStore";

const Box = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px;
  border: 1px solid ${tokens.color.negBorder};
  border-radius: 8px;
  background: ${tokens.color.negSubtle};

  .title {
    color: ${tokens.color.neg};
    font-size: 13px;
    font-weight: 700;
  }

  .sub {
    margin-top: 4px;
    color: ${tokens.color.ink3};
    font-size: 12px;
    line-height: 1.5;
  }
`;

const ConfirmBox = styled.div`
  display: grid;
  gap: 10px;
  padding: 16px;
  border: 1px solid ${tokens.color.neg};
  border-radius: 8px;
  background: ${tokens.color.negBg};

  .msg {
    color: ${tokens.color.neg};
    font-size: 13px;
    font-weight: 600;
  }

  .sub {
    color: ${tokens.color.ink2};
    font-size: 12px;
    line-height: 1.5;
  }
`;

const ConfirmInput = styled.input`
  height: 36px;
  padding: 0 12px;
  border: 1px solid ${tokens.color.neg};
  border-radius: ${tokens.radius.control};
  background: #fff;
  color: ${tokens.color.ink1};
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  outline: none;

  &:focus {
    box-shadow: ${tokens.shadow.focus};
  }
`;

const ConfirmPasswordInput = styled(PasswordTextInput)`
  input {
    height: 36px;
    border-color: ${tokens.color.neg};
    background: #fff;
    font-size: 13px;
    font-weight: 600;
  }
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
`;

const StatusText = styled.div`
  margin-top: 10px;
  color: ${tokens.color.pos};
  font-size: 12px;
  font-weight: 600;
`;

const ErrorText = styled(StatusText)`
  color: ${tokens.color.neg};
`;

const ACCOUNT_DELETION_GRACE_DAYS = 7;

/**
 * 되돌릴 수 없는 삭제 흐름이므로 확인 문구 입력을 요구합니다.
 * 사용자가 정확히 '삭제'라고 타이핑해야 실제 삭제 버튼이 활성화됩니다.
 */
const CONFIRM_PHRASE = "삭제";

export const DangerSection: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const deletionProvider = getAccountDeletionProvider(user);
  const [confirming, setConfirming] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPhrase("");
    setPassword("");
    setError(null);
    setConfirming(false);
  };

  const handleDelete = async () => {
    if (phrase.trim() !== CONFIRM_PHRASE) return;
    setSubmitting(true);
    setError(null);
    try {
      await deleteCurrentAccount(deletionProvider === "password" ? password : undefined);
      setDone(true);
      reset();
      navigate("/login", { replace: true });
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      let message = "계정 삭제에 실패했어요. 잠시 후 다시 시도해 주세요.";
      switch (code) {
        case "auth/missing-password":
          message = "현재 비밀번호를 입력해 주세요.";
          break;
        case "auth/wrong-password":
        case "auth/invalid-credential":
          message = "현재 비밀번호가 일치하지 않아요.";
          break;
        case "auth/popup-closed-by-user":
          message = "Google 인증 창이 닫혔어요. 다시 시도해 주세요.";
          break;
        case "functions/failed-precondition":
        case "failed-precondition":
          message = "보안을 위해 최근 로그인 확인이 필요해요. 다시 로그인한 뒤 시도해 주세요.";
          break;
        case "functions/unauthenticated":
        case "auth/no-current-user":
          message = "로그인 상태가 만료됐어요. 다시 로그인해 주세요.";
          break;
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <SettingsBlock title="계정 삭제" subtitle="삭제 예약을 저장했고 로그인 화면으로 이동 중이에요.">
        <Box>
          <div>
            <div className="title">삭제 예약이 완료됐어요</div>
            <div className="sub">{ACCOUNT_DELETION_GRACE_DAYS}일 안에 다시 로그인하면 계정이 자동으로 복구돼요.</div>
          </div>
          <Button variant="secondary" size="md" onClick={() => navigate("/login", { replace: true })}>
            로그인으로 이동
          </Button>
        </Box>
      </SettingsBlock>
    );
  }

  return (
    <SettingsBlock title="계정 삭제" subtitle={`${ACCOUNT_DELETION_GRACE_DAYS}일 뒤 영구 삭제되며, 그 전까지 다시 로그인하면 자동 복구돼요.`}>
      {confirming ? (
        <ConfirmBox>
          <div className="msg">삭제를 예약할까요?</div>
          <div className="sub">
            계속하려면 아래 입력란에 <b>{CONFIRM_PHRASE}</b> 라고 정확히 입력해 주세요.
            예약 직후에는 로그아웃되고, {ACCOUNT_DELETION_GRACE_DAYS}일 안에 다시 로그인하면 자동으로 복구돼요.
          </div>
          <ConfirmInput
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            placeholder={CONFIRM_PHRASE}
            aria-label="삭제 확인 문구"
          />
          {deletionProvider === "password" && (
            <ConfirmPasswordInput
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="현재 비밀번호"
              aria-label="현재 비밀번호"
              // Chrome DevTools Issues: "Improve form fields autocomplete attributes" 회피.
              // 비밀번호 변경/탈퇴 같은 재인증 흐름은 current-password 가 표준.
              autoComplete="current-password"
            />
          )}
          {deletionProvider === "google.com" && (
            <div className="sub">삭제 전에 Google 재인증 팝업이 한 번 열려요.</div>
          )}
          <Actions>
            <Button variant="secondary" size="md" onClick={reset} disabled={submitting}>
              취소
            </Button>
            <Button
              variant="danger"
              size="md"
              onClick={handleDelete}
              disabled={
                submitting ||
                phrase.trim() !== CONFIRM_PHRASE ||
                (deletionProvider === "password" && !password)
              }
            >
              {submitting ? "예약 중..." : "삭제 예약"}
            </Button>
          </Actions>
          {error && <ErrorText>{error}</ErrorText>}
        </ConfirmBox>
      ) : (
        <Box>
          <div>
            <div className="title">계정 삭제 예약</div>
            <div className="sub">유예 기간이 끝나면 회원님의 계정과 저장된 데이터가 함께 영구 삭제돼요.</div>
          </div>
          <Button variant="danger" size="md" onClick={() => setConfirming(true)}>
            계정 삭제
          </Button>
        </Box>
      )}
      {done && <StatusText>삭제 요청을 처리했어요.</StatusText>}
    </SettingsBlock>
  );
};
