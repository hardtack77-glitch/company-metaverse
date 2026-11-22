// 📷 실사 사진 구역: 이 구역 안에 들어가면 화면에 사진이 작게 뜨고, 터치하면 크게 보임
// - floors: 해당 층들, x/z: 게임 좌표 범위 (블렌더 X,Y → 게임 X = X, Z = -Y)
// - 사진은 client/public/photos/ 에 넣고 파일 이름을 적어 주면 됨 (새 구역도 같은 방식으로 추가)
const LOUNGE_TEXT = "각 층 휴게실에는 편안한 소파와 작은 정원 코너가 있어 동료들과 이야기를 나누거나 잠시 쉬어 갈 수 있습니다.";
const SLEEP_TEXT = "각 층에는 안마의자로 구성된 수면실이 있어 피곤할때 잠시 쉴 수 있는 공간이 마련 되어 있습니다.";

export const PHOTO_ZONES = [
  // 6층 수면실 (블렌더 X -16~-8.8, Y -3.6~0.2)
  { id: "sleep_6f", floors: ["6F"], x: [-16.0, -8.8], z: [-0.2, 3.6], title: "수면실", photo: "sleep_room.jpg", thumb: "sleep_room_thumb.jpg", text: SLEEP_TEXT },
  // 7·8·9층 수면실 (블렌더 X 1.7~6.7, Y 8.4~15)
  { id: "sleep_789f", floors: ["7F", "8F", "9F"], x: [1.7, 6.7], z: [-15.0, -8.4], title: "수면실", photo: "sleep_room.jpg", thumb: "sleep_room_thumb.jpg", text: SLEEP_TEXT },
  // 7·8·9층 휴게실 (블렌더 X 1.7~6.7, Y -1.5~8.4)
  { id: "lounge_789f", floors: ["7F", "8F", "9F"], x: [1.7, 6.7], z: [-8.4, 1.5], title: "휴게실", photos: ["lounge.jpg", "lounge_2.jpg", "lounge_3.jpg", "lounge_4.jpg"], thumb: "lounge_thumb.jpg", text: LOUNGE_TEXT },
  // 7·8·9층 엘리베이터 홀 (블렌더 X -1.9~4.3, Y -13.6~-10) — 8층은 사진이 없어 7층 사진 사용
  ...[["7F", "elevator_7f"], ["8F", "elevator_7f"], ["9F", "elevator_9f"]].map(([f, img]) => ({
    id: `elevator_${f}`, floors: [f], x: [-1.9, 4.3], z: [10.0, 13.6], title: `${f.replace("F", "층")} 엘리베이터 홀`,
    photo: `${img}.jpg`, thumb: `${img}_thumb.jpg`,
    text: "층마다 엘리베이터 홀의 벽 색이 달라요. 7층은 주황색, 9층은 노란색! 내리자마자 몇 층인지 한눈에 알 수 있어요. 엘리베이터 앞에서 버튼을 누르면 다른 층으로 이동할 수 있어요.",
  })),
  // 7·8·9층 상담석 진입로 (중앙 기둥 줄 앞 · 블렌더 X -4.5~0.3, Y 3.6~7.0) — 사진 여러 장, 옆으로 넘겨 보기
  {
    id: "counsel_789f", floors: ["7F", "8F", "9F"], x: [-4.5, 0.3], z: [-7.0, -3.6], title: "상담실",
    photos: [1, 2, 3, 4, 5, 6].map((i) => `counsel_${i}.jpg`), thumb: "counsel_thumb.jpg",
    text: "초록 식물과 나무 화분 칸막이로 꾸며진 상담실이에요. 상담사 한 분 한 분이 편안한 환경에서 고객의 마음까지 상담할 수 있도록 마련된 공간입니다.",
  },
  // 1층 일반강의장 (블렌더 X 9.4~17.6, Y 13.4~23)
  {
    id: "lecture_1f", floors: ["1F"], x: [9.4, 17.6], z: [-23.0, -13.4], title: "일반강의장",
    photos: ["lecture_1.jpg", "lecture_2.jpg"], thumb: "lecture_thumb.jpg",
    text: "입사 후 교육을 받는 일반강의장이에요. 스크린과 화이트보드가 갖춰져 있어 강사님과 함께 상담 업무를 차근차근 배울 수 있어요.",
  },
  // 1층 사물함 복도 (블렌더 X 7.1~9.4, Y -0.6~4.45)
  {
    id: "locker_1f", floors: ["1F"], x: [7.1, 9.4], z: [-4.45, 0.6], title: "사물함",
    photo: "locker.jpg", thumb: "locker_thumb.jpg",
    text: "개인 소지품을 보관할 수 있는 번호 키 사물함과 잠시 앉아 쉴 수 있는 벤치가 마련되어 있어요.",
  },
  // 1층 엘리베이터 홀 (블렌더 X -8.7~-2.35, Y -8.5~-4.6) — 엘리베이터 + U+tv·IoT 체험대
  {
    id: "elevator_1f", floors: ["1F"], x: [-8.7, -2.35], z: [4.6, 8.5], title: "1층 엘리베이터 홀",
    photos: ["elevator_1f_1.jpg", "elevator_1f_2.jpg"], thumb: "elevator_1f_thumb.jpg",
    text: "대구고객센터는 1층과 6~9층을 사용해요. 엘리베이터 맞은편에는 U+tv와 IoT@home 체험대가 있어 LG유플러스 서비스를 직접 볼 수 있어요.",
  },
  // 1층 북카페·다트 라운지 (블렌더 X 0~7, Y -2.3~3.7)
  {
    id: "bookcafe_1f", floors: ["1F"], x: [0, 7.0], z: [-3.7, 2.3], title: "북카페 · 다트 라운지",
    photos: ["bookcafe_1.jpg", "bookcafe_2.jpg"], thumb: "bookcafe_thumb.jpg",
    text: "책을 읽거나 다트 게임을 즐기며 쉬어 갈 수 있는 라운지예요. 다트 머신 앞에 서면 게임 속에서도 다트를 던져 볼 수 있어요! 🎯",
  },
  // 1층 탕비실 앞 (블렌더 X 4.5~7.8, Y -4.5~-3.1)
  {
    id: "pantry_1f", floors: ["1F"], x: [4.5, 7.8], z: [3.1, 4.5], title: "탕비실",
    photo: "pantry_1f.jpg", thumb: "pantry_1f_thumb.jpg",
    text: "커피머신과 제빙기, 정수기가 있는 탕비실이에요. 분리수거함도 함께 있어요.",
  },
  // 7·8·9층 카페테리아 (REST BAR · 출입구 오른쪽 · 블렌더 X 1.7~6.7, Y -7.5~-1.5)
  {
    id: "cafe_789f", floors: ["7F", "8F", "9F"], x: [1.7, 6.7], z: [1.5, 7.5], title: "카페테리아",
    photos: ["cafe_1.jpg", "cafe_2.jpg", "cafe_3.jpg"], thumb: "cafe_thumb.jpg",
    text: "냉장고와 정수기, 창가 바 테이블이 있는 카페테리아예요. 상담 사이사이 간식과 음료를 즐기며 잠시 숨 돌릴 수 있어요.",
  },
  // 6~9층 엘리베이터 홀 ↔ 화장실 통로 (직원 사진 벽 "표정있는 목소리" · 폰부스)
  ...[
    { id: "voice_6f", floors: ["6F"], x: [-16.2, -1.0], z: [8.0, 12.0] }, // 6층: 블렌더 X -16.2~-1.0, Y -12~-8
    { id: "voice_789f", floors: ["7F", "8F", "9F"], x: [-22.1, -1.9], z: [8.0, 12.0] }, // 7~9층: 블렌더 X -22.1~-1.9, Y -12~-8
  ].map((z) => ({
    ...z, title: "표정있는 목소리 · 통로",
    photos: ["voice_wall_1.jpg", "voice_wall_2.jpg"], thumb: "voice_wall_thumb.jpg",
    text: "엘리베이터에서 화장실로 가는 통로에는 우리 상담사들의 밝은 모습을 담은 사진 갤러리 '표정있는 목소리'와 개인 통화를 할 수 있는 폰부스가 있어요.",
  })),
  // 6층 심리상담실 (블렌더 X 1.8~6.8, Y -7.95~-1.0)
  {
    id: "psych_6f", floors: ["6F"], x: [1.8, 6.8], z: [1.0, 7.95], title: "심리상담실",
    photo: "psych_6f.jpg", thumb: "psych_6f_thumb.jpg",
    text: "전문 심리상담사가 상주하는 심리상담실이에요. 마음이 지칠 때 언제든 편하게 찾아와 이야기를 나눌 수 있어요.",
  },
  // 6층 안마치료실 (블렌더 X -8.4~-1.4, Y -7.9~-3.6)
  {
    id: "massage_6f", floors: ["6F"], x: [-8.4, -1.4], z: [3.6, 7.9], title: "안마치료실",
    photo: "massage_6f.jpg", thumb: "massage_6f_thumb.jpg",
    text: "전문 안마사에게 마사지를 받으며 뭉친 몸을 풀 수 있는 안마치료실이에요.",
  },
  // 1층 회전문 밖 광장 (블렌더 X -9.5~14, Y -14~-10)
  {
    id: "building_1f", floors: ["1F"], x: [-9.5, 14.0], z: [10.0, 14.0], title: "LG유플러스 대구고객센터",
    photo: "building.jpg", thumb: "building_thumb.jpg",
    text: "푸른 가로수길 옆에 자리한 LG유플러스 대구고객센터 건물이에요. 회전문으로 들어오면 로비와 안내데스크가 맞이해 드려요.",
  },
  // 1층 카페테리아 안쪽 (블렌더 X 7.8~13, Y -6.8~-1.2)
  {
    id: "cafe_1f", floors: ["1F"], x: [7.8, 13.0], z: [1.2, 6.8], title: "1층 카페테리아",
    photos: ["cafe_1f_1.jpg", "cafe_1f_2.jpg"], thumb: "cafe_1f_thumb.jpg",
    text: "커피머신과 전자레인지, 냉장고가 갖춰진 카페테리아예요. 혈압계와 인바디 측정기도 있어 쉬는 시간에 건강도 챙길 수 있어요.",
  },
  // 6~9층 출입구 들어오는 공간 (TV · 화분 벽) — 6층: 블렌더 X -1.4~1.8 / 7~9층: X -1.1~1.7, Y -8~-5
  ...[
    { id: "entrance_6f", floors: ["6F"], x: [-1.4, 1.8], z: [5.0, 8.0] },
    { id: "entrance_789f", floors: ["7F", "8F", "9F"], x: [-1.1, 1.7], z: [5.0, 8.0] },
  ].map((z) => ({
    ...z, title: "상담실 출입구",
    photo: "entrance.jpg", thumb: "entrance_thumb.jpg",
    text: "출입구에 들어서면 따뜻한 나무 벽과 초록 화분, LG U+ TV가 맞아 주는 상담실 입구예요. 여기서부터 상담실이 시작돼요.",
  })),
  // 1층 교육장 복도 (교육 복도 X 0~9.4, Y 4.45~6.6 + 북측 강의장 복도 X 7.1~9.4, Y 6.6~17.6) — 같은 id 로 한 구역처럼
  ...[
    { x: [0, 9.4], z: [-6.6, -4.45] },
    { x: [7.1, 9.4], z: [-17.6, -6.6] },
  ].map((r) => ({
    id: "training_corr_1f", floors: ["1F"], ...r, title: "교육장 복도",
    photos: ["training_corr_2.jpg", "training_corr_1.jpg"], thumb: "training_corr_thumb.jpg",
    text: "회의실과 강의장으로 이어지는 교육장 복도예요. 신입 상담사들이 이 복도를 따라 교육을 받으러 가요.",
  })),
  // 1층 로비 → 화장실 쪽 그린월 복도 (블렌더 X -4.3~0, Y -2.3~6.8 · 화장실 입구 포함)
  {
    id: "greenwall_1f", floors: ["1F"], x: [-4.3, 0], z: [-6.8, 2.3], title: "그린월 복도",
    photos: ["greenwall_1.jpg", "greenwall_2.jpg"], thumb: "greenwall_thumb.jpg",
    text: "로비에서 화장실로 이어지는 복도에는 싱그러운 수직정원(그린월)이 있어요. 지나가기만 해도 기분이 상쾌해져요.",
  },
];

export function zoneAt(floor, x, z) {
  return PHOTO_ZONES.find((p) => p.floors.includes(floor) && x >= p.x[0] && x <= p.x[1] && z >= p.z[0] && z <= p.z[1]) || null;
}

export const photoUrl = (file) => `/photos/${file}?v=${typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : ""}`;
