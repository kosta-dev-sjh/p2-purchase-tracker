/**
 * 역할: 해당 화면의 상태와 레이아웃을 조립하는 페이지 진입 파일입니다.
 * 위치: src\pages\Upload\index.tsx
 */
import React from "react";
import styled from "styled-components";
import { AppShell } from "../../components/layout/AppShell";
import { tokens } from "../../styles/tokens";
import { media } from "../../tokens/breakpoints";
import { MethodCard } from "./components/MethodCard";
import { CameraIcon, PenIcon, SpreadsheetIcon } from "./components/icons";

const Wrap = styled.div`
  display: grid;
  place-items: center;
  min-height: calc(100vh - 140px);
  padding: 40px 0;
`;

const Inner = styled.div`
  width: 100%;
  /* 3개 카드가 한 줄로 들어갈 때 제목/CTA 한 줄에 깔끔히 들어가도록 살짝 넓혔습니다. */
  max-width: 880px;
  text-align: center;
`;

const Prompt = styled.h2`
  margin: 0 0 32px;
  color: ${tokens.color.ink1};
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
`;

const Options = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;

  ${media.tablet} {
    grid-template-columns: 1fr 1fr;
  }

  ${media.mobile} {
    grid-template-columns: 1fr;
  }
`;

export const UploadPage: React.FC = () => (
  <AppShell activeNav="upload" crumb="입력" title="내역 입력">
    <Wrap>
      <Inner>
        {/* v1에서는 OCR 흐름과 수동 입력 흐름을 여기서 명확히 갈라 줍니다. */}
        <Prompt>어떤 방식으로 내역을 입력하시겠어요?</Prompt>
        <Options>
          {/* 첫 진입 시 왼쪽 → 오른쪽 순으로 140ms 간격씩 아래에서 올라오며 등장합니다. */}
          <MethodCard
            icon={<CameraIcon />}
            title="OCR로 입력"
            description={`쇼핑몰 주문내역 캡처를 인식해\n자동으로 입력합니다.`}
            ctaLabel="OCR 업로드 시작"
            ctaVariant="primary"
            footnote="취소, 반품, 환불, 정기결제까지 함께 감지"
            href="/ocr-upload"
            enterDelayMs={0}
          />
          <MethodCard
            icon={<PenIcon />}
            title="수동 입력"
            description={`지출과 수입 내역을 직접\n기록할 수 있습니다.`}
            ctaLabel="직접 입력 시작"
            ctaVariant="ghost"
            footnote="상품도 팝업으로 간편하게 추가"
            href="/manual-entry"
            enterDelayMs={140}
          />
          <MethodCard
            icon={<SpreadsheetIcon />}
            title="카드 내역 가져오기"
            description={`카드사에서 내려받은 CSV/엑셀로\n결제내역을 한 번에 불러옵니다.`}
            ctaLabel="파일 업로드 시작"
            ctaVariant="ghost"
            footnote="OCR로 상품 상세를 나중에 덧붙일 수 있어요"
            href="/csv-upload"
            enterDelayMs={280}
          />
        </Options>
      </Inner>
    </Wrap>
  </AppShell>
);

