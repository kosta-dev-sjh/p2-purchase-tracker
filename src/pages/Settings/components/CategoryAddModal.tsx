/**
 * 역할: 설정 · 카테고리 섹션에서 "카테고리 추가" 버튼을 눌렀을 때 뜨는 팝업 모달입니다.
 *       사이트 전반의 Modal/FormField/Button/TextInput 공통 컴포넌트를 그대로 써서
 *       다른 화면과 톤을 일치시킵니다.
 *
 *       이름 입력값이 내부 개념 카탈로그의 별칭과 유사하면 "이 카테고리에 ○○ 자동 분류를
 *       연결할까요?"를 제안해, 사용자가 새 카테고리를 만들자마자 가맹점 자동 분류를
 *       곧바로 써먹을 수 있게 해뒀습니다.
 * 위치: src\pages\Settings\components\CategoryAddModal.tsx
 */
import { useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { Button } from "../../../components/primitives/Button";
import { FormField } from "../../../components/form/FormField";
import { TextInput } from "../../../components/form/TextInput";
import { Modal } from "../../../components/modal/Modal";
import { tokens } from "../../../styles/tokens";
import {
  CATEGORY_CONCEPTS,
  CONCEPT_BY_ID,
  suggestConceptByName,
  type ConceptId,
} from "../../../data/categoryConcepts";

export interface CategoryAddPayload {
  name: string;
  color: string;
  conceptIds: ConceptId[];
}

/**
 * 모달의 두 가지 동작 모드.
 * - "add": 새 카테고리를 만든다. 기본값은 빈 이름 + 첫 프리셋 색.
 * - "edit": 기존 카테고리의 이름/색/개념 바인딩을 수정한다. initial* 값들이 채워져야 한다.
 *   nameLocked=true면 이름 필드를 읽기 전용으로 잠가 시스템 라벨(예: 기타)을 보호한다.
 */
type CategoryModalMode =
  | { kind: "add" }
  | {
      kind: "edit";
      initialName: string;
      initialColor: string;
      initialConceptIds?: ConceptId[];
      nameLocked?: boolean;
    };

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

/**
 * HEX 입력 옆 색상 미리보기. 단순히 색만 보여주는 게 아니라 버튼으로 동작해
 * 클릭하면 숨겨진 `<input type="color">`를 통해 OS 네이티브 색상 팔레트가 뜬다.
 * 다른 폼 컨트롤과 톤을 맞추기 위해 라인/포커스/호버 처리를 공통 토큰 기준으로 잡았다.
 */
const HexPreview = styled.button<{ $color: string }>`
  position: relative;
  width: 28px;
  height: 28px;
  border-radius: ${tokens.radius.control};
  border: 1px solid ${tokens.color.line};
  background: ${({ $color }) => $color};
  flex-shrink: 0;
  padding: 0;
  cursor: pointer;
  transition:
    border-color ${tokens.motion.fast} ease,
    box-shadow ${tokens.motion.fast} ease,
    transform ${tokens.motion.fast} ease;

  &:hover {
    border-color: ${tokens.color.ink4};
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(16, 24, 40, 0.1);
  }

  &:focus-visible {
    outline: none;
    box-shadow: ${tokens.shadow.focus};
    border-color: ${tokens.color.accent};
  }
`;

/**
 * 화면에는 보이지 않지만 HexPreview 클릭 시 click()으로 활성화되는 네이티브 color input.
 * display:none 으로 두면 일부 브라우저(특히 Safari)가 picker 좌표를 잡지 못해 화면 밖에 띄우는
 * 경우가 있어, 시각적으로는 안 보이게 하되 DOM 위치는 HexPreview 옆에 유지한다.
 */
const HiddenColorInput = styled.input.attrs({ type: "color" })`
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
  border: 0;
  padding: 0;
  margin: 0;
`;

const ErrorLine = styled.div`
  color: ${tokens.color.neg};
  font-size: 12px;
  font-weight: 500;
`;

const SuggestionCard = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px dashed ${tokens.color.accent};
  border-radius: ${tokens.radius.control};
  background: ${tokens.color.tint};
  color: ${tokens.color.ink2};
  font-size: 12.5px;
`;

const SuggestionText = styled.span`
  strong {
    color: ${tokens.color.ink1};
    font-weight: 600;
  }
`;

const ConceptChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const ConceptChip = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: ${tokens.radius.chip};
  border: 1px solid
    ${({ $active }) => ($active ? tokens.color.accent : tokens.color.line)};
  background: ${({ $active }) => ($active ? tokens.color.tint : tokens.color.panel)};
  color: ${({ $active }) => ($active ? tokens.color.accentHover : tokens.color.ink3)};
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background ${tokens.motion.fast} ease,
    border-color ${tokens.motion.fast} ease,
    color ${tokens.motion.fast} ease;

  &:hover {
    border-color: ${tokens.color.accent};
  }
`;

/**
 * 개념 id를 사용자에게 보여줄 짧은 레이블로 변환. 별칭의 첫 한국어 항목을 우선 표시하고,
 * 없으면 id 자체를 대문자화해 폴백.
 */
function conceptLabel(id: ConceptId): string {
  const concept = CONCEPT_BY_ID[id];
  const koAlias = concept.aliases.find((alias) => /[가-힣]/.test(alias));
  return koAlias ?? id;
}

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
  const [conceptIds, setConceptIds] = useState<ConceptId[]>(() =>
    mode.kind === "edit" ? (mode.initialConceptIds ?? []) : []
  );
  const [error, setError] = useState<string | null>(null);

  /**
   * HexPreview 버튼이 눌리면 이 input 의 click() 을 호출해 OS 네이티브 색상 팔레트를 띄운다.
   * 사용자가 picker 에서 색을 고르면 `onChange` 가 #RRGGBB 형식의 값을 그대로 넘겨주므로
   * 별도 정규화 없이 hex 입력값과 색을 동시에 갱신한다.
   */
  const colorInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * 이름 입력값이 어떤 개념 별칭과 매칭되는지 실시간 계산. 이미 체크돼 있거나 다른 카테고리에서
   * 가져가지 못하는 개념이더라도, 여기서는 제안만 내고 실제 바인딩 충돌은 스토어(reassignConcepts)가
   * 해결하므로 모달 쪽은 단순 제안에 집중한다.
   */
  const suggestedConceptId = useMemo(() => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const hit = suggestConceptByName(trimmed);
    if (!hit) return null;
    return hit;
  }, [name]);

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

  /**
   * 네이티브 color input 에서 색을 골랐을 때 — 항상 #RRGGBB 형식이 보장되므로
   * 표시 hex draft 와 실제 color 를 동시에 대문자 정규화해 동기화한다.
   */
  const handleNativePick = (value: string) => {
    const upper = value.toUpperCase();
    setColor(upper);
    setHexDraft(upper);
  };

  const openNativePicker = () => {
    const node = colorInputRef.current;
    if (!node) return;
    // showPicker() 가 가능한 환경에서는 그쪽을 우선 사용한다 (Chrome/Edge 최신).
    // 미지원 브라우저(Safari 등) 폴백으로 click() 을 호출.
    if (typeof node.showPicker === "function") {
      try {
        node.showPicker();
        return;
      } catch {
        // 일부 환경에서 showPicker 가 SecurityError 를 던질 수 있어 click 으로 폴백.
      }
    }
    node.click();
  };

  const toggleConcept = (conceptId: ConceptId) => {
    setConceptIds((prev) =>
      prev.includes(conceptId)
        ? prev.filter((id) => id !== conceptId)
        : [...prev, conceptId]
    );
  };

  const handleAcceptSuggestion = () => {
    if (!suggestedConceptId) return;
    if (conceptIds.includes(suggestedConceptId)) return;
    setConceptIds((prev) => [...prev, suggestedConceptId]);
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
    onSubmit({ name: trimmed, color: normalizedColor, conceptIds });
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

        {!nameLocked && (
          <FormField
            label="자동 분류 연결"
            helpText="이 카테고리와 연결된 가맹점 규칙에 맞는 결제는 카드 내역 가져오기·주문 캡처로 불러올 때 자동으로 이 카테고리로 분류돼요. 수동 입력이나 거래 수정에는 영향을 주지 않아요."
          >
            {suggestedConceptId && !conceptIds.includes(suggestedConceptId) && (
              <SuggestionCard>
                <SuggestionText>
                  <strong>{conceptLabel(suggestedConceptId)}</strong> 가맹점 규칙을 이 카테고리에 연결할까요?
                </SuggestionText>
                <Button variant="secondary" size="sm" onClick={handleAcceptSuggestion}>
                  연결
                </Button>
              </SuggestionCard>
            )}
            <ConceptChipRow style={{ marginTop: suggestedConceptId ? 10 : 0 }}>
              {CATEGORY_CONCEPTS.map((concept) => {
                const active = conceptIds.includes(concept.id);
                return (
                  <ConceptChip
                    key={concept.id}
                    type="button"
                    $active={active}
                    aria-pressed={active}
                    onClick={() => toggleConcept(concept.id)}
                  >
                    {active ? "✓ " : "+ "}
                    {conceptLabel(concept.id)}
                  </ConceptChip>
                );
              })}
            </ConceptChipRow>
          </FormField>
        )}

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

        <FormField label="HEX 코드로 지정" helpText="선택한 팔레트 색을 미세 조정하거나, 원하는 색상을 직접 입력할 수 있어요. 왼쪽 색상 사각형을 누르면 색상 팔레트로도 고를 수 있어요.">
          <HexInputRow>
            <HexPreview
              type="button"
              $color={normalizeHex(hexDraft) ?? color}
              onClick={openNativePicker}
              aria-label="색상 팔레트 열기"
              title="색상 팔레트 열기"
            />
            <HiddenColorInput
              ref={colorInputRef}
              value={normalizeHex(hexDraft) ?? color}
              onChange={(event) => handleNativePick(event.target.value)}
              tabIndex={-1}
              aria-hidden="true"
            />
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
