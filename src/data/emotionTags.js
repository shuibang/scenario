// 감정태그 데이터
// 각 감정 단어: { word, score(추천 intensity 1-5), example(예시 문장) }

export const EMOTION_CATEGORIES = [
  {
    color: '#FFD600',
    label: '기쁨',
    groups: [
      {
        name: '가벼운 기쁨',
        emotions: [
          { word: '설렘', score: 3, example: '처음 만나는 날의 설렘' },
          { word: '기대', score: 2, example: '내일을 기대하며' },
          { word: '흥분', score: 4, example: '소식을 듣고 흥분하다' },
          { word: '흐뭇함', score: 2, example: '잘 자라는 모습에 흐뭇함' },
          { word: '뿌듯함', score: 3, example: '결과물을 보며 뿌듯함' },
        ],
      },
      {
        name: '강한 기쁨',
        emotions: [
          { word: '환희', score: 5, example: '승리의 환희' },
          { word: '행복', score: 4, example: '오래된 행복' },
          { word: '황홀함', score: 5, example: '황홀한 순간' },
          { word: '신남', score: 4, example: '축제처럼 신나다' },
          { word: '즐거움', score: 3, example: '함께하는 즐거움' },
        ],
      },
    ],
  },
  {
    color: '#FF6B9D',
    label: '애정',
    groups: [
      {
        name: '따뜻한 애정',
        emotions: [
          { word: '사랑', score: 4, example: '말하지 못한 사랑' },
          { word: '다정함', score: 2, example: '다정하게 건네는 말' },
          { word: '그리움', score: 3, example: '멀어진 사람에 대한 그리움' },
          { word: '애틋함', score: 3, example: '애틋하게 바라보다' },
          { word: '포근함', score: 2, example: '품 안의 포근함' },
        ],
      },
      {
        name: '열정적 애정',
        emotions: [
          { word: '열정', score: 4, example: '식지 않는 열정' },
          { word: '질투', score: 4, example: '숨길 수 없는 질투' },
          { word: '집착', score: 5, example: '끊을 수 없는 집착' },
          { word: '두근거림', score: 3, example: '두근거리는 마음' },
          { word: '설레임', score: 3, example: '첫사랑의 설레임' },
        ],
      },
    ],
  },
  {
    color: '#4FC3F7',
    label: '평온',
    groups: [
      {
        name: '고요한 평온',
        emotions: [
          { word: '평온', score: 1, example: '흔들리지 않는 평온' },
          { word: '안도', score: 2, example: '마음이 놓이는 안도' },
          { word: '여유', score: 2, example: '느긋한 여유' },
          { word: '만족', score: 2, example: '작은 것에서 오는 만족' },
          { word: '무심함', score: 1, example: '아무렇지 않은 무심함' },
        ],
      },
      {
        name: '안정적 감정',
        emotions: [
          { word: '침착함', score: 2, example: '위기 속의 침착함' },
          { word: '담담함', score: 1, example: '담담하게 받아들이다' },
          { word: '차분함', score: 1, example: '차분히 앉아서' },
          { word: '안정감', score: 2, example: '곁에 있을 때의 안정감' },
        ],
      },
    ],
  },
  {
    color: '#66BB6A',
    label: '활기',
    groups: [
      {
        name: '에너지',
        emotions: [
          { word: '활기', score: 3, example: '활기찬 아침' },
          { word: '의욕', score: 3, example: '넘치는 의욕' },
          { word: '자신감', score: 4, example: '당당한 자신감' },
          { word: '용기', score: 4, example: '한 발 내딛는 용기' },
          { word: '도전', score: 3, example: '새로운 도전 앞에서' },
        ],
      },
      {
        name: '긍정',
        emotions: [
          { word: '희망', score: 3, example: '포기하지 않는 희망' },
          { word: '결심', score: 4, example: '굳건한 결심' },
          { word: '신뢰', score: 3, example: '흔들리지 않는 신뢰' },
          { word: '호기심', score: 2, example: '반짝이는 호기심' },
          { word: '열의', score: 4, example: '불타는 열의' },
        ],
      },
    ],
  },
  {
    color: '#1565C0',
    label: '슬픔',
    groups: [
      {
        name: '가벼운 슬픔',
        emotions: [
          { word: '슬픔', score: 3, example: '말없이 흐르는 슬픔' },
          { word: '아쉬움', score: 2, example: '떠나며 느끼는 아쉬움' },
          { word: '외로움', score: 3, example: '깊은 외로움' },
          { word: '허전함', score: 2, example: '빈자리의 허전함' },
          { word: '실망', score: 3, example: '기대가 무너진 실망' },
        ],
      },
      {
        name: '깊은 슬픔',
        emotions: [
          { word: '비통함', score: 5, example: '참을 수 없는 비통함' },
          { word: '절망', score: 5, example: '끝이 보이지 않는 절망' },
          { word: '후회', score: 4, example: '돌이킬 수 없는 후회' },
          { word: '상실감', score: 4, example: '무언가 잃은 상실감' },
          { word: '죄책감', score: 4, example: '떨쳐내지 못하는 죄책감' },
        ],
      },
    ],
  },
  {
    color: '#E53935',
    label: '분노',
    groups: [
      {
        name: '가벼운 분노',
        emotions: [
          { word: '짜증', score: 2, example: '사소한 것에 짜증' },
          { word: '불만', score: 2, example: '쌓인 불만' },
          { word: '답답함', score: 3, example: '속이 막히는 답답함' },
          { word: '억울함', score: 3, example: '억울한 상황' },
        ],
      },
      {
        name: '강한 분노',
        emotions: [
          { word: '분노', score: 4, example: '참을 수 없는 분노' },
          { word: '격분', score: 5, example: '걷잡을 수 없는 격분' },
          { word: '증오', score: 5, example: '뿌리 깊은 증오' },
          { word: '경멸', score: 4, example: '차가운 경멸' },
          { word: '반발심', score: 3, example: '강한 반발심' },
        ],
      },
    ],
  },
  {
    color: '#7B1FA2',
    label: '불안',
    groups: [
      {
        name: '가벼운 불안',
        emotions: [
          { word: '걱정', score: 2, example: '사소한 걱정' },
          { word: '긴장', score: 3, example: '발표 전의 긴장' },
          { word: '초조함', score: 3, example: '기다리며 초조함' },
          { word: '불안', score: 3, example: '알 수 없는 불안' },
        ],
      },
      {
        name: '깊은 불안',
        emotions: [
          { word: '공포', score: 5, example: '뼛속까지 파고드는 공포' },
          { word: '두려움', score: 4, example: '피할 수 없는 두려움' },
          { word: '공황', score: 5, example: '통제 불가의 공황' },
          { word: '위기감', score: 4, example: '직감적인 위기감' },
          { word: '의심', score: 3, example: '떨쳐낼 수 없는 의심' },
        ],
      },
    ],
  },
  {
    color: '#212121',
    label: '수치/혼란',
    groups: [
      {
        name: '수치',
        emotions: [
          { word: '부끄러움', score: 3, example: '얼굴이 붉어지는 부끄러움' },
          { word: '창피함', score: 3, example: '숨고 싶은 창피함' },
          { word: '민망함', score: 2, example: '어색하고 민망함' },
          { word: '모욕감', score: 5, example: '씻을 수 없는 모욕감' },
        ],
      },
      {
        name: '혼란',
        emotions: [
          { word: '혼란', score: 3, example: '갈피를 못 잡는 혼란' },
          { word: '당황', score: 3, example: '예상치 못한 당황' },
          { word: '어리둥절', score: 2, example: '상황을 파악 못해 어리둥절' },
          { word: '갈등', score: 4, example: '선택 앞의 갈등' },
          { word: '망설임', score: 2, example: '한 발 못 내딛는 망설임' },
        ],
      },
    ],
  },
  {
    color: '#9E9E9E',
    label: '무기력',
    groups: [
      {
        name: '무감각',
        emotions: [
          { word: '무기력', score: 3, example: '아무것도 하기 싫은 무기력' },
          { word: '지침', score: 2, example: '온몸이 지쳐버린 지침' },
          { word: '공허함', score: 3, example: '채워지지 않는 공허함' },
          { word: '무감각', score: 2, example: '감각이 사라진 무감각' },
        ],
      },
      {
        name: '체념',
        emotions: [
          { word: '체념', score: 3, example: '더 이상 바라지 않는 체념' },
          { word: '포기', score: 4, example: '손을 놓아버린 포기' },
          { word: '무관심', score: 2, example: '아무래도 좋은 무관심' },
          { word: '허탈함', score: 3, example: '힘이 빠지는 허탈함' },
        ],
      },
    ],
  },
];

// 검색용 flat 배열
export const ALL_EMOTIONS = EMOTION_CATEGORIES.flatMap((cat) =>
  cat.groups.flatMap((group) =>
    group.emotions.map((em) => ({
      ...em,
      color: cat.color,
      categoryLabel: cat.label,
    }))
  )
);

// 단어로 추천 색상·강도 조회
export function getRecommendedTag(word) {
  const found = ALL_EMOTIONS.find((e) => e.word === word);
  if (found) return { word: found.word, color: found.color, intensity: found.score };
  return { word, color: '#9E9E9E', intensity: 3 };
}
