// ⚫ 오목 대결 (회원 전용) — 나는 흑(선공), NPC 는 백. 판·수 계산은 서버에서
import { useEffect, useState } from "react";
import { omokStart, omokMove, omokResign } from "./socket.js";

const N = 15;
const CELL = 22; // SVG 좌표 단위
const PAD = 14;
const SIZE = PAD * 2 + CELL * (N - 1);
const empty = () => Array.from({ length: N }, () => Array(N).fill(0));
const RESULT = {
  win: { text: "승리! 🎉", color: "#16a34a" },
  lose: { text: "패배… 😢", color: "#dc2626" },
  draw: { text: "무승부 🤝", color: "#6b7280" },
};

export default function OmokGame({ npc, onClose }) {
  const [board, setBoard] = useState(empty);
  const [last, setLast] = useState(null);
  const [busy, setBusy] = useState(true);
  const [result, setResult] = useState(null); // { result, message }
  const [stats, setStats] = useState(null);
  const [msg, setMsg] = useState("");
  const [confirmResign, setConfirmResign] = useState(false);

  const start = async () => {
    setBusy(true);
    setBoard(empty());
    setLast(null);
    setResult(null);
    setMsg("");
    const r = await omokStart(npc.id, npc.name);
    if (!r.ok) setMsg(r.message || "시작하지 못했어요.");
    if (r.stats) setStats(r.stats);
    setBusy(false);
  };
  useEffect(() => {
    start();
  }, []); // eslint-disable-line

  const place = async (x, y) => {
    if (busy || result || board[y][x]) return;
    setBusy(true);
    setMsg("");
    setBoard((b) => b.map((row, j) => row.map((v, i) => (i === x && j === y ? 1 : v))));
    setLast({ x, y });
    const r = await omokMove(x, y);
    if (!r.ok) {
      setBoard((b) => b.map((row, j) => row.map((v, i) => (i === x && j === y ? 0 : v))));
      setMsg(r.message || "다시 시도해 주세요.");
      setBusy(false);
      return;
    }
    if (r.ai) {
      await new Promise((ok) => setTimeout(ok, 350)); // NPC 가 생각하는 척
      setBoard((b) => b.map((row, j) => row.map((v, i) => (i === r.ai.x && j === r.ai.y ? 2 : v))));
      setLast(r.ai);
    }
    if (r.result) {
      setResult({ result: r.result, message: r.message });
      setStats(r.stats);
    }
    setBusy(false);
  };

  const resign = async () => {
    setConfirmResign(false);
    const r = await omokResign();
    if (r.ok && r.result) {
      setResult({ result: "lose", message: "기권했어요. 다음엔 끝까지 도전해 봐요!" });
      setStats(r.stats);
    }
  };

  const close = async () => {
    if (!result && board.some((row) => row.some(Boolean))) {
      if (!confirmResign) return setConfirmResign("close");
      await omokResign();
    }
    onClose();
  };

  const status = result
    ? null
    : busy
    ? `${npc.name}이(가) 생각 중…`
    : board.some((row) => row.some(Boolean))
    ? "내 차례예요 (흑 ⚫)"
    : "가운데부터 두어 보세요! 나는 흑 ⚫ 선공";

  return (
    <div style={S.backdrop}>
      <div style={S.panel}>
        <div style={S.head}>
          <b>⚫ {npc.name}와 오목 대결</b>
          <button style={S.x} onClick={close} aria-label="닫기">
            ✕
          </button>
        </div>

        <div style={S.statusRow}>
          {result ? (
            <span style={{ color: RESULT[result.result].color, fontWeight: 900, fontSize: 18 }}>{RESULT[result.result].text}</span>
          ) : (
            <span>{status}</span>
          )}
        </div>
        {result && <div style={S.line}>{result.message}</div>}

        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={S.board}>
          <rect x="0" y="0" width={SIZE} height={SIZE} rx="8" fill="#e8c27a" />
          {Array.from({ length: N }, (_, i) => (
            <g key={i} stroke="#6b4a1f" strokeWidth="0.8">
              <line x1={PAD} y1={PAD + i * CELL} x2={PAD + (N - 1) * CELL} y2={PAD + i * CELL} />
              <line x1={PAD + i * CELL} y1={PAD} x2={PAD + i * CELL} y2={PAD + (N - 1) * CELL} />
            </g>
          ))}
          {[[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]].map(([x, y]) => (
            <circle key={`${x}${y}`} cx={PAD + x * CELL} cy={PAD + y * CELL} r="2.4" fill="#6b4a1f" />
          ))}
          {board.map((row, y) =>
            row.map((v, x) => (
              <g key={`${x}_${y}`} onClick={() => place(x, y)} style={{ cursor: v || busy || result ? "default" : "pointer" }}>
                <rect x={PAD + x * CELL - CELL / 2} y={PAD + y * CELL - CELL / 2} width={CELL} height={CELL} fill="transparent" />
                {v > 0 && (
                  <circle
                    cx={PAD + x * CELL}
                    cy={PAD + y * CELL}
                    r={CELL * 0.43}
                    fill={v === 1 ? "#111" : "#fafafa"}
                    stroke={v === 1 ? "#000" : "#9ca3af"}
                    strokeWidth="0.8"
                  />
                )}
                {last && last.x === x && last.y === y && <circle cx={PAD + x * CELL} cy={PAD + y * CELL} r="3" fill="#e6007e" />}
              </g>
            ))
          )}
        </svg>

        {msg && <p style={S.err}>{msg}</p>}

        {confirmResign ? (
          <div style={S.btnRow}>
            <span style={{ fontSize: 13, flex: 1 }}>{confirmResign === "close" ? "지금 나가면 기권(패)으로 기록돼요. 나갈까요?" : "기권하면 패로 기록돼요. 기권할까요?"}</span>
            <button style={S.btnDanger} onClick={confirmResign === "close" ? close : resign}>
              {confirmResign === "close" ? "나가기" : "기권"}
            </button>
            <button style={S.btnGhost} onClick={() => setConfirmResign(false)}>
              계속 두기
            </button>
          </div>
        ) : (
          <div style={S.btnRow}>
            {result ? (
              <button style={S.btnMain} onClick={start}>
                한 판 더!
              </button>
            ) : (
              <button style={S.btnGhost} onClick={() => setConfirmResign("resign")} disabled={!board.some((r) => r.some(Boolean))}>
                🏳️ 기권
              </button>
            )}
          </div>
        )}

        {stats && (
          <div style={S.stats}>
            📋 나의 오목 기록 · {stats.total}판 <b style={{ color: "#16a34a" }}>{stats.win}승</b> {stats.draw}무{" "}
            <b style={{ color: "#dc2626" }}>{stats.lose}패</b>
            {stats.best && ` · 최단 승리 ${stats.best}수`}
          </div>
        )}
      </div>
    </div>
  );
}

