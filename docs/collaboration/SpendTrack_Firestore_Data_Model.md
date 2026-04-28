# SpendTrack Firestore Data Model

- 문서 목적: 현재 React 코드와 목업 데이터를 기준으로 Firestore 컬렉션 구조, CRUD 범위, 인덱스, 팀 작업 분담 기준을 정리합니다.
- 기준 코드:
  - `src/stores/transactionsStore.ts`
  - `src/stores/profileStore.ts`
  - `src/stores/categoriesStore.ts`
  - `src/pages/Transactions/components/TransactionTable.tsx`
  - `src/pages/ManualEntry/index.tsx`
  - `src/pages/OcrEdit/index.tsx`
  - `src/pages/CsvUpload/index.tsx`
- 작성일: 2026-04-22

## 1. 결론 요약

현재 화면이 실제로 소비하는 핵심 엔티티는 아래 3개입니다.

1. `users`
2. `users/{uid}/transactions`
3. `users/{uid}/categories`

즉 1차 Firestore 연동 범위는 `프로필`, `거래`, `카테고리` 3축으로 잡는 것이 가장 안전합니다.

운영/감사 목적의 보조 컬렉션으로는 `accountLifecycleLogs`를 최상위에 별도로 두는 것을 권장합니다.  
이 컬렉션은 제품 기능의 핵심 엔티티는 아니지만, 탈퇴 예약 / 복구 / 최종 삭제 이력을 남길 때 유용합니다.

추가로 필요한 가벼운 설정값은 `users/{uid}` 문서 안에 함께 두고, OCR 원본 이미지나 대규모 AI 호출 로그 같은 기능은 2차 확장으로 미룹니다.  
다만 현재 기획 기준상 `Tesseract 기본 + Vision fallback`, `SummaryBanner AI 문장화`가 다음 구현 범위에 들어오므로, 최소 메타데이터는 거래 문서와 사용자 문서에 함께 둘 수 있게 여지를 남겨두는 편이 좋습니다.

## 2. 왜 이 구조가 현재 코드와 맞는가

현재 코드 기준으로 실제 영속화가 필요한 상태는 아래와 같습니다.

- 거래 목록 CRUD
  - 수동 입력 저장
  - OCR 저장
  - CSV 벌크 추가
  - 거래 수정/삭제
  - OCR 결과를 기존 거래에 상품으로 병합
- 사용자 프로필 수정
  - 이름
  - 닉네임
  - 이메일 표시값
  - 아바타
  - 비밀번호 변경일 표시값
- 카테고리 설정 CRUD
  - 표준 카테고리 색상/이름 변경
  - 사용자 정의 카테고리 추가/삭제

반대로 현재 코드에는 아직 아래가 없습니다.

- 실제 OCR 엔진 결과 영속 보관
- 이미지 파일 업로드 저장소
- 서버 사이드 집계
- 실시간 협업 동시 편집

따라서 Firestore도 현재 UI와 스토어 API를 그대로 치환할 수 있는 최소 구조로 가는 것이 맞습니다.

## 3. 추천 컬렉션 구조

```text
users/{uid}
  displayName
  nickname
  email
  avatarUrl
  passwordChangedAt
  accountStatus
  deletionRequestedAt
  purgeAt
  restoredAt
  onboardingSeen
  analysisCache
  createdAt
  updatedAt

users/{uid}/transactions/{transactionId}
  type
  dateText
  dateTs
  monthKey
  platform
  categories
  title
  amount
  absAmount
  status
  source
  memo
  detail.items[]
  detail.source
  ocrMeta
  createdAt
  updatedAt

users/{uid}/categories/{categoryId}
  name
  color
  isStandard
  isLocked
  sortOrder
  createdAt
  updatedAt

accountLifecycleLogs/{logId}
  uid
  eventType
  emailHash
  emailMasked
  providerIds[]
  reauthProvider
  reason
  status
  authTime
  dataSummary
  requestedAt
  restoredAt
  purgedAt
  purgeAt
  failedAt
```

