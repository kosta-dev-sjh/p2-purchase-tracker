/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 *       OCR 편집 화면 좌측의 이미지 목록. 선택과 "이 캡쳐는 잘못 올린 것" 삭제까지 처리합니다.
 * 위치: src\pages\OcrEdit\components\ImageList.tsx
 */
import React from "react";
import styled from "styled-components";
import { Card, CardBd, CardHd, CardTitle } from "../../../components/primitives/Card";
import { tokens } from "../../../styles/tokens";
import type { OcrImageItem } from "../data";

const List = styled.ul`
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const Row = styled.li<{ $active?: boolean }>`
  position: relative;
  display: grid;
  /* 썸네일 + 텍스트 + 삭제 버튼 슬롯. 삭제 버튼은 22px라 24px 정도면 오른쪽 끝이 밀리지 않습니다. */
  grid-template-columns: 44px minmax(0, 1fr) 24px;
  gap: 10px;
  align-items: center;
  padding: 8px;
  border: 1px solid ${({ $active }) => ($active ? tokens.color.accentBorder : "transparent")};
  border-radius: 8px;
  background: ${({ $active }) => ($active ? tokens.color.accentSubtle : "transparent")};
  cursor: pointer;
  transition: background ${tokens.motion.fast};

  &:hover {
    background: ${({ $active }) => ($active ? tokens.color.accentSubtle : tokens.color.tint)};
  }

  /* 삭제 버튼은 평상시 숨어 있다가 row hover / 키보드 포커스 시에만 노출해
   * 목록이 시각적으로 조용하면서도, 실수로 누를 여지를 줄입니다. */
  &:hover .row-delete,
  &:focus-within .row-delete {
    opacity: 1;
  }
`;

const Thumb = styled.div`
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  overflow: hidden;
  border: 1px solid ${tokens.color.line};
  border-radius: 6px;
  background: ${tokens.color.tint};
  color: ${tokens.color.ink5};
  font-size: 16px;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const Meta = styled.div`
  /* 좁은 컨테이너에서도 한 줄로 들어가게끔 넘치면 말줄임표로 처리합니다. */
  min-width: 0;

  .name {
    margin-bottom: 4px;
    color: ${tokens.color.ink1};
    font-size: ${tokens.type.caption.size};
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: ${tokens.color.ink4};
    font-size: 11px;
    white-space: nowrap;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .dot.on {
    background: ${tokens.color.accent};
  }

  .dot.off {
    background: ${tokens.color.ink5};
  }
`;

const DeleteButton = styled.button`
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: ${tokens.color.ink4};
  cursor: pointer;
  opacity: 0;
  transition:
    background ${tokens.motion.fast},
    color ${tokens.motion.fast},
    opacity ${tokens.motion.fast};

  &:hover {
    background: ${tokens.color.negSubtle};
    color: ${tokens.color.neg};
  }

  &:focus-visible {
    opacity: 1;
    outline: none;
    box-shadow: ${tokens.shadow.focus};
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

const Empty = styled.div`
  padding: 14px 8px;
  color: ${tokens.color.ink4};
  font-size: 12px;
  text-align: center;
  line-height: 1.5;
`;

const AddButton = styled.button`
  width: 100%;
  margin-top: 8px;
  padding: 10px;
  border: 1px dashed ${tokens.color.line};
  border-radius: 8px;
  background: ${tokens.color.panel};
  color: ${tokens.color.ink3};
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;

  &:hover {
    border-color: ${tokens.color.accent};
    color: ${tokens.color.accentHover};
  }
`;

export const ImageList: React.FC<{
  images: OcrImageItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  /**
   * 이미지 전체 삭제 콜백. 잘못 올린 캡쳐를 한 번에 지울 때 사용하며,
   * 실제 삭제 확인(모달)은 상위 페이지에서 처리합니다.
   */
  onDelete?: (id: string) => void;
}> = ({ images, selectedId, onSelect, onAdd, onDelete }) => (
  <Card>
    <CardHd>
      <CardTitle>이미지 목록</CardTitle>
    </CardHd>
    <CardBd>
      <List>
        {images.map((image) => {
          const active = image.id === selectedId;
          return (
            <Row key={image.id} $active={active} onClick={() => onSelect(image.id)}>
              <Thumb>{image.thumbUrl ? <img src={image.thumbUrl} alt={image.fileName} /> : "🧾"}</Thumb>
              <Meta>
                <div className="name">{image.fileName}</div>
                <div className="status">
                  <span className={`dot ${image.status === "analyzed" ? "on" : "off"}`} />
                  {image.status === "analyzed" ? "분석 완료" : "대기 중"}
                </div>
              </Meta>
              {onDelete && (
                <DeleteButton
                  type="button"
                  className="row-delete"
                  aria-label={`${image.fileName} 이미지 삭제`}
                  onClick={(event) => {
                    // 행 onClick(선택 전환)이 함께 발동하는 걸 막습니다.
                    event.stopPropagation();
                    onDelete(image.id);
                  }}
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </DeleteButton>
              )}
            </Row>
          );
        })}
        {images.length === 0 && (
          <Empty>
            등록된 이미지가 없어요.
            <br />
            아래 '+ 이미지 추가'로 새 캡쳐를 올려 주세요.
          </Empty>
        )}
      </List>
      <AddButton type="button" onClick={onAdd}>
        + 이미지 추가
      </AddButton>
    </CardBd>
  </Card>
);
