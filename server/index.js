// 회사 메타버스 실시간 서버 (Node.js + Socket.IO)
// - 최대 70명 실시간 위치 공유 (같은 층끼리만 위치를 주고받아 트래픽 절약)
// - 1F / 6F / 7F·8F·9F(상담실) 층 + 엘리베이터 이동
// - 말풍선 채팅 (같은 층)
// - 보물 찾기: 서버가 층·거리·중복을 검증하고 Acknowledgement(콜백)로 결과 응답
import express from "express";
import http from "http";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import crypto from "crypto";
import { N as OMOK_N, emptyBoard, isWin, aiMove } from "./omok.js";
import { EMPATHY_QUESTIONS, EMPATHY_POINTS, EMPATHY_COUNT } from "./empathy.js";
import { QUESTS, QUEST_BY_ID, QUEST_GIVER, questProgress, questApply, questComplete } from "./quest.js";
import { ITEM_CATALOG, SLOTS, drawDart, TREASURE_POINTS, TREASURE_ALL_BONUS, GAME_WIN, GAME_WIN_RULE, gameReward, GAME_KO, newWallet } from "./shop.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 배포 시: client 를 빌드한 결과물(client/dist)을 이 서버가 같이 보내 줌 → 주소 하나로 접속
const CLIENT_DIST = path.resolve(__dirname, "../client/dist");

const PORT = process.env.PORT || 3001;
const MAX_PLAYERS = 70;
const CLAIM_DISTANCE = 2.0; // 보물과 이 거리(m) 안에 있어야 획득 가능
const ELEVATOR_DISTANCE = 2.0; // 엘리베이터 앞 파란 마커에서 이 거리 안에 있어야 층 이동 가능

// "each"  : 직원마다 각 보물을 1번씩 획득 가능
// "first" : 선착순 1명만 획득 (획득되면 모두의 화면에서 사라짐)
const TREASURE_MODE = process.env.TREASURE_MODE || "each";

/* ───────── 건물 설정 (블렌더 맵에 맞게 좌표 수정) ─────────
   좌표 변환: 블렌더 (X, Y, Z) → 여기 [X, Z(높이), -Y]
   예) 블렌더에서 X=-11, Y=6 → [-11, 0, -6] */
const FLOORS = ["1F", "6F", "7F", "8F", "9F"]; // 7·8·9층 = 상담실 (같은 디자인)
const START_FLOOR = "1F";
// 첫 입장 위치: 1층 정문 회전문 안쪽 로비 (이 점 주변에 나란히 배치)
const START_POSITION = [-1.2, 0, 8.0];
// 층별 엘리베이터 앞 '파란 원형 마커' 위치 — 블렌더 맵의 엘리베이터 문 앞
const ELEVATORS = {
  "1F": [-5.7, 0, 7.3], // 엘리베이터 홀: 브론즈 엘리베이터 2기 사이 앞
  "6F": [1.6, 0, 10.55], // Elev_Door_Left/Right 사이, 금색 "6" 거울 앞
  "7F": [2.6, 0, 10.55], // 오렌지 유광 벽 "7" 앞
  "8F": [2.6, 0, 10.55], // 8·9층은 7층과 같은 구조
  "9F": [2.6, 0, 10.55],
};
// 층별 계단실(비상구) 계단참 '초록 원형 마커' — 엘리베이터 대신 계단으로도 층간 이동
const STAIRS = {
  "1F": [-9.95, 0, 5.3], // 엘리베이터 홀 서쪽 벽 검은 문 안쪽 (북쪽 계단참)
  "6F": [-0.9, 0, 14.9], // 엘리베이터 홀 남쪽 벽 비상구 문 안쪽 (서쪽 계단참)
  "7F": [-0.1, 0, 14.9],
  "8F": [-0.1, 0, 14.9],
  "9F": [-0.1, 0, 14.9],
};
const STAIR_DISTANCE = 1.6;
// 1층 북카페 BULLSEYE 다트 머신 앞 (다트 게임 점수는 이 근처에서만 받음)
const DART_SPOT = { floor: "1F", position: [1.0, 0, -0.72] };
const DART_MAX = 3 * 3 * 60; // 3라운드 × 3발 × 트리플20(60점)
const dartBest = new Map(); // 기기키 → { name, score, at } (서버가 다시 켜지면 초기화)
const dartTop = (n = 10) => [...dartBest.values()].sort((a, b) => b.score - a.score || a.at - b.at).slice(0, n);
// 엘리베이터에서 내렸을 때 서는 위치 (층별, 마커에서 한 걸음 나온 자리)
const ELEVATOR_EXITS = {
  "1F": [-5.7, 0, 6.4],
  "6F": [0.6, 0, 10.55],
  "7F": [1.6, 0, 10.55],
  "8F": [1.6, 0, 10.55],
  "9F": [1.6, 0, 10.55],
};

// 보물 10종 (1·6·7·8·9층 2개씩) — 블렌더 맵의 관련 물체 옆 빈자리
const treasures = {
  t1_coupon: { id: "t1_coupon", floor: "1F", name: "카페 쿠폰", position: [7.9, 0.5, 8.4] }, // 카페테리아 건강관리 코너 옆
  t1_headset: { id: "t1_headset", floor: "1F", name: "황금 헤드셋", position: [6.3, 0.5, -11.6], small: true }, // 강사실 (책장 옆)
  t6_ksqi: { id: "t6_ksqi", floor: "6F", name: "KSQI 인증패", position: [-15.4, 0.5, 10.25] },
  t6_dino: { id: "t6_dino", floor: "6F", name: "노란 공룡 인형", position: [-0.6, 0.5, 5.8], hidden: true },
  t7_cushion: { id: "t7_cushion", floor: "7F", name: "빨간 하트 쿠션", position: [5.33, 0.5, -1.0] },
  t7_card: { id: "t7_card", floor: "7F", name: "상담실 에티켓 황금 사원증", position: [-8.9, 0.5, -5.3], small: true }, // 중앙 기둥 옆 에티켓 보드
  t8_blanket: { id: "t8_blanket", floor: "8F", name: "수면실 포근한 담요", position: [4.2, 0.5, -12.0] }, // 수면실 안마의자 앞
  t8_remote: { id: "t8_remote", floor: "8F", name: "Clova TV 리모컨", position: [-0.6, 0.5, 6.6], hidden: true }, // 출입구 왼쪽 TV 선반
  t9_marker: { id: "t9_marker", floor: "9F", name: "회의실 황금 마커", position: [-7.3, 0.5, 6.0], small: true }, // 회의실 3
  t9_bulb: { id: "t9_bulb", floor: "9F", name: "정원 코너 황금 전구", position: [3.35, 0.5, -6.6] }, // 휴게실 정원 코너
};

/* ───────── 상태 ───────── */
const app = express();
app.use(cors());
app.get("/health", (_req, res) => res.json({ ok: true, players: players.size, storage: db ? "firestore" : "memory" }));

if (fs.existsSync(CLIENT_DIST)) {
  // 3D 맵(.glb)은 크니까 브라우저가 하루 동안 저장해 두고 재사용
  app.use(
    express.static(CLIENT_DIST, {
      setHeaders: (res, file) => {
        if (file.endsWith(".glb")) res.setHeader("Cache-Control", "public, max-age=86400");
        else if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      },
    })
  );
  app.get(/^\/(?!socket\.io|health|admin).*/, (_req, res) => res.sendFile(path.join(CLIENT_DIST, "index.html")));
} else {
  app.get("/", (_req, res) => res.send("company-metaverse server OK (client 미빌드: 개발 모드)"));
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }, // 개발용. 배포 시 사내 도메인으로 제한하세요.
});

// socket.id -> { id, key, name, color, floor, position:[x,y,z], rotationY }
const players = new Map();
// 보물ID -> Set(playerKey)   ※ socket.id 는 재접속마다 바뀌므로 기기 고유키로 기록
const foundBy = Object.fromEntries(Object.keys(treasures).map((id) => [id, new Set()]));
const claimLocks = new Set(); // 동시 요청 순서 보장용

/* ───────── 🔄 보물찾기 주간 초기화 ─────────
   매주 일요일 낮 12:00 (한국시간)에 모든 보물이 다시 나타나서 누구나 다시 찾을 수 있어요.
   지난 기록은 Firestore 에 그대로 남고, 이번 회차(일요일 12시 이후) 기록만 "찾음"으로 봐요. */
const RESET_DOW = 0;   // 0=일요일
const RESET_HOUR = 12; // 한국시간 12시
function treasureRoundStart(now = Date.now()) {
  const k = new Date(now + 9 * 3600000); // KST 를 UTC 필드로 다룸
  const start = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate(), RESET_HOUR));
  start.setUTCDate(start.getUTCDate() - ((k.getUTCDay() - RESET_DOW + 7) % 7));
  if (start > k) start.setUTCDate(start.getUTCDate() - 7);
  return start.getTime() - 9 * 3600000; // 실제 UTC 시각(ms)
}
let treasureRound = treasureRoundStart();
const roundId = () => new Date(treasureRound + 9 * 3600000).toISOString().slice(0, 10); // 예: 2026-11-22

const COLORS = ["#e6007e", "#ff8a00", "#00a3e0", "#22b573", "#8e44ad", "#f1c40f", "#e74c3c", "#1abc9c"];
const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];
const LOOK_TYPES = ["male", "female_long", "female_short"];
const cleanLook = (look) => ({
  type: LOOK_TYPES.includes(look?.type) ? look.type : "male",
  outfit: /^#[0-9a-f]{6}$/i.test(look?.outfit || "") ? look.outfit : "#2f5fb3",
});
const clean = (s, max) => String(s ?? "").replace(/[<>]/g, "").trim().slice(0, max);
const dist2D = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const publicPlayer = ({ key, empNo, buffTimer, radarUntil, ...p }) => p; // 고유키·사번은 다른 사람에게 보내지 않음
const playersOnFloor = (floor) => [...players.values()].filter((p) => p.floor === floor).map(publicPlayer);
const elevatorExit = (floor) => [...ELEVATOR_EXITS[floor]];

function treasuresFor(key) {
  return Object.values(treasures).map((t) => ({
    ...t,
    foundCount: foundBy[t.id].size,
    foundByMe: foundBy[t.id].has(key),
    claimed: TREASURE_MODE === "first" && foundBy[t.id].size > 0,
  }));
}

/* ───────── NPC 에게 남긴 메시지 ─────────
   - 공개 메시지: NPC 에게 말을 건 사람들이 볼 수 있음 (최근 것만)
   - 비공개 메시지: 관리자 페이지에서만 볼 수 있음
   - 관리자 페이지: /admin/messages?key=관리자키 (Render 환경변수 ADMIN_KEY 에 키 설정)
   - FIREBASE_SERVICE_ACCOUNT 가 있으면 Firestore(npcMessages) 에도 저장 → 서버가 다시 켜져도 유지 */
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const MSG_MAX_LEN = 200;
const MSG_KEEP = 300; // NPC 한 명당 메모리에 남기는 최대 개수
const npcMessages = new Map(); // npcId → [{ id, npcId, npcName, floor, from, text, isPublic, at }]
function addMessage(m) {
  const list = npcMessages.get(m.npcId) || [];
  list.push(m);
  if (list.length > MSG_KEEP) list.splice(0, list.length - MSG_KEEP);
  npcMessages.set(m.npcId, list);
}
const publicMessages = (npcId, n = 15) =>
  (npcMessages.get(npcId) || [])
    .filter((m) => m.isPublic)
    .slice(-n)
    .reverse()
    .map(({ from, text, at }) => ({ from, text, at }));
// 내 메시지함: 내가 남긴 메시지 + 관리자(NPC) 답장
const myMessages = (key, n = 50) =>
  [...npcMessages.values()]
    .flat()
    .filter((m) => m.key === key)
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, n);
const unreadCount = (key) => myMessages(key, 500).filter((m) => m.reply && !m.replyRead).length;
const findMessage = (id) => [...npcMessages.values()].flat().find((m) => m.id === id);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

