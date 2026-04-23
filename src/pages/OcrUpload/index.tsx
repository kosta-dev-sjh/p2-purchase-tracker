/**
 * 역할: OCR 업로드 화면의 상태와 레이아웃을 조립하는 페이지 진입 파일입니다.
 *
 *       업로드 흐름은 "배치 단위"로 설계돼 있습니다. 사용자는 플랫폼을 고른 뒤 그 플랫폼의
 *       캡쳐 여러 장을 한 번에 올리고, 필요하면 플랫폼을 바꿔 다른 몰의 캡쳐를 이어서 올릴 수
 *       있습니다. 각 이미지는 "업로드 시점에 선택돼 있던 플랫폼"을 태그로 지니며, 이 태그는
 *       UploadedGrid의 뱃지와 OcrEdit의 image.platform으로 그대로 이어집니다.
 *
 *       플랫폼 선택 카드는 페이지 상단이 아니라 업로드 영역 바로 위에 둬, "지금 고른 플랫폼이
 *       바로 이 업로드 버튼을 눌렀을 때 찍힌다"는 점을 시각적으로 붙여 인지시킵니다.
 * 위치: src\pages\OcrUpload\index.tsx
 */
import React, { useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import styled from "styled-components";
import { createWorker } from "tesseract.js";
import { AppShell } from "../../components/layout/AppShell";
import { Button } from "../../components/primitives/Button";
import { PLATFORM_LABELS } from "../../constants/labels";
import { tokens } from "../../styles/tokens";
import { media } from "../../tokens/breakpoints";
import { PlatformSelect, type Platform } from "./components/PlatformSelect";
import { UploadZone } from "./components/UploadZone";
import { UploadedGrid } from "./components/UploadedGrid";
import { GuideCard } from "./components/GuideCard";
import { ocrUploadMockData, type UploadedImage } from "./data";
import { ocrStore } from "../../stores/ocrStore";
import {
  parseCoupangOrderText,
  parseNaverOrderText,
  parseAuctionOrderText,
  parseTemuOrderText,
  type PurchaseOCRResult,
} from "../../utils/ocrParsers";
import { detectStatusFromOcrText } from "../../utils/ocrParse";
import type { OcrOrder, OcrImageItem } from "../OcrEdit/data";

const Wrap = styled.div`
  display: grid;
  gap: 16px;
`;

/**
 * 플랫폼 ↔ 업로드 구역을 하나의 "현재 배치" 묶음으로 보이게 감싸는 컨테이너.
 * 두 카드가 한 번의 업로드 액션에 엮여 있다는 시각적 힌트 역할을 합니다.
 */
const UploadStack = styled.div`
  display: grid;
  gap: 12px;
`;

const Footer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 4px;

  .count {
    color: ${tokens.color.ink4};
    font-size: 12px;
    line-height: 1.5;
  }

  .count strong {
    color: ${tokens.color.ink2};
    font-weight: 700;
  }

  /*
   * 좁은 모바일에서는 왼쪽의 업로드 요약(쿠팡 2장, 네이버 1장 …)이 길어지면
   * flex-shrink 로 오른쪽 버튼 컨테이너가 1~2 글자 폭까지 쪼그라들어 "취/소",
   * "분/석/시/작/하/기" 처럼 세로로 잘리는 현상이 생깁니다. 세로로 쌓아 요약을
   * 먼저 보여 주고, 액션 버튼은 바로 아래에 풀-폭으로 배치합니다.
   */
  ${media.mobile} {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  flex-shrink: 0;

  /*
   * 버튼 자체가 pc 에서는 자연 폭, 모바일에서는 Footer 가 세로 스택이 된 뒤
   * Actions 가 풀-폭이 되도록 잡아 두고, 그 안에서 두 버튼이 50:50 으로 나눠 갖게 합니다.
   * && 를 써서 styled.button 의 기본 클래스보다 specificity 를 한 단계 높여 확실히 덮어씁니다.
   */
  ${media.mobile} {
    width: 100%;

    && > * {
      flex: 1;
      min-width: 0;
      padding: 0 14px;
      white-space: nowrap;
    }
  }
`;

/**
 * 업로드할 수 있는 최대 이미지 수. 한 번에 너무 많은 캡쳐를 처리하면 OCR 비용과
 * 편집 화면 체감 부하가 커지므로 MVP에서는 5로 제한합니다.
 */
const MAX_IMAGES = 5;

export const OcrUploadPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isAppendMode = location.state?.append === true;

  // 여기서의 platform은 "다음에 올릴 이미지에 찍힐 태그"입니다.
  // 업로드를 실행할 때마다 새 이미지의 UploadedImage.platform에 스냅샷으로 복사됩니다.
  const [platform, setPlatform] = useState<Platform>("coupang");
  
  // append 모드일 때는 빈 상태로 시작하여 이전에 올린 이미지와 혼동되지 않게 합니다.
  const [images, setImages] = useState<UploadedImage[]>(isAppendMode ? [] : ocrUploadMockData.images);

  React.useEffect(() => {
    // 새로운 세션 시작일 경우에만 스토어를 초기화합니다.
    if (!isAppendMode) {
      ocrStore.clear();
    }
  }, [isAppendMode]);

  const handleRemove = (id: string) => {
    setImages((current) => current.filter((image) => image.id !== id));
  };

  const handleFileSelect = (files: File[]) => {
    setImages((current) => {
      // 남은 개수만큼만 파일 받기
      const remainingSlots = MAX_IMAGES - current.length;
      if (remainingSlots <= 0) return current;

      const filesToAdd = files.slice(0, remainingSlots);
      
      const newImages = filesToAdd.map((file, index) => {
        return {
          id: `file-${Date.now()}-${index}`,
          thumbUrl: URL.createObjectURL(file),
          fileName: file.name,
          sizeLabel: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
          status: "ready" as const,
          // 현재 선택된 플랫폼을 이미지에 "찍어" 둡니다.
          platform,
          file, // OCR 파싱에 쓸 원본 파일
        };
      });

      return [...current, ...newImages];
    });
  };

  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    if (images.length === 0) return;
    setIsAnalyzing(true);
    
    try {
      const worker = await createWorker('kor+eng');
      const processedImages: OcrImageItem[] = [];

      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        if (!image.file) {
          // v1 목업 이미지 대응 폴백
          processedImages.push({
            id: image.id,
            fileName: image.fileName,
            thumbUrl: image.thumbUrl,
            status: "analyzed" as const,
            platform: image.platform,
            orders: []
          });
          continue;
        }

        const result = await worker.recognize(image.file);
        const rawText = result.data.text;

        let parsedData: PurchaseOCRResult[] = [];
        if (image.platform === 'coupang') {
          parsedData = parseCoupangOrderText(rawText);
        } else if (image.platform === 'naver') {
          parsedData = parseNaverOrderText(rawText);
        } else if (image.platform === 'auction') {
          parsedData = parseAuctionOrderText(rawText);
        } else if (image.platform === 'temu') {
          parsedData = parseTemuOrderText(rawText);
        }

        const orders: OcrOrder[] = parsedData.map((res, idx) => {
          // 테무는 안내 문구가 많아 rawText 사용 시 오인식이 심하므로 statusText만 사용
          // 다른 플랫폼(네이버/쿠팡/옥션)은 기존처럼 rawText를 fallback으로 사용
          const statusTag = image.platform === 'temu'
            ? (res.statusText ? (detectStatusFromOcrText(res.statusText) ?? "purchase") : "purchase")
            : (detectStatusFromOcrText(res.statusText ?? res.rawText) ?? "purchase");
          return {
            id: `${image.id}-order-${idx}`,
            orderDate: res.date ?? "",
            statusTag,
            statusLabel: "자동 추출됨",
            totalAmount: res.price ?? 0,
            rawText: res.rawText,
            products: res.itemName ? [{
              id: `${image.id}-product-${idx}`,
              name: res.itemName,
              price: res.price ?? 0,
              quantity: 1,
            }] : []
          };
        });

        processedImages.push({
          id: image.id,
          fileName: image.fileName,
          thumbUrl: image.thumbUrl,
          status: "analyzed" as const,
          platform: image.platform,
          rawText: rawText,
          orders: orders.length > 0 ? orders : [{
             id: `${image.id}-empty`,
             orderDate: "",
             statusTag: "purchase",
             totalAmount: 0,
             rawText,
             products: []
          }]
        });
      }

      await worker.terminate();
      
      ocrStore.setImages(isAppendMode ? [...ocrStore.getImages(), ...processedImages] : processedImages);
      navigate("/ocr-edit");
    } catch (error) {
      console.error('OCR 파싱 실패:', error);
      alert('이미지 분석 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  /**
   * 플랫폼 뱃지별로 현재 몇 장이 올라가 있는지 요약합니다.
   * 사용자가 "내가 쿠팡 3장, 네이버 2장 올렸구나"를 한 눈에 확인할 수 있게 Footer에 노출합니다.
   */
  const platformCounts = useMemo(() => {
    const counts: Partial<Record<Platform, number>> = {};
    for (const image of images) {
      counts[image.platform] = (counts[image.platform] ?? 0) + 1;
    }
    return counts;
  }, [images]);

  const atCapacity = images.length >= MAX_IMAGES;

  return (
    <AppShell activeNav="upload" crumb="입력 · OCR" title="OCR 업로드">
      <Wrap>
        <GuideCard items={ocrUploadMockData.guide} />

        {/* 플랫폼 선택과 업로드 구역은 "한 번의 배치"를 구성하므로 시각적으로 붙여 보여 줍니다. */}
        <UploadStack>
          <PlatformSelect value={platform} onChange={setPlatform} />
          {/* data-tour: ProductTour 스포트라이트 타겟. */}
          <div data-tour="ocr-zone">
            <UploadZone
              acceptedTypes="PNG, JPG, WEBP"
              maxSize="10MB"
              maxCount={MAX_IMAGES}
              activePlatformLabel={PLATFORM_LABELS[platform]}
              disabled={atCapacity}
              onPick={handleFileSelect}
            />
          </div>
        </UploadStack>

        {images.length > 0 && <UploadedGrid images={images} onRemove={handleRemove} />}

        <Footer>
          <span className="count">
            업로드한 이미지 <strong>{images.length}/{MAX_IMAGES}</strong>
            {images.length > 0 && (
              <>
                {" · "}
                {(Object.keys(platformCounts) as Platform[])
                  .map((p) => `${PLATFORM_LABELS[p]} ${platformCounts[p]}장`)
                  .join(", ")}
              </>
            )}
          </span>
          <Actions>
            <Button variant="ghost" size="lg" onClick={() => navigate("/upload")}>
              취소
            </Button>
            <Button
              variant="primary"
              size="lg"
              disabled={images.length === 0 || isAnalyzing}
              onClick={handleAnalyze}
            >
              {isAnalyzing ? "분석 중..." : "분석 시작하기"}
            </Button>
          </Actions>
        </Footer>
      </Wrap>
    </AppShell>
  );
};
