/**
 * 역할: 가맹점명을 기반으로 카테고리를 추정할 때 쓰는 "내부 개념(concept)" 카탈로그.
 *       - 카탈로그는 사용자 카테고리와 무관하게 고정되어 있고, 사용자 카테고리(`CategoryEntry`)는
 *         `conceptIds`로 여기 정의된 개념에 "연결"되어 그 개념의 가맹점 패턴을 빨아들이는 구조입니다.
 *       - 덕분에 사용자가 "카페"라고 부르든 "커피"라고 부르든 룰 테이블은 그대로 두고 바인딩만 바꾸면 됩니다.
 *
 * 위치: src/data/categoryConcepts.ts
 *
 * 설계 메모:
 *  - 패턴은 정규식 기반. 영/한 혼용, 지점 꼬리말("강남점"), 카드사 접미 괄호까지 대응하도록 너그럽게.
 *  - aliases는 사용자가 카테고리를 새로 만들 때 "이름이 이 개념과 비슷한가?"를 판정할 때만 씁니다.
 *  - 상위 가맹점 기준으로 한국 개인 소비의 다수를 커버하는 것을 목표로 하되, 애매한 종합몰(쿠팡/11번가 등)은
 *    의도적으로 제외합니다. 종합몰 카테고리는 품목 분석 없이는 신뢰도 낮기 때문에 `etc`로 두는 게 안전합니다.
 */

export type ConceptId =
  | "cafe"
  | "delivery"
  | "restaurant"
  | "convenience"
  | "mart"
  | "transport"
  | "subscription"
  | "utility"
  | "insurance"
  | "fashion"
  | "digital"
  | "health"
  | "beauty"
  | "fuel"
  | "telecom";

export interface CategoryConcept {
  id: ConceptId;
  /** 사용자 카테고리 이름 ↔ 개념 매칭 후보 찾기용 별칭. 소문자/한글 모두. */
  aliases: string[];
  /** 가맹점명에 이 정규식이 걸리면 해당 개념으로 추정. 상위 규칙이 승리. */
  patterns: RegExp[];
  /** 추정 실패 시 표준 5개 카테고리로 내려앉히기 위한 기본 백업 매핑.
   *  `TxCategory` 값이지만 여기에 타입을 끌어오지 않기 위해 문자열로 둡니다. */
  fallbackStandard: "food" | "fashion" | "digital" | "living" | "etc";
}

/**
 * 개념 카탈로그. 더 구체적인 개념이 먼저 나오도록 배치해두면 매칭 우선순위가 자연스러움.
 * (예: 편의점이 마트보다 구체적 → 위에 둠)
 */
