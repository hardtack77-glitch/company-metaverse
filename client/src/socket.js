// Socket.IO 연결 설정
import { io } from "socket.io-client";

// 서버 주소: .env 의 VITE_SERVER_URL 이 있으면 그 주소 사용, 없으면
// - 배포(빌드) 버전: 화면을 보내 준 서버와 같은 주소로 연결 (Render 등)
// - 개발 중(npm run dev): 지금 주소의 3001 포트 서버로 연결
const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ||
  (import.meta.env.DEV ? `${window.location.protocol}//${window.location.hostname}:3001` : undefined);

export const socket = io(SERVER_URL, {
  autoConnect: false, // 이름 입력 후 연결
  transports: ["websocket", "polling"],
});

// 기기 고유키: 재접속해도 같은 사람으로 인식 → 보물 중복 획득 방지
function getPlayerKey() {
  let key = localStorage.getItem("cm_key");
  if (!key) {
    key = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/[^a-zA-Z0-9-]/g, "");
    localStorage.setItem("cm_key", key);
  }
  return key;
}

// 지금 내 층·위치 (다시 연결되거나 링크에서 돌아왔을 때 그 자리에서 이어서 하기)
const POSE_KEY = "cm_pose";
const pose = (() => {
  try {
    return JSON.parse(localStorage.getItem(POSE_KEY)) || {};
  } catch {
    return {};
  }
})();
let poseSavedAt = 0;
export function rememberPose(update) {
  Object.assign(pose, update);
  const now = Date.now();
  if (now - poseSavedAt > 1500) {
    poseSavedAt = now;
    try {
      localStorage.setItem(POSE_KEY, JSON.stringify(pose));
    } catch {
      /* 무시 */
    }
  }
}
const resumePayload = () => (pose.floor && pose.position ? { floor: pose.floor, position: pose.position, rotationY: pose.rotationY || 0 } : undefined);
// 이동 보내기 + 위치 기억
export function sendMove(position, rotationY) {
  socket.emit("move", { position, rotationY });
  rememberPose({ position, rotationY });
}
socket.on("init", ({ me } = {}) => me && rememberPose({ floor: me.floor, position: me.position }));

// 로그인 토큰 (회원 = 내부 임직원). 없으면 방문자(게스트)
const TOKEN_KEY = "cm_token";
let authToken = (() => {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
})();
export const getToken = () => authToken;
export function setToken(t) {
  authToken = t || "";
  try {
    if (authToken) localStorage.setItem(TOKEN_KEY, authToken);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 무시 */
  }
}

let lastName = "";
let lastLook = null; // { type, outfit } 캐릭터 모양·가디건 색
let resumeNext = false; // 다음 입장 때 마지막 자리에서 이어서 하기
let joinAsGuest = false; // 방문자로 입장하면 토큰을 보내지 않음
export function connectAs(name, look, { resume = false, guest = false } = {}) {
  lastName = name;
  lastLook = look || null;
  resumeNext = resume;
  joinAsGuest = guest;
  if (!socket.connected) socket.connect();
  else socket.emit("join", { name, key: getPlayerKey(), look: lastLook, resume: resume ? resumePayload() : undefined, token: guest ? undefined : authToken || undefined });
}
// 연결(재연결 포함)될 때마다 자동 입장 — 재연결이면 마지막 자리에서 이어서
let joinedOnce = false;
socket.on("connect", () => {
  if (!lastName) return;
  const resume = joinedOnce || resumeNext ? resumePayload() : undefined;
  socket.emit("join", { name: lastName, key: getPlayerKey(), look: lastLook, resume, token: joinAsGuest ? undefined : authToken || undefined });
  joinedOnce = true;
  resumeNext = false;
});

// 서버 응답(Acknowledgement)을 Promise 로 받기 — 5초 안에 응답 없으면 실패 처리
function request(event, payload, fallback) {
  return new Promise((resolve) => {
    socket.timeout(5000).emit(event, payload, (err, res) => resolve(err ? fallback : res));
  });
}

export const claimTreasure = (treasureId) =>
  request("claimTreasure", treasureId, { success: false, message: "서버 응답이 없어요. 다시 시도해 주세요." });

export const changeFloor = (floor) =>
  request("changeFloor", floor, { ok: false, message: "서버 응답이 없어요. 다시 시도해 주세요." });

// 다트 게임 점수 보내기 → { ok, isBest, best, rank, top: [{name, score}] }
export const submitDart = (score) =>
  request("dartScore", score, { ok: false, message: "서버 응답이 없어요. 랭킹은 다음에 다시 확인해 주세요." });