app.get("/admin/messages", (req, res) => {
  if (!ADMIN_KEY) return res.status(403).send("관리자 키(ADMIN_KEY 환경변수)가 아직 설정되지 않았어요. Render → Environment 에 ADMIN_KEY 를 추가해 주세요.");
  if (req.query.key !== ADMIN_KEY) return res.status(403).send("관리자 키가 맞지 않아요.");
  const all = [...npcMessages.values()].flat().sort((a, b) => (a.at < b.at ? 1 : -1));
  if (req.query.format === "csv") {
    const rows = [["시간", "층", "받는 NPC", "보낸 사람", "사번", "공개", "메시지"], ...all.map((m) => [m.at, m.floor, m.npcName, m.from, m.empNo || "", m.isPublic ? "공개" : "비공개", m.text])];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=npc_messages.csv");
    return res.send("\ufeff" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n"));
  }
  const byNpc = {};
  for (const m of all) (byNpc[m.npcName] ||= []).push(m);
  const fmt = (iso) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const sections = Object.entries(byNpc)
    .map(([npc, list]) => `<h2>${escapeHtml(npc)} <small>${list.length}건</small></h2><table><tr><th>시간</th><th>층</th><th>보낸 사람</th><th>공개</th><th>메시지</th><th>답장</th></tr>${list
      .map((m) => `<tr><td>${fmt(m.at)}</td><td>${escapeHtml(m.floor)}</td><td>${escapeHtml(m.from)}${m.empNo ? ` <small>(${m.empNo})</small>` : ""}</td><td>${m.isPublic ? "공개" : "🔒 비공개"}</td><td>${escapeHtml(m.text)}</td><td>${
        m.reply
          ? `<div class="re">↳ ${escapeHtml(m.reply)}<br><small>${fmt(m.replyAt)}${m.replyRead ? " · 읽음" : " · 안 읽음"}</small></div>`
          : ""
      }<form method="post" action="/admin/reply"><input type="hidden" name="key" value="${escapeHtml(ADMIN_KEY)}"><input type="hidden" name="id" value="${m.id}"><textarea name="text" maxlength="300" placeholder="${m.reply ? "답장 고치기" : "답장 쓰기"}"></textarea><button>보내기</button></form></td></tr>`)
      .join("")}</table>`)
    .join("");
  res.send(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NPC 메시지함</title>
<style>body{font-family:system-ui,sans-serif;margin:16px;color:#111}h1{font-size:20px}h2{font-size:16px;margin-top:24px}small{color:#888;font-weight:400}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f5f5f5}
textarea{width:100%;min-width:140px;box-sizing:border-box;height:44px;font:inherit}form button{margin-top:4px}.re{background:#fdf2f8;border-radius:6px;padding:4px 6px;margin-bottom:6px}</style></head>
<body><h1>💌 NPC 메시지함 <small>총 ${all.length}건 · 저장: ${db ? "Firestore" : "서버 메모리(재시작 시 초기화)"}</small></h1>
<p><a href="?key=${encodeURIComponent(ADMIN_KEY)}&format=csv">엑셀(CSV)로 받기</a> · <a href="/admin/users?key=${encodeURIComponent(ADMIN_KEY)}">👥 회원 목록</a></p>${sections || "<p>아직 메시지가 없어요.</p>"}</body></html>`);
});

// 관리자 답장 → 보낸 사람의 "내 메시지함"으로 전달 (접속 중이면 바로 알림)
app.post("/admin/reply", express.urlencoded({ extended: false }), async (req, res) => {
  const { key, id, text } = req.body || {};
  if (!ADMIN_KEY || key !== ADMIN_KEY) return res.status(403).send("관리자 키가 맞지 않아요.");
  const m = findMessage(String(id || ""));
  const body = clean(text, 300);
  const back = `/admin/messages?key=${encodeURIComponent(ADMIN_KEY)}`;
  if (!m || !body) return res.redirect(back);
  m.reply = body;
  m.replyAt = new Date().toISOString();
  m.replyRead = false;
  if (db) await db.collection("npcMessages").doc(m.id).set(m).catch((e) => console.error("답장 저장 실패:", e.message));
  for (const [sid, p] of players) if (p.key === m.key) io.to(sid).emit("inboxNew", { npcName: m.npcName, unread: unreadCount(m.key) });
  console.log(`[답장] ${m.npcName} → ${m.from}: ${body}`);
  res.redirect(back);
});

/* ───────── ✊ 가위바위보 (회원 전용 퀘스트) ─────────
   - 결과는 서버가 무작위로 정하고, 한 판마다 Firestore "rpsGames" 에 기록
   - 관리자 기록 보기: /admin/rps?key=관리자키  (엑셀: &format=csv)                       */
const rpsGames = []; // { id, empNo, name, npcId, npcName, floor, player, npc, result, at }
const RPS = ["rock", "scissors", "paper"];
const RPS_KO = { rock: "바위", scissors: "가위", paper: "보" };
const RESULT_KO = { win: "승", lose: "패", draw: "무" };
const rpsJudge = (a, b) => (a === b ? "draw" : (a === "rock" && b === "scissors") || (a === "scissors" && b === "paper") || (a === "paper" && b === "rock") ? "win" : "lose");
function rpsStats(empNo) {
  const mine = rpsGames.filter((g) => g.empNo === empNo).sort((a, b) => (a.at < b.at ? 1 : -1));
  const c = { win: 0, lose: 0, draw: 0 };
  mine.forEach((g) => (c[g.result] += 1));
  let streak = 0;
  for (const g of mine) {
    if (g.result === "win") streak += 1;
    else if (g.result === "lose") break;
  }
  return { total: mine.length, ...c, streak, recent: mine.slice(0, 10).map((g) => ({ result: g.result, at: g.at })) };
}
const RPS_LINES = {
  win: ["와, 제가 졌네요! 실력 인정합니다 👏", "오늘 운이 좋으시네요! 상담도 이렇게 술술 풀리길!", "제가 졌어요… 한 판 더 해요!"],
  lose: ["제가 이겼네요! 다시 도전해 보세요 😄", "아깝다! 다음엔 이길 수 있어요!", "이번엔 제 승리! 포기하지 마세요 💪"],
  draw: ["마음이 통했네요! 🤝", "비겼어요! 한 번 더?", "우리 생각이 같았네요 ㅎㅎ"],
};

app.get("/admin/rps", (req, res) => {
  if (!ADMIN_KEY) return res.status(403).send("관리자 키(ADMIN_KEY 환경변수)가 아직 설정되지 않았어요.");
  if (req.query.key !== ADMIN_KEY) return res.status(403).send("관리자 키가 맞지 않아요.");
  const fmt = (iso) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const list = [...rpsGames].sort((a, b) => (a.at < b.at ? 1 : -1));
  if (req.query.format === "csv") {
    const rows = [["진행일시", "사번", "이름", "상대 NPC", "층", "나", "NPC", "결과"], ...list.map((g) => [fmt(g.at), g.empNo, g.name, g.npcName, g.floor, RPS_KO[g.player], RPS_KO[g.npc], RESULT_KO[g.result]])];
    const csv = "\uFEFF" + rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=rps_games.csv");
    return res.send(csv);
  }
  // 사람별 순위 (승 많은 순)
  const by = new Map();
  for (const g of rpsGames) {
    const s = by.get(g.empNo) || { empNo: g.empNo, name: g.name, total: 0, win: 0, lose: 0, draw: 0, last: "" };
    s.total += 1;
    s[g.result] += 1;
    if (g.at > s.last) s.last = g.at;
    by.set(g.empNo, s);
  }
  const rank = [...by.values()].sort((a, b) => b.win - a.win || a.lose - b.lose);
  const k = encodeURIComponent(ADMIN_KEY);
  res.send(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>가위바위보 기록</title>
<style>body{font-family:system-ui,sans-serif;margin:16px}table{border-collapse:collapse;width:100%;font-size:14px;margin-bottom:24px}td,th{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f5f5f5}</style></head>
<body><h1>✊ 가위바위보 기록 (${rpsGames.length}판)</h1><p><a href="?key=${k}&format=csv">엑셀(CSV)로 받기</a> · <a href="/admin/messages?key=${k}">💌 메시지함</a> · <a href="/admin/users?key=${k}">👥 회원 목록</a></p>
<h2>사람별 순위</h2><table><tr><th>순위</th><th>이름(사번)</th><th>판수</th><th>승</th><th>무</th><th>패</th><th>승률</th><th>마지막 게임</th></tr>${
    rank.map((s, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(s.name)} (${s.empNo})</td><td>${s.total}</td><td>${s.win}</td><td>${s.draw}</td><td>${s.lose}</td><td>${Math.round((s.win / s.total) * 100)}%</td><td>${fmt(s.last)}</td></tr>`).join("") || "<tr><td colspan=8>아직 기록이 없어요.</td></tr>"
  }</table>
<h2>전체 기록 (최근 300판)</h2><table><tr><th>진행일시</th><th>이름(사번)</th><th>상대</th><th>나</th><th>NPC</th><th>결과</th></tr>${
    list.slice(0, 300).map((g) => `<tr><td>${fmt(g.at)}</td><td>${escapeHtml(g.name)} (${g.empNo})</td><td>${escapeHtml(g.npcName)} · ${g.floor}</td><td>${RPS_KO[g.player]}</td><td>${RPS_KO[g.npc]}</td><td>${RESULT_KO[g.result]}</td></tr>`).join("")
  }</table></body></html>`);
});

/* ───────── ⚫ 오목 대결 (회원 전용) ─────────
   - 판은 서버가 들고 있고 NPC 수도 서버가 계산 (조작 방지)
   - 한 판이 끝날 때마다 Firestore "omokGames" 에 기록 (시작·종료 일시, 수, 결과, 기권 여부)
   - 관리자: /admin/omok?key=관리자키 (&format=csv)                                         */
const omokGames = [];
const OMOK_RESULT_KO = { win: "승", lose: "패", draw: "무" };
function omokStats(empNo) {
  const mine = omokGames.filter((g) => g.empNo === empNo).sort((a, b) => (a.endAt < b.endAt ? 1 : -1));
  const c = { win: 0, lose: 0, draw: 0 };
  mine.forEach((g) => (c[g.result] += 1));
  const wins = mine.filter((g) => g.result === "win");
  return { total: mine.length, ...c, best: wins.length ? Math.min(...wins.map((g) => g.moves)) : null, recent: mine.slice(0, 10).map((g) => ({ result: g.result, at: g.endAt, moves: g.moves })) };
}
function finishOmok(p, game, result, resigned = false) {
  const g = {
    id: `${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`, empNo: p.empNo, name: p.name,
    npcId: game.npcId, npcName: game.npcName, floor: p.floor, result, resigned,
    moves: game.moves.filter((m) => m.c === 1).length, startAt: game.startAt, endAt: new Date().toISOString(),
    record: game.moves.map((m) => `${m.c === 1 ? "B" : "W"}${m.x},${m.y}`).join(" "),
  };
  omokGames.push(g);
  if (db) db.collection("omokGames").doc(g.id).set(g).catch((e) => console.error("오목 저장 실패:", e.message));
  console.log(`[오목] ${p.name}(${p.empNo}) vs ${g.npcName} → ${OMOK_RESULT_KO[result]}${resigned ? " (기권)" : ""} · ${g.moves}수`);
  awardGame(p, "omok", g);
  return omokStats(p.empNo);
}
const OMOK_LINES = {
  win: ["와… 제가 졌네요! 실력이 대단하세요 👏", "졌습니다! 상담도 이렇게 수를 잘 읽으시겠죠?", "인정! 다음엔 저도 더 열심히 둘게요."],
  lose: ["제가 이겼네요! 다시 도전해 보세요 😄", "아깝다! 한 수만 더 막았으면요.", "이번엔 제 승리! 언제든 재도전 환영이에요."],
  draw: ["판이 꽉 찼네요! 무승부예요 🤝"],
};

app.get("/admin/omok", (req, res) => {
  if (!ADMIN_KEY) return res.status(403).send("관리자 키(ADMIN_KEY 환경변수)가 아직 설정되지 않았어요.");
  if (req.query.key !== ADMIN_KEY) return res.status(403).send("관리자 키가 맞지 않아요.");
  const fmt = (iso) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const list = [...omokGames].sort((a, b) => (a.endAt < b.endAt ? 1 : -1));
  if (req.query.format === "csv") {
    const rows = [["시작일시", "종료일시", "사번", "이름", "상대 NPC", "층", "결과", "기권", "둔 수", "기보"], ...list.map((g) => [fmt(g.startAt), fmt(g.endAt), g.empNo, g.name, g.npcName, g.floor, OMOK_RESULT_KO[g.result], g.resigned ? "기권" : "", g.moves, g.record])];
    const csv = "\uFEFF" + rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=omok_games.csv");
    return res.send(csv);
  }
  const by = new Map();
  for (const g of omokGames) {
    const s = by.get(g.empNo) || { empNo: g.empNo, name: g.name, total: 0, win: 0, lose: 0, draw: 0, best: null, last: "" };
    s.total += 1;
    s[g.result] += 1;
    if (g.result === "win" && (s.best === null || g.moves < s.best)) s.best = g.moves;
    if (g.endAt > s.last) s.last = g.endAt;
    by.set(g.empNo, s);
  }
  const rank = [...by.values()].sort((a, b) => b.win - a.win || (a.best ?? 999) - (b.best ?? 999));
  const k = encodeURIComponent(ADMIN_KEY);
  res.send(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>오목 기록</title>
<style>body{font-family:system-ui,sans-serif;margin:16px}table{border-collapse:collapse;width:100%;font-size:14px;margin-bottom:24px}td,th{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f5f5f5}</style></head>
<body><h1>⚫ 오목 대결 기록 (${omokGames.length}판)</h1><p><a href="?key=${k}&format=csv">엑셀(CSV)로 받기</a> · <a href="/admin/rps?key=${k}">✊ 가위바위보</a> · <a href="/admin/messages?key=${k}">💌 메시지함</a> · <a href="/admin/users?key=${k}">👥 회원 목록</a></p>
<h2>사람별 순위</h2><table><tr><th>순위</th><th>이름(사번)</th><th>판수</th><th>승</th><th>무</th><th>패</th><th>최단 승리</th><th>마지막 게임</th></tr>${
    rank.map((s, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(s.name)} (${s.empNo})</td><td>${s.total}</td><td>${s.win}</td><td>${s.draw}</td><td>${s.lose}</td><td>${s.best ? s.best + "수" : "-"}</td><td>${fmt(s.last)}</td></tr>`).join("") || "<tr><td colspan=8>아직 기록이 없어요.</td></tr>"
  }</table>
<h2>전체 기록 (최근 300판)</h2><table><tr><th>종료일시</th><th>이름(사번)</th><th>상대</th><th>결과</th><th>둔 수</th></tr>${
    list.slice(0, 300).map((g) => `<tr><td>${fmt(g.endAt)}</td><td>${escapeHtml(g.name)} (${g.empNo})</td><td>${escapeHtml(g.npcName)} · ${g.floor}</td><td>${OMOK_RESULT_KO[g.result]}${g.resigned ? " (기권)" : ""}</td><td>${g.moves}</td></tr>`).join("")
  }</table></body></html>`);
});

/* ───────── 🥤 야바위 (회원 전용) — 3판, 뒤로 갈수록 빠르고 많이 섞음 ─────────
   - 섞는 순서·정답은 서버가 정하고 확인 → 한 게임(3판) 끝나면 Firestore "shellGames" 에 기록
   - 관리자: /admin/shell?key=관리자키 (&format=csv)                                          */
const shellGames = [];
const SHELL_LEVELS = [
  { swaps: 4, ms: 650, label: "1판 · 연습" },
  { swaps: 8, ms: 420, label: "2판 · 보통" },
  { swaps: 13, ms: 270, label: "3판 · 어려움" },
];
function shellStats(empNo) {
  const mine = shellGames.filter((g) => g.empNo === empNo).sort((a, b) => (a.at < b.at ? 1 : -1));
  return {
    total: mine.length, perfect: mine.filter((g) => g.score === 3).length,
    best: mine.length ? Math.max(...mine.map((g) => g.score)) : 0,
    hits: mine.reduce((s, g) => s + g.score, 0), recent: mine.slice(0, 10).map((g) => ({ score: g.score, at: g.at })),
  };
}

app.get("/admin/shell", (req, res) => {
  if (!ADMIN_KEY) return res.status(403).send("관리자 키(ADMIN_KEY 환경변수)가 아직 설정되지 않았어요.");
  if (req.query.key !== ADMIN_KEY) return res.status(403).send("관리자 키가 맞지 않아요.");
  const fmt = (iso) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const list = [...shellGames].sort((a, b) => (a.at < b.at ? 1 : -1));
  const ox = (g) => g.rounds.map((r) => (r ? "O" : "X")).join(" ");
  if (req.query.format === "csv") {
    const rows = [["진행일시", "사번", "이름", "상대 NPC", "층", "1판", "2판", "3판", "맞힌 수"], ...list.map((g) => [fmt(g.at), g.empNo, g.name, g.npcName, g.floor, ...g.rounds.map((r) => (r ? "O" : "X")), g.score])];
    const csv = "\uFEFF" + rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=shell_games.csv");
    return res.send(csv);
  }
  const by = new Map();
  for (const g of shellGames) {
    const s = by.get(g.empNo) || { empNo: g.empNo, name: g.name, total: 0, perfect: 0, hits: 0, last: "" };
    s.total += 1;
    s.hits += g.score;
    if (g.score === 3) s.perfect += 1;
    if (g.at > s.last) s.last = g.at;
    by.set(g.empNo, s);
  }
  const rank = [...by.values()].sort((a, b) => b.perfect - a.perfect || b.hits / b.total - a.hits / a.total);
  const k = encodeURIComponent(ADMIN_KEY);
  res.send(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>야바위 기록</title>
<style>body{font-family:system-ui,sans-serif;margin:16px}table{border-collapse:collapse;width:100%;font-size:14px;margin-bottom:24px}td,th{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f5f5f5}</style></head>
<body><h1>🥤 야바위 기록 (${shellGames.length}게임)</h1><p><a href="?key=${k}&format=csv">엑셀(CSV)로 받기</a> · <a href="/admin/omok?key=${k}">⚫ 오목</a> · <a href="/admin/rps?key=${k}">✊ 가위바위보</a> · <a href="/admin/messages?key=${k}">💌 메시지함</a></p>
<h2>사람별 순위</h2><table><tr><th>순위</th><th>이름(사번)</th><th>게임 수</th><th>3판 모두 성공</th><th>맞힌 판 / 전체 판</th><th>마지막 게임</th></tr>${
    rank.map((s, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(s.name)} (${s.empNo})</td><td>${s.total}</td><td>${s.perfect}</td><td>${s.hits} / ${s.total * 3}</td><td>${fmt(s.last)}</td></tr>`).join("") || "<tr><td colspan=6>아직 기록이 없어요.</td></tr>"
  }</table>
<h2>전체 기록 (최근 300게임)</h2><table><tr><th>진행일시</th><th>이름(사번)</th><th>상대</th><th>1·2·3판</th><th>맞힌 수</th></tr>${
    list.slice(0, 300).map((g) => `<tr><td>${fmt(g.at)}</td><td>${escapeHtml(g.name)} (${g.empNo})</td><td>${escapeHtml(g.npcName)} · ${g.floor}</td><td>${ox(g)}</td><td>${g.score} / 3</td></tr>`).join("")
  }</table></body></html>`);
});

/* ───────── 📞 콜 받기 반응속도 · 💗 공감 응대 챌린지 (회원 전용) ─────────
   - 반응속도: 5콜, 벨 울리는 시점은 서버가 정함. 부정출발(벨 전에 터치)은 +500ms 벌점
   - 공감 응대: 문제 은행(server/empathy.js)에서 5문제, 정답은 서버에만 → 100점 만점
   - 기록: Firestore "reactionGames" / "empathyGames"
   - 관리자: /admin/reaction?key=… · /admin/empathy?key=… (&format=csv)                       */
const reactionGames = [];
const memoryGames = []; // 🃏 카드 짝맞추기: { empNo, name, seconds, moves, at }
const MEMORY_CARDS = ["📶", "📺", "📱", "🏠", "🎧", "💳", "🛡️", "☁️"]; // 인터넷·U+tv·5G·IoT·상담·요금·보안·클라우드
function memoryStats(empNo) {
  const mine = memoryGames.filter((g) => g.empNo === empNo);
  return { total: mine.length, best: mine.length ? Math.min(...mine.map((g) => g.seconds)) : null, fewest: mine.length ? Math.min(...mine.map((g) => g.moves)) : null };
}
const baseballGames = []; // ⚾ 숫자야구: { empNo, name, success, tries, secret, guesses, at }
const BASEBALL_MAX = 10;
function baseballStats(empNo) {
  const mine = baseballGames.filter((g) => g.empNo === empNo);
  const wins = mine.filter((g) => g.success);
  return { total: mine.length, wins: wins.length, best: wins.length ? Math.min(...wins.map((g) => g.tries)) : null };
}
const empathyGames = [];
const REACTION_CALLS = 5;
const FALSE_START_PENALTY = 500;
const csvOf = (rows) => "\uFEFF" + rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
const kstFmt = (iso) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
function reactionStats(empNo) {
  const mine = reactionGames.filter((g) => g.empNo === empNo);
  return { total: mine.length, best: mine.length ? Math.min(...mine.map((g) => g.avg)) : null, fastest: mine.length ? Math.min(...mine.map((g) => g.fastest)) : null };
}
function empathyStats(empNo) {
  const mine = empathyGames.filter((g) => g.empNo === empNo);
  return { total: mine.length, best: mine.length ? Math.max(...mine.map((g) => g.score)) : null, perfect: mine.filter((g) => g.score === 100).length };
}
function adminGamePage(req, res, { title, file, list, head, row, rankHead, rank }) {
  if (!ADMIN_KEY) return res.status(403).send("관리자 키(ADMIN_KEY 환경변수)가 아직 설정되지 않았어요.");
  if (req.query.key !== ADMIN_KEY) return res.status(403).send("관리자 키가 맞지 않아요.");
  const sorted = [...list].sort((a, b) => (a.at < b.at ? 1 : -1));
  if (req.query.format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=${file}.csv`);
    return res.send(csvOf([head, ...sorted.map(row)]));
  }
  const k = encodeURIComponent(ADMIN_KEY);
  const td = (cells) => cells.map((c) => `<td>${escapeHtml(String(c ?? ""))}</td>`).join("");
  res.send(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;margin:16px}table{border-collapse:collapse;width:100%;font-size:14px;margin-bottom:24px}td,th{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f5f5f5}</style></head>