## 4. 최상위 문서 설계

### 4-1. `users/{uid}`

역할:
- Firebase Auth의 사용자와 1:1 대응되는 프로필 문서
- Settings, Sidebar, AppShell에서 읽는 기본 사용자 정보 저장
- 작은 개인 설정값 저장

권장 필드:

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `displayName` | string | O | 현재 `profile.name` 대응 |
| `nickname` | string | O | 현재 `profile.nickname` 대응 |
| `email` | string | O | 화면 표시 및 보조 조회용 |
| `avatarUrl` | string \| null | O | 권장: Cloud Storage URL. 현재 `avatarDataUrl`는 장기적으로 대체 |
| `passwordChangedAt` | string | X | 현재 UI 표시용 문자열 유지 가능 |
| `accountStatus` | `"active" \| "pending_deletion"` | O | 계정 활성/삭제 예약 상태 |
| `deletionRequestedAt` | Timestamp | X | 삭제 예약 요청 시각 |
| `purgeAt` | Timestamp | X | 실제 영구 삭제 예정 시각 |
| `restoredAt` | Timestamp | X | 삭제 예약 후 다시 로그인으로 복구된 시각 |
| `onboardingSeen` | boolean | O | 현재 localStorage 플래그 대체 가능 |
| `analysisCache` | map | X | 월별 AI 요약 문장을 짧게 캐시할 경우 사용 가능 |
| `createdAt` | Timestamp | O | 문서 생성 시간 |
| `updatedAt` | Timestamp | O | 마지막 수정 시간 |

주의:
- 비밀번호 자체는 절대 저장하지 않습니다.
- 이메일은 Auth에도 있으므로 중복이지만, 화면 렌더 단순화를 위해 문서에도 캐시해 둘 수 있습니다.
- 아바타는 Firestore에 base64 문자열로 넣기보다 Storage 업로드 후 URL만 저장하는 쪽이 좋습니다.
- `analysisCache`는 필수가 아닙니다. 다만 Analysis 진입마다 AI를 다시 호출하지 않고, 거래 변경 시점에만 새 문장을 생성하려면 사용자 문서 또는 별도 하위 컬렉션에 캐시할 수 있습니다.

예시:

```json
{
  "displayName": "홍길동",
  "nickname": "길동님",
  "email": "hong@example.com",
  "avatarUrl": null,
  "passwordChangedAt": "2025.02.10",
  "accountStatus": "active",
  "onboardingSeen": false,
  "createdAt": "serverTimestamp()",
  "updatedAt": "serverTimestamp()"
}
```

### 4-2. `accountLifecycleLogs/{logId}`

역할:
- 회원 탈퇴 예약, 재활성화, 최종 삭제를 남기는 감사 로그
- `users/{uid}` 삭제 이후에도 남아 있어야 하므로 사용자 문서 바깥 최상위 컬렉션에 저장
- 운영 확인용 최소 메타데이터만 보관하고, 거래 원문이나 프로필 전체 스냅샷은 남기지 않음

권장 필드:

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `uid` | string | O | 대상 Auth uid |
| `eventType` | `"deletion_requested" \| "deletion_restored" \| "deletion_purged" \| "deletion_request_failed"` | O | 계정 수명주기 이벤트 |
| `emailHash` | string \| null | X | 이메일 원문 대신 남기는 SHA-256 해시 |
| `emailMasked` | string \| null | X | 운영자가 식별 가능한 최소 표시값 |
| `providerIds` | string[] | O | 이벤트 당시 연결된 로그인 수단 |
| `reauthProvider` | string \| null | X | 삭제 예약 직전 재인증에 사용한 provider |
| `reason` | string | O | 예: `self-service` |
| `status` | `"scheduled" \| "completed" \| "failed"` | O | 이벤트 처리 상태 |
| `authTime` | string \| null | X | 삭제 예약 직전 최근 인증 시각(ISO 문자열) |
| `dataSummary.userDocExisted` | boolean | X | 최종 삭제 시 `users/{uid}` 문서 존재 여부 |
| `dataSummary.topLevelCounts` | map | X | 예: `transactions: 142`, `categories: 6` |
| `dataSummary.totalDocsDeleted` | number | X | 실제 삭제된 문서 총합 |
| `requestedAt` | Timestamp | X | 삭제 예약 시각 |
| `restoredAt` | Timestamp | X | 재로그인 복구 시각 |
| `purgedAt` | Timestamp | X | 최종 영구 삭제 시각 |
| `purgeAt` | Timestamp | X | 삭제 예정 시각 |
| `failedAt` | Timestamp | X | 실패 시각 |

