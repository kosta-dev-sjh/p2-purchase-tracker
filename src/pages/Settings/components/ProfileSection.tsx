/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Settings\components\ProfileSection.tsx
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { Button } from "../../../components/primitives/Button";
import { FormField } from "../../../components/form/FormField";
import { TextInput } from "../../../components/form/TextInput";
import { tokens } from "../../../styles/tokens";
import { SettingsBlock } from "./SettingsSection";
import { profileStore, useProfile } from "../../../stores/profileStore";
import { media } from "../../../tokens/breakpoints";
import { changeNicknameWithCooldown, type ChangeNicknameError } from "../../../lib/firebaseSync";

// 서버(functions/src/index.ts NICKNAME_COOLDOWN_HOURS) 와 동일한 값. 서버가 진실원이지만,
// UI 가 "다음 변경 가능까지 N시간 남음" 을 표시하려면 클라이언트도 같은 상수를 알아야 합니다.
const NICKNAME_COOLDOWN_HOURS = 24;
const NICKNAME_COOLDOWN_MS = NICKNAME_COOLDOWN_HOURS * 60 * 60 * 1000;
const NICKNAME_MAX_LENGTH = 20;

/** 남은 쿨다운(ms)을 "1시간 23분" / "5분" 같은 사람이 읽기 좋은 한국어로 변환 */
function formatRemaining(ms: number): string {
  if (ms <= 0) return "0분";
  const minutes = Math.ceil(ms / (60 * 1000));
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (remMin === 0) return `${hours}시간`;
  return `${hours}시간 ${remMin}분`;
}

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

/**
 * 닉네임 필드 아래에 작게 깔리는 도움말. 두 가지 모드:
 * - 쿨다운 진행 중: "다음 변경까지 N시간 남음" + ink4
 * - 변경 가능: "24시간에 한 번 변경할 수 있어요" + ink4
 * 빈번한 변경 방어 정책을 사용자에게 가시화하기 위함입니다(서버는 강제, UI 는 안내).
 */