<body><h1>${title} (${list.length}회)</h1><p><a href="?key=${k}&format=csv">엑셀(CSV)로 받기</a> · <a href="/admin/rps?key=${k}">✊ 가위바위보</a> · <a href="/admin/omok?key=${k}">⚫ 오목</a> · <a href="/admin/shell?key=${k}">🥤 야바위</a> · <a href="/admin/reaction?key=${k}">📞 반응속도</a> · <a href="/admin/empathy?key=${k}">💗 공감응대</a> · <a href="/admin/baseball?key=${k}">⚾ 숫자야구</a> · <a href="/admin/memory?key=${k}">🃏 짝맞추기</a></p>
<h2>사람별 순위</h2><table><tr>${["순위", ...rankHead].map((h) => `<th>${h}</th>`).join("")}</tr>${rank.map((r, i) => `<tr><td>${i + 1}</td>${td(r)}</tr>`).join("") || "<tr><td>아직 기록이 없어요.</td></tr>"}</table>
<h2>전체 기록 (최근 300회)</h2><table><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr>${sorted.slice(0, 300).map((g) => `<tr>${td(row(g))}</tr>`).join("")}</table></body></html>`);
}
const bestBy = (list, key, pick) => {
  const m = new Map();
  for (const g of list) {
    const s = m.get(g.empNo) || { empNo: g.empNo, name: g.name, n: 0, best: null, last: "" };
    s.n += 1;
    s.best = s.best === null ? g[key] : pick(s.best, g[key]);
    if (g.at > s.last) s.last = g.at;
    s.name = g.name;
    m.set(g.empNo, s);
  }
  return [...m.values()];
};
app.get("/admin/reaction", (req, res) =>
  adminGamePage(req, res, {
    title: "📞 콜 받기 반응속도 기록", file: "reaction_games", list: reactionGames,
    head: ["진행일시", "사번", "이름", "상대 NPC", "평균(ms)", "가장 빠름(ms)", "부정출발", "5콜 기록(ms)"],
    row: (g) => [kstFmt(g.at), g.empNo, g.name, g.npcName, g.avg, g.fastest, g.falseStarts, g.times.join(" / ")],
    rankHead: ["이름(사번)", "도전 횟수", "최고 평균(ms)", "마지막 도전"],
    rank: bestBy(reactionGames, "avg", Math.min).sort((a, b) => a.best - b.best).map((s) => [`${s.name} (${s.empNo})`, s.n, s.best, kstFmt(s.last)]),
  })
);
app.get("/admin/baseball", (req, res) =>
  adminGamePage(req, res, {
    title: "⚾ 숫자야구 기록", file: "baseball_games", list: baseballGames,
    head: ["진행일시", "사번", "이름", "상대 NPC", "결과", "시도 횟수", "정답", "입력 기록"],
    row: (g) => [kstFmt(g.at), g.empNo, g.name, g.npcName, g.success ? "성공" : "실패", g.tries, g.secret, g.guesses.join(" ")],
    rankHead: ["이름(사번)", "도전 횟수", "최소 시도(성공)", "마지막 도전"],
    rank: bestBy(baseballGames.filter((g) => g.success), "tries", Math.min).sort((a, b) => a.best - b.best).map((s) => [`${s.name} (${s.empNo})`, s.n, `${s.best}번`, kstFmt(s.last)]),
  })
);
app.get("/admin/memory", (req, res) =>
  adminGamePage(req, res, {
    title: "🃏 카드 짝맞추기 기록", file: "memory_games", list: memoryGames,
    head: ["진행일시", "사번", "이름", "상대 NPC", "걸린 시간(초)", "뒤집은 횟수(쌍)"],
    row: (g) => [kstFmt(g.at), g.empNo, g.name, g.npcName, g.seconds, g.moves],
    rankHead: ["이름(사번)", "도전 횟수", "최고 기록(초)", "마지막 도전"],
    rank: bestBy(memoryGames, "seconds", Math.min).sort((a, b) => a.best - b.best).map((s) => [`${s.name} (${s.empNo})`, s.n, s.best, kstFmt(s.last)]),
  })
);
app.get("/admin/empathy", (req, res) =>
  adminGamePage(req, res, {
    title: "💗 공감 응대 챌린지 기록", file: "empathy_games", list: empathyGames,
    head: ["진행일시", "사번", "이름", "상대 NPC", "점수", "최고 답변 수", "문제·선택"],
    row: (g) => [kstFmt(g.at), g.empNo, g.name, g.npcName, g.score, g.bestCount, g.answers.map((a) => `${a.q}:${a.pick}`).join(" ")],
    rankHead: ["이름(사번)", "도전 횟수", "최고 점수", "마지막 도전"],
    rank: bestBy(empathyGames, "score", Math.max).sort((a, b) => b.best - a.best).map((s) => [`${s.name} (${s.empNo})`, s.n, s.best, kstFmt(s.last)]),
  })
);

/* ───────── 🏆 랭킹 게시판 (게임별 TOP 10 · 이번 주 / 전체) ───────── */
function weekStartIso() {
  const kst = new Date(Date.now() + 9 * 3600000); // KST 기준 월요일 0시
  const day = (kst.getUTCDay() + 6) % 7;
  kst.setUTCHours(0, 0, 0, 0);
  kst.setUTCDate(kst.getUTCDate() - day);
  return new Date(kst.getTime() - 9 * 3600000).toISOString();
}
function buildRankings(period, myEmp) {
  const since = period === "week" ? weekStartIso() : "";
  const inP = (list, key = "at") => list.filter((g) => (g[key] || "") >= since);
  const agg = (list, keyOf) => {
    const m = new Map();
    for (const g of list) {
      const s = m.get(g.empNo) || { empNo: g.empNo, name: g.name, n: 0, v: 0, w: 0 };
      s.n += 1;
      keyOf(s, g);
      s.name = g.name;
      m.set(g.empNo, s);
    }
    return [...m.values()];
  };
  const top = (arr, sort, fmt) => {
    const sorted = arr.sort(sort);
    const out = sorted.slice(0, 10).map((s, i) => ({ rank: i + 1, name: s.name, value: fmt(s), me: s.empNo === myEmp }));
    const mi = sorted.findIndex((s) => s.empNo === myEmp);
    return { top: out, mine: mi >= 0 ? { rank: mi + 1, value: fmt(sorted[mi]) } : null, players: sorted.length };
  };
  return {
    rps: top(agg(inP(rpsGames), (s, g) => { if (g.result === "win") s.v += 1; }), (a, b) => b.v - a.v || a.n - b.n, (s) => `${s.v}승 (${s.n}판)`),
    omok: top(agg(inP(omokGames, "endAt"), (s, g) => { if (g.result === "win") s.v += 1; }), (a, b) => b.v - a.v || a.n - b.n, (s) => `${s.v}승 (${s.n}판)`),
    shell: top(agg(inP(shellGames), (s, g) => { if (g.score === 3) s.v += 1; s.w += g.score; }), (a, b) => b.v - a.v || b.w / b.n - a.w / a.n, (s) => `3판 성공 ${s.v}회 · 적중 ${s.w}/${s.n * 3}`),
    reaction: top(agg(inP(reactionGames), (s, g) => { s.v = s.v ? Math.min(s.v, g.avg) : g.avg; }), (a, b) => a.v - b.v, (s) => `평균 ${s.v}ms`),
    memory: top(agg(inP(memoryGames), (s, g) => { if (!s.v || g.seconds < s.v || (g.seconds === s.v && g.moves < s.w)) { s.v = g.seconds; s.w = g.moves; } }), (a, b) => a.v - b.v || a.w - b.w, (s) => `${s.v}초 · ${s.w}번`),
    baseball: top(agg(inP(baseballGames), (s, g) => { if (g.success) { s.w += 1; s.v = s.v ? Math.min(s.v, g.tries) : g.tries; } }).filter((s) => s.w > 0), (a, b) => a.v - b.v || b.w - a.w, (s) => `최소 ${s.v}번 · 성공 ${s.w}회`),
    empathy: top(agg(inP(empathyGames), (s, g) => { s.v = Math.max(s.v, g.score); }), (a, b) => b.v - a.v || a.n - b.n, (s) => `${s.v}점`),
  };
}

/* ───────── 회원 (내부 임직원) ─────────
   - 회원가입: 이름 + 사번(숫자 6자리) + 비밀번호 → 비밀번호는 scrypt 로 암호화해서 저장
   - 로그인하면 서명된 토큰을 받아 기기에 저장 → 다음부터 자동 로그인 (30일)
   - 회원은 보물 기록·캐릭터가 사번 기준으로 저장되어 어느 기기에서 들어와도 이어짐
   - 관리자 회원 목록: /admin/users?key=관리자키  (삭제: &delete=사번)                     */
const floorChat = new Map(); // 층 → 최근 채팅 30줄 (새로 들어온 사람도 진행 중인 대화를 볼 수 있게)
const CHAT_KEEP = 30;
const chatLog = (floor) => floorChat.get(floor) || [];
const users = new Map(); // 사번 → { empNo, name, pass, look, createdAt, lastLogin }
const AUTH_SECRET = crypto
  .createHash("sha256")
  .update(process.env.AUTH_SECRET || process.env.FIREBASE_SERVICE_ACCOUNT || process.env.ADMIN_KEY || crypto.randomBytes(32).toString("hex"))
  .digest();
const TOKEN_DAYS = 30;
const hashPassword = (pw, salt = crypto.randomBytes(16).toString("hex")) =>
  `${salt}:${crypto.scryptSync(String(pw), salt, 32).toString("hex")}`;
function checkPassword(pw, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, "hex");
  const b = crypto.scryptSync(String(pw), salt, 32);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const sign = (s) => crypto.createHmac("sha256", AUTH_SECRET).update(s).digest("base64url");
function makeToken(empNo) {
  const body = `${empNo}.${Date.now() + TOKEN_DAYS * 86400000}`;
  return `${body}.${sign(body)}`;
}
function readToken(token) {
  const [empNo, exp, sig] = String(token || "").split(".");
  if (!empNo || !exp || !sig) return null;
  const want = sign(`${empNo}.${exp}`);
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  if (Number(exp) < Date.now()) return null;
  return users.get(empNo) || null;
}
const userPublic = (u) => ({ name: u.name, empNo: u.empNo, look: u.look || null });
async function saveUser(u) {
  if (!db) return;
  try {
    await db.collection("users").doc(u.empNo).set(u);
  } catch (e) {
    console.error("회원 저장 실패:", e.message);
  }
}

app.get("/admin/users", async (req, res) => {
  if (!ADMIN_KEY) return res.status(403).send("관리자 키(ADMIN_KEY 환경변수)가 아직 설정되지 않았어요.");
  if (req.query.key !== ADMIN_KEY) return res.status(403).send("관리자 키가 맞지 않아요.");
  let note = "";
  const del = String(req.query.delete || "");
  if (/^\d{6}$/.test(del) && users.has(del)) {
    const u = users.get(del);
    users.delete(del);
    if (db) await db.collection("users").doc(del).delete().catch(() => {});
    note = `<p style="color:#b91c1c">${escapeHtml(u.name)}(${del}) 회원을 삭제했어요. 같은 사번으로 다시 가입할 수 있어요.</p>`;
  }
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-");
  const k = encodeURIComponent(ADMIN_KEY);
  const rows = [...users.values()]
    .sort((a, b) => a.empNo.localeCompare(b.empNo))
    .map((u) => `<tr><td>${u.empNo}</td><td>${escapeHtml(u.name)}</td><td>${escapeHtml(rosterStatus(u).label)}</td><td>${fmt(u.createdAt)}</td><td>${fmt(u.lastLogin)}</td>
      <td><a href="?key=${k}&delete=${u.empNo}" onclick="return confirm('${escapeHtml(u.name)}(${u.empNo}) 회원을 삭제할까요? (비밀번호를 잊은 경우 삭제 후 다시 가입)')">삭제</a></td></tr>`)
    .join("");
  res.send(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>회원 목록</title>
<style>body{font-family:system-ui,sans-serif;margin:16px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f5f5f5}</style></head>
<body><h1>👥 회원(내부 임직원) ${users.size}명</h1>${note}<p><a href="/admin/messages?key=${k}">💌 메시지함 보기</a> · <a href="/admin/roster?key=${k}">📋 사원 명단 · 회원 대조</a></p>
<table><tr><th>사번</th><th>이름</th><th>명단 대조</th><th>가입일</th><th>마지막 로그인</th><th></th></tr>${rows || "<tr><td colspan=6>아직 가입한 사람이 없어요.</td></tr>"}</table></body></html>`);
});

