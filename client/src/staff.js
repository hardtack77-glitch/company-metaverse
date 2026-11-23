// 층별 고정 NPC 직원 명단 + 상담실(7·8·9층) 좌석 배치
// - 1층: 강사 4명 (일반강의장, 전산강의장1·2, 강사실)
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
    game: "shell", // 말을 걸면 "야바위 게임" (회원만)
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
    game: "rps", // 말을 걸면 "가위바위보 하기" (회원만)
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
    game: "baseball", // 말을 걸면 "숫자야구" (회원만)
    leaders: [
      ["서혜연", { seat: ["S", 3] }],
      ["김나영", { walk: "north" }],
      ["유하영", { seat: ["N", 2] }],
      ["기수빈", { walk: "south" }],
      ["김화영", { seat: ["N", 5] }],
      ["박주경", { seat: ["S", 1] }],
      ["김은경", { seat: ["S", 5] }],
      ["조윤아", { seat: ["N", 4] }],
      ["채혜욱", { walk: "corridor" }],
      ["박혜란", { walk: "north" }],
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
    ...(cfg.game ? { game: cfg.game } : {}),
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
    position: [15.4, 0, -17.65], rotationY: 0, // 일반강의장 교수대 뒤 (교육생 쪽을 바라봄)
    dialog: [
      "여기는 일반강의장이에요. 신입 상담사 이론 교육이 열리는 곳이죠.",
      "처음엔 모두 서툴러요. 질문을 많이 하는 사람이 제일 빨리 늘어요!",
      "오늘 배운 한 가지만 꼭 기억해도 성공이에요. 화이팅!",
    ],
  },
  {
    id: "staff_1F_윤규리", floor: "1F", name: "윤규리 강사", ...look("윤규리"),
    position: [15.4, 0, -8.05], rotationY: 0, // 전산강의장1 교수대 뒤 (교육생 쪽을 바라봄)
    dialog: [
      "전산강의장1은 상담석처럼 모니터와 PC로 실제 상담 시스템을 실습하는 곳이에요.",
      "실습에서 많이 틀려 볼수록 실전에서 덜 틀려요. 겁먹지 말아요!",
      "모니터 두 개, 처음엔 정신없지만 금방 익숙해져요 :)",
    ],
  },
  {
    id: "staff_1F_양인실", floor: "1F", name: "양인실 강사", ...look("양인실"),
    position: [3.35, 0, -11.95], rotationY: 0, pose: "sit", // 강사실 남쪽 벽 줄 가운데 강사석
    dialog: [
      "여기는 강사실이에요. 교육 자료를 준비하고 1:1 코칭도 해요.",
      "교육 중에 힘든 점이 있으면 언제든 강사실 문을 두드려요!",
      "여러분이 현장에서 웃으며 일하는 게 저희 강사들의 보람이에요.",
    ],
  },
  {
    id: "staff_1F_류가영", floor: "1F", name: "류가영 강사", ...look("류가영"),
    position: [15.4, 0, 2.75], rotationY: 0, // 전산강의장2 교수대 뒤 (교육생 쪽을 바라봄)
    dialog: [
      "전산강의장2에서는 상담 프로그램 사용법을 배워요.",
      "공감상담의 첫걸음은 고객의 말을 끝까지 듣는 거예요!",
      "교육 수료하는 날까지 제가 옆에서 응원할게요. 할 수 있어요!",
    ],
  },
);