export const CATEGORY_CONCEPTS: CategoryConcept[] = [
  {
    id: "cafe",
    aliases: ["카페", "커피", "coffee", "cafe"],
    patterns: [
      /스타벅스|starbucks/i,
      /투썸|twosome/i,
      /이디야|ediya/i,
      /폴바셋|paul ?bassett/i,
      /커피빈|coffee ?bean/i,
      /blue ?bottle|블루보틀/i,
      /메가커피|메가엠지씨/i,
      /컴포즈/i,
      /빽다방|paik'?s/i,
      /할리스|hollys/i,
      /공차|gong ?cha/i,
      /탐앤탐스|tom ?n ?toms/i,
      /달콤커피|dalkomm/i,
      /엔제리너스/i,
      /더벤티|the ?venti/i,
      /카페베네/i,
      /커피/i, // 넓은 백업 — "동네커피" 류 포착
      // 베이커리/디저트는 카페와 한 바구니로 묶는 게 가계부 UX 표준(뱅크샐러드 "카페/간식").
      // 동네 빵집 가맹점명에 "베이커리"·"빵"·"제과"가 흔히 들어와서 long-tail 회수율을 올림.
      /베이커리|bakery/i,
      /빵집|제과점|제과|뚜레쥬르|tous ?les ?jours|파리바게트|paris ?baguette/i,
      /도넛|donut|크리스피크림|krispy/i,
      /마카롱|macaron/i,
      /빙수|설빙/i,
      /아이스크림|ice ?cream|배스킨라빈스|baskin/i,
      /디저트|dessert/i,
    ],
    fallbackStandard: "food",
  },
  {
    id: "delivery",
    aliases: ["배달", "딜리버리", "delivery"],
    patterns: [
      // "배달의민족" 결제는 카드 명세서에서 운영사 법인명인 "우아한형제들"로 찍히는 경우가 압도적으로 많아
      // 브랜드명만 잡으면 거의 못 잡는다. 두 표기 모두 공식 패턴으로 끌어올림.
      /배달의민족|배민/i,
      /우아한\s*형제들|woowa(?:hanbros|brothers)?/i,
      /요기요|yogiyo/i,
      /쿠팡이츠|coupang ?eats/i,
      /땡겨요/i,
      /배달특급/i,
      /우버이츠|uber ?eats/i,
    ],
    fallbackStandard: "food",
  },
  {
    id: "convenience",
    aliases: ["편의점", "convenience"],
    patterns: [
      /\bGS25\b/i,
      /\bCU\b(?!-?\w)/i,
      /세븐일레븐|7[- ]?eleven|7-?11/i,
      /이마트24|emart24/i,
      /미니스톱|ministop/i,
      /편의점/i, // "OO편의점" 동네 점포 일반 백업
    ],
    fallbackStandard: "food",
  },
  {
    id: "mart",
    aliases: ["마트", "장보기", "grocery", "mart"],
    patterns: [
      /이마트(?!24)/i,
      /홈플러스|homeplus/i,
      /롯데마트|lotte ?mart/i,
      /코스트코|costco/i,
      /트레이더스|traders/i,
      /하나로마트/i,
      /노브랜드|no ?brand/i,
      // 다이소는 분류상 "생활용품 마트"에 가까워 mart concept으로 흡수.
      // 슈퍼마켓 일반 단어도 동네 장보기를 잡기 위해 함께 추가.
      /다이소|daiso/i,
      /슈퍼마켓|super ?market/i,
    ],
    fallbackStandard: "living",
  },
  {
    id: "restaurant",
    aliases: ["식당", "외식", "음식점", "맛집", "restaurant"],
    patterns: [
      /맥도날드|mcdonald/i,
      /버거킹|burger ?king/i,
      /롯데리아|lotteria/i,
      /맘스터치|mom'?s ?touch/i,
      /kfc/i,
      /서브웨이|subway/i,
      /도미노|domino/i,
      /피자헛|pizza ?hut/i,
      /미스터피자|mr\.? ?pizza/i,
      /bhc|bhc치킨/i,
      /교촌|kyochon/i,
      /bbq/i,
      /네네치킨|nene/i,
      /굽네|goobne/i,
      /푸라닭|puradak/i,
      /스시|초밥/i,
      /김밥/i,
      /분식/i,
      /식당/i,
      // ── 일반 명사 매칭 레이어 ──────────────────────────────────────────
      // 가맹점 고유명("싸움의고수" 같은 동네 가게)은 일일이 못 잡지만,
      // 메뉴군 단어가 상호에 거의 항상 들어가는 한국 식음업 특성을 활용해
      // 키워드 한 줄로 long-tail을 광범위하게 회수한다.
      // 너무 일반적인 단어("집/방/마을/동")는 오탐 폭이 너무 커 의도적으로 제외.
      /치킨|chicken/i, // 치킨집 long-tail (싸움의고수, 처갓집 등 포함)
      /피자|pizza/i,
      /버거|burger/i,
      /삼겹살|돼지갈비|소갈비|등심|안창살|차돌박이/i,
      /국밥|해장국|순댓?국|곰탕|설렁탕|육개장/i,
      /떡볶이|떡볶기/i,
      /돈까스|돈가스|katsu|카츠/i,
      /라멘|라면|우동|소바/i,
      /짜장|짬뽕|중국집|중화요리/i,
      /파스타|pasta|이탈리안|italian/i,
      /횟집|회집|sushi(?!-?roll)/i,
      /족발|보쌈/i,
      /곱창|막창|대창/i,
      /찜닭|찜갈비|닭갈비/i,
      /샤브샤브|훠궈|hot ?pot/i,
      /샐러드|salad/i, // 샐러바웃 등 회수
      /브런치|brunch/i,
      /비스트로|bistro|다이닝|dining/i,
      /주점|호프|선술집|이자카야|izakaya|pub|\bbar\b(?!ber)/i,
      /한식|중식|일식|양식|뷔페|buffet/i,
      /토스트|toast|샌드위치|sandwich/i,
      /포케|poke|타코|taco|쌀국수|pho/i,
    ],
    fallbackStandard: "food",
  },
  {
    id: "transport",
    aliases: ["교통", "대중교통", "지하철", "버스", "택시", "transport"],
    patterns: [
      /지하철|metro|subway/i,
      /버스/i,
      /택시|taxi/i,
      /카카오\s*[tT]|kakao ?t/i,
      /우티|uber(?!eats)/i,
      /티머니|t[- ]?money/i,
      /하이패스|hi[- ]?pass/i,
      /대중교통/i,
      /코레일|korail|ktx|srt/i,
      /철도/i,
      /공항버스|리무진/i,
    ],
    fallbackStandard: "etc",
  },
  {
    id: "fuel",
    aliases: ["주유", "기름", "fuel", "gas"],
    patterns: [
      /SK에너지|sk ?energy/i,
      /GS칼텍스|gs ?caltex/i,
      /S-?OIL|에쓰[- ]?오일/i,
      /현대오일뱅크|hd ?oilbank/i,
      /알뜰주유소/i,
      /주유소/i,
    ],
    fallbackStandard: "etc",
  },
  {
    id: "subscription",
    aliases: ["구독", "멤버십", "정기결제", "subscription"],
    patterns: [
      /netflix|넷플릭스/i,
      /youtube ?premium|유튜브\s*프리미엄/i,
      /disney\+?|디즈니플러스|디즈니\+/i,
      /spotify|스포티파이/i,
      /wavve|웨이브/i,
      /tving|티빙/i,
      /왓챠|watcha/i,
      /apple ?music|애플뮤직/i,
      /apple ?one|애플원/i,
      /icloud|아이클라우드/i,
      /chatgpt|openai/i,
      /claude\.ai|anthropic/i,
      /gemini ?(advanced|premium)/i,
      /cursor\.(?:com|sh)|cursor ?ai/i,
      /perplexity/i,
      /github(?: ?copilot)?|gh ?copilot/i,
      /notion|노션/i,
      /figma|피그마/i,
      /linear\.app|linear/i, // 가맹점명에 단독 "linear"가 잘 안 오므로 도메인 우선
      /밀리의서재|밀리 ?서재/i,
      /리디|ridi/i,
      /쿠팡\s*플레이|coupang ?play/i,
      /네이버\s*플러스|naver ?plus/i,
      /쿠팡\s*와우/i,
      /배민\s*클럽|배달의민족\s*클럽/i,
    ],
    fallbackStandard: "etc",
  },
  {
    id: "telecom",
    aliases: ["통신", "통신비", "telecom", "mobile", "인터넷"],
    patterns: [
      /\bSKT\b|에스케이텔레콤|sk ?telecom/i,
      // 인터넷·IPTV 회선은 모회선과 별도 청구되어 "SK브로드밴드/KT 인터넷/엘지유플러스" 같은 표기로 들어옴.
      // 모바일과 같이 통신비로 묶는 게 가계부 UX 표준이라 telecom 한 바구니에 둠.
      /SK ?브로드밴드|에스케이\s*브로드밴드|skb(?:roadband)?/i,
      /\bKT\b(?!X)/i,
      /KT ?인터넷|KT ?olleh|olleh ?tv/i,
      /LG ?U\+?|유플러스|lg ?uplus/i,
      /엘지\s*유플러스|엘지\s*유플\+?/i,
      /알뜰폰|mvno/i,
      /통신요금|통신료/i,
    ],
    fallbackStandard: "etc",
  },
  {
    id: "utility",
    aliases: ["공과금", "관리비", "전기", "가스", "수도", "utility", "bill"],
    patterns: [
      /한국전력|한전|kepco/i,
      /전기요금|전기료/i,
      /도시가스|가스요금|가스료/i,
      /수도요금|상하수도|water/i,
      /관리비|아파트관리비|오피스텔관리비/i,
      /난방비|지역난방/i,
      /환경개선부담금|전기차충전/i,
    ],
    fallbackStandard: "living",
  },
  {
    id: "insurance",
    aliases: ["보험", "보험료", "insurance"],
    patterns: [
      /삼성화재|현대해상|kb손해보험|db손해보험|메리츠화재|한화손해보험/i,
      /교보생명|한화생명|삼성생명|신한라이프|흥국생명|미래에셋생명/i,
      /보험료|손해보험|생명보험|화재보험/i,
      /건강보험|국민건강보험|장기요양보험/i,
    ],
    fallbackStandard: "living",
  },
  {
    id: "fashion",
    aliases: ["패션", "의류", "옷", "fashion", "clothing", "apparel"],
    patterns: [
      /무신사|musinsa/i,
      /29cm|이십구cm/i,
      /유니클로|uniqlo/i,
      /자라|\bzara\b/i,
      /h&?m|에이치앤엠/i,
      /지그재그|zigzag/i,
      /에이블리|ably/i,
      /브랜디|brandi/i,
      /스파오|spao/i,
      /탑텐|topten/i,
      /미쏘|mixxo/i,
      /nike|나이키/i,
      /adidas|아디다스/i,
      /newbalance|뉴발란스/i,
    ],
    fallbackStandard: "fashion",
  },
  {
    id: "digital",
    aliases: ["전자", "디지털", "전자기기", "digital", "electronics"],
    patterns: [
      /apple ?store|애플\s*스토어/i,
      /삼성전자|samsung ?electronics/i,
      /하이마트|hi[- ]?mart/i,
      /전자랜드/i,
      /\blg전자\b/i,
    ],
    fallbackStandard: "digital",
  },
  {
    id: "health",
    aliases: ["건강", "의료", "병원", "약국", "health", "medical"],
    patterns: [
      /약국/i,
      /병원/i,
      /의원/i,
      /치과/i,
      /한의원/i,
      /피부과|성형외과|안과|이비인후과|정형외과/i,
      /클리닉|clinic/i,
    ],
    fallbackStandard: "etc",
  },
  {
    id: "beauty",
    aliases: ["뷰티", "화장품", "미용", "beauty", "cosmetics"],
    patterns: [
      /올리브\s*영|olive ?young/i,
      /아리따움|aritaum/i,
      /이니스프리|innisfree/i,
      /더페이스샵|the ?face ?shop/i,
      /미샤|missha/i,
      /네이처리퍼블릭|nature ?republic/i,
      /에뛰드|etude/i,
      /시코르|chicor/i,
      // 헤어/뷰티 살롱은 별도 concept으로 떼지 않고 beauty에 합류 — 가계부 표준 분류와 일치.
      // 일반 명사 회수율을 위해 헤어/바버/살롱/두피/네일/속눈썹까지 보강.
      // 한국 미용실 브랜드는 거의 "OO헤어"(준오헤어/이가자헤어/박승철헤어) 형태라 "헤어" 단독 키워드도 포함.
      // 헤어드라이어/헤어밴드 같은 잡음은 mart·beauty 화장품 패턴이 먼저 매칭되어 큰 영향 없고,
      // 어차피 beauty concept 안에 머무는 잡음이라 다른 카테고리로 새지도 않음.
      /미용실|헤어 ?샵|헤어 ?샾|헤어 ?살롱|헤어|hair ?(?:shop|salon)/i,
      /바버 ?샵|barber ?shop|barbershop/i,
      // \b는 한글 경계에서 동작하지 않으므로 한글 키워드는 그냥 부분 매칭으로 둔다.
      // 영문 salon만 단어 경계 적용 (\b)으로 "salonpas" 같은 노이즈 회피.
      /살롱|\bsalon\b/i,
      /네일 ?샵|nail ?shop|네일아트/i,
      /속눈썹|아이래쉬|eyelash/i,
      /두피 ?케어|왁싱|waxing/i,
    ],
    fallbackStandard: "etc",
  },
];