/* ───────── 📺 센터 소식 (1층 엘리베이터 통로 TV) ─────────
   - 보물 발견 · 미니게임 기록 · 신규 가입 소식을 최근 20개까지 모아 모두에게 실시간 전송
   - TV 는 최근 소식 + 이번 주 미니게임 1위를 돌아가며 보여 줌                            */
const newsFeed = [];
let newsSeq = 0;
function pushNews(icon, text) {
  const item = { id: ++newsSeq, icon, text, at: new Date().toISOString() };
  newsFeed.unshift(item);
  newsFeed.length = Math.min(newsFeed.length, 20);
  io.emit("news", item);
}
const newsName = (p) => (p?.guest || !p?.empNo ? "방문자" : p.name);
function gameNews(p, game, g) {
  const n = newsName(p);
  if (game === "rps" && g.result === "win") pushNews("✊", `${n}님 가위바위보 승리!`);
  if (game === "omok" && g.result === "win" && !g.resigned) pushNews("⚫", `${n}님 오목 대결에서 승리!`);
  if (game === "shell" && g.score === 3) pushNews("🥤", `${n}님 야바위 3판 모두 맞혔어요!`);
  if (game === "reaction" && g.avg) pushNews("📞", `${n}님 콜 받기 평균 ${g.avg}ms`);
  if (game === "empathy" && g.score >= 70) pushNews("💗", `${n}님 공감응대 챌린지 ${g.score}점!`);
  if (game === "baseball" && g.success) pushNews("⚾", `${n}님 숫자야구 ${g.tries}번 만에 정답!`);
  if (game === "memory" && g.seconds) pushNews("🃏", `${n}님 카드 짝맞추기 ${g.seconds}초 완료`);
}
function weeklyChamps() {
  const r = buildRankings("week");
  return Object.entries(r)
    .filter(([, v]) => v.top.length)
    .map(([k, v]) => ({ game: GAME_KO[k] || k, name: v.top[0].name, value: v.top[0].value }));
}

/* ───────── 🛒 포인트 지갑 (회원 전용) ─────────
   - 사번별 포인트·가방·장착 상태 → Firestore "wallets" 에 저장 (서버가 다시 켜져도 유지)
   - 처음 쓰는 회원은 500P + 커피 1잔으로 시작
   - 보물 1개 50P, 이번 주 10개 다 찾으면 +200P
   - 미니게임은 NPC 에게 이기면 게임마다 하루 1번 50P (허유경 센터장 오목은 100P), 자정에 초기화 */
const wallets = new Map(); // 사번 → { empNo, points, bag, equipped, day, dayGame }
const kstDay = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const nextKstMidnight = (now = Date.now()) => (Math.floor((now + 9 * 3600000) / 86400000) + 1) * 86400000 - 9 * 3600000;

/* ───────── ⚡ 아이템 효과 (지갑에 끝나는 시각 저장 → 층 이동·새로고침·재접속해도 유지) ─────────
   w.buffs = { coffee: 끝, radar: 끝, wave: 민트빛 파동 끝, refresh: '상쾌함 충전!' 끝(자정) } */
const buffView = (w) => {
  const now = Date.now();
  return Object.fromEntries(Object.entries(w.buffs || {}).filter(([, t]) => t > now));
};
function syncBuffs(p) {
  if (!p?.empNo) return;
  const w = getWallet(p.empNo);
  const b = (w.buffs ||= {});
  const now = Date.now();
  const coffee = (b.coffee || 0) > now;
  const wave = (b.wave || 0) > now;
  const aura = (b.refresh || 0) > now ? "✨ 상쾌함 충전!" : null;
  p.radarUntil = (b.radar || 0) + 3000; // 숨은 보물은 스캐너 켜진 동안만 획득
  if (!!p.coffee !== coffee) {
    p.coffee = coffee;
    io.to(p.floor).emit("playerCoffee", { id: p.id, on: coffee });
  }
  if ((p.aura || null) !== aura || !!p.wave !== wave) {
    p.aura = aura;
    p.wave = wave;
    io.to(p.floor).emit("playerAura", { id: p.id, aura, wave });
  }
  clearTimeout(p.buffTimer);
  const next = Math.min(...[b.coffee, b.wave, b.refresh].filter((t) => t > now));
  if (Number.isFinite(next)) p.buffTimer = setTimeout(() => syncBuffs(p), Math.min(next - now + 50, 2 ** 31 - 1));
}
function getWallet(empNo) {
  if (!empNo) return null;
  let w = wallets.get(empNo);
  if (!w) {
    w = newWallet(empNo);
    wallets.set(empNo, w);
    saveWallet(w);
  }
  return w;
}
function saveWallet(w) {
  if (!db) return;
  db.collection("wallets").doc(w.empNo).set(w).catch((e) => console.error("지갑 저장 실패:", e.message));
}
function walletDay(w) {
  const today = kstDay();
  if (w.day !== today) {
    w.day = today;
    w.dayGame = 0;
    w.dayWins = {};
  }
  w.dayWins ||= {};
  return w;
}
// 오늘 아직 이기지 않은 게임의 보상 합계 / 게임별 오늘 보상 받았는지
const gamesLeft = (w) => Object.keys(GAME_WIN).filter((g) => !walletDay(w).dayWins[g]);
const walletView = (w) => ({
  points: w.points, bag: w.bag, equipped: w.equipped, buffs: buffView(w),
  gameLeft: gamesLeft(w).reduce((s, g) => s + gameReward(g), 0),
  gameToday: Object.keys(GAME_WIN).map((g) => ({ game: g, name: GAME_KO[g], reward: gameReward(g), rule: GAME_WIN_RULE[g], done: !!w.dayWins[g] })),
});
function addPoints(p, amount, reason) {
  const w = getWallet(p.empNo);
  if (!w || amount <= 0) return 0;
  w.points += amount;
  saveWallet(w);
  io.to(p.id).emit("wallet", { ...walletView(w), gained: amount, reason });
  return amount;
}
// 미니게임 보상: NPC 에게 이기면 게임마다 하루 1번 (한국시간 자정에 초기화)
function awardGame(p, game, g) {
  gameNews(p, game, g);
  if (!p?.empNo) return 0;
  const w = walletDay(getWallet(p.empNo));
  const label = GAME_KO[game] || "미니게임";
  if (!GAME_WIN[game]?.(g)) return 0; // 이기지 못하면 포인트 없음
  questEvent(p, { kind: "win", game });
  if (w.dayWins[game]) {
    io.to(p.id).emit("wallet", { ...walletView(w), gained: 0, reason: `${label} 승리 보상은 오늘 이미 받았어요 (내일 자정에 다시 받을 수 있어요)` });
    return 0;
  }
  w.dayWins[game] = true;
  const amt = gameReward(game);
  w.dayGame = (w.dayGame || 0) + amt;
  return addPoints(p, amt, `${label} 승리 보상`);
}

