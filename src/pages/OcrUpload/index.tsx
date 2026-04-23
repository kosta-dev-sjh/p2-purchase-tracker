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
import { PlatformConfirmModal } from "./components/PlatformConfirmModal";
import { OCR_UPLOAD_GUIDE, type UploadedImage } from "./data";
import { ocrStore } from "../../stores/ocrStore";
import {
  parseCoupangOrderText,
  parseNaverOrderText,
  parseAuctionOrderText,
  parseTemuOrderText,
  type PurchaseOCRResult,
} from "../../utils/ocrParsers";
import { detectStatusFromOcrText } from "../../utils/ocrParse";
import { preprocessImageForOcr } from "../../utils/ocrPreprocess";
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

  // 실제 OCR 흐름에서는 사용자가 직접 업로드하기 전에는 이미지가 비어 있어야 합니다.
  // append 모드(기존 결과에 이어 붙이기)든 새 세션이든 초기 상태는 항상 빈 배열로 시작합니다.
  const [images, setImages] = useState<UploadedImage[]>([]);

  /**
   * "분석 시작하기" → 플랫폼 확인 모달(PlatformConfirmModal)의 개폐 상태.
   * 모달에서 확인을 누르면 수정된 이미지 배열이 내려와 실제 OCR 파이프(runAnalysis)가 돕니다.
   */
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

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

  /**
   * "분석 시작하기" 진입점.
   * 분석 자체는 이미지 장수만큼 Tesseract를 돌리는 무거운 작업이라, 실행 전
   * PlatformConfirmModal을 먼저 띄워 사용자에게 태그를 재확인할 기회를 줍니다.
   * 모달에서 "확인하고 분석 시작"을 누르면 handleConfirmAnalyze가 실제 파이프를 돌립니다.
   */
  const handleAnalyze = () => {
    if (images.length === 0) return;
    if (isAnalyzing) return;
    setIsConfirmOpen(true);
  };

  /**
   * 모달에서 확정된 최종 이미지 배열로 OCR 파이프를 실행합니다.
   * 여기서 받은 updatedImages는 사용자가 모달에서 플랫폼 태그를 수정한 결과이므로,
   * 상위 images state에도 그대로 반영해 UploadedGrid의 뱃지가 같이 바뀌도록 합니다.
   */
  const handleConfirmAnalyze = async (updatedImages: UploadedImage[]) => {
    setIsConfirmOpen(false);
    setImages(updatedImages);
    await runAnalysis(updatedImages);
  };

  const runAnalysis = async (targetImages: UploadedImage[]) => {
    if (targetImages.length === 0) return;
    setIsAnalyzing(true);

    try {
      const worker = await createWorker('kor+eng');

      // Tesseract 파라미터 튜닝:
      //  - tessedit_pageseg_mode=6(Single uniform block of text)로 두면 쇼핑 캡쳐처럼
      //    "하나의 수직 블록"을 가진 이미지에서 라인 분할이 안정적으로 이뤄집니다.
      //    기본값(3=Auto)은 한글 쇼핑 UI에서 아이콘/뱃지를 별도 블록으로 잘못 잡아
      //    라인 경계가 흐트러지는 경우가 많았습니다.
      //  - preserve_interword_spaces=1: 공백을 보존해 파서의 토큰 분리가 쉬워집니다.
      // setParameters는 문자열 키-값만 받으므로 그대로 전달합니다.
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: "6",
          preserve_interword_spaces: "1",
        } as unknown as never);
      } catch {
        // 파라미터 설정 실패는 치명적이지 않으니 로그만 남기고 기본값으로 진행.
        console.warn("[OcrUpload] tesseract.setParameters 실패 — 기본값으로 진행");
      }

      const processedImages: OcrImageItem[] = [];

      for (let i = 0; i < targetImages.length; i++) {
        const image = targetImages[i];
        if (!image.file) {
          // 방어적 폴백. 정상 업로드 흐름에서는 File 객체가 반드시 있지만,
          // 예외적으로 file 참조가 비어 있는 케이스(예: 테스트 주입)에서도
          // 파이프라인이 터지지 않도록 빈 orders로 통과시킵니다.
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

        // 저해상도·저대비 캡쳐에서 Tesseract 인식률이 크게 갈리므로 업스케일 + 그레이스케일
        // 전처리를 한 번 태운 뒤 OCR로 넘깁니다. 실패 시 원본 파일을 그대로 받는 방어적 경로.
        const preprocessed = await preprocessImageForOcr(image.file);
        const result = await worker.recognize(preprocessed);
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

        /**
         * 한 개의 PurchaseOCRResult를 OcrOrder.products 항목으로 변환합니다.
         * 가격만 잡히고 이름을 못 뽑은 경우엔 "상품명 입력 필요" 플레이스홀더로 남겨 사용자가
         * OcrEdit에서 이름만 채워 저장할 수 있게 합니다.
         */
        const toProduct = (res: PurchaseOCRResult, idx: number) => {
          const unitPrice = res.price ?? 0;
          const qty = res.quantity && res.quantity > 0 ? res.quantity : 1;
          const hasItem = Boolean(res.itemName);
          const hasPrice = unitPrice > 0;
          if (!hasItem && !hasPrice) return null;
          return {
            id: `${image.id}-product-${idx}`,
            name: hasItem ? (res.itemName as string) : "상품명 입력 필요",
            price: unitPrice,
            quantity: qty,
          };
        };

        let orders: OcrOrder[];

        if (image.platform === 'coupang' && parsedData.length > 0) {
          // 쿠팡 캡쳐는 **주문 헤더(YYYY. M. DD 주문) 한 개 = 주문 하나** 입니다. 실제 UI에서
          // 주문상세 페이지는 헤더 하나 + 여러 배송 블록 구조이고(예: 피스타치오 + 캐리어),
          // 주문목록/내역 페이지는 한 캡쳐에 헤더 여러 개(예: 4/7 주문 + 4/1 주문)가 쌓여 있습니다.
          // 따라서 파싱 결과를 **헤더 날짜로 그룹화**해 각 날짜마다 OcrOrder를 하나씩 만들어야 합니다.
          //   - 헤더 1개 이미지: 결과 전부가 같은 date → 카드 1장 (상품 N개 묶음)
          //   - 헤더 N개 이미지: date별로 N장 → 사용자가 "4/7이 왜 4/1로 둔갑?" 같은 혼란 없음
          //
          // 주문 레벨 statusTag: 묶음 안 상품들이 전부 cancel이면 cancel, 전부 refund면 refund, 그 외에는
          // purchase로 승격. 한 주문 안에 준비중 + 완료가 섞여 있어도 가계부 관점에서는 돈이 나간 건이므로.
          const groupsByDate = new Map<string, PurchaseOCRResult[]>();
          for (const res of parsedData) {
            const key = res.date ?? "";
            const arr = groupsByDate.get(key) ?? [];
            arr.push(res);
            groupsByDate.set(key, arr);
          }

          orders = Array.from(groupsByDate.entries()).map(([date, group], orderIdx) => {
            const resultStatuses = group.map((res) =>
              detectStatusFromOcrText(res.statusText ?? res.rawText) ?? "purchase",
            );
            const allCanceled = resultStatuses.every((s) => s === "cancel");
            const allRefunded = resultStatuses.every((s) => s === "refund");
            const orderStatusTag = allCanceled ? "cancel" : allRefunded ? "refund" : "purchase";

            const products = group
              .map((res, productIdx) => toProduct(res, orderIdx * 100 + productIdx))
              .filter((p): p is NonNullable<typeof p> => p !== null);

            const totalAmount = products.reduce(
              (sum, p) => sum + p.price * (p.quantity ?? 1),
              0,
            );

            return {
              id: `${image.id}-order-${orderIdx}`,
              orderDate: date,
              statusTag: orderStatusTag,
              statusLabel: "자동 추출됨",
              totalAmount,
              rawText: group[0].rawText,
              products,
            };
          });
        } else {
          // 네이버/옥션/테무는 "이미지 1장 = 주문 N건(목록형)"이 자연스러운 플랫폼이라
          // 기존처럼 결과 1개당 OcrOrder 1개로 매핑합니다.
          orders = parsedData.map((res, idx) => {
            const statusTag = image.platform === 'temu'
              ? (res.statusText ? (detectStatusFromOcrText(res.statusText) ?? "purchase") : "purchase")
              : (detectStatusFromOcrText(res.statusText ?? res.rawText) ?? "purchase");
            const product = toProduct(res, idx);
            const unitPrice = res.price ?? 0;
            const qty = res.quantity && res.quantity > 0 ? res.quantity : 1;
            return {
              id: `${image.id}-order-${idx}`,
              orderDate: res.date ?? "",
              statusTag,
              statusLabel: "자동 추출됨",
              totalAmount: product ? unitPrice * qty : 0,
              rawText: res.rawText,
              products: product ? [product] : [],
            };
          });
        }

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
        <GuideCard items={OCR_UPLOAD_GUIDE} />

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
              currentCount={images.length}
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
      <PlatformConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        images={images}
        onConfirm={handleConfirmAnalyze}
      />
    </AppShell>
  );
};
