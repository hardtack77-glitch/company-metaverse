// ✊ 가위바위보 (회원 전용) — 결과는 서버가 정하고 Firestore 에 기록
import { useEffect, useState } from "react";
import { playRps, getRpsStats } from "./socket.js";

const HANDS = [
  { id: "rock", emoji: "✊", label: "바위" },
  { id: "scissors", emoji: "✌️", label: "가위" },
  { id: "paper", emoji: "✋", label: "보" },
];
const HAND = Object.fromEntries(HANDS.map((h) => [h.id, h]));
const RESULT = {
  win: { text: "이겼어요! 🎉", color: "#16a34a" },
  lose: { text: "졌어요… 😢", color: "#dc2626" },
  draw: { text: "비겼어요! 🤝", color: "#6b7280" },
};

export default function RpsGame({ npc, onClose }) {
  const [phase, setPhase] = useState("pick"); // pick | shaking | result
  const [mine, setMine] = useState(null);
  const [res, setRes] = useState(null);
  const [stats, setStats] = useState(null);
  const [shake, setShake] = useState(0);
  const [err, setErr] = useState("");

  useEffect(() => {
    getRpsStats().then((r) => r.ok && setStats(r.stats));
  }, []);

  useEffect(() => {
    if (phase !== "shaking") return;
    const t = setInterval(() => setShake((s) => s + 1), 120);
    return () => clearInterval(t);
  }, [phase]);

  const pick = async (choice) => {
    setErr("");
    setMine(choice);
    setPhase("shaking");
    const started = Date.now();
    const r = await playRps(npc.id, npc.name, choice);
    await new Promise((ok) => setTimeout(ok, Math.max(0, 1100 - (Date.now() - started)))); // "가위 바위 보!" 연출
    if (!r.ok) {
      setErr(r.message || "다시 시도해 주세요.");
      setPhase("pick");
      return;
    }
    setRes(r);
    setStats(r.stats);
    setPhase("result");
  };

  const npcHand = phase === "result" ? HAND[res.npc] : HANDS[shake % 3];
  const callout = ["가위!", "바위!", "보!"][Math.min(2, Math.floor(shake / 3))];

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.panel} onClick={(e) => e.stopPropagation()}>
        <div style={S.head}>
          <b>✊ {npc.name}와 가위바위보</b>
          <button style={S.x} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div style={S.arena}>
          <div style={S.side}>
            <div style={S.who}>{npc.name}</div>
            <div style={{ ...S.hand, transform: phase === "shaking" ? `translateY(${shake % 2 ? -8 : 0}px)` : "none" }}>
              {phase === "pick" ? "❔" : npcHand.emoji}
            </div>
          </div>
          <div style={S.vs}>{phase === "shaking" ? callout : "VS"}</div>
          <div style={S.side}>
            <div style={S.who}>나</div>
            <div style={S.hand}>{mine ? HAND[mine].emoji : "❔"}</div>
          </div>
        </div>

        {phase === "result" && (
          <div style={{ ...S.result, color: RESULT[res.result].color }}>
            {RESULT[res.result].text}
            <div style={S.line}>{res.message}</div>
          </div>
        )}

        {phase !== "shaking" && (
          <>
            <p style={S.ask}>{phase === "result" ? "한 판 더?" : "무엇을 낼까요?"}</p>
            <div style={S.btns}>
              {HANDS.map((h) => (
                <button key={h.id} style={S.pick} onClick={() => pick(h.id)}>
                  <span style={{ fontSize: 34 }}>{h.emoji}</span>
                  <span style={{ fontSize: 13 }}>{h.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {err && <p style={{ color: "#dc2626", fontSize: 13, textAlign: "center" }}>{err}</p>}

        {stats && (
          <div style={S.stats}>
            <div style={S.statsTitle}>📋 나의 가위바위보 기록</div>
            <div>
              {stats.total}판 · <b style={{ color: "#16a34a" }}>{stats.win}승</b> {stats.draw}무 <b style={{ color: "#dc2626" }}>{stats.lose}패</b>
              {stats.total > 0 && ` · 승률 ${Math.round((stats.win / stats.total) * 100)}%`}
            </div>
            {stats.streak > 1 && <div>🔥 현재 {stats.streak}연승 중!</div>}
            {stats.recent?.length > 0 && (
              <div style={S.recent}>
                {stats.recent.map((g, i) => (
                  <span key={i} title={new Date(g.at).toLocaleString("ko-KR")} style={{ color: RESULT[g.result].color }}>
                    {g.result === "win" ? "승" : g.result === "lose" ? "패" : "무"}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const S = {
  backdrop: { position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 },
  panel: { width: "100%", maxWidth: 400, background: "#fff", borderRadius: 18, padding: 16, boxShadow: "0 10px 30px rgba(0,0,0,.35)" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 16, marginBottom: 10 },
  x: { border: 0, background: "#f3f4f6", borderRadius: 999, width: 32, height: 32, fontSize: 15 },
  arena: { display: "flex", alignItems: "center", justifyContent: "space-around", background: "#fdf2f8", borderRadius: 14, padding: "14px 6px" },
  side: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 110 },
  who: { fontSize: 12, color: "#6b7280", fontWeight: 700 },
  hand: { fontSize: 64, lineHeight: 1, transition: "transform .1s" },
  vs: { fontSize: 18, fontWeight: 900, color: "#e6007e", minWidth: 56, textAlign: "center" },
  result: { textAlign: "center", fontSize: 22, fontWeight: 900, margin: "12px 0 2px" },
  line: { fontSize: 13, color: "#374151", fontWeight: 400, marginTop: 4 },
  ask: { textAlign: "center", margin: "12px 0 8px", fontSize: 14, color: "#374151" },
  btns: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 },
  pick: { border: "2px solid #f9a8d4", background: "#fff", borderRadius: 14, padding: "10px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, touchAction: "manipulation" },
  stats: { marginTop: 14, background: "#f9fafb", borderRadius: 12, padding: "10px 12px", fontSize: 13, lineHeight: 1.6 },
  statsTitle: { fontWeight: 700, marginBottom: 2 },
  recent: { display: "flex", gap: 6, marginTop: 4, fontWeight: 700 },
};
