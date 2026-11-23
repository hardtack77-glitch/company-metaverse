// 🛒 아이템 상점 — 카탈로그와 포인트 규칙 (회원 전용, 서버에서만 계산)
export const ITEM_CATALOG = {
  item_coffee: { id: "item_coffee", icon: "☕", name: "REST BAR 아이스 아메리카노", type: "consumable", buyPrice: 100, sellPrice: 50, effect: "SPEED_BOOST", duration: 30000, desc: "30초 동안 이동 속도 1.5배 (손에 커피컵)" },
  item_scanner: { id: "item_scanner", icon: "📡", name: "U+ 5G 보물 위치 스캐너", type: "consumable", buyPrice: 200, sellPrice: 100, effect: "RADAR_SCAN", duration: 20000, desc: "20초 동안 이 층의 못 찾은 보물 방향을 화살표로 안내" },
  item_spray: { id: "item_spray", icon: "🌿", name: "강의장 상쾌 피톤치드 스프레이", type: "consumable", buyPrice: 80, sellPrice: 40, effect: "AURA_EMOJI", duration: 15000, desc: "15초 동안 민트빛 파동 + 머리 위 '✨ 상쾌함 충전!' (모두에게 보임)" },
  equip_gold_hs: { id: "equip_gold_hs", icon: "🎧", name: "베스트 상담사 골드 헤드셋", type: "equipment", slot: "headset", buyPrice: 500, sellPrice: 350, desc: "장착하면 황금색 헤드셋 (모두에게 보임)" },
  equip_dino_pet: { id: "equip_dino_pet", icon: "🦖", name: "휴게실 노란 공룡 미니 펫", type: "equipment", slot: "pet", buyPrice: 800, sellPrice: 560, desc: "노란 공룡이 옆에서 따라다님 + 보물 획득 거리 +1.2m" },
  equip_mini_fan: { id: "equip_mini_fan", icon: "🪭", name: "상담석 휴대용 미니 선풍기", type: "equipment", slot: "hand", buyPrice: 300, sellPrice: 210, desc: "오른손에 흰색 미니 선풍기 + 이동 속도 항상 +15%" },
  equip_gold_bird: { id: "equip_gold_bird", icon: "🐦", name: "황금새", type: "equipment", slot: "shoulder", buyPrice: 1000, sellPrice: 700, desc: "어깨 위에 앉아 날개를 파닥이는 황금새 (모두에게 보임)" },
  item_dart_ticket: { id: "item_dart_ticket", icon: "🎯", name: "BULLSEYE 럭키 다트 티켓", type: "gacha", buyPrice: 250, sellPrice: 150, desc: "사용하면 다트 룰렛! 50P ~ 1,000P 랜덤 당첨" },
};
export const SLOTS = ["headset", "pet", "hand", "shoulder"];

// 다트 티켓: 확률 가중치 (기대값 약 197P < 구매가 250P → 무한 뽑기로 포인트를 불리는 것 방지)
export const DART_PRIZES = [
  { p: 50, w: 30 }, { p: 100, w: 27 }, { p: 200, w: 20 }, { p: 300, w: 13 }, { p: 500, w: 8 }, { p: 1000, w: 2 },
];
export function drawDart(randomInt) {
  const total = DART_PRIZES.reduce((a, b) => a + b.w, 0);
  let r = randomInt(total);
  for (const d of DART_PRIZES) if ((r -= d.w) < 0) return d.p;
  return DART_PRIZES[0].p;
}

export const START_POINTS = 500;
export const TREASURE_POINTS = 300;
export const GAME_DAILY_CAP = 300; // 미니게임으로 하루에 벌 수 있는 최대 포인트

// 미니게임 결과 → 포인트
export const GAME_POINTS = {
  rps: (g) => ({ win: 20, draw: 5, lose: 0 })[g.result] ?? 0,
  omok: (g) => (g.resigned ? 0 : ({ win: 50, draw: 20, lose: 5 })[g.result] ?? 0),
  shell: (g) => g.score * 10 + (g.score === 3 ? 10 : 0),
  reaction: () => 20,
  empathy: (g) => Math.round(g.score / 4),
  baseball: (g) => (g.success ? Math.max(20, 50 - g.tries * 3) : 5),
  memory: () => 30,
};
export const GAME_KO = { rps: "가위바위보", omok: "오목", shell: "야바위", reaction: "콜 받기", empathy: "공감 응대", baseball: "숫자야구", memory: "카드 짝맞추기" };

export const newWallet = (empNo) => ({
  empNo, points: START_POINTS, bag: { item_coffee: 1 }, equipped: { headset: null, pet: null, hand: null, shoulder: null },
  day: "", dayGame: 0, createdAt: new Date().toISOString(),
});