/* ───────── 📜 퀘스트 (1층 김지연 센터장) ─────────
   - 지갑(w)에 진행 중 퀘스트 w.quest = { id, startedAt, progress[] }, 완료 기록 w.questsDone = { id: 완료일시 }
   - 한 번에 1개만 진행 · 퀘스트마다 1번만 완료 · 진행 중이면 머리 위에 "퀘스트 수행중" */
function questView(w) {
  const done = w.questsDone || {};
  const active = w.quest && QUEST_BY_ID[w.quest.id] ? w.quest : null;
  return {
    active: active ? { id: active.id, startedAt: active.startedAt, ...questProgress(QUEST_BY_ID[active.id], active.progress) } : null,
    list: QUESTS.map((q) => ({ id: q.id, title: q.title, goal: q.goal, reward: q.reward, ...questProgress(q, active?.id === q.id ? active.progress : []), completedAt: done[q.id] || null })),
  };
}
const questTitle = (w) => (w.quest && QUEST_BY_ID[w.quest.id] ? QUEST_BY_ID[w.quest.id].title : null);
function setPlayerQuest(p, title) {
  p.quest = title || null;
  io.to(p.floor).emit("playerQuest", { id: p.id, quest: p.quest });
}
// 게임·메시지·다트 결과가 들어오면 진행 중 퀘스트에 반영
function questEvent(p, ev) {
  if (!p?.empNo) return;
  const w = getWallet(p.empNo);
  if (!w?.quest || !questApply(w.quest, ev)) return;
  const q = QUEST_BY_ID[w.quest.id];
  if (questComplete(w.quest)) {
    (w.questsDone ||= {})[q.id] = new Date().toISOString();
    w.quest = null;
    saveWallet(w);
    setPlayerQuest(p, null);
    addPoints(p, q.reward, `📜 퀘스트 [${q.title}] 완료`);
    pushNews("📜", `${newsName(p)}님이 퀘스트 [${q.title}]을(를) 완료했어요!`);
    io.to(p.id).emit("questUpdate", { ...questView(w), completed: { title: q.title, reward: q.reward } });
    console.log(`[퀘스트] ${p.name}(${p.empNo}) 완료 → ${q.title} +${q.reward}P`);
  } else {
    saveWallet(w);
    io.to(p.id).emit("questUpdate", questView(w));
  }
}

/* ───────── 사원 명단 (회원가입 확인용) ─────────
   - 명단은 GitHub 에 올리지 않고 Firestore "config/roster" 에만 저장 (관리자 페이지에서 붙여넣기)
   - 명단이 올라가 있으면: 회원가입 때 사번 + 이름이 명단과 같아야 가입됨
   - 명단이 비어 있으면: 예전처럼 누구나 가입 (명단을 올리기 전까지 가입이 막히지 않도록)
   - 관리자 페이지: /admin/roster?key=관리자키  (명단 올리기 + 현재 회원 대조)              */
const roster = new Map(); // 사번 → 이름
let rosterUpdatedAt = null;
const normName = (s) => String(s ?? "").replace(/\s+/g, "");
function parseRoster(text) {
  const out = new Map();
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = line.trim().match(/^"?(\d{6})"?\s*[,\t; ]\s*"?([^",\t;]+?)"?\s*(?:[,\t;].*)?$/);
    if (m && normName(m[2])) out.set(m[1], normName(m[2]));
  }
  return out;
}
function rosterStatus(u) {
  if (!roster.size) return { ok: null, label: "명단 없음" };
  const nm = roster.get(u.empNo);
  if (!nm) return { ok: false, label: "❌ 명단에 없는 사번" };
  if (nm !== normName(u.name)) return { ok: false, label: `⚠️ 이름 불일치 (명단: ${nm})` };
  return { ok: true, label: "✅ 일치" };
}
async function saveRoster() {
  if (!db) return;
  try {
    await db.collection("config").doc("roster").set({ rows: [...roster].map(([e, n]) => ({ e, n })), updatedAt: rosterUpdatedAt });
  } catch (e) {
    console.error("사원 명단 저장 실패:", e.message);
  }
}

