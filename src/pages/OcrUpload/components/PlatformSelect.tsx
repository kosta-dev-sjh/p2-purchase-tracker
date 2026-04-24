/**
 * 역할: OCR 업로드 시 각 이미지에 붙일 플랫폼 태그를 고르는 세그먼트.
 *
 *       이 컴포넌트에서 고른 플랫폼은 "한 번에 올리는 배치"에만 적용됩니다.
 *       사용자가 쿠팡 캡쳐 2장을 올리고 네이버 플랫폼으로 바꿔 다시 3장을 올리면
 *       앞 2장에는 "쿠팡", 뒤 3장에는 "네이버" 태그가 남아야 하므로, 이 값은
 *       전역이 아니라 "다음 업로드에 적용될 라벨"로 읽히도록 문구를 짰습니다.
 *
 *       OCR은 캡쳐의 레이아웃(쿠팡/네이버)을 알아야 파싱 정확도가 올라가서,
 *       수동 입력의 "미지정"(플랫폼 없는 오프라인 결제)은 여기 선택지에서 제외합니다.
 * 위치: src\pages\OcrUpload\components\PlatformSelect.tsx
 */
import React from "react";
import styled from "styled-components";
import { Card, CardBd, CardHd, CardTitle } from "../../../components/primitives/Card";
import { PLATFORM_LABELS } from "../../../constants/labels";
import { tokens } from "../../../styles/tokens";

/**
 * OCR이 파싱할 수 있는 플랫폼 집합.
 * 수동 입력의 TxPlatform과는 의도적으로 분리합니다. 수동 입력은 오프라인 결제용
 * "unspecified"까지 허용하지만, OCR은 반드시 쇼핑몰 캡쳐가 전제라서 이 세 값 중 하나를 골라야 합니다.
 */
export type Platform = "coupang" | "naver";

const OCR_PLATFORMS: readonly Platform[] = ["coupang", "naver"];

const Hint = styled.div`
  margin-bottom: 10px;
  color: ${tokens.color.ink4};
  font-size: 12px;
  line-height: 1.5;
`;

const Group = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const Option = styled.button<{ $on?: boolean }>`
  padding: 8px 16px;
  border: 1px solid ${({ $on }) => ($on ? tokens.color.accentBorder : tokens.color.line)};
  border-radius: 8px;
  background: ${({ $on }) => ($on ? tokens.color.accentSubtle : tokens.color.panel)};
  color: ${({ $on }) => ($on ? tokens.color.accentHover : tokens.color.ink2)};
  cursor: pointer;
  font-family: inherit;
  font-size: ${tokens.type.bodySm.size};
  font-weight: 600;
  transition:
    background ${tokens.motion.fast},
    border-color ${tokens.motion.fast},
    color ${tokens.motion.fast};

  &:hover {
    background: ${({ $on }) => ($on ? tokens.color.accentSubtle : tokens.color.tint)};
  }
`;

export const PlatformSelect: React.FC<{
  value: Platform;
  onChange: (value: Platform) => void;
}> = ({ value, onChange }) => (
  <Card>
    <CardHd>
      <CardTitle>이번 업로드의 플랫폼</CardTitle>
    </CardHd>
    <CardBd>
      <Hint>
        아래에서 고른 플랫폼이 <strong>이번에 올릴 이미지에만</strong> 붙습니다.
        다른 플랫폼 캡쳐도 함께 정리하려면, 먼저 한 배치를 올린 뒤 플랫폼을 바꾸고
        다음 이미지들을 이어서 올리면 돼요.
      </Hint>
      <Group>
        {OCR_PLATFORMS.map((platform) => (
          <Option
            key={platform}
            type="button"
            $on={value === platform}
            onClick={() => onChange(platform)}
          >
            {PLATFORM_LABELS[platform]}
          </Option>
        ))}
      </Group>
    </CardBd>
  </Card>
);