예시:

```json
{
  "uid": "uid_12345",
  "eventType": "deletion_requested",
  "emailHash": "8b7d...c91",
  "emailMasked": "ho***@example.com",
  "providerIds": ["password"],
  "reauthProvider": "password",
  "reason": "self-service",
  "status": "scheduled",
  "authTime": "2026-04-27T09:45:00.000Z",
  "requestedAt": "serverTimestamp()",
  "purgeAt": "serverTimestamp() + 7d"
}
```

주의:
- 삭제 로그는 `users/{uid}` 아래에 두면 회원 탈퇴 시 함께 사라지므로 안 됩니다.
- 개인정보 최소화 원칙상 이메일 원문, 거래 상세 내용, avatarDataUrl 같은 필드는 보관하지 않는 편이 좋습니다.
- 재로그인 복구를 허용하려면 삭제 요청 시점에 Firebase Auth 사용자를 즉시 지우면 안 됩니다.
- 운영 정책이 정해지면 TTL 또는 주기 삭제 배치로 로그 보관 기간을 제한하는 것이 좋습니다.

## 5. 핵심 거래 컬렉션 설계

### 5-1. `users/{uid}/transactions/{transactionId}`

역할:
- 현재 앱의 핵심 도메인 데이터
- Home, Transactions, Analysis, OCR 매칭, 수정 모달이 모두 여기에 의존

권장 필드:

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `type` | `"expense" \| "income"` | O | 현재 `TxRow.type` |
| `dateText` | string | O | `"2026.04.19"` 형태 유지. UI 호환용 |
| `dateTs` | Timestamp | O | 정렬/범위 조회용 |
| `monthKey` | string | O | `"2026-04"` 형태. 월 필터 성능용 |
| `platform` | `"coupang" \| "naver" \| "musinsa"` | O | 현재 `TxPlatform` 기준 |
| `categories` | string[] | O | 최소 1개, 빈 배열 금지 |
| `title` | string | O | 거래명 |
| `amount` | number | O | 현재 규칙 유지. 지출은 음수, 수입은 양수 |
| `absAmount` | number | O | 매칭 및 비교용 절댓값 |
| `status` | `"purchase" \| "cancel" \| "refund" \| "sub" \| "etc"` | O | 현재 `TxStatus` |
| `source` | `"mock" \| "csv" \| "ocr" \| "manual"` | X | 생성 경로 |
| `memo` | string | X | 메모 |
| `detail.items` | array | X | 상품 목록 |
| `detail.source` | `"OCR" \| "MANUAL"` | X | 상품 상세 생성 경로 |
| `detail.cardImport` | map | X | 카드 CSV/XLSX 원본 메타. 할부 승인/청구, 회차, 청구금액 등은 여기서만 관리 |
| `ocrMeta` | map | X | OCR 엔진/검증/fallback 관련 메타데이터 |
| `createdAt` | Timestamp | O | 생성 시간 |
| `updatedAt` | Timestamp | O | 수정 시간 |

정책 메모:

- OCR 단독 저장 거래는 `detail.cardImport`를 추정 생성하지 않는다.
- `detail.cardImport`는 카드 명세서 import가 원본이며, OCR 상품이 기존 카드 거래에 병합될 때만 그 메타를 간접적으로 공유한다.
- `billing`(할부 청구건)은 OCR 상품 병합 대상이 아니다.

상품 배열 항목:

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `name` | string | O | 상품명 |
| `price` | number | O | 상품 가격 |
| `link` | string | X | 상품 URL |

