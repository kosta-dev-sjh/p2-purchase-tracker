# SpendTrack AI 작업 규칙

이 문서는 SpendTrack 저장소에서 작업하는 모든 AI가 가장 먼저 참고할 운영 규칙입니다.

## 1. 기본 원칙

- 모든 응답과 문서, 커밋 메시지 설명은 기본적으로 한국어를 우선합니다.
- `docs/SpendTrack_Planning_Document.md`는 기획의 source of truth이며, 특별한 요청이 없으면 수정하지 않습니다.
- 현재 구현의 source of truth는 `src/`입니다. 문서가 코드와 다르면 코드를 기준으로 판단합니다.
- "새 기능 추가"보다 "기존 흐름 보존, 회귀 방지, 일관성 유지"를 우선합니다.
- 사용자가 명시적으로 요구하지 않은 대규모 구조 변경은 피합니다.

## 2. 작업 전에 확인할 것

- 현재 브랜치와 `git status`를 먼저 확인합니다.
- 관련 화면의 `index.tsx`와 연결된 `components`, `utils`, `stores`를 함께 읽고 수정 범위를 정합니다.
- 같은 역할의 기존 유틸이나 모달이 이미 있는지 먼저 찾고, 중복 구현을 만들지 않습니다.

## 3. 코드 구조 규칙

- 페이지 조립은 `src/pages/<Screen>/index.tsx`에서 담당합니다.
- 화면 전용 UI는 `src/pages/<Screen>/components`에 둡니다.
- 여러 화면이 공유하는 로직은 `src/utils`, `src/stores`, `src/components`로 올립니다.
- 거래 도메인 기준 타입은 현재 `src/pages/Transactions/components/TransactionTable.tsx`의 `TxRow` 계열을 우선 기준으로 봅니다.
- 저장소 교체 가능성을 유지해야 하므로 거래 CRUD는 가능한 `transactionsStore`를 통해 다룹니다.

## 4. 중복/저장 흐름 작업 규칙

- 중복 판정은 `src/utils/duplicateCheck.ts`를 단일 기준으로 사용합니다.
- 보강/머지 규칙은 `src/utils/mergeEnrichment.ts`를 우선 사용합니다.
- 수동 입력, OCR, CSV 업로드, 거래 수정이 서로 다른 규칙으로 갈라지지 않는지 항상 교차 확인합니다.
- `detail.itemsCoverage`, `detail.sourceImageUrl` 같은 메타 필드는 병합 시 보존해야 합니다.
- 자동 병합보다 사용자 확인이 필요한 경우는 보수적으로 처리합니다.

## 5. UI/폼 작업 규칙

- 필수 입력값은 `*`로 표시하고, 누락 시 첫 번째 오류 필드로 포커스를 이동시킵니다.
- 기존 토큰(`src/styles/tokens.ts`)과 공통 폼 컴포넌트를 우선 사용합니다.
- 비슷한 모달/배너/경고 컴포넌트를 새로 만들기 전에 기존 파일을 재사용할 수 있는지 확인합니다.
- 모바일 레이아웃을 깨뜨릴 수 있는 변경은 데스크톱 기준으로만 끝내지 말고 반응형 영향을 함께 점검합니다.

## 6. 문서 규칙

- 기획 외 문서는 "현재도 참조 가치가 있는가"를 기준으로 유지합니다.
- 시점 의존 handoff, 발표용 문서, 과거 상태 보고서는 살아 있는 운영 문서로 대체할 수 있으면 삭제합니다.
- 새 문서를 만들 때는 "누가, 언제, 무엇을 위해 읽는가"가 분명해야 합니다.

## 7. 검증 규칙

- 코드 수정 후 기본 검증은 `npm run build`입니다.
- 린트는 기존 저장소의 누적 경고/오류 상황을 감안해, 실패 시 "이번 작업과 직접 관련 있는지"를 분리해서 설명합니다.
- 죽은 코드 삭제 후에는 반드시 빌드로 회귀 여부를 확인합니다.

