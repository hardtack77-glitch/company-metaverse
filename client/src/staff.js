// 층별 고정 NPC 직원 명단 + 상담실(7·8·9층) 좌석 배치
// - 1층: 강사 4명 (일반강의장1·2, 강사실, 전산강의장1)
// - 7·8·9층: 실장·팀장 (돌아다니거나 팀장석에 앉음) + 코치 (상담석에 앉음)
// - 이름·대사·자리는 여기서 고치면 됩니다. 좌표는 웹 좌표 [x, 0, z] (블렌더 X, -Y)

/* ───────── 상담실 좌석 (blender/build_7f.py 와 같은 배치) ───────── */
const LINE_X = [-17.3, -13.85, -10.4, -6.95, -3.5]; // 각 줄 가운데 칸막이 x (1~5줄)
const PITCH = 1.3;
const NSEAT = 5;
const HALF_Y0 = { S: -3.7, N: 6.68 }; // 블렌더 y: 남쪽 구역(회의실 쪽) / 북쪽 구역(창가 쪽)

// 상담석 하나: half "S"|"N", line 1~5, side "W"|"E", k 0~4 (남→북)
export function seatPose(half, line, side, k) {
  const sx = LINE_X[line - 1];
  const cy = HALF_Y0[half] + (k + 0.5) * PITCH;
  const sg = side === "W" ? -1 : 1;
  // 의자 위치에서 책상 쪽으로 살짝 → 앉은 자세
  return { position: [sx + sg * 0.98, 0, -cy], rotationY: side === "W" ? Math.PI / 2 : -Math.PI / 2 };
}
// 팀장석 (각 줄 북쪽 끝, 팀원 쪽을 바라봄)
export function leaderSeatPose(half, line) {
  const sx = LINE_X[line - 1];
  const y1 = HALF_Y0[half] + NSEAT * PITCH;
  return { position: [sx, 0, -(y1 + 1.05)], rotationY: 0 };
}
export const ALL_SEATS = [];
for (const half of ["S", "N"])
  for (let line = 1; line <= 5; line++)
    for (const side of ["W", "E"])
      for (let k = 0; k < NSEAT; k++) ALL_SEATS.push({ key: `${half}${line}${side}${k}`, half, line, side, k });

/* ───────── 돌아다니는 길 (통로 가운데, 블렌더 [x, y]) ───────── */
const AISLE = [-15.575, -12.125, -8.675, -5.225, -1.75]; // 줄 사이 통로 x
const ROUTES = {
  // 실장: 회의실 앞 복도 → 서쪽 통로 → 기둥 통로 → 동쪽 통로 한 바퀴
  chief: [[0.3, -4.55], [-15.575, -4.55], [-15.575, 4.45], [-1.75, 4.45], [-1.75, -4.55]],
  // 북쪽 구역 통로 두 곳을 오가며 순찰
  north: [[-12.125, 6.2], [-12.125, 12.8], [-12.125, 6.2], [-5.225, 6.2], [-5.225, 12.8], [-5.225, 6.2]],
  // 남쪽 구역 통로 두 곳
  south: [[-8.675, 4.45], [-8.675, -3.3], [-8.675, 4.45], [-15.575, 4.45], [-15.575, -3.3], [-15.575, 4.45]],
  // 나무 복도 ↔ 기둥 통로
  corridor: [[0.3, -6.0], [0.3, 12.5], [0.3, 6.2], [-8.0, 6.2], [0.3, 6.2]],
};
const route = (name) => ROUTES[name].map(([x, y]) => [x, 0, -y]);
void AISLE;

/* ───────── 겉모습: 이름으로 정해지는 랜덤 (매번 같은 모습) ───────── */
const OUTFITS = ["#2f5fb3", "#e6007e", "#d62839", "#f08a24", "#e5b81c", "#2e9e5b", "#2bb3a3", "#7b4bb7", "#f39ac7", "#1f2a44", "#8a8f99", "#f4f1ea"];
function hash(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}
function look(name, male = false) {
  const h = hash(name);
  return {
    model: male ? "Character_Player_Consultant" : h % 2 ? "Character_Female_LongHair" : "Character_Female_ShortHair",
    color: OUTFITS[(h >>> 3) % OUTFITS.length],
  };
}

