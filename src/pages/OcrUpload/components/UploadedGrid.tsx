/**
 * 역할: 특정 페이지 안에서만 사용하는 화면 전용 UI 블록입니다.
 *       각 썸네일의 좌상단에 플랫폼 뱃지를 함께 표시해, 같은 화면에서 여러 플랫폼을
 *       섞어 올리는 흐름에서도 사용자가 어느 캡쳐가 어디서 찍힌 것인지 한눈에 구분할 수 있게 합니다.
 *       같은 파일명이 이미 목록에 있으면 "중복" 배지를 표시해 실수로 재업로드하는 것을 방지합니다.
 * 위치: src\pages\OcrUpload\components\UploadedGrid.tsx
 */
import React, { useMemo } from "react";
import styled from "styled-components";
import { Card, CardBd, CardHd, CardTitle } from "../../../components/primitives/Card";
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
 * 플랫폼별 뱃지 색상.
 * - 쿠팡(빨강 계열), 네이버(초록 계열), 테무(주황 계열)로 쇼핑몰의 브랜드 이미지를
 *   살짝 암시해 "이게 어느 몰 캡쳐였더라"를 색으로도 구분할 수 있게 합니다.
 * - 다만 브랜드 로고의 정확한 색을 그대로 쓰면 상표권·톤 조화 문제가 있어,
 *   서비스 팔레트와 어울리도록 톤을 낮춰 톤인톤으로 맞췄습니다.
 */
const PLATFORM_BADGE_STYLES: Record<Platform, { bg: string; fg: string }> = {
  coupang: { bg: "#FEE2E2", fg: "#B91C1C" },
  naver: { bg: "#DCFCE7", fg: "#166534" },
  // 테무의 브랜드 색상은 선명한 주황. 쿠팡의 빨강과 색조가 겹치지 않도록 옐로우-오렌지
  // 축에 더 가까운 톤(#C2410C / #FFEDD5)을 써서 "빨강=쿠팡, 주황=테무"로 구분됩니다.
  temu: { bg: "#FFEDD5", fg: "#C2410C" },
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

  return (
    <Card>
      <CardHd>
        <CardTitle>업로드한 이미지 ({images.length})</CardTitle>
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
                  {isDup && <DupOverlay />}
                  <Remove type="button" onClick={() => onRemove(image.id)}>
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
    </Card>
  );
};