const S = {
  backdrop: { position: "absolute", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: 8 },
  panel: { width: "100%", maxWidth: 440, maxHeight: "98vh", overflowY: "auto", background: "#fff", borderRadius: 18, padding: 12, boxShadow: "0 10px 30px rgba(0,0,0,.35)" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 16, marginBottom: 6 },
  x: { border: 0, background: "#f3f4f6", borderRadius: 999, width: 32, height: 32, fontSize: 15 },
  statusRow: { textAlign: "center", fontSize: 14, minHeight: 24, color: "#374151" },
  line: { textAlign: "center", fontSize: 13, color: "#374151", marginBottom: 4 },
  board: { width: "100%", display: "block", touchAction: "manipulation", userSelect: "none", margin: "6px 0" },
  err: { color: "#dc2626", fontSize: 13, textAlign: "center", margin: "4px 0" },
  btnRow: { display: "flex", gap: 8, alignItems: "center", justifyContent: "center", marginTop: 4 },
  btnMain: { border: 0, borderRadius: 10, background: "#e6007e", color: "#fff", fontWeight: 700, padding: "10px 22px", fontSize: 15 },
  btnGhost: { border: "1px solid #d1d5db", borderRadius: 10, background: "#fff", color: "#374151", padding: "8px 14px", fontSize: 14 },
  btnDanger: { border: 0, borderRadius: 10, background: "#dc2626", color: "#fff", padding: "8px 14px", fontSize: 14 },
  stats: { marginTop: 10, background: "#f9fafb", borderRadius: 12, padding: "8px 12px", fontSize: 13, textAlign: "center" },
};
