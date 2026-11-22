// 🥤 야바위 (회원 전용) — 컵 3개 중 공이 든 컵 맞히기, 3판 (뒤로 갈수록 빠르고 많이 섞음)
// 섞는 순서와 정답은 서버가 정하고, 고른 컵이 맞는지도 서버가 확인·기록
import { useEffect, useRef, useState } from "react";
import { shellStart, shellRound, shellPick } from "./socket.js";

const SLOT_X = [16, 50, 84]; // 컵 자리 (가로 %)
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

export default function ShellGame({ npc, onClose }) {
  const [phase, setPhase] = useState("loading"); // loading | ready | show | shuffle | pick | reveal | done
  const [round, setRound] = useState(null); // { round, label, ms }
  const [slotOf, setSlotOf] = useState([0, 1, 2]); // 컵 id → 자리
  const [ballCup, setBallCup] = useState(null); // 공이 든 컵 id
  const [lift, setLift] = useState({}); // 컵 id → 들어 올림
  const [hop, setHop] = useState({}); // 섞을 때 위/아래로 비켜 가기
  const [speed, setSpeed] = useState(400);
  const [results, setResults] = useState([]);
  const [picked, setPicked] = useState(null);
  const [final, setFinal] = useState(null); // { score, stats }
  const [stats, setStats] = useState(null);
  const [msg, setMsg] = useState("");
  const alive = useRef(true);
  useEffect(() => () => (alive.current = false), []);

  const begin = async () => {
    setPhase("loading");
    setResults([]);
    setFinal(null);
    const r = await shellStart(npc.id, npc.name);
    if (!r.ok) return setMsg(r.message || "시작하지 못했어요.");
    setStats(r.stats);
    setPhase("ready");
  };
  useEffect(() => {
    begin();
  }, []); // eslint-disable-line

  const playRound = async () => {
    setMsg("");
    setPicked(null);
    const r = await shellRound();
    if (!r.ok) return setMsg(r.message || "다시 시도해 주세요.");
    setRound(r);
    const slots = [0, 1, 2];
    setSlotOf(slots);
    setSpeed(r.ms);
    const ball = r.start; // 처음엔 컵 id = 자리
    setBallCup(ball);
    // 1) 공 보여 주기
    setPhase("show");
    setLift({ [ball]: true });
    await wait(1100);
    setLift({});
    await wait(450);
    // 2) 섞기 (자리 a ↔ b)
    setPhase("shuffle");
    let cur = [...slots];
    for (const [a, b] of r.swaps) {
      if (!alive.current) return;
      const ca = cur.indexOf(a);
      const cb = cur.indexOf(b);
      cur = cur.map((s, id) => (id === ca ? b : id === cb ? a : s));
      setHop({ [ca]: -1, [cb]: 1 });
      setSlotOf(cur);
      await wait(r.ms);
    }
    setHop({});
    setPhase("pick");
  };

  const choose = async (cupId) => {
    if (phase !== "pick") return;
    const slot = slotOf[cupId];
    setPicked(cupId);
    setPhase("reveal");
    const r = await shellPick(slot);
    if (!r.ok) {
      setMsg(r.message || "다시 시도해 주세요.");
      setPhase("pick");
      return;
    }
    const answerCup = slotOf.indexOf(r.answer);
    setBallCup(answerCup);
    setLift({ [cupId]: true, [answerCup]: true });
    setResults((x) => [...x, r.correct]);
    if (r.done) {
      setFinal({ score: r.score });
      setStats(r.stats);
    }
  };

  const nextLabel = results.length < 3 ? `${results.length + 1}판 시작` : null;
  const last = results[results.length - 1];

  return (
    <div style={S.backdrop}>
      <div style={S.panel}>
        <div style={S.head}>
          <b>🥤 {npc.name}의 야바위</b>
          <button style={S.x} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div style={S.rounds}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ ...S.roundDot, ...(results[i] === true ? S.ok : results[i] === false ? S.ng : null) }}>
              {i + 1}판 {results[i] === true ? "⭕" : results[i] === false ? "❌" : ""}
            </span>
          ))}
        </div>

        <div style={S.status}>
          {phase === "ready" && "공이 든 컵을 잘 보세요! 3판, 갈수록 빨라져요."}
          {phase === "show" && `${round?.label} — 공은 여기 있어요! 👀`}
          {phase === "shuffle" && `${round?.label} — 섞는 중…`}
          {phase === "pick" && "공은 어디에 있을까요? 컵을 눌러 주세요!"}
          {phase === "reveal" && last !== undefined && (last ? "정답! 🎉" : "아쉬워요… 여기 있었어요!")}
          {phase === "loading" && "준비 중…"}
        </div>

        <div style={S.table}>
          {[0, 1, 2].map((id) => {
            const up = lift[id];
            const h = hop[id] || 0;
            return (
              <div
                key={id}
                onClick={() => choose(id)}
                style={{
                  ...S.cupWrap,
                  left: `${SLOT_X[slotOf[id]]}%`,
                  transition: `left ${speed}ms ease-in-out, transform ${Math.min(speed, 300)}ms`,
                  transform: `translate(-50%, ${h * 14}px) scale(${1 + h * -0.06})`,
                  zIndex: h < 0 ? 3 : 2,
                  cursor: phase === "pick" ? "pointer" : "default",
                }}
              >
                <div
                  style={{
                    ...S.cup,
                    transform: `translateY(${up ? -58 : 0}px)`,
                    filter: picked === id ? "drop-shadow(0 0 6px #fde047) brightness(1.15)" : phase === "pick" ? "drop-shadow(0 0 4px #fff)" : "none",
                  }}
                >
                  <div style={S.cupRim} />
                  <div style={S.cupLabel}>U+</div>
                </div>
                {ballCup === id && (phase === "show" || phase === "reveal") && <div style={S.ball} />}
              </div>
            );
          })}
          <div style={S.tableEdge} />
        </div>

        {msg && <p style={S.err}>{msg}</p>}

        {final ? (
          <div style={S.final}>
            <div style={{ fontSize: 22, fontWeight: 900, color: final.score === 3 ? "#16a34a" : final.score ? "#d97706" : "#dc2626" }}>
              {final.score === 3 ? "3판 모두 성공! 👑" : `3판 중 ${final.score}판 성공`}
            </div>
            <div style={{ fontSize: 13, color: "#374151", margin: "4px 0 10px" }}>
              {final.score === 3 ? "눈이 정말 좋으시네요! 상담할 때도 놓치는 게 없겠어요." : final.score ? "꽤 잘하셨어요! 다시 도전해 보세요." : "제 손이 더 빨랐네요 😄 다시 도전!"}
            </div>
            <button style={S.btnMain} onClick={begin}>
              다시 하기
            </button>
          </div>
        ) : (
          (phase === "ready" || (phase === "reveal" && last !== undefined)) &&
          nextLabel && (
            <div style={{ textAlign: "center" }}>
              <button style={S.btnMain} onClick={playRound}>
                {nextLabel} ▶
              </button>
            </div>
          )
        )}

        {stats && (
          <div style={S.stats}>
            📋 나의 야바위 기록 · {stats.total}게임 · 3판 모두 성공 <b style={{ color: "#16a34a" }}>{stats.perfect}회</b>
            {stats.total > 0 && ` · 적중 ${stats.hits}/${stats.total * 3}`}
          </div>
        )}
      </div>
    </div>
  );
}

