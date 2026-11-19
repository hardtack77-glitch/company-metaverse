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

let lastName = "";
let lastLook = null; // { type, outfit } 캐릭터 모양·가디건 색
let resumeNext = false; // 다음 입장 때 마지막 자리에서 이어서 하기
export function connectAs(name, look, { resume = false } = {}) {
  lastName = name;
  lastLook = look || null;
  resumeNext = resume;
  if (!socket.connected) socket.connect();
  else socket.emit("join", { name, key: getPlayerKey(), look: lastLook, resume: resume ? resumePayload() : undefined });
}
// 연결(재연결 포함)될 때마다 자동 입장 — 재연결이면 마지막 자리에서 이어서
let joinedOnce = false;
socket.on("connect", () => {
  if (!lastName) return;
  const resume = joinedOnce || resumeNext ? resumePayload() : undefined;
  socket.emit("join", { name: lastName, key: getPlayerKey(), look: lastLook, resume });
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