/* ───────── 응원·독려 대사 (나중에 자유롭게 바꾸세요) ───────── */
const LINES = {
  chief: [
    "오늘도 고객의 마음을 먼저 들어 주셔서 고마워요.",
    "우리 층의 힘은 서로 챙겨 주는 마음이에요. 힘든 콜 있으면 언제든 말해요!",
    "목표보다 중요한 건 지치지 않는 거예요. 물 한 잔 마시고 가요~",
    "여러분 덕분에 고객 만족도가 쑥쑥 오르고 있어요. 자부심 가져도 돼요!",
    "한 통 한 통이 쌓여 신뢰가 됩니다. 오늘도 멋져요!",
  ],
  leader: [
    "오늘 첫 콜 잘 시작했나요? 우리 팀 화이팅!",
    "어려운 응대 뒤엔 잠깐 숨 고르기! 휴게실도 이용해요.",
    "공감 한마디가 고객의 하루를 바꿔요. 잘하고 있어요!",
    "모르는 건 바로 물어봐요. 혼자 고민하지 않기!",
    "오늘 목표까지 조금만 더! 끝나면 같이 칭찬해요 :)",
    "웃으며 말하면 목소리에도 표정이 담겨요. 표정 있는 목소리!",
    "실수해도 괜찮아요. 다음 콜에서 만회하면 돼요.",
    "휴식 시간은 꼭 챙기기! 건강이 최우선이에요.",
  ],
  coach: [
    "통화 품질 코칭이 필요하면 언제든 불러 주세요!",
    "오늘의 팁: 고객 말을 요약해서 되묻기만 해도 공감이 전해져요.",
    "쿠션어 하나로 분위기가 부드러워져요. '번거로우시겠지만~' 처럼요.",
    "좋은 상담은 듣는 시간에서 시작돼요. 경청 최고!",
    "칭찬 콜이 들어왔어요! 오늘도 잘하고 있다는 증거예요.",
    "어려운 콜은 녹취를 같이 들어 보며 방법을 찾아봐요. 함께라면 쉬워요.",
  ],
};
function pickLines(pool, name, n = 2) {
  const h = hash(name);
  const out = [];
  for (let i = 0; out.length < n && i < pool.length * 2; i++) {
    const line = pool[(h + i * 7) % pool.length];
    if (!out.includes(line)) out.push(line);
  }
  return out;
}

/* ───────── 명단 ───────── */
const FLOORS = {
  "7F": {
    chief: "손설희",
    leaders: [
      ["박은지", { seat: ["S", 2] }],
      ["전솔지", { walk: "north" }],
      ["이다영", { seat: ["N", 4] }],
      ["심수현", { walk: "south" }],
      ["정향미", { seat: ["S", 5] }],
    ],
    coaches: [
      ["김윤혜", "실장", ["S", 2, "W", 1]],
      ["김은지", "코치", ["N", 4, "E", 2]],
      ["김시은", "코치", ["S", 5, "E", 3]],
    ],
  },
  "8F": {
    chief: "이준민",
    leaders: [
      ["강승희", { seat: ["S", 1] }],
      ["김은령", { walk: "north" }],
      ["현홍숙", { seat: ["N", 3] }],
      ["홍신혜", { walk: "south" }],
      ["김하나", { seat: ["S", 4] }],
      ["한주희", { walk: "corridor" }],
    ],
    coaches: [
      ["정주연", "코치", ["N", 2, "E", 3]],
      ["김건희", "코치", ["S", 3, "W", 0]],
      ["이승연", "코치", ["N", 5, "E", 1]],
    ],
  },
  "9F": {
    chief: "김민정",
    leaders: [
      ["서혜연", { seat: ["S", 3] }],
      ["김나영", { walk: "north" }],
      ["유하영", { seat: ["N", 2] }],
      ["기수빈", { walk: "south" }],
      ["김화영", { seat: ["N", 5] }],
    ],
    coaches: [
      ["김효선", "코치", ["S", 4, "W", 2]],
      ["배민영", "코치", ["N", 3, "W", 4]],
      ["신재민", "코치", ["S", 2, "E", 1], true], // 남자
    ],
  },
};