// 6층 (CS1그룹) — 블렌더 좌표 [x, y] → 웹 [x, 0, -y]
const W6 = (pts) => pts.map(([x, y]) => [x, 0, -y]);
const SEAT_W = Math.PI / 2; // 서쪽 자리: 동쪽 칸막이를 바라봄
const LONG = "Character_Female_LongHair";
const MALE = "Character_Player_Consultant";
const six = (who, title, extra, lines, male = false) => {
  const lk = look(who, male);
  return {
    id: `staff_6F_${who}`, floor: "6F", name: `${who} ${title}`, ...lk, ...extra,
    dialog: [`안녕하세요, 6층 ${who} ${title}입니다.`, ...lines],
  };
};
STAFF.push(
  // 위쪽 사무실 (자동문 안쪽, 팀장석 2석이 붙어 있는 곳)
  six("박정학", "총무", { path: W6([[-4.75, 4.5], [-4.75, 15.2], [-4.75, 9.9], [-2.0, 9.9], [-4.75, 9.9]]) },
    ["비품이나 시설 문의는 언제든 말씀하세요!", "사무실이 쾌적해야 상담도 잘 되죠. 불편한 점 있으면 알려 주세요."], true),
  six("박하늘", "총무", { path: W6([[-1.3, 10.2], [-1.3, 14.2], [-1.3, 10.2], [-2.6, 6.5], [-4.6, 6.5], [-2.6, 6.5]]), pathOffset: 0.5 },
    ["택배, 우편물, 회의실 예약은 총무팀으로!", "오늘도 다들 안전하게 근무하세요. 응원합니다!"], true),
  six("박남수", "PM", { position: [-2.17, 0, -12.35], rotationY: -SEAT_W, pose: "sit" }, // 상담석 (동쪽 자리)
    ["센터를 움직이는 건 숫자와 통계, 꼼꼼한 실적 확인이 필요해요."], true),
  six("허유경", "센터장", { position: [-3.85, 0, -15.52], rotationY: 0, pose: "sit", game: "omok" }, // 팀장석
    ["여러분 한 사람 한 사람이 우리 센터의 자랑이에요.", "고객도, 직원도 행복한 센터를 함께 만들어 가요!"]),
  { ...six("류희숙", "재무회계", { position: [-4.13, 0, -12.35], rotationY: SEAT_W, pose: "sit" },
    ["경비 처리는 기한 안에 부탁드려요~", "숫자는 정직해요. 꼼꼼함이 신뢰를 만듭니다!"]), model: LONG },
  // 통로와 연결된 상담석 (사무실1)
  six("황미애", "실장", { position: [0.57, 0, -4.55], rotationY: SEAT_W, pose: "sit" }, pickLines(LINES.chief, "황미애")),
  six("이영재", "실장", { position: [0.57, 0, -5.85], rotationY: SEAT_W, pose: "sit" }, pickLines(LINES.chief, "이영재")),
  six("오연지", "프로", { position: [0.57, 0, -7.15], rotationY: SEAT_W, pose: "sit" },
    ["고객의 목소리에 귀 기울이는 중이에요!", "공감 한마디가 통화를 바꿔요. 오늘도 화이팅!"]),
  six("오정대", "강사", { position: [3.92, 0, -5.85], rotationY: SEAT_W, pose: "sit" },
    ["신입 상담사 교육을 맡고 있어요. 궁금한 건 언제든 물어보세요!", ...pickLines(LINES.coach, "오정대", 1)], true),
  six("최숙영", "과장", { path: W6([[3.22, 3.4], [3.22, 9.75], [-0.15, 9.75], [-0.15, 4.3], [-0.15, 9.75], [3.22, 9.75]]) },
    pickLines(LINES.leader, "최숙영")),
  six("정옥남", "실장", { path: W6([[3.22, 3.4], [6.9, 3.4], [6.9, 9.75], [3.22, 9.75]]), pathOffset: 0.5 },
    pickLines(LINES.chief, "정옥남")),
  six("송재진", "강사", { path: W6([[5.8, 3.3], [2.6, 3.3], [3.22, 3.3], [3.22, 8.5], [3.22, 3.3]]), pathOffset: 0.25 },
    ["교육장에서 배운 걸 현장에서 써 보는 중이죠? 잘하고 있어요!", ...pickLines(LINES.coach, "송재진", 1)], true),
  // 심리상담실
  six("이혜진", "심리상담실장", { position: [5.3, 0, 1.95], rotationY: 0, pose: "sit" },
    ["마음이 힘들 땐 언제든 편하게 찾아오세요.", "이곳에서 나눈 이야기는 비밀이 지켜져요. 차 한잔하며 쉬어 가세요."]),
);
void MALE;

