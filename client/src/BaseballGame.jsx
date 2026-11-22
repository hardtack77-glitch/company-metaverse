// ⚾ 숫자야구 (회원 전용) — 서로 다른 숫자 3개를 10번 안에 맞히기
// 자리·숫자 모두 맞으면 스트라이크(S), 숫자만 맞으면 볼(B), 하나도 없으면 아웃(OUT). 정답은 서버에만 있음
import { useEffect, useState } from "react";
import { baseballStart, baseballGuess } from "./socket.js";

export default function BaseballGame({ npc, onClose }) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([]); // { guess, strike, ball }
  const [max, setMax] = useState(10);
  const [result, setResult] = useState(null); // { success, secret, tries }
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [showHelp, setShowHelp] = useState(false);

  const begin = async () => {
    setInput("");
    setHistory([]);
    setResult(null);
    setMsg("");
    const r = await baseballStart(npc.id, npc.name);
    if (!r.ok) return setMsg(r.message || "시작하지 못했어요.");
    setMax(r.max);
    setStats(r.stats);
  };
  useEffect(() => {
    begin();
  }, []); // eslint-disable-line

  const press = (d) => {
    setMsg("");
    if (result || input.length >= 3 || input.includes(d)) return;
    setInput((x) => x + d);
  };
  const submit = async () => {
    if (busy || result) return;
    if (input.length !== 3) return setMsg("숫자 3개를 눌러 주세요.");
    setBusy(true);
    const r = await baseballGuess(input);
    setBusy(false);
    if (!r.ok) return setMsg(r.message || "다시 시도해 주세요.");
    setHistory((h) => [...h, { guess: input, strike: r.strike, ball: r.ball }]);
    setInput("");
    if (r.done) {
      setResult({ success: r.success, secret: r.secret, tries: r.tries });
      setStats(r.stats);
    }
  };

  const left = max - history.length;
  const label = (h) => (h.strike === 0 && h.ball === 0 ? "OUT" : `${h.strike ? `${h.strike}S ` : ""}${h.ball ? `${h.ball}B` : ""}`.trim());

  return (
    <div style={S.backdrop}>
      <div style={S.panel}>
        <div style={S.head}>
          <b>⚾ {npc.name}의 숫자야구</b>
          <span>
            <button style={S.help} onClick={() => setShowHelp((v) => !v)}>
              규칙
            </button>
            <button style={S.x} onClick={onClose} aria-label="닫기">
              ✕
            </button>
          </span>
        </div>
        {showHelp && (
          <div style={S.helpBox}>
            서로 다른 숫자 3개(0~9)로 된 정답을 {max}번 안에 맞혀요.
            <br />• <b>S(스트라이크)</b>: 숫자와 자리가 모두 맞음
            <br />• <b>B(볼)</b>: 숫자는 있지만 자리가 다름
            <br />• <b>OUT</b>: 맞는 숫자가 하나도 없음
            <br />예) 정답 123 · 입력 135 → 1S 1B
          </div>
        )}

        <div style={S.board}>
          {history.length === 0 && <div style={S.empty}>첫 숫자를 입력해 보세요!</div>}
          {history.map((h, i) => (
            <div key={i} style={S.row}>
              <span style={S.no}>{i + 1}</span>
              <span style={S.guess}>{h.guess}</span>
              <span style={{ ...S.judge, ...(h.strike === 3 ? S.hit : h.strike + h.ball === 0 ? S.out : null) }}>{label(h)}</span>
            </div>
          ))}
        </div>

        {result ? (
          <div style={S.result}>
            <div style={{ fontSize: 24, fontWeight: 900, color: result.success ? "#16a34a" : "#dc2626" }}>
              {result.success ? `홈런! ${result.tries}번 만에 성공 🎉` : "아쉬워요… 기회를 모두 썼어요"}
            </div>
            <div style={{ fontSize: 14, margin: "4px 0 10px" }}>
              정답은 <b style={{ fontSize: 18, letterSpacing: 4 }}>{result.secret}</b>
            </div>
            <button style={S.btnMain} onClick={begin}>
              다시 도전
            </button>
          </div>
        ) : (
          <>
            <div style={S.inputRow}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={S.slot}>
                  {input[i] ?? ""}
                </span>
              ))}
              <span style={S.left}>남은 기회 {left}</span>
            </div>
            <div style={S.pad}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "확인"].map((k) => (
                <button
                  key={k}
                  style={{ ...S.key, ...(k === "확인" ? S.keyOk : k === "⌫" ? S.keyDel : null), ...(k.length === 1 && k !== "⌫" && input.includes(k) ? S.keyUsed : null) }}
                  onClick={() => (k === "확인" ? submit() : k === "⌫" ? setInput((x) => x.slice(0, -1)) : press(k))}
                  disabled={busy}
                >
                  {k}
                </button>
              ))}
            </div>
          </>
        )}
        {msg && <p style={S.err}>{msg}</p>}
        {stats && (
          <div style={S.stats}>
            📋 나의 기록 · {stats.total}회 도전 · 성공 {stats.wins}회{stats.best ? ` · 최소 ${stats.best}번 만에 성공` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

const S = {
  backdrop: { position: "absolute", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: 10 },
  panel: { width: "100%", maxWidth: 400, maxHeight: "96vh", overflowY: "auto", background: "#fff", borderRadius: 18, padding: 14, boxShadow: "0 10px 30px rgba(0,0,0,.35)" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 16, marginBottom: 8 },
  help: { border: "1px solid #d1d5db", background: "#fff", borderRadius: 999, fontSize: 12, padding: "4px 10px", marginRight: 6 },
  x: { border: 0, background: "#f3f4f6", borderRadius: 999, width: 32, height: 32, fontSize: 15 },
  helpBox: { background: "#f0fdf4", borderRadius: 10, padding: "8px 10px", fontSize: 12, lineHeight: 1.6, marginBottom: 8 },
  board: { background: "#14532d", borderRadius: 12, padding: 8, minHeight: 110, maxHeight: 220, overflowY: "auto" },
  empty: { color: "#bbf7d0", fontSize: 13, textAlign: "center", padding: "36px 0" },
  row: { display: "flex", alignItems: "center", gap: 10, color: "#fff", padding: "4px 8px", borderBottom: "1px dashed rgba(255,255,255,.15)" },
  no: { width: 18, fontSize: 11, opacity: 0.7 },
  guess: { flex: 1, fontSize: 20, fontWeight: 800, letterSpacing: 6, fontFamily: "monospace" },
  judge: { fontWeight: 900, fontSize: 15, color: "#fde047" },
  hit: { color: "#4ade80" },
  out: { color: "#fca5a5" },
  inputRow: { display: "flex", alignItems: "center", gap: 6, margin: "10px 0 8px" },
  slot: { width: 44, height: 50, borderRadius: 10, border: "2px solid #15803d", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 900 },
  left: { marginLeft: "auto", fontSize: 13, color: "#15803d", fontWeight: 700 },
  pad: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 },
  key: { height: 44, border: 0, borderRadius: 10, background: "#f3f4f6", fontSize: 20, fontWeight: 700, touchAction: "manipulation" },
  keyOk: { background: "#15803d", color: "#fff", fontSize: 16 },
  keyDel: { background: "#e5e7eb" },
  keyUsed: { opacity: 0.35 },
  result: { textAlign: "center", padding: "12px 0 4px" },
  btnMain: { border: 0, borderRadius: 10, background: "#e6007e", color: "#fff", fontWeight: 700, padding: "10px 22px", fontSize: 15 },
  err: { color: "#dc2626", fontSize: 13, textAlign: "center", margin: "6px 0 0" },
  stats: { marginTop: 10, background: "#f9fafb", borderRadius: 12, padding: "8px 12px", fontSize: 13, textAlign: "center" },
};