const STAFF = [];
// 7·8·9층
for (const [floor, cfg] of Object.entries(FLOORS)) {
  const n = floor.replace("F", "");
  const chiefName = `${cfg.chief} 실장`;
  STAFF.push({
    id: `staff_${floor}_${cfg.chief}`, floor, name: chiefName, ...look(cfg.chief),
    path: route("chief"),
    dialog: [`안녕하세요, ${n}층 상담실 ${chiefName}이에요.`, ...pickLines(LINES.chief, cfg.chief)],
  });
  cfg.leaders.forEach(([who, where], i) => {
    const name = `${who} 팀장`;
    const base = { id: `staff_${floor}_${who}`, floor, name, ...look(who),
      dialog: [`${n}층 ${name}이에요. 반가워요!`, ...pickLines(LINES.leader, who)] };
    if (where.seat) STAFF.push({ ...base, ...leaderSeatPose(...where.seat), pose: "sit" });
    else STAFF.push({ ...base, path: route(where.walk), pathOffset: i * 0.37 });
  });
  cfg.coaches.forEach(([who, title, seat, male]) => {
    const name = `${who} ${title}`;
    STAFF.push({
      id: `staff_${floor}_${who}`, floor, name, ...look(who, male), ...seatPose(...seat), pose: "sit", seatKey: seat.join(""),
      dialog: [`코칭 담당 ${name}이에요.`, ...pickLines(LINES.coach, who)],
    });
  });
}

// 1층 강사 4명 (블렌더 좌표 → 웹 [X, 0, -Y])
STAFF.push(
  {
    id: "staff_1F_현지우", floor: "1F", name: "현지우 강사", ...look("현지우"),
    position: [15.7, 0, -8.3], rotationY: -Math.PI / 2, // 일반강의장1 단상 앞
    dialog: [
      "여기는 일반강의장1이에요. 신입 상담사 입문 교육이 열리는 곳이죠.",
      "처음엔 모두 서툴러요. 질문을 많이 하는 사람이 제일 빨리 늘어요!",
      "오늘 배운 한 가지만 꼭 기억해도 성공이에요. 화이팅!",
    ],
  },
  {
    id: "staff_1F_윤규리", floor: "1F", name: "윤규리 강사", ...look("윤규리"),
    position: [10.1, 0, -12.6], rotationY: Math.PI / 2, // 일반강의장2 입구 쪽 (실습석을 바라봄)
    dialog: [
      "일반강의장2는 듀얼 모니터로 실제 상담 시스템을 실습하는 곳이에요.",
      "실습에서 많이 틀려 볼수록 실전에서 덜 틀려요. 겁먹지 말아요!",
      "모니터 두 개, 처음엔 정신없지만 금방 익숙해져요 :)",
    ],
  },
  {
    id: "staff_1F_양인실", floor: "1F", name: "양인실 강사", ...look("양인실"),
    position: [12.2, 0, -17.3], rotationY: Math.PI, pose: "sit", // 강사실 가운데 책상
    dialog: [
      "여기는 강사실이에요. 교육 자료를 준비하고 1:1 코칭도 해요.",
      "교육 중에 힘든 점이 있으면 언제든 강사실 문을 두드려요!",
      "여러분이 현장에서 웃으며 일하는 게 저희 강사들의 보람이에요.",
    ],
  },
  {
    id: "staff_1F_류가영", floor: "1F", name: "류가영 강사", ...look("류가영"),
    position: [11.3, 0, 0.5], rotationY: Math.PI, // 전산강의장1 입구 쪽 (교육생 쪽을 바라봄)
    dialog: [
      "전산강의장1에서는 상담 프로그램 사용법을 배워요.",
      "공감상담의 첫걸음은 고객의 말을 끝까지 듣는 거예요!",
      "교육 수료하는 날까지 제가 옆에서 응원할게요. 할 수 있어요!",
    ],
  },
);