예시:

```json
{
  "type": "expense",
  "dateText": "2026.04.14",
  "dateTs": "Timestamp(2026-04-14T00:00:00+09:00)",
  "monthKey": "2026-04",
  "platform": "coupang",
  "categories": ["fashion"],
  "title": "나이키 에어포스 외 1건",
  "amount": -258000,
  "absAmount": 258000,
  "status": "purchase",
  "source": "ocr",
  "memo": "",
  "detail": {
    "source": "OCR",
    "items": [
      {
        "name": "나이키 에어포스 1 로우",
        "price": 129000,
        "link": "https://www.coupang.com/vp/products/1000001"
      },
      {
        "name": "나이키 에어포스 1 로우 화이트",
        "price": 129000
      }
    ]
  },
  "ocrMeta": {
    "engine": "tesseract",
    "fallbackUsed": true,
    "validatorPassed": false,
    "analyzedAt": "serverTimestamp()"
  },
  "createdAt": "serverTimestamp()",
  "updatedAt": "serverTimestamp()"
}
```

### 5-2. 왜 `dateText`와 `dateTs`를 같이 두는가

현재 UI는 문자열 날짜를 많이 사용합니다. 하지만 Firestore에서는 범위 조회와 정렬이 중요하므로 Timestamp도 같이 필요합니다.

권장 원칙:
- UI 입력/출력용: `dateText`
- 정렬/쿼리용: `dateTs`
- 월 필터용: `monthKey`

### 5-3. 왜 `absAmount`를 따로 두는가

현재 매칭 로직은 OCR 후보와 기존 거래를 비교할 때 절댓값 기준으로 금액을 비교합니다.

관련 코드:
- `src/utils/matchTransaction.ts`

즉 아래 둘 다 필요합니다.
- `amount`: 수입/지출 부호 포함 실제 도메인 값
- `absAmount`: OCR 매칭, 필터링, 비교 편의용 값

### 5-4. 카테고리 필드 원칙

현재 UI는 `categories: TxCategory[]` 구조를 이미 쓰고 있으므로 Firestore도 그대로 맞추는 것이 좋습니다.

원칙:
- 빈 배열 금지
- 값이 없으면 `["etc"]`
- 최대 개수는 현재 UI 상한과 동일하게 유지
- 현재 분석 로직은 다중 카테고리를 중복 집계하므로 그대로 저장

### 5-5. OCR/AI 메타데이터를 최소 필드로 두는 이유

현재 기획 기준에서 OCR은 `Tesseract 기본 + Vision fallback`, 분석 인사이트는 `저장 시점/갱신 시점에만 AI 생성` 원칙을 따릅니다.

따라서 모든 원본 로그를 저장할 필요는 없지만, 아래 정도의 메타는 남겨둘 가치가 있습니다.

- 어떤 엔진이 최종 결과를 만들었는지 (`engine`)
- Vision fallback이 실제 사용되었는지 (`fallbackUsed`)
- validator를 통과했는지 (`validatorPassed`)
- 언제 분석되었는지 (`analyzedAt`)

이 정도면 디버깅과 UX 설명에는 충분하고, 과도한 로그 저장 없이도 현재 제품 흐름을 설명할 수 있습니다.

## 6. 카테고리 컬렉션 설계

### 6-1. `users/{uid}/categories/{categoryId}`

역할:
- Settings의 카테고리 관리 화면 저장소
- 거래 화면과 분석 화면의 색상/라벨 기준

문서 ID 권장:
- 표준 카테고리: `living`, `fashion`, `digital`, `food`, `etc`
- 사용자 정의 카테고리: `custom_<timestamp>` 또는 Firestore auto id

권장 필드:

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `name` | string | O | 화면 표시 이름 |
| `color` | string | O | hex color |
| `isStandard` | boolean | O | 표준 카테고리 여부 |
| `isLocked` | boolean | O | 삭제/수정 제한 여부 |
| `sortOrder` | number | O | 표시 순서 |
| `createdAt` | Timestamp | O | 생성 시간 |
| `updatedAt` | Timestamp | O | 수정 시간 |

