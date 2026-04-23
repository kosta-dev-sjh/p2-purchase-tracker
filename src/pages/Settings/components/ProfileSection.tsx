/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Settings\components\ProfileSection.tsx
 */
import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { Button } from "../../../components/primitives/Button";
import { FormField } from "../../../components/form/FormField";
import { TextInput } from "../../../components/form/TextInput";
import { tokens } from "../../../styles/tokens";
import { SettingsBlock } from "./SettingsSection";
import { profileStore, useProfile } from "../../../stores/profileStore";
import { media } from "../../../tokens/breakpoints";

const Row = styled.div`
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 20px;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid ${tokens.color.line2};

  ${media.mobile} {
    grid-template-columns: 1fr;
    gap: 14px;
  }
`;

const Avatar = styled.div<{ $bg?: string }>`
  display: grid;
  width: 72px;
  height: 72px;
  place-items: center;
  border-radius: 50%;
  background: ${({ $bg }) => $bg ?? tokens.color.accent};
  background-size: cover;
  background-position: center;
  color: #fff;
  font-size: 26px;
  font-weight: 700;
  overflow: hidden;
`;

const Meta = styled.div`
  .name {
    color: ${tokens.color.ink1};
    font-size: 15px;
    font-weight: 700;
  }

  .email {
    margin-top: 2px;
    color: ${tokens.color.ink4};
    font-size: 12.5px;
  }

  .actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
    flex-wrap: wrap;
  }
`;

const FieldGrid = styled.div`
  display: grid;
  gap: 14px;
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  padding-top: 4px;

  ${media.mobile} {
    flex-direction: column;
    align-items: stretch;
  }
`;

const StatusText = styled.span<{ $tone: "success" | "error" }>`
  color: ${({ $tone }) => ($tone === "error" ? tokens.color.neg : tokens.color.pos)};
  font-size: 12px;
  font-weight: 600;
`;

const HiddenFileInput = styled.input`
  display: none;
`;

/** 한글 이름의 첫 글자만 추려 아바타 폴백으로 씁니다. 빈 문자열이면 '?'로 떨어짐. */
function initial(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.charAt(0) : "?";
}

export const ProfileSection: React.FC = () => {
  // 저장된 프로필을 구독해 다른 섹션(계정 변경 등)의 업데이트도 즉시 반영합니다.
  const profile = useProfile();
  const [name, setName] = useState(profile.name);
  const [nickname, setNickname] = useState(profile.nickname);
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 구독한 프로필이 바뀌면 입력 상태도 맞춰 줍니다(외부 변경 대응).
  useEffect(() => {
    setName(profile.name);
    setNickname(profile.nickname);
  }, [profile.name, profile.nickname]);

  const handleAvatarPick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarFile: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // 같은 파일을 다시 선택해도 change 이벤트가 나도록 초기화
    if (!file) return;
    // 1MB 이상은 base64로 localStorage에 넣기에 과해서 막습니다. Firestore 이관 전까지의 임시 제한.
    if (file.size > 1024 * 1024) {
      setStatus({ tone: "error", text: "1MB 이하 이미지만 사용할 수 있어요." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      profileStore.save({ avatarDataUrl: String(reader.result) });
      setStatus({ tone: "success", text: "사진을 변경했어요." });
    };
    reader.onerror = () => {
      setStatus({ tone: "error", text: "사진을 읽지 못했어요." });
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarRemove = () => {
    profileStore.save({ avatarDataUrl: null });
    setStatus({ tone: "success", text: "사진을 제거했어요." });
  };

  const handleSave = () => {
    if (!name.trim()) {
      setStatus({ tone: "error", text: "이름을 입력해 주세요." });
      return;
    }
    profileStore.save({ name: name.trim(), nickname: nickname.trim() });
    setStatus({ tone: "success", text: "변경사항을 저장했어요." });
  };

  const avatarBg = profile.avatarDataUrl
    ? `url(${profile.avatarDataUrl})`
    : undefined;

  return (
    <SettingsBlock title="프로필" subtitle="이름과 사진을 변경할 수 있어요.">
      <Row>
        <Avatar $bg={avatarBg}>
          {/* 이미지가 설정돼 있으면 background-image만 보여주고 이니셜은 숨깁니다. */}
          {!profile.avatarDataUrl && initial(profile.name)}
        </Avatar>
        <Meta>
          <div className="name">{profile.name}</div>
          <div className="email">{profile.email}</div>
          <div className="actions">
            <Button variant="ghost" size="sm" onClick={handleAvatarPick}>
              사진 변경
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAvatarRemove}
              disabled={!profile.avatarDataUrl}
            >
              제거
            </Button>
          </div>
          <HiddenFileInput
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarFile}
          />
        </Meta>
      </Row>
      <FieldGrid>
        <FormField label="이름">
          <TextInput value={name} onChange={(event) => setName(event.target.value)} />
        </FormField>
        <FormField label="닉네임">
          <TextInput value={nickname} onChange={(event) => setNickname(event.target.value)} />
        </FormField>
      </FieldGrid>
      <Actions>
        {status && <StatusText $tone={status.tone}>{status.text}</StatusText>}
        <Button variant="primary" size="md" onClick={handleSave}>
          변경사항 저장
        </Button>
      </Actions>
    </SettingsBlock>
  );
};
