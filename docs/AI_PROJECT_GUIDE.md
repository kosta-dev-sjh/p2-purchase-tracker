# SpendTrack AI 프로젝트 가이드

작성 목적: 이 저장소에서 작업하는 AI가 짧은 시간 안에 현재 구조와 우선순위를 이해하도록 돕는 운영 문서

## 1. 프로젝트 한 줄 요약

SpendTrack는 쇼핑 주문내역 OCR, 카드 CSV, 수동 입력을 하나의 거래 스토어로 모아 기록·수정·조회·분석하는 소비관리 웹앱입니다.

## 2. 문서 우선순위

1. `docs/SpendTrack_Planning_Document.md`
2. `CLAUDE.md`
3. 이 문서
4. `src/` 실제 코드

planning과 코드가 어긋나면, 구현 판단은 우선 코드 기준으로 하고 planning 변경이 필요한지 따로 검토합니다.

## 3. 현재 핵심 사용자 흐름

### 입력 경로

- `/manual-entry`: 사용자가 직접 거래를 입력
- `/ocr-upload` → `/ocr-edit`: 주문 이미지 업로드 후 OCR 결과 수정
- `/csv-upload`: 카드 이용내역 파일 업로드

### 저장 이후

- `/transactions`: 월별 거래 목록, 상세, 수정, 삭제
- `/analysis`: 플랫폼/카테고리/반복구매/요일 패턴 등 분석

## 4. 핵심 도메인 규칙

### 거래 데이터

- 핵심 거래 타입은 `TxRow`
- 지출은 음수, 수입은 양수
- 플랫폼/카테고리/상태는 문자열 리터럴 union으로 관리
- 거래 상세 상품은 `detail.items`

### 중복 처리

- 1차 fingerprint: `date|platform|abs(amount)`
- 2차 비교: `detail.items`의 `name|price` 집합
- 완전 동일: skip
- 새 아이템만 추가: merge
- 같은 이름인데 가격 다름: 새 거래로 분기

### 보강 처리

- 기존 데이터가 빈 경우만 자동 채움
- 충돌은 사용자 확인 모달로 보냄
- 기존 값을 소리 없이 덮어쓰지 않음

## 5. 지금 코드에서 중요한 파일

### 저장/도메인

- `src/stores/transactionsStore.ts`
- `src/utils/duplicateCheck.ts`
- `src/utils/mergeEnrichment.ts`
- `src/utils/productTotalCheck.ts`
- `src/utils/matchTransaction.ts`

### 입력 화면

- `src/pages/ManualEntry/index.tsx`
- `src/pages/OcrEdit/index.tsx`
- `src/pages/CsvUpload/index.tsx`

### 수정/표시

- `src/components/modal/TransactionEditModal.tsx`
- `src/pages/Transactions/index.tsx`
- `src/pages/Transactions/components/DetailPanel.tsx`

## 6. 변경 시 자주 확인할 체크리스트

- 같은 규칙이 수동 입력/OCR/CSV/수정 모달에서 모두 일관적인가
- 상품 메타(`itemsCoverage`, `sourceImageUrl`)가 병합 중에 사라지지 않는가
- 필수 입력값 표시와 포커스 이동이 유지되는가
- 결과 안내 모달/배너가 실제 저장 결과와 어긋나지 않는가
- 죽은 코드가 새로 생기지 않았는가

## 7. 남아 있는 임시/차기 작업 포인트

- 인증은 아직 목업이며 `src/mocks/auth.ts`에 의존
- 저장은 localStorage 기반
- Firestore/실 OCR/AI 실호출은 아직 차기 단계
- 관련 참고 문서:
  - `docs/collaboration/SpendTrack_Firestore_Data_Model.md`
  - `docs/collaboration/SpendTrack_MockAuth_Replacement.md`

## 8. 문서 유지 규칙

- 과거 handoff, 발표 스크립트, 일회성 보고 문서는 계속 쌓아두지 않습니다.
- 살아 있는 운영 기준 문서만 남기고, 시점이 지난 문서는 이 문서나 `CLAUDE.md`로 흡수합니다.
