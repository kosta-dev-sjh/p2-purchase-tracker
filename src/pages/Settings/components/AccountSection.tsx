/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Settings\components\AccountSection.tsx
 */
import React, { useState } from "react";
import styled from "styled-components";
import { Button } from "../../../components/primitives/Button";
import { tokens } from "../../../styles/tokens";
import { SettingsBlock } from "./SettingsSection";
import { profileStore, useProfile } from "../../../stores/profileStore";
import { todayAsDotDate } from "../../../utils/date";
import { media } from "../../../tokens/breakpoints";
import { useAuthSession } from "../../../stores/authStore";
import { changeCurrentPassword, getAccountDeletionProvider } from "../../../lib/firebaseSync";

const Item = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 14px 0;
  border-bottom: 1px solid ${tokens.color.line2};

  &:last-child {
    border-bottom: none;
  }

  .label {
    color: ${tokens.color.ink1};
    font-size: 13px;
    font-weight: 600;
  }

  .sub {
    margin-top: 2px;
    color: ${tokens.color.ink4};
    font-size: 12px;
  }

  ${media.mobile} {
    flex-direction: column;
    gap: 12px;
  }
`;

const EditorBody = styled.div`
  display: grid;
  gap: 8px;
  flex: 1;
`;

const EditorRow = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const Input = styled.input`
  flex: 1;
  min-width: 220px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.control};
  background: ${tokens.color.panel};
  color: ${tokens.color.ink1};
  font-family: inherit;
  font-size: ${tokens.type.bodySm.size};
  outline: none;

  &:focus {
    border-color: ${tokens.color.accent};
    box-shadow: ${tokens.shadow.focus};
  }

  ${media.mobile} {
    min-width: 0;
    width: 100%;
  }
`;

const Msg = styled.div<{ $tone: "success" | "error" }>`
  color: ${({ $tone }) => ($tone === "error" ? tokens.color.neg : tokens.color.pos)};
  font-size: 12px;
  font-weight: 600;
`;

const SideButtons = styled.div`
  display: flex;
  gap: 8px;

  ${media.mobile} {
    width: 100%;
    justify-content: stretch;
  }
