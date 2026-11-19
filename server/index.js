// 회사 메타버스 실시간 서버 (Node.js + Socket.IO)
// - 최대 50명 실시간 위치 공유 (같은 층끼리만 위치를 주고받아 트래픽 절약)
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 배포 시: client 를 빌드한 결과물(client/dist)을 이 서버가 같이 보내 줌 → 주소 하나로 접속
const CLIENT_DIST = path.resolve(__dirname, "../client/dist");

const PORT = process.env.PORT || 3001;
const MAX_PLAYERS = 50;
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
  t1_headset: { id: "t1_headset", floor: "1F", name: "황금 헤드셋", position: [12.4, 0.5, -16.3] }, // 강사실
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
  app.get(/^\/(?!socket\.io|health).*/, (_req, res) => res.sendFile(path.join(CLIENT_DIST, "index.html")));
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
const publicPlayer = ({ key, ...p }) => p; // 고유키는 다른 사람에게 보내지 않음
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
  socket.on("join", ({ name, key, look, resume } = {}, ack) => {
    if (players.has(socket.id)) return; // 중복 join 무시
    if (players.size >= MAX_PLAYERS) {
      const res = { ok: false, message: `정원(${MAX_PLAYERS}명)이 가득 찼습니다. 잠시 후 다시 시도해 주세요.` };
      if (typeof ack === "function") ack(res);
      socket.emit("joinRejected", res);
      return socket.disconnect(true);
    }
    const player = {
      id: socket.id,
      key: clean(key, 64) || socket.id,
      name: clean(name, 12) || `사원_${socket.id.slice(0, 4)}`,
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

    socket.emit("init", {
      me: publicPlayer(player),
      players: playersOnFloor(player.floor),
      treasures: treasuresFor(player.key),
      treasureMode: TREASURE_MODE,
      world: { floors: FLOORS, elevators: ELEVATORS },
    });
    socket.to(player.floor).emit("playerJoined", publicPlayer(player));
    if (typeof ack === "function") ack({ ok: true });
    console.log(`[입장] ${player.name} @${player.floor} (${players.size}/${MAX_PLAYERS})`);
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

    reply({ ok: true, floor, position: p.position, players: playersOnFloor(floor) });
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

  // 4) 채팅 → 같은 층
  socket.on("chat", (text) => {
    const p = players.get(socket.id);
    const msg = clean(text, 80);
    if (!p || !msg) return;
    io.to(p.floor).emit("chat", { id: socket.id, name: p.name, text: msg, at: Date.now() });
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