## 8. 금지/주의

- planning 문서를 임의로 덮어쓰지 않습니다.
- 실제 사용 중인 목업 인증(`src/mocks/auth.ts`)을 대체 구현 없이 제거하지 않습니다.
- 사용처 없는 것처럼 보여도 import/문자열/라우팅/스토어 연결을 확인하기 전에는 삭제하지 않습니다.
- generated 산출물이나 `dist` 기준 파일을 제품 문서의 source of truth로 취급하지 않습니다.

## 9. OCR 파이프라인 운영 원칙 (2026-04-24 확정)

이 섹션은 두 AI(Claude, Codex) 의 교차 검토를 거쳐 합의된 정책입니다.
상세 배경·대안 비교는 `docs/OCR_Architecture_Decision.md` 참고.

### 9.1 플랫폼별 파서 투자 수준

- **쿠팡(coupang)**: 현재 parser-heavy 상태를 `회귀 대응 모드` 로 고정. 샘플 23장
  ground-truth harness(`.ocr-raw-cache/ground-truth.json`) 기준 PASS 가 깨지면
  바로 고치되, "정확도 추가 상승" 을 노리는 새 regex/후처리 튜닝은 멈춥니다.
- **네이버쇼핑·테무 등 신규 플랫폼**: 1차 파서는 작성합니다(편집 화면이 빈 상태로
  열리면 UX 치명적이라 초안은 반드시 필요). 다만 투자 깊이는 쿠팡과 달리
  **"편집 가능한 구조화 초안"** 수준까지만:
    - 주문 단위 분리
    - 날짜/상태/상품명/가격의 **대략적** 추출
    - 명백한 쓰레기 문자열 제거
  여기까지. 세밀한 이름 복원이나 분리배송 같은 예외 케이스 수습은 AI 보정에 맡깁니다.
- 신규 플랫폼은 **쿠팡 파서를 복제하지 말고**, 얇은 전처리 + `aiService.fallbackOcrProducts`
  경로를 우선 고려합니다.

### 9.2 AI 보정 레이어

- `src/utils/aiService.ts` 의 Gemini 2.5 Flash Vision 경로가 단일 진실원입니다.
- 호출 게이트는 `src/utils/ocrQuality.ts` 의 `pickBadProducts` — "bad 카드 있는
  이미지만" AI 호출. 1차 필터 역할을 유지합니다.
- AI 호출이 발동하면 그 이미지의 **전체 카드** 를 검증받습니다(이미지 input 비용이
  이미 지불됐으므로 일부만 검증은 비효율).
- `aiApplied` 플래그는 **실제로 값이 바뀐 카드에만** 찍힙니다(사용자에게 "AI 가 손댄
  것처럼 보여주는 거짓말" 금지).

### 9.3 배포 전 필수 (현재 미완)

- **API 키 노출**: `VITE_GEMINI_API_KEY` 가 프론트엔드 번들에 박히는 구조는 개발용만
  허용. 실 배포 전 반드시 서버 프록시(Vercel Functions / Cloudflare Workers /
  Next.js Route) 로 키 은닉 필요.
- **Rate limit**: Gemini 2.5 Flash free tier 는 10 RPM / 250 RPD. 동시 사용자 10명만
  몰려도 free tier 초과 가능. 서버화 시 per-user / per-IP rate limit 같이 설계.

### 9.4 측정 지표

- `AI 호출 비율` 만 보지 말고 `AI 변경 실효율` 도 같이 측정합니다.
  `analyzeUploadedImages` 완료 시 콘솔에 3개 수치 로깅:
    - 호출된 이미지 수 / 총 이미지 수 (= 게이트 발동율)
    - 실제로 수정된 카드 수 / 총 카드 수 (= 카드 레벨 실효율)
    - 실제로 수정된 이미지 수 / 호출된 이미지 수 (= 이미지 레벨 실효율)
- 실효율이 낮으면(예: 호출 35% 중 수정 5%) 게이트가 과민한 것 — bad 판정 기준 완화 대상.
