/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 *       각 썸네일의 좌상단에 플랫폼 뱃지를 함께 표시해, 같은 화면에서 여러 플랫폼을
 *       섞어 올리는 흐름에서도 사용자가 어느 캡쳐가 어디서 찍힌 것인지 한눈에 구분할 수 있게 합니다.
 *       같은 파일명이 이미 목록에 있으면 "중복" 배지를 표시해 실수로 재업로드하는 것을 방지합니다.
 * 위치: src\pages\OcrUpload\components\UploadedGrid.tsx
 */
import React, { useMemo, useState } from "react";
import styled from "styled-components";
import { Card, CardBd, CardHd, CardTitle } from "../../../components/primitives/Card";
import { ImageLightbox } from "../../../components/primitives/ImageLightbox";
import { PLATFORM_LABELS } from "../../../constants/labels";
import { tokens } from "../../../styles/tokens";
import type { UploadedImage } from "../data";
import type { Platform } from "./PlatformSelect";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
`;

const Thumb = styled.div`
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid ${tokens.color.line};
  border-radius: ${tokens.radius.controlLg};
  background: ${tokens.color.tint};

  .placeholder {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: ${tokens.color.ink5};
    font-size: 24px;
  }

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

/**
 * 썸네일 위에 올라가는 투명 버튼. 썸네일 전체를 클릭 영역으로 삼아 라이트박스를 띄웁니다.
 * Remove 버튼과 영역이 겹치지만, Remove 버튼은 z-index 가 더 높고 stopPropagation 으로
 * 같이 열리지 않게 막습니다. cursor: zoom-in 으로 "확대 가능"이라는 힌트를 줍니다.
 */
const ThumbOpenButton = styled.button`
  position: absolute;
  inset: 0;
  border: none;
  background: transparent;
  padding: 0;
  cursor: zoom-in;
  z-index: 1;

  &:focus-visible {
    outline: 2px solid ${tokens.color.accent};
    outline-offset: -2px;
  }
`;

/**
 * CardHd 의 타이틀 아래 살짝 작은 톤으로 "클릭하면 확대된다"는 힌트를 줍니다.
 * UI 를 산만하게 만들지 않기 위해 기본 색상은 ink4 이고, 카드 타이틀과 같은 라인이 아니라
 * 아래로 흘려 넣습니다.
 */
const HintText = styled.div`
  margin-top: 4px;
  color: ${tokens.color.ink4};
  font-size: 11.5px;
  line-height: 1.5;
`;

/**
 * 플랫폼별 뱃지 색상.
 * - 쿠팡(빨강 계열), 네이버(초록 계열)로 쇼핑몰의 브랜드 이미지를
 *   살짝 암시해 "이게 어느 몰 캡쳐였더라"를 색으로도 구분할 수 있게 합니다.
 * - 다만 브랜드 로고의 정확한 색을 그대로 쓰면 상표권·톤 조화 문제가 있어,
 *   서비스 팔레트와 어울리도록 톤을 낮춰 톤인톤으로 맞췄습니다.
 */
const PLATFORM_BADGE_STYLES: Record<Platform, { bg: string; fg: string }> = {
  coupang: { bg: "#FEE2E2", fg: "#B91C1C" },
  naver: { bg: "#DCFCE7", fg: "#166534" },
};

const PlatformBadge = styled.span<{ $platform: Platform }>`
  position: absolute;
  top: 6px;
  left: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  background: ${({ $platform }) => PLATFORM_BADGE_STYLES[$platform].bg};
  color: ${({ $platform }) => PLATFORM_BADGE_STYLES[$platform].fg};
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.01em;
  pointer-events: none;
  /* 확대 트리거 버튼 위에 얹혀야 하므로 z-index 를 명시합니다. */
  z-index: 2;
  /* 썸네일 이미지가 뒤에 깔려도 뱃지가 묻히지 않도록 살짝 그림자를 둡니다. */
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
`;

const Remove = styled.button`
  position: absolute;
  top: 6px;
  right: 6px;
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border: none;
  border-radius: 50%;
  background: rgba(11, 18, 32, 0.75);
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  transition: background ${tokens.motion.fast};
  /* ThumbOpenButton 위에 올라가 삭제 버튼 클릭이 확대 동작에 가려지지 않게 합니다. */
  z-index: 2;

  &:hover {
    background: rgba(11, 18, 32, 0.95);
  }
`;

