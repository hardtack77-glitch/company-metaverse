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
  t1_coupon: { id: "t1_coupon", floor: "1F", name: "카페 쿠폰", position: [11.9, 0.5, 3.9] }, // 카페테리아 창가
  t1_headset: { id: "t1_headset", floor: "1F", name: "황금 헤드셋", position: [5.9, 0.5, -14.2] }, // 강사실 (가운데 빈 공간 동쪽)
  t6_ksqi: { id: "t6_ksqi", floor: "6F", name: "KSQI 인증패", position: [-15.4, 0.5, 10.25] },
  t6_dino: { id: "t6_dino", floor: "6F", name: "노란 공룡 인형", position: [-0.6, 0.5, 5.8] },
  t7_cushion: { id: "t7_cushion", floor: "7F", name: "빨간 하트 쿠션", position: [5.33, 0.5, -1.0] },
  t7_card: { id: "t7_card", floor: "7F", name: "상담실 에티켓 황금 사원증", position: [-8.9, 0.5, -5.3] }, // 중앙 기둥 옆 에티켓 보드
  t8_blanket: { id: "t8_blanket", floor: "8F", name: "수면실 포근한 담요", position: [4.2, 0.5, -12.0] }, // 수면실 안마의자 앞
  t8_remote: { id: "t8_remote", floor: "8F", name: "Clova TV 리모컨", position: [-0.6, 0.5, 6.6] }, // 출입구 왼쪽 TV 선반
  t9_marker: { id: "t9_marker", floor: "9F", name: "회의실 황금 마커", position: [-7.3, 0.5, 6.0] }, // 회의실 3
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

