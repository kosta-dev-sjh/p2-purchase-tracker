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
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<null | { tone: "success" | "error"; text: string }>(null);

  const startEmail = () => {
    setEmailDraft(profile.email);
    setEditing("email");
    setMessage(null);
  };

  const startPassword = () => {
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

  const savePassword = () => {
    if (password.length < 8) {
      setMessage({ tone: "error", text: "비밀번호는 8자 이상이어야 해요." });
      return;
    }
    if (password !== confirm) {
      setMessage({ tone: "error", text: "두 비밀번호가 일치하지 않아요." });
      return;
    }
    // 실제 비밀번호는 저장하지 않고 변경 시각만 기록합니다. 데모 범위에서 필요한 최소치입니다.
    profileStore.save({ passwordChangedAt: todayAsDotDate() });
    setEditing(null);
    setMessage({ tone: "success", text: "비밀번호를 변경했어요." });
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
            <EditorRow>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="새 비밀번호 (8자 이상)"
              />
              <Input
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder="새 비밀번호 확인"
              />
            </EditorRow>
            <EditorRow>
              <SideButtons>
                <Button variant="secondary" size="sm" onClick={cancel}>
                  취소
                </Button>
                <Button variant="primary" size="sm" onClick={savePassword}>
                  저장
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