const S = {
  backdrop: { position: "absolute", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: 10 },
  panel: { width: "100%", maxWidth: 420, background: "#fff", borderRadius: 18, padding: 14, boxShadow: "0 10px 30px rgba(0,0,0,.35)" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 16, marginBottom: 8 },
  x: { border: 0, background: "#f3f4f6", borderRadius: 999, width: 32, height: 32, fontSize: 15 },
  rounds: { display: "flex", gap: 6, justifyContent: "center", marginBottom: 6 },
  roundDot: { fontSize: 12, padding: "3px 10px", borderRadius: 999, background: "#f3f4f6", color: "#6b7280", fontWeight: 700 },
  ok: { background: "#dcfce7", color: "#166534" },
  ng: { background: "#fee2e2", color: "#991b1b" },
  status: { textAlign: "center", fontSize: 14, minHeight: 22, color: "#374151", fontWeight: 600 },
  table: { position: "relative", height: 190, margin: "8px 0", background: "linear-gradient(#1f6f43, #165a36)", borderRadius: 14, overflow: "hidden" },
  tableEdge: { position: "absolute", left: 0, right: 0, bottom: 0, height: 14, background: "#7c4a1e" },
  cupWrap: { position: "absolute", bottom: 26, width: 78, height: 120, display: "flex", justifyContent: "center", alignItems: "flex-end" },
  cup: {
    position: "absolute", bottom: 0, width: 70, height: 88, background: "linear-gradient(90deg,#c81d5c,#e6007e 45%,#b0105a)",
    clipPath: "polygon(14% 0, 86% 0, 100% 100%, 0 100%)", transition: "transform .35s ease", zIndex: 2, borderRadius: 4,
  },
  cupRim: { position: "absolute", top: 0, left: 0, right: 0, height: 9, background: "rgba(255,255,255,.35)" },
  cupLabel: { position: "absolute", top: 34, width: "100%", textAlign: "center", color: "#fff", fontWeight: 900, fontSize: 15 },
  ball: { position: "absolute", bottom: 2, width: 26, height: 26, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, #fff59d, #f59e0b)", zIndex: 1, boxShadow: "0 2px 4px rgba(0,0,0,.35)" },
  err: { color: "#dc2626", fontSize: 13, textAlign: "center", margin: "4px 0" },
  final: { textAlign: "center", margin: "6px 0" },
  btnMain: { border: 0, borderRadius: 10, background: "#e6007e", color: "#fff", fontWeight: 700, padding: "10px 22px", fontSize: 15 },
  stats: { marginTop: 10, background: "#f9fafb", borderRadius: 12, padding: "8px 12px", fontSize: 13, textAlign: "center" },
};