/** id → concept 빠른 조회용 인덱스 (O(1)). */
export const CONCEPT_BY_ID: Record<ConceptId, CategoryConcept> = CATEGORY_CONCEPTS.reduce(
  (acc, concept) => {
    acc[concept.id] = concept;
    return acc;
  },
  {} as Record<ConceptId, CategoryConcept>
);

/**
 * 가맹점명 문자열을 훑어 가장 먼저 매칭되는 개념의 id를 반환합니다.
 * 어떤 개념에도 걸리지 않으면 null.
 *
 * 주의: 카탈로그 순서가 우선순위다. 상위에 더 구체적인 개념이 오도록 배치돼 있어야 한다.
 */
export function detectConcept(merchant: string): ConceptId | null {
  if (!merchant) return null;
  const normalized = merchant
    .replace(/\(주\)|\(유\)|주식회사/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  for (const concept of CATEGORY_CONCEPTS) {
    for (const pattern of concept.patterns) {
      if (pattern.test(normalized)) return concept.id;
    }
  }
  return null;
}

/**
 * 사용자가 새 카테고리를 추가할 때 "비슷한 이름의 개념"을 제안하기 위한 유사도 판정.
 * 완전히 똑같은 별칭이 있으면 즉시 반환하고, 없으면 부분 문자열 포함으로 2차 탐색.
 *
 * 편집거리까지 가면 오탐이 늘어 제안 UX만 번잡해지므로 여기선 알파·포함 수준만.
 * 제안이므로 틀려도 사용자가 체크박스를 해제하면 그만이라 보수적으로 둔다.
 */
export function suggestConceptByName(name: string): ConceptId | null {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  for (const concept of CATEGORY_CONCEPTS) {
    if (concept.aliases.some((alias) => alias.toLowerCase() === q)) return concept.id;
  }
  for (const concept of CATEGORY_CONCEPTS) {
    if (concept.aliases.some((alias) => {
      const a = alias.toLowerCase();
      return a.includes(q) || q.includes(a);
    })) return concept.id;
  }
  return null;
}
