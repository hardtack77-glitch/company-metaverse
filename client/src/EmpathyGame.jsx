// 💗 공감 응대 챌린지 (회원 전용) — 고객의 말에 가장 공감하는 답변 고르기, 5문제 · 100점 만점
// 어떤 보기가 가장 좋은 답인지는 서버만 알고, 고른 뒤에 해설과 함께 알려 줌
import { useEffect, useState } from "react";
import { empathyStart, empathyAnswer } from "./socket.js";

const KIND = {
  best: { label: "최고의 공감 응대! +20점", color: "#16a34a", bg: "#dcfce7" },
  ok: { label: "괜찮지만 아쉬워요 +10점", color: "#b45309", bg: "#fef3c7" },
  bad: { label: "고객이 서운할 수 있어요 +0점", color: "#dc2626", bg: "#fee2e2" },
};
const LETTERS = ["A", "B", "C"];

export default function EmpathyGame({ npc, onClose }) {
  const [qs, setQs] = useState(null);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState(null);
  const [fb, setFb] = useState(null); // 서버 판정
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const begin = async () => {
    setQs(null);
    setIdx(0);
    setPicked(null);
    setFb(null);
    setScore(0);
    setDone(false);
    setMsg("");
    const r = await empathyStart(npc.id, npc.name);
    if (!r.ok) return setMsg(r.message || "시작하지 못했어요.");
    setQs(r.questions);
    setStats(r.stats);
  };
  useEffect(() => {
    begin();
  }, []); // eslint-disable-line

  const choose = async (i) => {
    if (busy || fb) return;
    setBusy(true);
    setPicked(i);
    const r = await empathyAnswer(i);
    setBusy(false);
    if (!r.ok) {
      setPicked(null);
      return setMsg(r.message || "다시 시도해 주세요.");
    }
    setFb(r);
    setScore(r.score);
    if (r.done) setStats(r.stats);
  };

  const next = () => {
    if (fb?.done) return setDone(true);
    setIdx((x) => x + 1);
    setPicked(null);
    setFb(null);
  };

  const q = qs?.[idx];
  return (
    <div style={S.backdrop}>
      <div style={S.panel}>
        <div style={S.head}>
          <b>💗 {npc.name}의 공감 응대 챌린지</b>
          <button style={S.x} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        {!qs && <p style={S.center}>{msg || "문제를 준비하고 있어요…"}</p>}

        {qs && !done && q && (
          <>
            <div style={S.progress}>
              <span>
                {idx + 1} / {qs.length}
              </span>
              <span>현재 {score}점</span>
            </div>
            <div style={S.bar}>
              <div style={{ ...S.barIn, width: `${((idx + (fb ? 1 : 0)) / qs.length) * 100}%` }} />
            </div>
            <div style={S.customer}>
              <span style={S.cIcon}>📞 고객</span>
              <p style={{ margin: 0 }}>{q.customer}</p>
            </div>
            <div style={S.ask}>어떻게 응대할까요?</div>
            <div style={S.opts}>
              {q.options.map((o, i) => {
                const isBest = fb && fb.best === i;
                const isMine = picked === i;
                const st = fb ? (isBest ? KIND.best : isMine ? KIND[fb.kind] : null) : null;
                return (
                  <button
                    key={i}
                    onClick={() => choose(i)}
                    style={{ ...S.opt, ...(st ? { borderColor: st.color, background: st.bg } : null), ...(isMine && !fb ? { borderColor: "#e6007e" } : null), opacity: fb && !isBest && !isMine ? 0.55 : 1 }}
                  >
                    <b style={S.letter}>{LETTERS[i]}</b>
                    <span>{o}</span>
                  </button>
                );
              })}
            </div>
            {fb && (
              <div style={{ ...S.fb, color: KIND[fb.kind].color }}>
                <b>{KIND[fb.kind].label}</b>
                <div style={S.why}>💡 {fb.why}</div>
                <button style={S.btnMain} onClick={next}>
                  {fb.done ? "결과 보기" : "다음 문제 ▶"}
                </button>
              </div>
            )}
            {msg && <p style={S.err}>{msg}</p>}
          </>
        )}

        {done && (
          <div style={S.center}>
            <div style={{ fontSize: 14, color: "#6b7280" }}>나의 공감 점수</div>
            <div style={{ fontSize: 44, fontWeight: 900, color: "#db2777" }}>{score}점</div>
            <div style={{ fontSize: 14, margin: "4px 0 12px" }}>
              {score === 100 ? "완벽해요! 이미 공감 상담의 달인이네요 💯" : score >= 70 ? "훌륭해요! 고객이 마음을 열 거예요 😊" : score >= 40 ? "좋아요! 해설을 떠올리며 다시 도전해 봐요." : "공감은 연습하면 늘어요. 다시 도전!"}
            </div>
            <button style={S.btnMain} onClick={begin}>
              다시 도전
            </button>
          </div>
        )}

        {stats && (
          <div style={S.stats}>
            📋 나의 기록 · {stats.total}회 도전{stats.best !== null ? ` · 최고 ${stats.best}점` : ""}
            {stats.perfect ? ` · 만점 ${stats.perfect}회` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

const S = {
  backdrop: { position: "absolute", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: 10 },
  panel: { width: "100%", maxWidth: 440, maxHeight: "96vh", overflowY: "auto", background: "#fff", borderRadius: 18, padding: 14, boxShadow: "0 10px 30px rgba(0,0,0,.35)" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 16, marginBottom: 8 },
  x: { border: 0, background: "#f3f4f6", borderRadius: 999, width: 32, height: 32, fontSize: 15, flexShrink: 0 },
  center: { textAlign: "center", padding: "12px 0" },
  progress: { display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280", fontWeight: 700 },
  bar: { height: 6, background: "#f3f4f6", borderRadius: 99, margin: "4px 0 10px", overflow: "hidden" },
  barIn: { height: "100%", background: "#db2777", transition: "width .3s" },
  customer: { background: "#fdf2f8", borderRadius: 14, padding: "10px 12px", fontSize: 15, lineHeight: 1.55 },
  cIcon: { display: "inline-block", fontSize: 11, fontWeight: 700, color: "#be185d", marginBottom: 2 },
  ask: { fontSize: 13, color: "#6b7280", margin: "10px 2px 6px" },
  opts: { display: "flex", flexDirection: "column", gap: 8 },
  opt: { display: "flex", gap: 8, textAlign: "left", border: "2px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: "10px 12px", fontSize: 14, lineHeight: 1.5, color: "#111827", touchAction: "manipulation" },
  letter: { color: "#db2777", flexShrink: 0 },
  fb: { textAlign: "center", marginTop: 10, fontSize: 15 },
  why: { color: "#374151", fontSize: 13, lineHeight: 1.55, background: "#f9fafb", borderRadius: 10, padding: "8px 10px", margin: "6px 0 10px", textAlign: "left" },
  btnMain: { border: 0, borderRadius: 10, background: "#e6007e", color: "#fff", fontWeight: 700, padding: "10px 22px", fontSize: 15 },
  err: { color: "#dc2626", fontSize: 13, textAlign: "center" },
  stats: { marginTop: 10, background: "#f9fafb", borderRadius: 12, padding: "8px 12px", fontSize: 13, textAlign: "center" },
};