const COLORS = ["#e6007e", "#ff8a00", "#00a3e0", "#22b573", "#8e44ad", "#f1c40f", "#e74c3c", "#1abc9c"];
const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];
const LOOK_TYPES = ["male", "female_long", "female_short"];
const cleanLook = (look) => ({
  type: LOOK_TYPES.includes(look?.type) ? look.type : "male",
  outfit: /^#[0-9a-f]{6}$/i.test(look?.outfit || "") ? look.outfit : "#2f5fb3",
});
const clean = (s, max) => String(s ?? "").replace(/[<>]/g, "").trim().slice(0, max);
const dist2D = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const publicPlayer = ({ key, empNo, ...p }) => p; // 고유키·사번은 다른 사람에게 보내지 않음
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
<body><h1>${title} (${list.length}회)</h1><p><a href="?key=${k}&format=csv">엑셀(CSV)로 받기</a> · <a href="/admin/rps?key=${k}">✊ 가위바위보</a> · <a href="/admin/omok?key=${k}">⚫ 오목</a> · <a href="/admin/shell?key=${k}">🥤 야바위</a> · <a href="/admin/reaction?key=${k}">📞 반응속도</a> · <a href="/admin/empathy?key=${k}">💗 공감응대</a></p>
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
    .map((u) => `<tr><td>${u.empNo}</td><td>${escapeHtml(u.name)}</td><td>${fmt(u.createdAt)}</td><td>${fmt(u.lastLogin)}</td>
      <td><a href="?key=${k}&delete=${u.empNo}" onclick="return confirm('${escapeHtml(u.name)}(${u.empNo}) 회원을 삭제할까요? (비밀번호를 잊은 경우 삭제 후 다시 가입)')">삭제</a></td></tr>`)
    .join("");
  res.send(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>회원 목록</title>
<style>body{font-family:system-ui,sans-serif;margin:16px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f5f5f5}</style></head>
<body><h1>👥 회원(내부 임직원) ${users.size}명</h1>${note}<p><a href="/admin/messages?key=${k}">💌 메시지함 보기</a></p>
<table><tr><th>사번</th><th>이름</th><th>가입일</th><th>마지막 로그인</th><th></th></tr>${rows || "<tr><td colspan=5>아직 가입한 사람이 없어요.</td></tr>"}</table></body></html>`);
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
    const snap = await db.collection("treasureClaims").get();
    snap.forEach((doc) => {
      const { treasureId, key } = doc.data();
      if (foundBy[treasureId] && key) foundBy[treasureId].add(key);
    });
    console.log(`✅ 보물 기록: Firestore 연결 (기존 기록 ${snap.size}건 복원)`);
    for (const [col, arr] of [["reactionGames", reactionGames], ["empathyGames", empathyGames]]) {
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
  const docId = TREASURE_MODE === "first" ? treasureId : `${treasureId}_${player.key}`;
  try {
    await db.collection("treasureClaims").doc(docId).create({
      treasureId,
      key: player.key,
      name: player.name,
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
    if (users.has(no)) return reply({ ok: false, message: "이미 가입된 사번이에요. 로그인해 주세요." });
    const u = { empNo: no, name: nm, pass: hashPassword(pw), look: null, createdAt: new Date().toISOString(), lastLogin: new Date().toISOString() };
    users.set(no, u);
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
    players.set(socket.id, player);
    socket.join(player.floor);
    if (member && JSON.stringify(member.look) !== JSON.stringify(player.look)) {
      member.look = player.look; // 회원은 고른 캐릭터를 계정에 저장
      saveUser(member);
    }

    socket.emit("init", {
      me: publicPlayer(player),
      players: playersOnFloor(player.floor),
      treasures: treasuresFor(player.key),
      treasureMode: TREASURE_MODE,
      world: { floors: FLOORS, elevators: ELEVATORS },
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
  socket.on("changeFloor", (floor, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const p = players.get(socket.id);
    if (!p) return reply({ ok: false, message: "먼저 입장해 주세요." });
    if (!FLOORS.includes(floor)) return reply({ ok: false, message: "없는 층입니다." });
    if (floor === p.floor) return reply({ ok: false, message: `이미 ${floor}에 있어요.` });
    if (dist2D(p.position, ELEVATORS[p.floor]) > ELEVATOR_DISTANCE)
      return reply({ ok: false, message: "엘리베이터 앞에서 이용해 주세요." });

    const from = p.floor;
    socket.leave(from);
    socket.to(from).emit("playerLeft", socket.id);

    p.floor = floor;
    p.position = elevatorExit(floor);
    socket.join(floor);
    socket.to(floor).emit("playerJoined", publicPlayer(p));

    reply({ ok: true, floor, position: p.position, players: playersOnFloor(floor), chatLog: chatLog(floor) });
    console.log(`[엘리베이터] ${p.name} ${from} → ${floor}`);
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
    console.log(`[반응속도] ${p.name}(${p.empNo}) 평균 ${avg}ms (부정출발 ${fs})`);
    reaction = null;
    reply({ ok: true, avg, fastest: g.fastest, falseStarts: fs, stats: reactionStats(p.empNo) });
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
  socket.on("claimTreasure", async (treasureId, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const player = players.get(socket.id);
    const item = treasures[treasureId];

    if (!player) return reply({ success: false, message: "먼저 입장해 주세요." });
    if (!item) return reply({ success: false, message: "존재하지 않는 보물입니다." });
    if (player.floor !== item.floor || dist2D(player.position, item.position) > CLAIM_DISTANCE)
      return reply({ success: false, message: "보물에 더 가까이 가야 해요!" });

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

      reply({
        success: true,
        treasureId,
        itemName: item.name,
        message: `축하합니다! [${item.name}]을(를) 찾았습니다!`,
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
    players.delete(socket.id);
    io.to(p.floor).emit("playerLeft", socket.id);
    io.emit("onlineCount", players.size);
    console.log(`[퇴장] ${p.name} (${players.size}/${MAX_PLAYERS})`);
  });

  // 전체 접속자 수 (층 상관없이)
  socket.on("join", () => io.emit("onlineCount", players.size));
});

await initStorage();
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ 서버 실행: http://localhost:${PORT} (보물 모드: ${TREASURE_MODE}, 층: ${FLOORS.join("/")})`);
});