예시:

```json
{
  "name": "생활",
  "color": "#6BCB77",
  "isStandard": true,
  "isLocked": false,
  "sortOrder": 20,
  "createdAt": "serverTimestamp()",
  "updatedAt": "serverTimestamp()"
}
```

주의:
- 현재 거래 데이터의 `categories`는 표준 카테고리 union 기준입니다.
- 사용자 정의 카테고리는 현재 거래와 연결되지 않으므로, 1차 구현에서는 `설정 저장만` 하고 거래 입력 옵션 연결은 2차로 미뤄도 됩니다.

## 7. CRUD 기준 매핑

### 7-1. 거래 CRUD

| 액션 | 현재 코드 | Firestore 액션 |
| --- | --- | --- |
| 거래 목록 조회 | `transactionsStore.loadAll()` | `users/{uid}/transactions` 월 기준 조회 |
| 거래 1건 추가 | `addOne()` | `addDoc()` 또는 `setDoc()` |
| CSV 벌크 추가 | `addMany()` | `writeBatch()` |
| 거래 수정 | `updateOne()` | `updateDoc()` |
| 거래 삭제 | `removeOne()` | `deleteDoc()` |
| OCR 상품 병합 | `appendItemsToTransaction()` | 대상 문서의 `detail.items` 갱신 |

### 7-2. 프로필 CRUD

| 액션 | 현재 코드 | Firestore 액션 |
| --- | --- | --- |
| 프로필 조회 | `profileStore.load()` | `getDoc(users/{uid})` |
| 프로필 저장 | `profileStore.save()` | `updateDoc(users/{uid})` |
| 프로필 초기화 | `profileStore.reset()` | 기본 프로필 생성 또는 필드 리셋 |

### 7-3. 카테고리 CRUD

| 액션 | 현재 코드 | Firestore 액션 |
| --- | --- | --- |
| 목록 조회 | `categoriesStore.loadAll()` | `getDocs(users/{uid}/categories)` |
| 추가 | `addCustom()` | `addDoc()` |
| 수정 | `update()` | `updateDoc()` |
| 삭제 | `remove()` | `deleteDoc()` |

## 8. 필수 쿼리와 인덱스

### 8-1. 기본 조회 패턴

현재 UI 기준으로 가장 중요한 조회는 아래입니다.

1. 월별 거래 목록 조회
2. 월별 거래 후 검색/필터
3. OCR 매칭 후보 조회
4. 카테고리 목록 조회

### 8-2. 추천 쿼리

월별 거래 목록:

```ts
query(
  collection(db, "users", uid, "transactions"),
  where("monthKey", "==", "2026-04"),
  orderBy("dateTs", "desc")
)
```

OCR 매칭 후보:

```ts
query(
  collection(db, "users", uid, "transactions"),
  where("platform", "==", platform),
  where("absAmount", "==", absAmount),
  where("monthKey", "==", monthKey)
)
```

참고:
- 날짜 허용 오차가 `+-2일`이므로 최종 필터링은 클라이언트에서 한 번 더 수행하는 편이 구현이 단순합니다.
- 초기에는 `monthKey + platform + absAmount`만으로 후보를 가져오고, `matchTransaction.ts` 로직으로 후처리하면 됩니다.

### 8-3. 추천 복합 인덱스

| 컬렉션 | 필드 |
| --- | --- |
| `users/{uid}/transactions` | `monthKey ASC`, `dateTs DESC` |
| `users/{uid}/transactions` | `monthKey ASC`, `platform ASC`, `absAmount ASC` |

## 9. 보안 규칙 초안

핵심 원칙:
- 로그인한 사용자만 자신의 문서에 접근
- 다른 사용자의 데이터 접근 금지

초안:

```txt
match /users/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;

  match /transactions/{transactionId} {
    allow read, write: if request.auth != null && request.auth.uid == userId;
  }

  match /categories/{categoryId} {
    allow read, write: if request.auth != null && request.auth.uid == userId;
  }
}
```

