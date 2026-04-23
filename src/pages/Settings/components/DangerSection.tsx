/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 * 위치: src\pages\Settings\components\DangerSection.tsx
 */
import React, { useState } from "react";
import styled from "styled-components";
import { Button } from "../../../components/primitives/Button";
import { tokens } from "../../../styles/tokens";
import { SettingsBlock } from "./SettingsSection";
import { profileStore } from "../../../stores/profileStore";
import { transactionsStore } from "../../../stores/transactionsStore";

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

/**
 * 되돌릴 수 없는 삭제 흐름이므로 확인 문구 입력을 요구합니다.
 * 사용자가 정확히 '삭제'라고 타이핑해야 실제 삭제 버튼이 활성화됩니다.
 */
const CONFIRM_PHRASE = "삭제";

export const DangerSection: React.FC = () => {
  const [confirming, setConfirming] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [done, setDone] = useState(false);

  const reset = () => {
    setPhrase("");
    setConfirming(false);
  };

  const handleDelete = () => {
    if (phrase.trim() !== CONFIRM_PHRASE) return;
    // 데모 단계라 실제 계정 삭제 대신 로컬 데이터를 초기화합니다.
    // Firestore 연동 시 이 두 호출을 계정 삭제 API 호출로 바꾸면 됩니다.
    profileStore.reset();
    transactionsStore.replaceAll([]);
    setDone(true);
    reset();
  };

  if (done) {
    return (
      <SettingsBlock title="계정 삭제" subtitle="데모 환경에서 모든 로컬 데이터를 비웠어요.">
        <Box>
          <div>
            <div className="title">삭제가 완료됐어요</div>
            <div className="sub">프로필과 거래 내역이 초기값으로 되돌아갔어요.</div>
          </div>
          <Button
            variant="secondary"
            size="md"
            onClick={() => {
              setDone(false);
              // 리셋한 데이터를 페이지 전반에 반영하려면 새로고침이 가장 확실합니다.
              window.location.reload();
            }}
          >
            새로고침
          </Button>
        </Box>
      </SettingsBlock>
    );
  }

  return (
    <SettingsBlock title="계정 삭제" subtitle="계정을 삭제하면 모든 거래 내역과 설정이 영구적으로 제거돼요.">
      {confirming ? (
        <ConfirmBox>
          <div className="msg">정말로 삭제할까요?</div>
          <div className="sub">
            계속하려면 아래 입력란에 <b>{CONFIRM_PHRASE}</b> 라고 정확히 입력해 주세요.
            데모 환경에서는 로컬 저장된 프로필과 거래 내역이 초기값으로 재설정돼요.
          </div>
          <ConfirmInput
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            placeholder={CONFIRM_PHRASE}
            aria-label="삭제 확인 문구"
          />
          <Actions>
            <Button variant="secondary" size="md" onClick={reset}>
              취소
            </Button>
            <Button
              variant="danger"
              size="md"
              onClick={handleDelete}
              disabled={phrase.trim() !== CONFIRM_PHRASE}
            >
              영구 삭제
            </Button>
          </Actions>
        </ConfirmBox>
      ) : (
        <Box>
          <div>
            <div className="title">계정과 모든 데이터 삭제</div>
            <div className="sub">이 작업은 되돌릴 수 없어요.</div>
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