// NPC 에게 메시지 남기기 / 공개 메시지 보기 → { ok, messages: [{ from, text, at }] }
export const sendNpcMessage = (payload) =>
  request("npcMessage", payload, { ok: false, message: "서버 응답이 없어요. 잠시 후 다시 시도해 주세요." });
// 동작(손 흔들기·춤 등) — 동작 이름만 보냄
export const sendAction = (type) => socket.connected && socket.emit("action", type);
// 가위바위보 (회원만): choice = "rock" | "scissors" | "paper" → { ok, npc, result, stats, message }
export const playRps = (npcId, npcName, choice) => request("rps", { npcId, npcName, choice }, { ok: false, message: "서버 응답이 없어요. 다시 시도해 주세요." });
export const getRpsStats = () => request("rpsStats", null, { ok: false });
// 오목 (회원만): 서버가 판을 들고 있고 NPC 수도 서버가 둠
const OMOK_FAIL = { ok: false, message: "서버 응답이 없어요. 다시 시도해 주세요." };
export const omokStart = (npcId, npcName) => request("omokStart", { npcId, npcName }, OMOK_FAIL);
export const omokMove = (x, y) => request("omokMove", { x, y }, OMOK_FAIL);
export const omokResign = () => request("omokResign", null, OMOK_FAIL);
// 야바위 (회원만): 3판, 판마다 서버가 섞는 순서를 정하고 정답 확인·기록
export const shellStart = (npcId, npcName) => request("shellStart", { npcId, npcName }, OMOK_FAIL);
export const shellRound = () => request("shellRound", null, OMOK_FAIL);
export const shellPick = (cup) => request("shellPick", { cup }, OMOK_FAIL);
// 📞 반응속도 · 💗 공감 응대 · 🏆 랭킹
export const reactionStart = (npcId, npcName) => request("reactionStart", { npcId, npcName }, OMOK_FAIL);
export const reactionSubmit = (times, falseStarts) => request("reactionSubmit", { times, falseStarts }, OMOK_FAIL);
export const empathyStart = (npcId, npcName) => request("empathyStart", { npcId, npcName }, OMOK_FAIL);
export const empathyAnswer = (pick) => request("empathyAnswer", { pick }, OMOK_FAIL);
export const baseballStart = (npcId, npcName) => request("baseballStart", { npcId, npcName }, OMOK_FAIL);
export const baseballGuess = (guess) => request("baseballGuess", { guess }, OMOK_FAIL);
export const memoryStart = (npcId, npcName) => request("memoryStart", { npcId, npcName }, OMOK_FAIL);
export const memoryFlip = (i) => request("memoryFlip", { i }, OMOK_FAIL);
export const getRankings = (period) => request("rankings", { period }, OMOK_FAIL);
export const getMyMessages = () => request("myMessages", null, { ok: false, items: [] });
export const getNpcMessages = (npcId) => request("npcMessages", npcId, { ok: false, messages: [] });

// 회원가입·로그인은 입장 전에 서버와 연결해서 처리
function ensureConnected() {
  if (socket.connected) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (ok) => {
      clearTimeout(t);
      socket.off("connect", onOk);
      resolve(ok);
    };
    const onOk = () => done(true);
    const t = setTimeout(() => done(false), 8000);
    socket.once("connect", onOk);
    socket.connect();
  });
}
const NO_SERVER = { ok: false, message: "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요. (서버가 깨어나는 데 30초쯤 걸릴 수 있어요)" };
async function authRequest(event, payload) {
  if (!(await ensureConnected())) return NO_SERVER;
  const res = await request(event, payload, NO_SERVER);
  if (res.ok && res.token) setToken(res.token);
  return res;
}
// 회원가입 { name, empNo, password } / 로그인 { empNo, password } → { ok, user: { name, empNo, look }, message }
export const signup = (payload) => authRequest("signup", payload);
export const login = (payload) => authRequest("login", payload);
// 저장된 토큰이 아직 유효한지 → { ok, user }
export async function checkSession() {
  if (!authToken) return { ok: false };
  if (!(await ensureConnected())) return { ok: false, offline: true };
  const res = await request("session", authToken, { ok: false, offline: true });
  if (!res.ok && !res.offline) setToken("");
  return res;
}
export const logout = () => setToken("");

// 🛒 아이템 상점 (회원 전용)
const SHOP_FAIL = { ok: false, message: "서버 응답이 없어요. 다시 시도해 주세요." };
export const shopInfo = () => request("shopInfo", null, SHOP_FAIL);
export const buyItem = (id) => request("buyItem", id, SHOP_FAIL);
export const sellItem = (id) => request("sellItem", id, SHOP_FAIL);
export const useItem = (id) => request("useItem", id, SHOP_FAIL);