## 10. 구현 시 주의점

### 10-1. `TxRow`를 기준 스키마로 삼는 것이 안전함

현재 `src/types/transaction.ts`보다 실제 앱 화면은 `TxRow`를 중심으로 움직입니다.

차이점 예시:
- `TxRow`는 `categories[]`를 사용
- `TxRow`는 `detail.items` 구조 사용
- `TxRow`는 `status` 값 집합이 실제 화면 로직과 맞음

따라서 Firestore 1차 스키마는 `Transaction` 인터페이스보다 `TxRow` 중심으로 정리하는 편이 좋습니다.

### 10-2. 아바타 저장 방식

현재는 `avatarDataUrl`을 localStorage에 저장하지만, Firestore에는 base64 이미지 문자열을 오래 저장하지 않는 편이 좋습니다.

권장:
- 이미지 파일은 Firebase Storage 업로드
- Firestore `users/{uid}.avatarUrl`에 다운로드 URL 저장

### 10-3. CSV 벌크 저장

CSV 업로드는 여러 거래를 한 번에 넣으므로 `writeBatch()` 사용이 적합합니다.

권장 흐름:
1. 파일 파싱
2. `TxRow` 형태 매핑
3. Firestore 문서 payload 변환
4. batch commit

### 10-4. 초기 시드 데이터

현재 `mock` 소스 데이터는 데모용입니다.

Firebase 전환 후 권장:
- 신규 계정: 빈 거래 목록 + 기본 카테고리 seed 생성
- 데모 계정이 필요하면 별도 seed 스크립트 또는 import 유틸로 주입

## 11. 팀 작업 분담 추천

### 작업 A. Auth + User bootstrap

담당 범위:
- Firebase Auth 로그인/회원가입 연결
- `users/{uid}` 생성
- 기본 카테고리 seed 생성

완료 기준:
- 신규 회원가입 시 사용자 문서와 표준 카테고리 5종이 자동 생성됨

### 작업 B. Transactions repository

담당 범위:
- `transactionsStore`를 대체할 Firestore repository 작성
- 목록 조회, 추가, 수정, 삭제, 벌크 추가 구현

완료 기준:
- Manual Entry, Transactions, CSV Upload가 Firestore 기반으로 동작함

### 작업 C. Profile + Categories repository

담당 범위:
- `profileStore`, `categoriesStore` 대체
- Settings 프로필/카테고리 화면 연동

완료 기준:
- 이름/닉네임/아바타/카테고리 수정이 새로고침 후 유지됨

### 작업 D. OCR save/attach flow

담당 범위:
- OCR 저장
- 기존 거래와 매칭 후보 조회
- `detail.items` 병합 업데이트

완료 기준:
- OCR Edit에서 새 저장 또는 기존 거래 병합이 Firestore에 반영됨

## 12. 구현 우선순위

1. Firebase 프로젝트 생성 + Auth/Firestore 설정
2. `users/{uid}` + 기본 카테고리 bootstrap
3. Transactions CRUD
4. Profile/Categories CRUD
5. OCR attach flow
6. Storage 기반 아바타 업로드

## 13. 추천 파일 구조

```text
src/lib/firebase.ts
src/lib/firestoreConverters.ts
src/repositories/userRepository.ts
src/repositories/transactionRepository.ts
src/repositories/categoryRepository.ts
src/hooks/useTransactionsQuery.ts
src/hooks/useProfileQuery.ts
src/hooks/useCategoriesQuery.ts
```

## 14. 최종 제안

이번 단계에서는 아래처럼 가는 것이 가장 현실적입니다.

- 인증: Firebase Auth
- 사용자 프로필: `users/{uid}`
- 거래: `users/{uid}/transactions`
- 카테고리: `users/{uid}/categories`
- 아바타 이미지: Firebase Storage

이 구조면 현재 코드와의 괴리가 적고, 팀원이 CRUD 작업을 나눠 가져가기도 쉽습니다.