export const STAFF_NPCS = STAFF;

/* ───────── 상담석에 앉아 일하는 직원 (배경용, 좌석의 절반 정도) ───────── */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const HAIR = ["#1d1512", "#2b1d16", "#3b2618", "#4a3020", "#151515"];
export const COUNSEL_FLOORS = ["7F", "8F", "9F"];
export function seatedWorkers(floor) {
  const taken = new Set(STAFF.filter((s) => s.floor === floor && s.seatKey).map((s) => s.seatKey));
  const r = rng(hash(`workers-${floor}`));
  const out = [];
  for (const s of ALL_SEATS) {
    if (taken.has(`${s.half}${s.line}${s.side}${s.k}`)) continue;
    if (r() > 0.5) continue; // 약 절반
    const pose = seatPose(s.half, s.line, s.side, s.k);
    out.push({
      ...pose,
      outfit: OUTFITS[Math.floor(r() * OUTFITS.length)],
      hair: HAIR[Math.floor(r() * HAIR.length)],
      longHair: r() < 0.55,
      phase: r() * Math.PI * 2,
    });
  }
  return out;
}

/* ───────── 채용담당자 (모든 층에 1명씩, 같은 모습) ───────── */
// 말을 걸면 메뉴: 1. 미니게임하기  2. 임직원추천 지원하기  3. 인사하기
export const RECRUIT_LINKS = {
  game: "https://planning-with-ai-62d35.web.app/",
  apply: "https://careers.cslguplus.co.kr/RecruitNotice/Index?area=03&workerType=",
};
export const RECRUIT_GREETING = "안녕하세요! 대구센터 채용담당자입니다.";
// 3번 '인사하기' 를 누를 때마다 차례로 바뀌는 인사말 (자유롭게 추가·수정)
export const RECRUIT_HELLOS = [
  "오늘도 반가워요! 좋은 하루 보내세요 😊",
  "대구고객센터에 관심 가져 주셔서 감사합니다!",
  "함께 일하고 싶은 분이 있다면 언제든 추천해 주세요 🙌",
  "웃는 얼굴로 일하는 곳, 대구고객센터입니다!",
  "식사는 잘 챙기셨나요? 건강이 최고예요!",
  "오늘도 고객의 마음을 여는 공감 한마디, 화이팅!",
  "새로운 동료를 기다리고 있어요. 주변에 소개 부탁드려요~",
  "보물은 몇 개 찾으셨어요? 아직이라면 구석구석 둘러보세요!",
  "좋은 사람이 좋은 사람을 부른대요. 임직원 추천 기다릴게요!",
  "퇴근까지 조금만 더 힘내요! 응원합니다 💪",
];
const RECRUITER_SPOTS = {
  "1F": { position: [1.5, 0, 6.5], rotationY: 0 }, // 로비 (정문 쪽을 바라봄)
  "6F": { position: [-1.5, 0, 12.3], rotationY: Math.PI / 2 }, // 엘리베이터 홀 남서쪽 구석 (지나가는 길 비움)
  "7F": { position: [-3.0, 0, 9.8], rotationY: Math.PI / 2 }, // 엘리베이터 홀 옆 복도
  "8F": { position: [-3.0, 0, 9.8], rotationY: Math.PI / 2 },
  "9F": { position: [-3.0, 0, 9.8], rotationY: Math.PI / 2 },
};
export const RECRUITERS = Object.entries(RECRUITER_SPOTS).map(([floor, spot]) => ({
  id: `recruiter_${floor}`, floor, name: "채용담당자", model: "Character_Player_Consultant", color: "#1f2a44",
  ...spot, menu: "recruiter", dialog: [RECRUIT_GREETING],
}));