const FieldHint = styled.span<{ $tone?: "muted" | "warn" }>`
  display: block;
  margin-top: 6px;
  color: ${({ $tone }) => ($tone === "warn" ? tokens.color.warn : tokens.color.ink4)};
  font-size: 12px;
  line-height: 1.4;
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
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [nicknameDraft, setNicknameDraft] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 쿨다운 카운트다운을 1분 단위로 갱신해 사용자가 "다음 변경까지 N시간" 을 실시간으로 봅니다.
  // (작은 도움말이라 매초까지 갱신할 필요는 없음 — 1분이면 충분히 자연스러움)
  const [tick, setTick] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const name = nameDraft ?? profile.name;
  const nickname = nicknameDraft ?? profile.nickname;

  // 닉네임 쿨다운 계산. 서버가 진실원이라 클라이언트 값은 보조 표시용입니다.
  const cooldown = useMemo(() => {
    if (!profile.nicknameChangedAt) {
      return { active: false, remainingMs: 0, nextAvailableLabel: null as string | null };
    }
    const last = new Date(profile.nicknameChangedAt).getTime();
    if (!Number.isFinite(last)) {
      return { active: false, remainingMs: 0, nextAvailableLabel: null };
    }
    const elapsed = Date.now() - last;
    const remainingMs = NICKNAME_COOLDOWN_MS - elapsed;
    if (remainingMs <= 0) {
      return { active: false, remainingMs: 0, nextAvailableLabel: null };
    }
    const nextAt = new Date(last + NICKNAME_COOLDOWN_MS);
    const label = `${nextAt.getMonth() + 1}월 ${nextAt.getDate()}일 ${String(
      nextAt.getHours(),
    ).padStart(2, "0")}:${String(nextAt.getMinutes()).padStart(2, "0")}`;
    return { active: true, remainingMs, nextAvailableLabel: label };
    // tick 을 의존성에 두어 1분마다 다시 계산.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.nicknameChangedAt, tick]);

  useEffect(() => {
    if (!cooldown.active) return;
    const id = window.setInterval(() => setTick((v) => v + 1), 60_000);
    return () => window.clearInterval(id);
  }, [cooldown.active]);

  const nicknameTrimmed = nickname.trim();
  const nicknameUnchanged = nicknameTrimmed === profile.nickname.trim();
  const nicknameInvalid =
    nicknameTrimmed.length === 0 || nicknameTrimmed.length > NICKNAME_MAX_LENGTH;
  const nicknameLocked = cooldown.active && !nicknameUnchanged;

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

  const handleSave = async () => {
    if (submitting) return;
    if (!name.trim()) {
      setStatus({ tone: "error", text: "이름을 입력해 주세요." });
      return;
    }
    if (nicknameInvalid) {
      setStatus({
        tone: "error",
        text: `닉네임은 1~${NICKNAME_MAX_LENGTH}자 사이로 입력해 주세요.`,
      });
      return;
    }
    if (nicknameLocked) {
      setStatus({
        tone: "error",
        text: `닉네임은 ${NICKNAME_COOLDOWN_HOURS}시간에 한 번만 변경할 수 있어요. (남은 시간 ${formatRemaining(cooldown.remainingMs)})`,
      });
      return;
    }

    setSubmitting(true);
    try {
      // 이름은 일반 경로(saveUserProfile) 로 저장. 닉네임 변경이 함께 있으면 callable 호출.
      // 두 필드를 한 번에 저장하는 UX 를 유지하면서, 닉네임만 보안 게이트를 통과시킵니다.
      const nameChanged = name.trim() !== profile.name.trim();
      if (nameChanged) {
        profileStore.save({ name: name.trim() });
      }

      if (!nicknameUnchanged) {
        await changeNicknameWithCooldown(nicknameTrimmed);
        // onSnapshot 이 nickname / nicknameChangedAt 을 흘려보내 store 가 자동 갱신됩니다.
        // 그 사이 입력값이 깜빡이지 않도록 draft 만 비워둡니다.
      }

      setNameDraft(null);
      setNicknameDraft(null);
      setStatus({ tone: "success", text: "변경사항을 저장했어요." });
    } catch (error) {
      const err = error as ChangeNicknameError;
      // 서버가 던지는 resource-exhausted 코드를 그대로 받아 사람이 읽기 좋은 메시지로 변환.
      if (err.code === "functions/resource-exhausted" || err.code === "resource-exhausted") {
        const remaining = err.retryAfterMs ?? cooldown.remainingMs;
        setStatus({
          tone: "error",
          text: `닉네임은 ${NICKNAME_COOLDOWN_HOURS}시간에 한 번만 변경할 수 있어요. (남은 시간 ${formatRemaining(remaining)})`,
        });
      } else if (err.code === "functions/invalid-argument" || err.code === "invalid-argument") {
        setStatus({ tone: "error", text: err.message || "닉네임 형식이 올바르지 않아요." });
      } else {
        setStatus({ tone: "error", text: err.message || "닉네임을 저장하지 못했어요." });
      }
    } finally {
      setSubmitting(false);
    }
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
          <TextInput value={name} onChange={(event) => setNameDraft(event.target.value)} />
        </FormField>
        <FormField label="닉네임">
          <TextInput
            value={nickname}
            onChange={(event) => setNicknameDraft(event.target.value)}
            maxLength={NICKNAME_MAX_LENGTH}
            disabled={nicknameLocked}
            aria-invalid={nicknameInvalid || nicknameLocked || undefined}
          />
          {/*
           * 쿨다운 안내: "다음 변경: M월 D일 HH:MM" 형식으로 사용자가 다시 시도할
           * 시점을 명확히 알 수 있게 합니다. 쿨다운이 없을 때도 정책을 미리 알리는
           * 짧은 안내를 보여줘서, 변경 후에 갑작스러운 실패로 놀라지 않게 합니다.
           */}
          {nicknameLocked ? (
            <FieldHint $tone="warn">
              닉네임은 {NICKNAME_COOLDOWN_HOURS}시간에 한 번만 변경할 수 있어요.
              남은 시간 {formatRemaining(cooldown.remainingMs)}
              {cooldown.nextAvailableLabel ? ` (다음 변경: ${cooldown.nextAvailableLabel})` : ""}
            </FieldHint>
          ) : (
            <FieldHint>
              빈번한 변경 방지를 위해 닉네임은 {NICKNAME_COOLDOWN_HOURS}시간에 한 번만 바꿀 수 있어요.
            </FieldHint>
          )}
        </FormField>
      </FieldGrid>
      <Actions>
        {status && <StatusText $tone={status.tone}>{status.text}</StatusText>}
        <Button
          variant="primary"
          size="md"
          onClick={handleSave}
          disabled={submitting}
        >
          {submitting ? "저장 중..." : "변경사항 저장"}
        </Button>
      </Actions>
    </SettingsBlock>
  );
};