`;

/**
 * 간단한 이메일 형식 검사. @와 .만 있으면 통과시키는 느슨한 검사로
 * 입력 피드백용 용도에 충분합니다.
 */
function isEmail(value: string): boolean {
  return /.+@.+\..+/.test(value.trim());
}

export const AccountSection: React.FC = () => {
  const profile = useProfile();
  const [editing, setEditing] = useState<null | "email" | "password">(null);
  const [emailDraft, setEmailDraft] = useState(profile.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [message, setMessage] = useState<null | { tone: "success" | "error"; text: string }>(null);
  const { user } = useAuthSession();
  const passwordProvider = getAccountDeletionProvider(user);
  const needsCurrentPassword = passwordProvider === "password";
  const usesGoogleReauth = passwordProvider === "google.com";

  const startEmail = () => {
    setEmailDraft(profile.email);
    setEditing("email");
    setMessage(null);
  };

  const startPassword = () => {
    setCurrentPassword("");
    setPassword("");
    setConfirm("");
    setEditing("password");
    setMessage(null);
  };

  const cancel = () => {
    setEditing(null);
    setMessage(null);
  };

  const saveEmail = () => {
    if (!isEmail(emailDraft)) {
      setMessage({ tone: "error", text: "올바른 이메일 형식을 입력해 주세요." });
      return;
    }
    profileStore.save({ email: emailDraft.trim() });
    setEditing(null);
    setMessage({ tone: "success", text: "이메일을 변경했어요." });
  };

  const savePassword = async () => {
    if (needsCurrentPassword && !currentPassword) {
      setMessage({ tone: "error", text: "현재 비밀번호를 입력해 주세요." });
      return;
    }
    if (password.length < 8) {
      setMessage({ tone: "error", text: "비밀번호는 8자 이상이어야 해요." });
      return;
    }
    if (password !== confirm) {
      setMessage({ tone: "error", text: "두 비밀번호가 일치하지 않아요." });
      return;
    }

    setSavingPassword(true);
    try {
      await changeCurrentPassword(password, currentPassword);
      profileStore.save({ passwordChangedAt: todayAsDotDate() });
      setEditing(null);
      setMessage({ tone: "success", text: "비밀번호를 변경했어요." });
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      let text = "비밀번호 변경에 실패했어요. 잠시 후 다시 시도해 주세요.";
      switch (code) {
        case "auth/missing-password":
          text = "현재 비밀번호를 입력해 주세요.";
          break;
        case "auth/wrong-password":
        case "auth/invalid-credential":
          text = "현재 비밀번호가 일치하지 않아요.";
          break;
        case "auth/weak-password":
          text = "더 강한 비밀번호를 입력해 주세요.";
          break;
        case "auth/requires-recent-login":
          text = "보안을 위해 다시 로그인한 뒤 시도해 주세요.";
          break;
        case "auth/popup-closed-by-user":
          text = "Google 재인증 창이 닫혀 비밀번호를 변경하지 못했어요.";
          break;
        case "auth/unsupported-provider":
          text = "이 로그인 방식에서는 비밀번호를 직접 변경할 수 없어요.";
          break;
        case "auth/no-current-user":
          text = "로그인 상태를 확인한 뒤 다시 시도해 주세요.";
          break;
      }
      setMessage({ tone: "error", text });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <SettingsBlock title="계정" subtitle="이메일과 비밀번호를 관리해요.">
      <Item>
        {editing === "email" ? (
          <EditorBody>
            <div className="label">이메일 변경</div>
            <EditorRow>
              <Input
                type="email"
                value={emailDraft}
                onChange={(event) => setEmailDraft(event.target.value)}
                placeholder="new@example.com"
              />
              <SideButtons>
                <Button variant="secondary" size="sm" onClick={cancel}>
                  취소
                </Button>
                <Button variant="primary" size="sm" onClick={saveEmail}>
                  저장
                </Button>
              </SideButtons>
            </EditorRow>
            {message && <Msg $tone={message.tone}>{message.text}</Msg>}
          </EditorBody>
        ) : (
          <>
            <div>
              <div className="label">이메일</div>
              <div className="sub">{profile.email}</div>
              {message && editing === null && <Msg $tone={message.tone}>{message.text}</Msg>}
            </div>
            <Button variant="ghost" size="sm" onClick={startEmail}>
              변경
            </Button>
          </>
        )}
      </Item>
      <Item>
        {editing === "password" ? (
          <EditorBody>
            <div className="label">비밀번호 변경</div>
            {needsCurrentPassword && (
              <EditorRow>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  placeholder="현재 비밀번호"
                  autoComplete="current-password"
                />
              </EditorRow>
            )}
            <EditorRow>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="새 비밀번호 (8자 이상)"
                autoComplete="new-password"
              />
              <Input
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder="새 비밀번호 확인"
                autoComplete="new-password"
              />
            </EditorRow>
            {usesGoogleReauth && (
              <div className="sub">저장 시 Google 재인증 창이 열립니다.</div>
            )}
            <EditorRow>
              <SideButtons>
                <Button variant="secondary" size="sm" onClick={cancel} disabled={savingPassword}>
                  취소
                </Button>
                <Button variant="primary" size="sm" onClick={savePassword} disabled={savingPassword}>
                  {savingPassword ? "변경 중..." : "저장"}
                </Button>
              </SideButtons>
            </EditorRow>
            {message && <Msg $tone={message.tone}>{message.text}</Msg>}
          </EditorBody>
        ) : (
          <>
            <div>
              <div className="label">비밀번호</div>
              {/* passwordChangedAt이 비어 있으면(아직 변경 이력 없음) "기록 없음"으로 폴백합니다.
                  이전에는 "마지막 변경: " 뒤가 빈 채로 콜론만 떠 있어 "데이터 누락처럼 보이는" 결함이 있었어요. */}
              <div className="sub">
                마지막 변경: {profile.passwordChangedAt || "기록 없음"}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={startPassword}>
              변경
            </Button>
          </>
        )}
      </Item>
    </SettingsBlock>
  );
};
