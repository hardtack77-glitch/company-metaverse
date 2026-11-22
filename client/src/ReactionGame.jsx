// 📞 콜 받기 반응속도 (회원 전용) — 벨이 울리면 최대한 빨리 터치! 5콜 평균으로 기록
// 벨이 울리는 시점은 서버가 정하고, 벨 전에 누르면 부정출발(+500ms 벌점)
import { useEffect, useRef, useState } from "react";
import { reactionStart, reactionSubmit } from "./socket.js";

const CALLS = 5;
const grade = (ms) => (ms < 260 ? "⚡ 번개 응대! 고객이 감동해요" : ms < 330 ? "👍 아주 빨라요!" : ms < 420 ? "🙂 좋아요! 조금만 더 빠르게" : "🐢 천천히… 다음엔 더 빨리!");

export default function ReactionGame({ npc, onClose }) {
  const [phase, setPhase] = useState("loading"); // loading | ready | wait | ring | between | done
  const [times, setTimes] = useState([]);
  const [falseStarts, setFalseStarts] = useState(0);
  const [last, setLast] = useState(null); // 직전 콜 기록 or "early"
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(null);
  const [msg, setMsg] = useState("");
  const delays = useRef([]);
  const ringAt = useRef(0);
  const timer = useRef(null);
  const st = useRef({ times: [], fs: 0 });

  const begin = async () => {
    clearTimeout(timer.current);
    setPhase("loading");
    setMsg("");
    setTimes([]);
    setFalseStarts(0);
    setLast(null);
    setResult(null);
    st.current = { times: [], fs: 0 };
    const r = await reactionStart(npc.id, npc.name);
    if (!r.ok) return setMsg(r.message || "시작하지 못했어요.");
    delays.current = r.delays;
    setStats(r.stats);
    setPhase("ready");
  };
  useEffect(() => {
    begin();
    return () => clearTimeout(timer.current);
  }, []); // eslint-disable-line

  const armCall = (i) => {
    setPhase("wait");
    timer.current = setTimeout(() => {
      ringAt.current = 0;
      setPhase("ring");
      // 화면에 초록색이 실제로 그려진 순간부터 잼 (느린 폰에서도 공정하게)
      requestAnimationFrame(() => requestAnimationFrame(() => (ringAt.current = performance.now())));
      if (navigator.vibrate) navigator.vibrate(80);
    }, delays.current[i]);
  };

  const finish = async () => {
    setPhase("loading");
    const r = await reactionSubmit(st.current.times, st.current.fs);
    if (!r.ok) {
      setMsg(r.message || "기록하지 못했어요.");
      setPhase("done");
      return;
    }
    setResult(r);
    setStats(r.stats);
    setPhase("done");
  };

  const tap = () => {
    if (phase === "ready") return armCall(0);
    if (phase === "wait") {
      // 부정출발: 벌점 + 같은 콜 다시
      clearTimeout(timer.current);
      st.current.fs += 1;
      setFalseStarts(st.current.fs);
      setLast("early");
      setPhase("between");
      timer.current = setTimeout(() => armCall(st.current.times.length), 900);
      return;
    }
    if (phase === "ring") {
      // 2초 넘게 못 받으면 "놓친 콜"로 2000ms 기록
      const ms = ringAt.current ? Math.min(2000, Math.max(80, Math.round(performance.now() - ringAt.current))) : 80;
      st.current.times.push(ms);
      setTimes([...st.current.times]);
      setLast(ms);
      if (st.current.times.length >= CALLS) return finish();
      setPhase("between");
      timer.current = setTimeout(() => armCall(st.current.times.length), 900);
    }
  };

  const bg = phase === "ring" ? "#16a34a" : phase === "wait" ? "#1f2937" : last === "early" && phase === "between" ? "#dc2626" : "#334155";
  return (
    <div style={S.backdrop}>
      <div style={S.panel}>
        <div style={S.head}>
          <b>📞 {npc.name}의 콜 받기 게임</b>
          <button style={S.x} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <div style={S.dots}>
          {Array.from({ length: CALLS }, (_, i) => (
            <span key={i} style={{ ...S.dot, ...(times[i] ? S.dotOn : null) }}>
              {times[i] ? `${times[i]}` : `${i + 1}콜`}
            </span>
          ))}
        </div>

        {phase !== "done" ? (
          <button style={{ ...S.pad, background: bg }} onPointerDown={tap} disabled={phase === "loading"}>
            {phase === "loading" && "준비 중…"}
            {phase === "ready" && (
              <>
                <span style={S.big}>☎️</span>
                <span>화면을 누르면 시작!</span>
                <small style={S.small}>벨이 울려 초록색이 되면 바로 터치하세요. 미리 누르면 +0.5초 벌점!</small>
              </>
            )}
            {phase === "wait" && (
              <>
                <span style={S.big}>🎧</span>
                <span>대기 중… 벨이 울리면 터치!</span>
              </>
            )}
            {phase === "ring" && (
              <>
                <span style={{ ...S.big, animation: "none" }}>📞</span>
                <span style={{ fontSize: 26, fontWeight: 900 }}>따르릉! 지금!</span>
              </>
            )}
            {phase === "between" && (
              <>
                <span style={S.big}>{last === "early" ? "🙅" : "✅"}</span>
                <span style={{ fontSize: 22, fontWeight: 900 }}>{last === "early" ? "부정출발! (+0.5초)" : `${last} ms`}</span>
              </>
            )}
          </button>
        ) : (
          <div style={S.result}>
            {result ? (
              <>
                <div style={{ fontSize: 14, color: "#6b7280" }}>5콜 평균 응답 속도</div>
                <div style={{ fontSize: 40, fontWeight: 900, color: "#0891b2" }}>{result.avg} ms</div>
                <div style={{ fontSize: 14, margin: "2px 0 8px" }}>{grade(result.avg)}</div>
                <div style={{ fontSize: 13, color: "#374151" }}>
                  가장 빠른 콜 {result.fastest}ms{result.falseStarts ? ` · 부정출발 ${result.falseStarts}회` : ""}
                </div>
              </>
            ) : (
              <div style={{ color: "#dc2626" }}>{msg}</div>
            )}
            <button style={S.btnMain} onClick={begin}>
              다시 도전
            </button>
          </div>
        )}
        {msg && phase !== "done" && <p style={S.err}>{msg}</p>}
        {falseStarts > 0 && phase !== "done" && <p style={S.note}>부정출발 {falseStarts}회 (+{falseStarts * 0.5}초)</p>}
        {stats && (
          <div style={S.stats}>
            📋 나의 기록 · {stats.total}회 도전{stats.best ? ` · 최고 평균 ${stats.best}ms · 최단 ${stats.fastest}ms` : ""}
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
  dots: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, marginBottom: 8 },
  dot: { fontSize: 11, textAlign: "center", padding: "4px 0", borderRadius: 8, background: "#f3f4f6", color: "#6b7280", fontWeight: 700 },
  dotOn: { background: "#cffafe", color: "#0e7490" },
  pad: { width: "100%", height: 260, border: 0, borderRadius: 16, color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 17, fontWeight: 700, touchAction: "manipulation", userSelect: "none", WebkitTapHighlightColor: "transparent", transition: "background .05s" },
  big: { fontSize: 64, lineHeight: 1 },
  small: { fontSize: 12, fontWeight: 400, opacity: 0.85, padding: "0 20px", lineHeight: 1.5 },
  result: { textAlign: "center", padding: "16px 0 6px" },
  btnMain: { marginTop: 12, border: 0, borderRadius: 10, background: "#e6007e", color: "#fff", fontWeight: 700, padding: "10px 22px", fontSize: 15 },
  err: { color: "#dc2626", fontSize: 13, textAlign: "center", margin: "6px 0 0" },
  note: { color: "#b45309", fontSize: 12, textAlign: "center", margin: "6px 0 0" },
  stats: { marginTop: 10, background: "#f9fafb", borderRadius: 12, padding: "8px 12px", fontSize: 13, textAlign: "center" },
};