const Meta = styled.div`
  margin-top: 6px;

  .name {
    overflow: hidden;
    color: ${tokens.color.ink2};
    font-size: 12px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .size {
    color: ${tokens.color.ink4};
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .platform-line {
    margin-top: 2px;
    color: ${tokens.color.ink4};
    font-size: 11px;
  }
`;

/** 중복 파일명 배지 */
const DupBadge = styled.span`
  display: inline-block;
  margin-top: 3px;
  padding: 1px 6px;
  border-radius: 4px;
  background: ${tokens.color.negBg};
  color: ${tokens.color.neg};
  font-size: 10px;
  font-weight: 700;
`;

/** 중복 이미지 Thumb에 반투명 오버레이 */
const DupOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(220, 38, 38, 0.18);
  pointer-events: none;
`;

export const UploadedGrid: React.FC<{
  images: UploadedImage[];
  onRemove: (id: string) => void;
}> = ({ images, onRemove }) => {
  /**
   * 같은 fileName이 목록 안에 2번 이상 나오면 두 번째 이후를 중복으로 표시합니다.
   * 첫 번째 등장은 허용하고, 이후 같은 이름이 오면 해당 id를 중복 셋에 넣습니다.
   */
  const dupIds = useMemo(() => {
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const image of images) {
      if (seen.has(image.fileName)) {
        dups.add(image.id);
      } else {
        seen.add(image.fileName);
      }
    }
    return dups;
  }, [images]);

  /**
   * 라이트박스 상태: 어떤 이미지의 id 로 열려 있는지. null 이면 닫힘.
   * images 배열에서 id 로 찾아 src/alt 를 넘기기 때문에, 열린 상태에서 해당 이미지가
   * 목록에서 제거되면(예: 삭제) 자연스럽게 아무것도 렌더하지 않게 됩니다.
   */
  const [zoomedId, setZoomedId] = useState<string | null>(null);
  const zoomedImage = zoomedId
    ? images.find((image) => image.id === zoomedId)
    : undefined;

  return (
    <Card>
      <CardHd>
        <CardTitle>업로드한 이미지 ({images.length})</CardTitle>
        <HintText>썸네일을 클릭하면 이미지가 확대됩니다.</HintText>
      </CardHd>
      <CardBd>
        <Grid>
          {images.map((image) => {
            const isDup = dupIds.has(image.id);
            return (
              <div key={image.id}>
                <Thumb style={isDup ? { borderColor: tokens.color.neg } : undefined}>
                  {image.thumbUrl ? (
                    <img src={image.thumbUrl} alt={image.fileName} />
                  ) : (
                    <div className="placeholder">🧾</div>
                  )}
                  <PlatformBadge $platform={image.platform}>
                    {PLATFORM_LABELS[image.platform]}
                  </PlatformBadge>
                  {/*
                    투명한 확대 트리거. 썸네일 전체를 덮지만 Remove 버튼은 z-index 가
                    더 높아 그대로 눌립니다. 썸네일이 아직 준비되지 않은 placeholder
                    상태에서는 확대할 이미지가 없으니 렌더하지 않습니다.
                  */}
                  {image.thumbUrl && (
                    <ThumbOpenButton
                      type="button"
                      aria-label={`${image.fileName} 확대해서 보기`}
                      onClick={() => setZoomedId(image.id)}
                    />
                  )}
                  {isDup && <DupOverlay />}
                  <Remove
                    type="button"
                    onClick={(event) => {
                      // 트리거와 영역이 겹치므로 삭제 시 라이트박스가 같이 열리지 않도록 버블링을 막습니다.
                      event.stopPropagation();
                      onRemove(image.id);
                    }}
                  >
                    ×
                  </Remove>
                </Thumb>
                <Meta>
                  <div className="name">{image.fileName}</div>
                  <div className="size">{image.sizeLabel}</div>
                  {isDup && <DupBadge>이미 올린 파일</DupBadge>}
                </Meta>
              </div>
            );
          })}
        </Grid>
      </CardBd>
      <ImageLightbox
        isOpen={Boolean(zoomedImage?.thumbUrl)}
        src={zoomedImage?.thumbUrl}
        alt={zoomedImage?.fileName}
        onClose={() => setZoomedId(null)}
      />
    </Card>
  );
};
