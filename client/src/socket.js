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

let lastName = "";
let lastLook = null; // { type, outfit } 캐릭터 모양·가디건 색
export function connectAs(name, look) {
  lastName = name;
  lastLook = look || null;
  if (!socket.connected) socket.connect();
  else socket.emit("join", { name, key: getPlayerKey(), look: lastLook });
}
// 연결(재연결 포함)될 때마다 자동 입장
socket.on("connect", () => {
  if (lastName) socket.emit("join", { name: lastName, key: getPlayerKey(), look: lastLook });
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