// 9층 — 이 게임을 함께 개발한 직원들 (이름 옆에 (개발자), 돌아다님)
const nine = (who, team, path, offset, lines, model) => ({
  id: `staff_9F_${who}`, floor: "9F", name: `${team} ${who} (개발자)`, // 이 게임을 함께 만든 개발자 ...look(who, model === MALE), ...(model ? { model } : {}),
  path: route(path), pathOffset: offset,
  dialog: [`안녕하세요, ${team} ${who}입니다.`, ...lines],
});
STAFF.push(
  nine("이준완", "채팅상담팀", "corridor", 0.3,
    ["채팅으로도 공감은 전해져요. 이모티콘 하나에도 마음을 담아요 :)", "전화든 채팅이든 고객의 마음을 여는 건 똑같아요. 화이팅!"], MALE),
  nine("이진욱", "우리가족마케팅", "chief", 0.55,
    ["우리 가족 결합 혜택, 고객님께 꼭 안내해 주세요!", "좋은 혜택은 알려 드릴수록 고객이 행복해져요."], MALE),
  nine("김예진", "업무지원팀", "north", 0.6,
    ["업무 시스템이나 지원이 필요하면 언제든 불러 주세요!", "여러분이 상담에만 집중할 수 있게 뒤에서 열심히 돕고 있어요."], LONG),
);

// 🎮 미니게임 NPC (회원 전용 퀘스트)
// - 9층 백영주 실장(새로 추가, 여성): 📞 콜 받기 반응속도 게임
STAFF.push({
  id: "staff_9F_백영주", floor: "9F", name: "백영주 실장", model: "Character_Female_LongHair", color: "#2bb3a3",
  path: route("south"), pathOffset: 0.55, game: "reaction",
  dialog: ["안녕하세요, 9층 상담실 백영주 실장이에요.", "상담사에게 제일 중요한 것 중 하나가 빠른 응대예요. 콜이 울리면 바로 받는 거죠!"],
});
// - 1층 강사실 황율산 실장(새로 추가, 여성): 🃏 기억력 카드 짝맞추기 — 팀장석에 앉아 있음
STAFF.push({
  id: "staff_1F_황율산", floor: "1F", name: "황율산 실장", model: "Character_Female_ShortHair", color: "#7b4bb7",
  position: [0.35, 0, -16.2], rotationY: Math.PI / 2, pose: "sit", game: "memory",
  dialog: ["안녕하세요, 강사실 황율산 실장이에요.", "상담사는 고객 정보를 잘 기억하는 것도 중요하죠. 기억력엔 자신 있나요?"],
});
// - 7층 김윤혜 실장: 💗 공감 응대 챌린지
for (const s of STAFF) if (s.id === "staff_7F_김윤혜") s.game = "empathy";

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
  // 1층: 안내데스크와 동선이 겹치지 않게 그린월 복도 → 교육 복도 → 사물함 복도를 왕복하며 돌아다님
  "1F": {
    position: [-1.2, 0, 1.5],
    rotationY: 0,
    path: [[-1.2, 1.5], [-1.2, -5.5], [3.0, -5.5], [8.1, -5.5], [8.1, -1.0], [8.1, -5.5], [3.0, -5.5], [-1.2, -5.5]].map(([x, y]) => [x, 0, y]),
  },
  "6F": { position: [-1.5, 0, 12.3], rotationY: Math.PI / 2 }, // 엘리베이터 홀 남서쪽 구석 (지나가는 길 비움)
  "7F": { position: [-3.0, 0, 9.8], rotationY: Math.PI / 2 }, // 엘리베이터 홀 옆 복도
  "8F": { position: [-3.0, 0, 9.8], rotationY: Math.PI / 2 },
  "9F": { position: [-3.0, 0, 9.8], rotationY: Math.PI / 2 },
};
export const RECRUITERS = Object.entries(RECRUITER_SPOTS).map(([floor, spot]) => ({
  id: `recruiter_${floor}`, floor, name: "채용담당자", model: "Character_Player_Consultant", color: "#1f2a44",
  ...spot, menu: "recruiter", dialog: [RECRUIT_GREETING],
}));
