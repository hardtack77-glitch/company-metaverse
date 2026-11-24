// 📜 퀘스트 (1층 김지연 센터장에게서 받기 · 한 번에 1개 · 퀘스트마다 1번만 완료)
//  - 감사인사 퀘스트: 퀘스트를 시작한 뒤 대상 NPC 모두에게 "메시지 남기기"를 하면 완료
//  - 게임 퀘스트: 퀘스트를 시작한 뒤 이기면 완료 (승리 기준은 shop.js 의 GAME_WIN 과 같음)
//  - 대상 NPC 명단은 client/src/staff.js (NPC 를 추가·삭제하면 자동 반영)
import { STAFF_NPCS } from "../client/src/staff.js";

const byTitle = (title) =>
  STAFF_NPCS.filter((s) => s.name.split(" ").slice(1).join(" ") === title).map((s) => ({ id: s.id, name: s.name, floor: s.floor }));
// 실장님들이 진행하는 게임 (오목은 허유경 센터장 → 따로)
const CHIEF_GAMES = [...new Set(STAFF_NPCS.filter((s) => s.name.endsWith(" 실장") && typeof s.game === "string" && !s.game.startsWith("http")).map((s) => s.game))];
const CHIEF_GAME_HOST = Object.fromEntries(
  STAFF_NPCS.filter((s) => s.name.endsWith(" 실장") && CHIEF_GAMES.includes(s.game)).map((s) => [s.game, `${s.name} (${s.floor})`])
);

export const QUEST_GIVER = { npcId: "npc_1f_center_head", floor: "1F", position: [-1.2, 0, 5.8], range: 3.5 };

export const QUESTS = [
  { id: "thanks_instructor", title: "공감을 넘어 감동으로(1)", goal: "모든 강사님들에게 감사인사 남기기", reward: 500, type: "thanks", targets: byTitle("강사") },
  { id: "thanks_coach", title: "공감을 넘어 감동으로(2)", goal: "모든 코치님들에게 감사인사 남기기", reward: 500, type: "thanks", targets: byTitle("코치") },
  { id: "thanks_leader", title: "공감을 넘어 감동으로(3)", goal: "모든 팀장님들에게 감사인사 남기기", reward: 500, type: "thanks", targets: byTitle("팀장") },
  { id: "thanks_chief", title: "공감을 넘어 감동으로(4)", goal: "모든 실장님들에게 감사인사 남기기", reward: 500, type: "thanks", targets: byTitle("실장") },
  { id: "beat_head", title: "허유경 센터장을 이겨라", goal: "센터장과 오목에서 승리하기", reward: 1000, type: "omok" },
  { id: "game_god", title: "게임의 신", goal: "실장님들과 게임에서 모두 승리하기", reward: 300, type: "games", games: CHIEF_GAMES },
  { id: "dart_master", title: "다트의 달인", goal: "다트 점수 300점 넘기기", reward: 500, type: "dart", score: 300 },
  { id: "dart_god", title: "다트의 신", goal: "다트 점수 400점 넘기기", reward: 1000, type: "dart", score: 400 },
];
export const QUEST_BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

// 진행도: { done, total, left:[남은 대상 이름] }
export function questProgress(q, prog = []) {
  const got = new Set(prog);
  if (q.type === "thanks") {
    const left = q.targets.filter((t) => !got.has(t.id));
    return { done: q.targets.length - left.length, total: q.targets.length, left: left.map((t) => `${t.name} (${t.floor})`) };
  }
  if (q.type === "games") {
    const left = q.games.filter((g) => !got.has(g));
    return { done: q.games.length - left.length, total: q.games.length, left: left.map((g) => CHIEF_GAME_HOST[g] || g) };
  }
  return { done: got.size ? 1 : 0, total: 1, left: [] };
}

// 이번 일이 진행 중인 퀘스트에 해당하면 진행 표시를 더함 → 바뀌었으면 true
//  ev: { kind: "message", npcId } | { kind: "win", game } | { kind: "dart", score }
export function questApply(active, ev) {
  const q = QUEST_BY_ID[active?.id];
  if (!q) return false;
  const prog = (active.progress ||= []);
  const add = (k) => (prog.includes(k) ? false : (prog.push(k), true));
  if (q.type === "thanks" && ev.kind === "message" && q.targets.some((t) => t.id === ev.npcId)) return add(ev.npcId);
  if (q.type === "games" && ev.kind === "win" && q.games.includes(ev.game)) return add(ev.game);
  if (q.type === "omok" && ev.kind === "win" && ev.game === "omok") return add("omok");
  if (q.type === "dart" && ev.kind === "dart" && ev.score >= q.score) return add("dart");
  return false;
}
export const questComplete = (active) => {
  const q = QUEST_BY_ID[active?.id];
  if (!q) return false;
  const p = questProgress(q, active.progress);
  return p.done >= p.total;
};
