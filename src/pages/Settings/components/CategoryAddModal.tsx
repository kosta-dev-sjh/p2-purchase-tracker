/**
 * 역할: 설정 · 카테고리 섹션에서 "카테고리 추가" 버튼을 눌렀을 때 뜨는 팝업 모달입니다.
 *       사이트 전반의 Modal/FormField/Button/TextInput 공통 컴포넌트를 그대로 써서
 *       다른 화면과 톤을 일치시킵니다.
 * 위치: src\pages\Settings\components\CategoryAddModal.tsx
 */
import { useState } from "react";
import styled from "styled-components";
import { Button } from "../../../components/primitives/Button";
import { FormField } from "../../../components/form/FormField";
import { TextInput } from "../../../components/form/TextInput";
import { Modal } from "../../../components/modal/Modal";
import { tokens } from "../../../styles/tokens";

export interface CategoryAddPayload {
  name: string;
  color: string;
}

/**
 * 모달의 두 가지 동작 모드.
 * - "add": 새 카테고리를 만든다. 기본값은 빈 이름 + 첫 프리셋 색.
 * - "edit": 기존 카테고리의 이름/색을 수정한다. initialName/initialColor가 채워져야 한다.
 *   nameLocked=true면 이름 필드를 읽기 전용으로 잠가 시스템 라벨(예: 기타)을 보호한다.
 */
type CategoryModalMode =
  | { kind: "add" }
  | { kind: "edit"; initialName: string; initialColor: string; nameLocked?: boolean };

interface CategoryAddModalProps {
  isOpen: boolean;
  /** 같은 이름이 이미 있으면 경고를 보여주기 위해 상위에서 기존 이름 목록을 내려받습니다.
   *  편집 모드에서는 자기 자신 이름을 미리 제외해서 넘겨주면 됩니다. */
  existingNames: string[];
  /** 생략하면 기존처럼 "추가" 모드로 동작해 호출부 호환성을 유지합니다. */
  mode?: CategoryModalMode;
  onClose: () => void;
  onSubmit: (payload: CategoryAddPayload) => void;
}

/**
 * 사이트의 차트 색상 팔레트(tokens.color.cat1~5, accent, pos, neg)에서 골라낸 프리셋.
 * tokens.color.warn이 tokens.color.cat3과 동일한 "#B45309"라 중복돼 있어 팔레트에서 제외하고,
 * 대신 색상 스펙트럼이 비는 노란색(#EAB308)을 채워 12개 프리셋을 겹치지 않게 유지합니다.
 * Set으로 한 번 더 걸러 후속 편집으로 실수로 중복이 들어가도 한 칸만 남도록 방어합니다.
 */
const PRESET_COLORS: string[] = Array.from(
  new Set<string>([
    tokens.color.accent, // 인디고
    tokens.color.cat2, // 청록
    tokens.color.cat3, // 주황 (burnt)
    tokens.color.cat4, // 자홍
    tokens.color.pos, // 초록
    tokens.color.neg, // 적
    "#EAB308", // 노랑 (기존 warn 자리 — cat3와 hex 중복이라 교체)
    "#0EA5E9", // 하늘색
    "#A855F7", // 라벤더
    "#F59E0B", // 황금색
    "#EC4899", // 핑크
    tokens.color.cat5, // 중립 회색
  ].map((color) => color.toUpperCase()))
);

const BodyStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 18px;
`;

const SwatchGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
`;

/**
 * 프리셋 색상 스와치. 체크된 상태에서는 내부에 흰색 체크마크가 보이고
 * 바깥쪽 링으로 포커스 상태를 표시합니다.
 */
const Swatch = styled.button<{ $color: string; $selected: boolean }>`
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: ${tokens.radius.control};
  border: 2px solid
    ${({ $selected }) => ($selected ? tokens.color.ink1 : "transparent")};
  background: ${({ $color }) => $color};
  cursor: pointer;
  padding: 0;
  transition:
    transform ${tokens.motion.fast} ease,
    border-color ${tokens.motion.fast} ease,
    box-shadow ${tokens.motion.fast} ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(16, 24, 40, 0.12);
  }

  &:focus-visible {
    outline: none;
    box-shadow: ${tokens.shadow.focus};
  }

  .mark {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: #fff;
    opacity: ${({ $selected }) => ($selected ? 1 : 0)};
    transition: opacity ${tokens.motion.fast} ease;
  }
`;

const HexInputRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const HexPreview = styled.span<{ $color: string }>`
  display: inline-block;
  width: 28px;
  height: 28px;
  border-radius: ${tokens.radius.control};
  border: 1px solid ${tokens.color.line};
  background: ${({ $color }) => $color};
  flex-shrink: 0;
`;

const ErrorLine = styled.div`
  color: ${tokens.color.neg};
  font-size: 12px;
  font-weight: 500;
`;

/** "#RRGGBB" 형식의 hex 색상인지 검증합니다. "#" 없이 6자리만 와도 자동으로 붙여 주도록 별도 처리합니다. */
function normalizeHex(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) return withHash.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    // 3자리 축약형("#ABC")은 6자리로 펼칩니다.
    const [, a, b, c] = withHash;
    return `#${a}${a}${b}${b}${c}${c}`.toUpperCase();
  }
  return null;
}

export const CategoryAddModal = ({
  isOpen,
  existingNames,
  mode = { kind: "add" },
  onClose,
  onSubmit,
}: CategoryAddModalProps) => {
  const isEdit = mode.kind === "edit";
  const nameLocked = mode.kind === "edit" && mode.nameLocked === true;

  const [name, setName] = useState(() => (mode.kind === "edit" ? mode.initialName : ""));
  const [color, setColor] = useState<string>(() =>
    mode.kind === "edit" ? mode.initialColor.toUpperCase() : PRESET_COLORS[0]
  );
  const [hexDraft, setHexDraft] = useState<string>(() =>
    mode.kind === "edit" ? mode.initialColor.toUpperCase() : PRESET_COLORS[0]
  );
  const [error, setError] = useState<string | null>(null);

  const handleSwatchClick = (preset: string) => {
    setColor(preset);
    setHexDraft(preset);
  };

  const handleHexChange = (value: string) => {
    setHexDraft(value);
    const normalized = normalizeHex(value);
    if (normalized) {
      setColor(normalized);
    }
  };

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("카테고리 이름을 입력해 주세요.");
      return;
    }
    if (existingNames.some((existing) => existing === trimmed)) {
      setError("이미 같은 이름의 카테고리가 있어요.");
      return;
    }
    const normalizedColor = normalizeHex(hexDraft) ?? color;
    onSubmit({ name: trimmed, color: normalizedColor });
    onClose();
  };

  const modalTitle = isEdit ? "카테고리 수정" : "카테고리 추가";
  const submitLabel = isEdit ? "변경 사항 저장" : "카테고리 추가하기";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle}>
      <BodyStack>
        <FormField
          label="카테고리 이름"
          required={!nameLocked}
          helpText={
            nameLocked
              ? "‘기타’는 미지정 거래의 기본 분류라 이름은 바꿀 수 없어요. 색상만 조정할 수 있어요."
              : undefined
          }
        >
          <TextInput
            value={name}
            disabled={nameLocked}
            onChange={(event) => {
              setName(event.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="예: 취미, 반려동물, 뷰티"
            autoFocus={!nameLocked}
          />
        </FormField>

        <FormField
          label="카테고리 색상"
          helpText="차트와 리포트에서 이 카테고리를 표시할 색이에요. 팔레트에서 고르거나 HEX 코드로 직접 지정할 수 있어요."
        >
          <SwatchGrid role="radiogroup" aria-label="카테고리 색상 팔레트">
            {PRESET_COLORS.map((preset) => {
              const isSelected = preset.toUpperCase() === color.toUpperCase();
              return (
                <Swatch
                  key={preset}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={preset}
                  $color={preset}
                  $selected={isSelected}
                  onClick={() => handleSwatchClick(preset)}
                >
                  <span className="mark" aria-hidden="true">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 8.5 6.5 12 13 4.5" />
                    </svg>
                  </span>
                </Swatch>
              );
            })}
          </SwatchGrid>
        </FormField>

        <FormField label="HEX 코드로 지정" helpText="선택한 팔레트 색을 미세 조정하거나, 원하는 색상을 직접 입력할 수 있어요.">
          <HexInputRow>
            <HexPreview $color={normalizeHex(hexDraft) ?? color} aria-hidden="true" />
            <TextInput
              value={hexDraft}
              onChange={(event) => handleHexChange(event.target.value)}
              placeholder="#4F46E5"
              maxLength={7}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              aria-label="HEX 색상 코드"
            />
          </HexInputRow>
        </FormField>

        {error && <ErrorLine role="alert">{error}</ErrorLine>}

        <Button variant="primary" size="lg" fullWidth onClick={handleSubmit}>
          {submitLabel}
        </Button>
      </BodyStack>
    </Modal>
  );
};