app.get("/admin/roster", (req, res) => {
  if (!ADMIN_KEY) return res.status(403).send("관리자 키(ADMIN_KEY 환경변수)가 아직 설정되지 않았어요.");
  if (req.query.key !== ADMIN_KEY) return res.status(403).send("관리자 키가 맞지 않아요.");
  const k = encodeURIComponent(ADMIN_KEY);
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-");
  const list = [...users.values()].map((u) => ({ u, st: rosterStatus(u) }));
  const bad = list.filter((x) => x.st.ok === false).sort((a, b) => a.u.empNo.localeCompare(b.u.empNo));
  const good = list.filter((x) => x.st.ok === true).sort((a, b) => a.u.empNo.localeCompare(b.u.empNo));
  const row = ({ u, st }) => `<tr><td>${u.empNo}</td><td>${escapeHtml(u.name)}</td><td>${escapeHtml(st.label)}</td><td>${fmt(u.createdAt)}</td>
      <td><a href="/admin/users?key=${k}&delete=${u.empNo}" onclick="return confirm('${escapeHtml(u.name)}(${u.empNo}) 회원을 삭제할까요?')">삭제</a></td></tr>`;
  const note = req.query.saved ? `<p style="color:#15803d">✅ 사원 명단 ${roster.size}명을 저장했어요.</p>` : req.query.empty ? `<p style="color:#b91c1c">붙여넣은 내용에서 사번(6자리)과 이름을 찾지 못했어요.</p>` : "";
  res.send(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>사원 명단</title>
<style>body{font-family:system-ui,sans-serif;margin:16px;max-width:900px}table{border-collapse:collapse;width:100%;font-size:14px;margin-bottom:20px}td,th{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f5f5f5}textarea{width:100%;height:160px;font-family:monospace}.box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin:12px 0}</style></head>
<body><h1>📋 사원 명단 · 회원 대조</h1>${note}
<p><a href="/admin/users?key=${k}">👥 회원 목록</a> · <a href="/admin/messages?key=${k}">💌 메시지함</a></p>
<div class="box"><b>현재 명단:</b> ${roster.size ? `${roster.size}명 (올린 시각 ${fmt(rosterUpdatedAt)}) → 회원가입 때 사번·이름을 확인하고 있어요.` : "아직 없어요 → 지금은 누구나 가입할 수 있어요."}</div>
<h2>회원 대조 결과</h2>
<p>가입 회원 ${list.length}명 중 ✅ 일치 <b>${good.length}</b>명 · 확인 필요 <b style="color:#b91c1c">${bad.length}</b>명</p>
<h3>확인 필요</h3><table><tr><th>사번</th><th>가입 이름</th><th>대조 결과</th><th>가입일</th><th></th></tr>${bad.map(row).join("") || "<tr><td colspan=5>없어요 👍</td></tr>"}</table>
<details><summary>✅ 일치한 회원 ${good.length}명 보기</summary><table><tr><th>사번</th><th>이름</th><th>대조 결과</th><th>가입일</th><th></th></tr>${good.map(row).join("")}</table></details>
<h2>명단 올리기 (전체 바꾸기)</h2>
<p>엑셀에서 <b>사원번호·사원명</b> 두 열을 선택해 복사(Ctrl+C)한 뒤 아래 칸에 붙여넣고 저장하세요. 제목 줄은 그대로 넣어도 괜찮아요. CSV 파일을 골라도 돼요.</p>
<form method="post" action="/admin/roster"><input type="hidden" name="key" value="${escapeHtml(ADMIN_KEY)}">
<input type="file" accept=".csv,.txt" onchange="const f=this.files[0];if(f)f.text().then(t=>this.form.text.value=t)"><br><br>
<textarea name="text" placeholder="642534	김민정&#10;641786	김승현"></textarea><br>
<button type="submit" onclick="return confirm('지금 명단을 이 내용으로 바꿀까요?')">명단 저장</button></form></body></html>`);
});

app.post("/admin/roster", express.urlencoded({ extended: false, limit: "2mb" }), async (req, res) => {
  const { key, text } = req.body || {};
  if (!ADMIN_KEY || key !== ADMIN_KEY) return res.status(403).send("관리자 키가 맞지 않아요.");
  const back = `/admin/roster?key=${encodeURIComponent(ADMIN_KEY)}`;
  const next = parseRoster(text);
  if (!next.size) return res.redirect(`${back}&empty=1`);
  roster.clear();
  for (const [e, n] of next) roster.set(e, n);
  rosterUpdatedAt = new Date().toISOString();
  await saveRoster();
  console.log(`[사원 명단] ${roster.size}명 저장`);
  res.redirect(`${back}&saved=1`);
});

/* ───────── 보물 기록 저장 ─────────
   환경변수 FIREBASE_SERVICE_ACCOUNT (Firebase 서비스 계정 JSON 전체)가 있으면 Firestore 에 저장,
   없으면 서버 메모리에만 저장 (서버가 재시작되면 초기화)                                    */
let db = null;
async function initStorage() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return console.log("ℹ️  보물 기록: 메모리 저장 (FIREBASE_SERVICE_ACCOUNT 없음)");
  try {
    const { default: admin } = await import("firebase-admin");
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
    db = admin.firestore();
    const snap = await db.collection("treasureClaims").where("at", ">=", new Date(treasureRound).toISOString()).get();
    snap.forEach((doc) => {
      const { treasureId, key } = doc.data();
      if (foundBy[treasureId] && key) foundBy[treasureId].add(key);
    });
    console.log(`✅ 보물 기록: Firestore 연결 (이번 주 ${roundId()} 회차 기록 ${snap.size}건 복원)`);
    for (const [col, arr] of [["reactionGames", reactionGames], ["empathyGames", empathyGames], ["baseballGames", baseballGames], ["memoryGames", memoryGames]]) {
      const snap = await db.collection(col).orderBy("at").limitToLast(5000).get();
      snap.forEach((doc) => arr.push(doc.data()));
      console.log(`✅ ${col}: ${snap.size}건 복원`);
    }
    const shellSnap = await db.collection("shellGames").orderBy("at").limitToLast(3000).get();
    shellSnap.forEach((doc) => shellGames.push(doc.data()));
    console.log(`✅ 야바위 기록: ${shellSnap.size}게임 복원`);
    const omokSnap = await db.collection("omokGames").orderBy("endAt").limitToLast(3000).get();
    omokSnap.forEach((doc) => omokGames.push(doc.data()));
    console.log(`✅ 오목 기록: ${omokSnap.size}판 복원`);
    const rpsSnap = await db.collection("rpsGames").orderBy("at").limitToLast(5000).get();
    rpsSnap.forEach((doc) => rpsGames.push(doc.data()));
    console.log(`✅ 가위바위보 기록: ${rpsSnap.size}판 복원`);
    const rosterDoc = await db.collection("config").doc("roster").get();
    if (rosterDoc.exists) {
      const d = rosterDoc.data();
      for (const r of d.rows || []) roster.set(r.e, r.n);
      rosterUpdatedAt = d.updatedAt || null;
    }
    console.log(`✅ 사원 명단: ${roster.size}명 복원`);
    const walletSnap = await db.collection("wallets").get();
    walletSnap.forEach((doc) => wallets.set(doc.id, doc.data()));
    console.log(`✅ 포인트 지갑: ${walletSnap.size}명 복원`);
    const userSnap = await db.collection("users").get();
    userSnap.forEach((doc) => users.set(doc.id, doc.data()));
    console.log(`✅ 회원: ${userSnap.size}명 복원`);
    const msgSnap = await db.collection("npcMessages").orderBy("at").limitToLast(3000).get();
    msgSnap.forEach((doc) => addMessage(doc.data()));
    console.log(`✅ NPC 메시지: ${msgSnap.size}건 복원`);
  } catch (err) {
    db = null;
    console.error("⚠️ Firestore 연결 실패 → 메모리 저장으로 계속:", err.message);
  }
}

async function saveClaim(treasureId, player) {
  if (!db) return; // 메모리 모드
  // 문서 ID = 보물+사람 (선착순 모드는 보물만) → create() 는 이미 있으면 실패하므로 DB 차원에서도 중복 차단
  const docId = (TREASURE_MODE === "first" ? treasureId : `${treasureId}_${player.key}`) + `_${roundId()}`;
  try {
    await db.collection("treasureClaims").doc(docId).create({
      treasureId,
      key: player.key,
      name: player.name,
      round: roundId(),
      at: new Date().toISOString(),
    });
  } catch (err) {
    if (err.code === 6 /* ALREADY_EXISTS */) {
      const e = new Error("이미 기록된 보물");
      e.alreadyClaimed = true;
      throw e;
    }
    throw err;
  }
}

/* ───────── 이벤트 ───────── */
io.on("connection", (socket) => {
  // 1) 입장
  // 0) 회원가입 / 로그인 (입장 전에 소켓으로 처리)
  let authFails = 0;
  socket.on("signup", async ({ name, empNo, password } = {}, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const nm = clean(name, 12);
    const no = String(empNo ?? "").trim();
    const pw = String(password ?? "");
    if (!nm) return reply({ ok: false, message: "이름을 입력해 주세요." });
    if (!/^\d{6}$/.test(no)) return reply({ ok: false, message: "사번은 숫자 6자리로 입력해 주세요." });
    if (pw.length < 4 || pw.length > 30) return reply({ ok: false, message: "비밀번호는 4~30자로 정해 주세요." });
    if (roster.size) {
      if (authFails >= 5) return reply({ ok: false, message: "시도가 너무 많아요. 잠시 후 새로고침하고 다시 시도해 주세요." });
      if (roster.get(no) !== normName(nm)) {
        authFails += 1;
        return reply({ ok: false, message: "사원 명단의 사번·이름과 일치하지 않아요. 사번과 이름(실명)을 다시 확인해 주세요.\n대구센터 소속이 아니신 분은 관리자(김승현M)에게 요청해 주세요." });
      }
    }
    if (users.has(no)) return reply({ ok: false, message: "이미 가입된 사번이에요. 로그인해 주세요." });
    const u = { empNo: no, name: nm, pass: hashPassword(pw), look: null, createdAt: new Date().toISOString(), lastLogin: new Date().toISOString() };
    users.set(no, u);
    pushNews("👋", `${nm}님이 메타버스에 처음 들어왔어요. 환영해요!`);
    await saveUser(u);
    console.log(`[회원가입] ${nm} (${no})`);
    reply({ ok: true, token: makeToken(no), user: userPublic(u) });
  });
  socket.on("login", async ({ empNo, password } = {}, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    if (authFails >= 5) return reply({ ok: false, message: "로그인 시도가 너무 많아요. 잠시 후 새로고침하고 다시 시도해 주세요." });
    const no = String(empNo ?? "").trim();
    const u = users.get(no);
    if (!u || !checkPassword(password, u.pass)) {
      authFails += 1;
      return reply({ ok: false, message: "사번 또는 비밀번호가 맞지 않아요." });
    }
    authFails = 0;
    u.lastLogin = new Date().toISOString();
    saveUser(u);
    reply({ ok: true, token: makeToken(no), user: userPublic(u) });
  });
  socket.on("session", (token, ack) => {
    const u = readToken(token);
    if (typeof ack === "function") ack(u ? { ok: true, user: userPublic(u) } : { ok: false });
  });

  socket.on("join", ({ name, key, look, resume, token } = {}, ack) => {
    if (players.has(socket.id)) return; // 중복 join 무시
    if (players.size >= MAX_PLAYERS) {
      const res = { ok: false, message: `정원(${MAX_PLAYERS}명)이 가득 찼습니다. 잠시 후 다시 시도해 주세요.` };
      if (typeof ack === "function") ack(res);
      socket.emit("joinRejected", res);
      return socket.disconnect(true);
    }
    const member = readToken(token); // 로그인한 임직원이면 회원 정보
    const player = {
      id: socket.id,
      // 회원은 사번 기준으로 기록 저장 (어느 기기에서든 이어짐), 방문자는 기기 기준
      key: member ? `emp:${member.empNo}` : clean(key, 64) || socket.id,
      name: member ? member.name : clean(name, 12) || `방문자_${socket.id.slice(0, 4)}`,
      empNo: member ? member.empNo : null,
      guest: !member,
      color: randomColor(),
      look: cleanLook(look), // 캐릭터 모양·가디건 색
      floor: START_FLOOR,
      position: [START_POSITION[0] + Math.random() * 1.6 - 0.8, 0, START_POSITION[2] + Math.random() * 0.6 - 0.3],
      rotationY: 0,
    };
    // 재연결·링크에서 돌아온 경우: 마지막 층·위치에서 이어서
    if (
      resume && FLOORS.includes(resume.floor) && Array.isArray(resume.position) && resume.position.length === 3 &&
      resume.position.every((v) => Number.isFinite(v) && Math.abs(v) < 80)
    ) {
      player.floor = resume.floor;
      player.position = [resume.position[0], 0, resume.position[2]];
      player.rotationY = Number.isFinite(resume.rotationY) ? resume.rotationY : 0;
    }
    if (member) player.equipped = { ...getWallet(member.empNo).equipped }; // 장착 아이템은 다른 사람에게도 보임
    if (member) player.quest = questTitle(getWallet(member.empNo)); // 진행 중 퀘스트 → 머리 위 표시
    players.set(socket.id, player);
    socket.join(player.floor);
    syncBuffs(player); // 남아 있는 아이템 효과 복원
    if (member && JSON.stringify(member.look) !== JSON.stringify(player.look)) {
      member.look = player.look; // 회원은 고른 캐릭터를 계정에 저장
      saveUser(member);
    }

    socket.emit("init", {
      me: publicPlayer(player),
      players: playersOnFloor(player.floor),
      treasures: treasuresFor(player.key),
      treasureMode: TREASURE_MODE,
      world: { floors: FLOORS, elevators: ELEVATORS, stairs: STAIRS },
      chatLog: chatLog(player.floor),
      inboxUnread: unreadCount(player.key),
    });
    socket.to(player.floor).emit("playerJoined", publicPlayer(player));
    if (typeof ack === "function") ack({ ok: true });
    console.log(`[입장] ${player.name}${member ? ` (${member.empNo})` : " (방문자)"} @${player.floor} (${players.size}/${MAX_PLAYERS})`);
  });

  // 2) 이동 → 같은 층에만 전달
  socket.on("move", ({ position, rotationY } = {}) => {
    const p = players.get(socket.id);
    if (!p || !Array.isArray(position) || position.length !== 3) return;
    if (!position.every(Number.isFinite)) return;
    p.position = position;
    p.rotationY = Number.isFinite(rotationY) ? rotationY : p.rotationY;
    socket.to(p.floor).volatile.emit("playerMoved", { id: socket.id, position, rotationY: p.rotationY });
  });

  // 3) 엘리베이터로 층 이동 (ack 로 새 층의 직원 목록·내 위치 응답)
  socket.on("changeFloor", (arg, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const floor = typeof arg === "object" && arg ? arg.floor : arg;
    const viaStairs = typeof arg === "object" && arg?.via === "stairs";
    const p = players.get(socket.id);
    if (!p) return reply({ ok: false, message: "먼저 입장해 주세요." });
    if (!FLOORS.includes(floor)) return reply({ ok: false, message: "없는 층입니다." });
    if (floor === p.floor) return reply({ ok: false, message: `이미 ${floor}에 있어요.` });
    // 엘리베이터 앞 또는 계단실 계단참 어디서든 이동 가능 (서 있는 곳으로 판단)
    const nearElev = dist2D(p.position, ELEVATORS[p.floor]) <= ELEVATOR_DISTANCE;
    const nearStairs = !!STAIRS[p.floor] && !!STAIRS[floor] && dist2D(p.position, STAIRS[p.floor]) <= STAIR_DISTANCE;
    if (!nearElev && !nearStairs) return reply({ ok: false, message: "엘리베이터 앞이나 계단실에서 이용해 주세요." });
    const useStairs = nearStairs && (viaStairs || !nearElev);

    const from = p.floor;
    socket.leave(from);
    socket.to(from).emit("playerLeft", socket.id);

    p.floor = floor;
    p.position = useStairs ? [...STAIRS[floor]] : elevatorExit(floor);
    socket.join(floor);
    socket.to(floor).emit("playerJoined", publicPlayer(p));

    reply({ ok: true, floor, position: p.position, players: playersOnFloor(floor), chatLog: chatLog(floor) });
    console.log(`[${useStairs ? "계단" : "엘리베이터"}] ${p.name} ${from} → ${floor}`);
  });

  // 3-2) 다트 게임 점수 → 최고 기록·랭킹 응답, 같은 층에 소식 알림
  socket.on("dartScore", (score, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const p = players.get(socket.id);
    if (!p) return reply({ ok: false, message: "먼저 입장해 주세요." });
    const s = Math.round(Number(score));
    if (!Number.isFinite(s) || s < 0 || s > DART_MAX) return reply({ ok: false, message: "점수가 올바르지 않아요." });
    if (p.floor !== DART_SPOT.floor || dist2D(p.position, DART_SPOT.position) > 3)
      return reply({ ok: false, message: "다트 머신 앞에서 해 주세요." });
    const prev = dartBest.get(p.key);
    const isBest = !prev || s > prev.score;
    if (isBest) dartBest.set(p.key, { name: p.name, score: s, at: Date.now() });
    else prev.name = p.name;
    const all = dartTop(Infinity);
    const mine = dartBest.get(p.key);
    reply({ ok: true, isBest, best: mine.score, rank: all.indexOf(mine) + 1, top: all.slice(0, 10) });
    socket.to(p.floor).emit("dartNews", { name: p.name, score: s });
    questEvent(p, { kind: "dart", score: s });
    console.log(`[다트] ${p.name} ${s}점${isBest ? " (최고 기록)" : ""}`);
  });

  // 3-3) NPC 에게 메시지 남기기 / 공개 메시지 보기
  let lastMsgAt = 0;
  socket.on("npcMessage", ({ npcId, npcName, text, isPublic } = {}, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const p = players.get(socket.id);
    if (!p) return reply({ ok: false, message: "먼저 입장해 주세요." });
    const id = clean(npcId, 64);
    const body = clean(text, MSG_MAX_LEN);
    if (!id || !body) return reply({ ok: false, message: "메시지를 입력해 주세요." });
    if (Date.now() - lastMsgAt < 5000) return reply({ ok: false, message: "조금 뒤에 다시 남겨 주세요. (5초에 한 번)" });
    lastMsgAt = Date.now();
    const m = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      npcId: id, npcName: clean(npcName, 40) || id, floor: p.floor,
      from: p.guest ? `${p.name}(방문자)` : p.name, empNo: p.empNo || "", key: p.key,
      text: body, isPublic: isPublic !== false, at: new Date().toISOString(),
    };
    addMessage(m);
    if (db) db.collection("npcMessages").doc(m.id).set(m).catch((e) => console.error("메시지 저장 실패:", e.message));
    console.log(`[메시지] ${m.from} → ${m.npcName}${m.isPublic ? "" : " (비공개)"}: ${m.text}`);
    reply({ ok: true, messages: publicMessages(id) });
    questEvent(p, { kind: "message", npcId: id });
  });
  // 내 메시지함 열기 → 목록 응답, 답장은 읽음 처리
  socket.on("myMessages", (_, ack) => {
    const p = players.get(socket.id);
    if (typeof ack !== "function") return;
    if (!p) return ack({ ok: false, items: [] });
    const list = myMessages(p.key);
    const items = list.map((m) => ({
      id: m.id, npcName: m.npcName, floor: m.floor, text: m.text, isPublic: m.isPublic, at: m.at,
      reply: m.reply || "", replyAt: m.replyAt || "", unread: !!(m.reply && !m.replyRead),
    }));
    for (const m of list)
      if (m.reply && !m.replyRead) {
        m.replyRead = true;
        if (db) db.collection("npcMessages").doc(m.id).set(m).catch(() => {});
      }
    ack({ ok: true, items, guest: !!p.guest });
  });
  socket.on("npcMessages", (npcId, ack) => {
    if (typeof ack === "function") ack({ ok: true, messages: publicMessages(clean(npcId, 64)) });
  });

  // 3-0000) 📞 반응속도 · 💗 공감 응대 · 🏆 랭킹
  const member = (reply) => {
    const p = players.get(socket.id);
    if (!p) return reply({ ok: false, message: "입장 후 이용해 주세요." }), null;
    if (p.guest || !p.empNo) return reply({ ok: false, message: "회원가입한 임직원만 할 수 있어요." }), null;
    return p;
  };
  const saveGame = (col, arr, g) => {
    arr.push(g);
    if (db) db.collection(col).doc(g.id).set(g).catch((e) => console.error(`${col} 저장 실패:`, e.message));
  };
  const gid = () => `${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
  let reaction = null;
  socket.on("reactionStart", ({ npcId, npcName } = {}, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const p = member(reply);
    if (!p) return;
    const delays = Array.from({ length: REACTION_CALLS }, () => 1200 + crypto.randomInt(2600)); // 벨이 울리기까지 1.2~3.8초
    reaction = { npcId: clean(npcId, 60), npcName: clean(npcName, 30) || "NPC", delays, startedAt: Date.now() };
    reply({ ok: true, delays, stats: reactionStats(p.empNo) });
  });
  socket.on("reactionSubmit", ({ times, falseStarts } = {}, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const p = member(reply);
    if (!p) return;
    if (!reaction) return reply({ ok: false, message: "새 게임을 시작해 주세요." });
    const fs = Math.max(0, Math.min(20, Number(falseStarts) || 0));
    const ok = Array.isArray(times) && times.length === REACTION_CALLS && times.every((t) => Number.isFinite(t) && t >= 80 && t <= 3000);
    const minElapsed = reaction.delays.reduce((a, b) => a + b, 0) + (ok ? times.reduce((a, b) => a + b, 0) : 0) - 400;
    if (!ok || Date.now() - reaction.startedAt < minElapsed) {
      reaction = null;
      return reply({ ok: false, message: "기록이 올바르지 않아요. 다시 도전해 주세요." });
    }
    const t = times.map((x) => Math.round(x));
    const avg = Math.round((t.reduce((a, b) => a + b, 0) + fs * FALSE_START_PENALTY) / REACTION_CALLS);
    const g = { id: gid(), empNo: p.empNo, name: p.name, npcId: reaction.npcId, npcName: reaction.npcName, floor: p.floor, times: t, falseStarts: fs, avg, fastest: Math.min(...t), at: new Date().toISOString() };
    saveGame("reactionGames", reactionGames, g);
    awardGame(p, "reaction", g);
    console.log(`[반응속도] ${p.name}(${p.empNo}) 평균 ${avg}ms (부정출발 ${fs})`);
    reaction = null;
    reply({ ok: true, avg, fastest: g.fastest, falseStarts: fs, stats: reactionStats(p.empNo) });
  });

  // 🃏 카드 짝맞추기: 4×4 (8쌍), 카드 배치는 서버에만 → 한 장씩 뒤집을 때마다 그림을 알려 줌
  let memory = null;
  socket.on("memoryStart", ({ npcId, npcName } = {}, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const p = member(reply);
    if (!p) return;
    const deck = [...MEMORY_CARDS, ...MEMORY_CARDS];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    memory = { npcId: clean(npcId, 60), npcName: clean(npcName, 30) || "NPC", deck, matched: new Set(), open: null, moves: 0, startAt: null };
    reply({ ok: true, size: deck.length, stats: memoryStats(p.empNo) });
  });
  socket.on("memoryFlip", ({ i } = {}, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const p = member(reply);
    if (!p) return;
    if (!memory) return reply({ ok: false, message: "새 게임을 시작해 주세요." });
    if (!Number.isInteger(i) || i < 0 || i >= memory.deck.length || memory.matched.has(i) || memory.open === i) return reply({ ok: false, message: "다른 카드를 골라 주세요." });
    const nowF = Date.now();
    if (memory.lastFlip && nowF - memory.lastFlip < 150) return reply({ ok: false, message: "너무 빨라요! 천천히 뒤집어 주세요." }); // 매크로 방지
    memory.lastFlip = nowF;
    if (!memory.startAt) memory.startAt = nowF; // 첫 카드를 뒤집는 순간부터 시간 잼
    const symbol = memory.deck[i];
    if (memory.open === null) {
      memory.open = i;
      return reply({ ok: true, symbol, first: true });
    }
    const j = memory.open;
    memory.open = null;
    memory.moves += 1;
    const match = memory.deck[j] === symbol;
    if (match) {
      memory.matched.add(i);
      memory.matched.add(j);
    }
    if (memory.matched.size < memory.deck.length) return reply({ ok: true, symbol, first: false, match, pair: j, moves: memory.moves });
    const seconds = Math.round((Date.now() - memory.startAt) / 100) / 10;
    const g = { id: gid(), empNo: p.empNo, name: p.name, npcId: memory.npcId, npcName: memory.npcName, floor: p.floor, seconds, moves: memory.moves, at: new Date().toISOString() };
    saveGame("memoryGames", memoryGames, g);
    awardGame(p, "memory", g);
    console.log(`[짝맞추기] ${p.name}(${p.empNo}) ${seconds}초 · ${memory.moves}번`);
    memory = null;
    reply({ ok: true, symbol, first: false, match, pair: j, moves: g.moves, done: true, seconds, stats: memoryStats(p.empNo) });
  });

  // ⚾ 숫자야구: 서로 다른 숫자 3개(0~9), 10번 안에 맞히기
  let baseball = null;
  socket.on("baseballStart", ({ npcId, npcName } = {}, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const p = member(reply);
    if (!p) return;
    const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const secret = [];
    while (secret.length < 3) secret.push(digits.splice(crypto.randomInt(digits.length), 1)[0]);
    baseball = { npcId: clean(npcId, 60), npcName: clean(npcName, 30) || "NPC", secret: secret.join(""), guesses: [] };
    reply({ ok: true, max: BASEBALL_MAX, stats: baseballStats(p.empNo) });
  });
  socket.on("baseballGuess", ({ guess } = {}, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const p = member(reply);
    if (!p) return;
    if (!baseball) return reply({ ok: false, message: "새 게임을 시작해 주세요." });
    const gs = String(guess ?? "");
    if (!/^\d{3}$/.test(gs) || new Set(gs).size !== 3) return reply({ ok: false, message: "서로 다른 숫자 3개를 입력해 주세요." });
    const sec = baseball.secret;
    let strike = 0, ball = 0;
    for (let i = 0; i < 3; i++) {
      if (gs[i] === sec[i]) strike++;
      else if (sec.includes(gs[i])) ball++;
    }
    baseball.guesses.push(gs);
    const tries = baseball.guesses.length;
    const success = strike === 3;
    if (!success && tries < BASEBALL_MAX) return reply({ ok: true, strike, ball, tries, done: false });
    const g = { id: gid(), empNo: p.empNo, name: p.name, npcId: baseball.npcId, npcName: baseball.npcName, floor: p.floor, success, tries, secret: sec, guesses: baseball.guesses, at: new Date().toISOString() };
    saveGame("baseballGames", baseballGames, g);
    awardGame(p, "baseball", g);
    console.log(`[숫자야구] ${p.name}(${p.empNo}) ${success ? `${tries}번 만에 성공` : "실패"}`);
    baseball = null;
    reply({ ok: true, strike, ball, tries, done: true, success, secret: sec, stats: baseballStats(p.empNo) });
  });

  let empathy = null;
  socket.on("empathyStart", ({ npcId, npcName } = {}, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const p = member(reply);
    if (!p) return;
    const pool = [...EMPATHY_QUESTIONS];
    const qs = [];
    while (qs.length < EMPATHY_COUNT && pool.length) qs.push(pool.splice(crypto.randomInt(pool.length), 1)[0]);
    // 보기 순서를 섞고 A/B/C 로만 보냄 (정답 종류는 서버에만)
    const questions = qs.map((q) => {
      const kinds = ["best", "ok", "bad"];
      for (let i = kinds.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
      }
      return { q, kinds };
    });
    empathy = { npcId: clean(npcId, 60), npcName: clean(npcName, 30) || "NPC", questions, idx: 0, score: 0, answers: [] };
    reply({ ok: true, questions: questions.map(({ q, kinds }) => ({ id: q.id, customer: q.customer, options: kinds.map((k) => q.options[k]) })), stats: empathyStats(p.empNo) });
  });
  socket.on("empathyAnswer", ({ pick } = {}, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const p = member(reply);
    if (!p) return;
    if (!empathy || empathy.idx >= empathy.questions.length) return reply({ ok: false, message: "새 게임을 시작해 주세요." });
    if (![0, 1, 2].includes(pick)) return reply({ ok: false, message: "보기를 골라 주세요." });
    const { q, kinds } = empathy.questions[empathy.idx];
    const kind = kinds[pick];
    const points = EMPATHY_POINTS[kind];
    empathy.score += points;
    empathy.answers.push({ q: q.id, pick: kind });
    empathy.idx += 1;
    const base = { ok: true, kind, points, best: kinds.indexOf("best"), why: q.why, score: empathy.score };
    if (empathy.idx < empathy.questions.length) return reply({ ...base, done: false });
    const g = { id: gid(), empNo: p.empNo, name: p.name, npcId: empathy.npcId, npcName: empathy.npcName, floor: p.floor, score: empathy.score, bestCount: empathy.answers.filter((a) => a.pick === "best").length, answers: empathy.answers, at: new Date().toISOString() };
    saveGame("empathyGames", empathyGames, g);
    awardGame(p, "empathy", g);
    console.log(`[공감응대] ${p.name}(${p.empNo}) ${g.score}점`);
    empathy = null;
    reply({ ...base, done: true, stats: empathyStats(p.empNo) });
  });

  socket.on("rankings", ({ period } = {}, ack) => {
    const p = players.get(socket.id);
    if (typeof ack === "function") ack({ ok: true, period: period === "week" ? "week" : "all", data: buildRankings(period === "week" ? "week" : "all", p?.empNo || null) });
  });

  // 3-000) 야바위 (회원만) — 3판 진행 상태
  let shell = null;
  socket.on("shellStart", ({ npcId, npcName } = {}, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const p = players.get(socket.id);
    if (!p) return reply({ ok: false, message: "입장 후 이용해 주세요." });
    if (p.guest || !p.empNo) return reply({ ok: false, message: "야바위 게임은 회원가입한 임직원만 할 수 있어요." });
    shell = { npcId: clean(npcId, 60), npcName: clean(npcName, 30) || "NPC", round: 0, results: [], answer: null };
    reply({ ok: true, rounds: SHELL_LEVELS.length, stats: shellStats(p.empNo) });
  });
  socket.on("shellRound", (_, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    if (!shell || shell.round >= SHELL_LEVELS.length) return reply({ ok: false, message: "새 게임을 시작해 주세요." });
    const lv = SHELL_LEVELS[shell.round];
    const start = crypto.randomInt(3);
    const swaps = [];
    let pos = start;
    for (let i = 0; i < lv.swaps; i++) {
      const a = crypto.randomInt(3);
      const b = (a + 1 + crypto.randomInt(2)) % 3;
      swaps.push([a, b]);
      if (pos === a) pos = b;
      else if (pos === b) pos = a;
    }
    shell.answer = pos;
    shell.openAt = Date.now() + 1500 + lv.swaps * lv.ms * 0.9; // 섞기가 끝나기 전엔 못 고름
    reply({ ok: true, round: shell.round + 1, label: lv.label, start, swaps, ms: lv.ms });
  });
  socket.on("shellPick", ({ cup } = {}, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const p = players.get(socket.id);
    if (!p || !p.empNo || !shell || shell.answer === null) return reply({ ok: false, message: "새 게임을 시작해 주세요." });
    if (![0, 1, 2].includes(cup)) return reply({ ok: false, message: "컵을 골라 주세요." });
    if (Date.now() < shell.openAt) return reply({ ok: false, message: "아직 섞는 중이에요!" });
    const correct = cup === shell.answer;
    const answer = shell.answer;
    shell.results.push(correct);
    shell.round += 1;
    shell.answer = null;
    if (shell.round < SHELL_LEVELS.length) return reply({ ok: true, correct, answer, done: false });
    const score = shell.results.filter(Boolean).length;
    const g = {
      id: `${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`, empNo: p.empNo, name: p.name,
      npcId: shell.npcId, npcName: shell.npcName, floor: p.floor, rounds: shell.results, score, at: new Date().toISOString(),
    };
    shellGames.push(g);
    if (db) db.collection("shellGames").doc(g.id).set(g).catch((e) => console.error("야바위 저장 실패:", e.message));
    awardGame(p, "shell", g);
    console.log(`[야바위] ${p.name}(${p.empNo}) ${g.rounds.map((r) => (r ? "O" : "X")).join("")} → ${score}/3`);
    shell = null;
    reply({ ok: true, correct, answer, done: true, score, stats: shellStats(p.empNo) });
  });

  // 3-00) 오목 (회원만) — 이 접속의 진행 중인 판
  let omok = null;
  socket.on("omokStart", ({ npcId, npcName } = {}, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const p = players.get(socket.id);
    if (!p) return reply({ ok: false, message: "입장 후 이용해 주세요." });
    if (p.guest || !p.empNo) return reply({ ok: false, message: "오목 대결은 회원가입한 임직원만 할 수 있어요." });
    omok = { board: emptyBoard(), moves: [], npcId: clean(npcId, 60), npcName: clean(npcName, 30) || "NPC", startAt: new Date().toISOString(), last: 0 };
    reply({ ok: true, size: OMOK_N, stats: omokStats(p.empNo) });
  });
  socket.on("omokMove", ({ x, y } = {}, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const p = players.get(socket.id);
    if (!p || !p.empNo || !omok) return reply({ ok: false, message: "새 게임을 시작해 주세요." });
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= OMOK_N || y >= OMOK_N) return reply({ ok: false, message: "판 안에 두어 주세요." });
    if (omok.board[y][x]) return reply({ ok: false, message: "이미 돌이 있는 자리예요." });
    const now = Date.now();
    if (now - omok.last < 250) return reply({ ok: false, message: "조금만 천천히!" });
    omok.last = now;
    const b = omok.board;
    b[y][x] = 1;
    omok.moves.push({ c: 1, x, y });
    const done = (result, ai = null) => {
      const stats = finishOmok(p, omok, result);
      omok = null;
      const lines = OMOK_LINES[result];
      return reply({ ok: true, ai, result, message: lines[crypto.randomInt(lines.length)], stats });
    };
    if (isWin(b, x, y, 1)) return done("win");
    if (omok.moves.length >= OMOK_N * OMOK_N) return done("draw");
    const [ax, ay] = aiMove(b, 2, 1);
    b[ay][ax] = 2;
    omok.moves.push({ c: 2, x: ax, y: ay });
    if (isWin(b, ax, ay, 2)) return done("lose", { x: ax, y: ay });
    if (omok.moves.length >= OMOK_N * OMOK_N) return done("draw", { x: ax, y: ay });
    reply({ ok: true, ai: { x: ax, y: ay }, result: null });
  });
  socket.on("omokResign", (_, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const p = players.get(socket.id);
    if (!p || !p.empNo || !omok) return reply({ ok: false });
    if (!omok.moves.length) {
      omok = null;
      return reply({ ok: true, stats: omokStats(p.empNo) });
    }
    const stats = finishOmok(p, omok, "lose", true);
    omok = null;
    reply({ ok: true, result: "lose", stats });
  });

  // 3-0) 가위바위보 (회원만) → 결과 기록
  let lastRps = 0;
  socket.on("rps", async ({ npcId, npcName, choice } = {}, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const p = players.get(socket.id);
    if (!p) return reply({ ok: false, message: "입장 후 이용해 주세요." });
    if (p.guest || !p.empNo) return reply({ ok: false, message: "가위바위보는 회원가입한 임직원만 할 수 있어요." });
    if (!RPS.includes(choice)) return reply({ ok: false, message: "가위·바위·보 중에 골라 주세요." });
    const now = Date.now();
    if (now - lastRps < 1200) return reply({ ok: false, message: "조금만 천천히! 잠시 후 다시 내 주세요." });
    lastRps = now;
    const npc = RPS[crypto.randomInt(3)];
    const result = rpsJudge(choice, npc);
    const g = {
      id: `${now.toString(36)}_${crypto.randomBytes(3).toString("hex")}`, empNo: p.empNo, name: p.name,
      npcId: clean(npcId, 60), npcName: clean(npcName, 30) || "NPC", floor: p.floor,
      player: choice, npc, result, at: new Date(now).toISOString(),
    };
    rpsGames.push(g);
    if (db) db.collection("rpsGames").doc(g.id).set(g).catch((e) => console.error("가위바위보 저장 실패:", e.message));
    awardGame(p, "rps", g);
    const lines = RPS_LINES[result];
    console.log(`[가위바위보] ${p.name}(${p.empNo}) ${RPS_KO[choice]} vs ${g.npcName} ${RPS_KO[npc]} → ${RESULT_KO[result]}`);
    reply({ ok: true, npc, result, message: lines[crypto.randomInt(lines.length)], stats: rpsStats(p.empNo) });
  });
  socket.on("rpsStats", (_, ack) => {
    const p = players.get(socket.id);
    if (typeof ack === "function") ack(p && p.empNo ? { ok: true, stats: rpsStats(p.empNo) } : { ok: false });
  });

  // 3-1) 동작(손 흔들기·하이파이브·박수·엄지척·춤·종이비행기) → 같은 층 다른 사람에게 이름만 전달
  const ACTION_TYPES = new Set(["wave", "highfive", "clap", "thumbs", "dance", "plane"]);
  let lastAction = 0;
  socket.on("action", (type) => {
    const p = players.get(socket.id);
    const now = Date.now();
    if (!p || !ACTION_TYPES.has(type) || now - lastAction < 600) return; // 연타 방지
    lastAction = now;
    socket.to(p.floor).emit("action", { id: socket.id, type });
  });

  // 4) 채팅 → 같은 층
  socket.on("chat", (text) => {
    const p = players.get(socket.id);
    const msg = clean(text, 80);
    if (!p || !msg) return;
    const line = { id: socket.id, name: p.guest ? `${p.name}(방문자)` : p.name, text: msg, at: Date.now() };
    const log = floorChat.get(p.floor) || [];
    log.push(line);
    if (log.length > CHAT_KEEP) log.splice(0, log.length - CHAT_KEEP);
    floorChat.set(p.floor, log);
    io.to(p.floor).emit("chat", line);
  });

  // 5) 보물 획득 요청 → 서버 검증 → 콜백으로 결과 응답
  // 🛒 아이템 상점 (회원 전용) — 포인트·가방·장착은 모두 서버가 관리
  socket.on("newsInfo", (_, ack) => {
    if (typeof ack === "function") ack({ ok: true, feed: newsFeed, champs: weeklyChamps() });
  });
  socket.on("questInfo", (_, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const p = member(reply);
    if (!p) return;
    reply({ ok: true, ...questView(getWallet(p.empNo)) });
  });
  socket.on("questStart", (id, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const p = member(reply);
    if (!p) return;
    const q = QUEST_BY_ID[id];
    const w = getWallet(p.empNo);
    if (!q) return reply({ ok: false, message: "없는 퀘스트예요." });
    if (p.floor !== QUEST_GIVER.floor || dist2D(p.position, QUEST_GIVER.position) > QUEST_GIVER.range)
      return reply({ ok: false, message: "1층 김지연 센터장님 앞에서 받을 수 있어요." });
    if (w.questsDone?.[q.id]) return reply({ ok: false, message: "이미 완료한 퀘스트예요." });
    if (w.quest && QUEST_BY_ID[w.quest.id]) return reply({ ok: false, message: `지금 [${QUEST_BY_ID[w.quest.id].title}] 퀘스트를 하고 있어요. 한 번에 1개만 할 수 있어요.` });
    w.quest = { id: q.id, startedAt: new Date().toISOString(), progress: [] };
    saveWallet(w);
    setPlayerQuest(p, q.title);
    console.log(`[퀘스트] ${p.name}(${p.empNo}) 시작 → ${q.title}`);
    reply({ ok: true, message: `[${q.title}] 퀘스트를 시작했어요! ${q.goal}`, ...questView(w) });
  });
  socket.on("questCancel", (_, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const p = member(reply);
    if (!p) return;
    const w = getWallet(p.empNo);
    if (!w.quest) return reply({ ok: false, message: "진행 중인 퀘스트가 없어요." });
    const t = questTitle(w);
    w.quest = null;
    saveWallet(w);
    setPlayerQuest(p, null);
    reply({ ok: true, message: `[${t}] 퀘스트를 그만뒀어요. 다시 받으면 처음부터 시작해요.`, ...questView(w) });
  });
  socket.on("shopInfo", (_, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const p = member(reply);
    if (!p) return;
    reply({ ok: true, catalog: Object.values(ITEM_CATALOG), wallet: walletView(getWallet(p.empNo)) });
  });
  let lastShop = 0;
  const shopGuard = (reply) => {
    const p = member(reply);
    if (!p) return null;
    const now = Date.now();
    if (now - lastShop < 300) return reply({ ok: false, message: "조금만 천천히!" }), null;
    lastShop = now;
    return p;
  };
  const sendEquip = (p) => io.to(p.floor).emit("playerEquip", { id: p.id, equipped: p.equipped });
  socket.on("buyItem", (itemId, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const p = shopGuard(reply);
    if (!p) return;
    const item = ITEM_CATALOG[itemId];
    if (!item) return reply({ ok: false, message: "없는 아이템이에요." });
    const w = getWallet(p.empNo);
    if (item.type === "equipment" && (w.bag[itemId] || 0) >= 1) return reply({ ok: false, message: "이미 가지고 있는 장착 아이템이에요." });
    if ((w.bag[itemId] || 0) >= 99) return reply({ ok: false, message: "가방에 더 넣을 수 없어요 (최대 99개)." });
    if (w.points < item.buyPrice) return reply({ ok: false, message: `포인트가 부족해요! (보유 ${w.points}P / 필요 ${item.buyPrice}P)` });
    w.points -= item.buyPrice;
    w.bag[itemId] = (w.bag[itemId] || 0) + 1;
    saveWallet(w);
    console.log(`[상점] ${p.name}(${p.empNo}) 구매 ${item.name} -${item.buyPrice}P → ${w.points}P`);
    reply({ ok: true, wallet: walletView(w), message: `🛒 ${item.name} 구매 완료! (-${item.buyPrice}P)` });
  });
  socket.on("sellItem", (itemId, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const p = shopGuard(reply);
    if (!p) return;
    const item = ITEM_CATALOG[itemId];
    const w = getWallet(p.empNo);
    if (!item || !(w.bag[itemId] > 0)) return reply({ ok: false, message: "가지고 있지 않은 아이템이에요." });
    if (item.type === "equipment" && w.equipped[item.slot] === itemId) {
      w.equipped[item.slot] = null;
      p.equipped = { ...w.equipped };
      sendEquip(p);
    }
    w.bag[itemId] -= 1;
    if (w.bag[itemId] <= 0) delete w.bag[itemId];
    w.points += item.sellPrice;
    saveWallet(w);
    console.log(`[상점] ${p.name}(${p.empNo}) 판매 ${item.name} +${item.sellPrice}P → ${w.points}P`);
    reply({ ok: true, wallet: walletView(w), message: `💰 ${item.name} 판매 완료! (+${item.sellPrice}P)` });
  });
  socket.on("useItem", (itemId, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const p = shopGuard(reply);
    if (!p) return;
    const item = ITEM_CATALOG[itemId];
    const w = getWallet(p.empNo);
    if (!item || !(w.bag[itemId] > 0)) return reply({ ok: false, message: "사용할 아이템이 없어요." });
    // (A) 장착 아이템: 장착 ↔ 해제
    if (item.type === "equipment") {
      const on = w.equipped[item.slot] === itemId;
      w.equipped[item.slot] = on ? null : itemId;
      p.equipped = { ...w.equipped };
      saveWallet(w);
      sendEquip(p);
      return reply({ ok: true, wallet: walletView(w), message: on ? `${item.name} 장착을 풀었어요.` : `✨ ${item.name} 장착 완료!` });
    }
    w.bag[itemId] -= 1;
    if (w.bag[itemId] <= 0) delete w.bag[itemId];
    // (B) 럭키 다트 티켓 → 당첨 점수는 다트 퀘스트 점수로도 인정
    if (item.type === "gacha") {
      const prize = drawDart(crypto.randomInt);
      w.points += prize;
      saveWallet(w);
      console.log(`[상점] ${p.name}(${p.empNo}) 다트 티켓 → ${prize}P`);
      reply({ ok: true, wallet: walletView(w), prize, message: `🎯 불스아이! ${prize}P 당첨!` });
      questEvent(p, { kind: "dart", score: prize });
      return;
    }
    // (C) 소모품: 끝나는 시각을 지갑에 저장 (같은 효과를 또 쓰면 지금부터 다시 계산)
    const now = Date.now();
    const b = (w.buffs ||= {});
    if (item.effect === "SPEED_BOOST") b.coffee = now + item.duration;
    if (item.effect === "RADAR_SCAN") b.radar = now + item.duration;
    if (item.effect === "AURA_EMOJI") {
      b.wave = now + item.duration; // 민트빛 파동 1시간
      b.refresh = nextKstMidnight(now); // '상쾌함 충전!' 오늘 자정까지
    }
    saveWallet(w);
    syncBuffs(p);
    const len = item.duration >= 3600000 ? `${item.duration / 3600000}시간` : `${item.duration / 60000}분`;
    reply({ ok: true, wallet: walletView(w), buff: { effect: item.effect, duration: item.duration }, message: `⚡ ${item.name} 사용! (${len})` });
  });

  socket.on("claimTreasure", async (treasureId, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const player = players.get(socket.id);
    const item = treasures[treasureId];

    if (!player) return reply({ success: false, message: "먼저 입장해 주세요." });
    if (!item) return reply({ success: false, message: "존재하지 않는 보물입니다." });
    if (player.floor !== item.floor || dist2D(player.position, item.position) > CLAIM_DISTANCE + (player.equipped?.pet ? 1.2 : 0))
      return reply({ success: false, message: "보물에 더 가까이 가야 해요!" });
    if (item.hidden && !(player.radarUntil > Date.now()))
      return reply({ success: false, message: "U+ 5G 보물 위치 스캐너를 켜야 보이는 보물이에요!" });

    const lockKey = TREASURE_MODE === "first" ? treasureId : `${treasureId}:${player.key}`;
    if (claimLocks.has(lockKey)) return reply({ success: false, message: "처리 중입니다. 잠시만요." });
    claimLocks.add(lockKey);
    try {
      const set = foundBy[treasureId];
      if (TREASURE_MODE === "first" && set.size > 0)
        return reply({ success: false, message: "아쉽! 다른 직원이 먼저 찾았어요." });
      if (set.has(player.key)) return reply({ success: false, message: "이미 획득한 보물입니다!" });

      await saveClaim(treasureId, player);
      set.add(player.key);
      let bonus = player.empNo ? addPoints(player, TREASURE_POINTS, `[${item.name}] 보물 발견`) : 0;
      const myCount = Object.values(foundBy).filter((s) => s.has(player.key)).length;
      const allFound = myCount === Object.keys(treasures).length;
      if (allFound && player.empNo) bonus += addPoints(player, TREASURE_ALL_BONUS, "이번 주 보물 10개 모두 발견 보너스");
      if (allFound) pushNews("🏆", `${newsName(player)}님이 이번 주 보물 ${myCount}개를 모두 찾았어요!`);
      pushNews("🎁", `${newsName(player)}님이 ${item.floor} [${item.name}] 보물을 찾았어요!`);

      reply({
        success: true,
        treasureId,
        itemName: item.name,
        message: `축하합니다! [${item.name}]을(를) 찾았습니다!${bonus ? ` (+${bonus}P)` : ""}${allFound ? `\n🏆 이번 주 보물을 모두 찾았어요!${player.empNo ? ` 보너스 +${TREASURE_ALL_BONUS}P` : ""}` : ""}`,
      });
      // 획득 알림은 전 층에 공지
      io.emit("treasureClaimed", {
        treasureId,
        name: player.name,
        itemName: item.name,
        foundCount: set.size,
        claimed: TREASURE_MODE === "first",
      });
      console.log(`[보물] ${player.name} → ${item.name}`);
    } catch (err) {
      if (err.alreadyClaimed) {
        foundBy[treasureId].add(player.key);
        return reply({
          success: false,
          message: TREASURE_MODE === "first" ? "아쉽! 다른 직원이 먼저 찾았어요." : "이미 획득한 보물입니다!",
        });
      }
      console.error("보물 저장 실패:", err);
      reply({ success: false, message: "저장 중 오류가 났어요. 다시 시도해 주세요." });
    } finally {
      claimLocks.delete(lockKey);
    }
  });

  // 6) 퇴장
  socket.on("disconnect", () => {
    const p = players.get(socket.id);
    if (!p) return;
    clearTimeout(p.buffTimer);
    players.delete(socket.id);
    io.to(p.floor).emit("playerLeft", socket.id);
    io.emit("onlineCount", players.size);
    console.log(`[퇴장] ${p.name} (${players.size}/${MAX_PLAYERS})`);
  });

  // 전체 접속자 수 (층 상관없이)
  socket.on("join", () => io.emit("onlineCount", players.size));
});

await initStorage();
function resetTreasuresIfNewWeek() {
  const start = treasureRoundStart();
  if (start === treasureRound) return;
  treasureRound = start;
  for (const set of Object.values(foundBy)) set.clear();
  claimLocks.clear();
  for (const [sid, p] of players) io.to(sid).emit("treasuresReset", { treasures: treasuresFor(p.key) });
  pushNews("🔄", "보물찾기가 초기화됐어요! 모든 보물이 다시 숨겨졌어요. 다시 찾아보세요!");
  console.log(`[보물] 주간 초기화 → ${roundId()} 회차`);
}
setInterval(resetTreasuresIfNewWeek, 30 * 1000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ 서버 실행: http://localhost:${PORT} (보물 모드: ${TREASURE_MODE}, 층: ${FLOORS.join("/")})`);
});
