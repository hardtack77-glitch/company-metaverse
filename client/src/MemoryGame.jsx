// 🃏 기억력 카드 짝맞추기 (회원 전용) — 4×4, LG U+ 서비스 그림 8쌍. 카드 배치는 서버에만 있음
import { useEffect, useRef, useState } from "react";
import { memoryStart, memoryFlip } from "./socket.js";

const NAMES = { "📶": "인터넷", "📺": "U+tv", "📱": "5G", "🏠": "IoT", "🎧": "상담", "💳": "요금", "🛡️": "보안", "☁️": "클라우드" };

export default function MemoryGame({ npc, onClose }) {
  const [cards, setCards] = useState([]); // { symbol|null, up, done }
  const [moves, setMoves] = useState(0);
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(null);
  const [msg, setMsg] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const lock = useRef(false);
  const startAt = useRef(0);
  const tick = useRef(null);

  const begin = async () => {
    clearInterval(tick.current);
    setResult(null);
    setMoves(0);
    setElapsed(0);
    setMsg("");
    startAt.current = 0;
    lock.current = false;
    const r = await memoryStart(npc.id, npc.name);
    if (!r.ok) return setMsg(r.message || "시작하지 못했어요.");
    setStats(r.stats);
    setCards(Array.from({ length: r.size }, () => ({ symbol: null, up: false, done: false })));
  };
  useEffect(() => {
    begin();
    return () => clearInterval(tick.current);
  }, []); // eslint-disable-line

  const flip = async (i) => {
    const c = cards[i];
    if (lock.current || result || !c || c.up || c.done) return;
    lock.current = true;
    if (!startAt.current) {
      startAt.current = Date.now();
      tick.current = setInterval(() => setElapsed((Date.now() - startAt.current) / 1000), 100);
    }
    const r = await memoryFlip(i);
    if (!r.ok) {
      setMsg(r.message || "다시 시도해 주세요.");
      lock.current = false;
      return;
    }
    setCards((cs) => cs.map((x, k) => (k === i ? { ...x, symbol: r.symbol, up: true } : x)));
    if (r.first) {
      lock.current = false;
      return;
    }
    setMoves(r.moves);
    if (r.match) {
      setCards((cs) => cs.map((x, k) => (k === i || k === r.pair ? { ...x, done: true, up: true } : x)));
      lock.current = false;
    } else {
      await new Promise((ok) => setTimeout(ok, 750)); // 틀린 카드는 잠깐 보여 주고 다시 덮기
      setCards((cs) => cs.map((x, k) => (k === i || k === r.pair ? { ...x, up: false } : x)));
      lock.current = false;
    }
    if (r.done) {
      clearInterval(tick.current);
      setElapsed(r.seconds);
      setResult(r);
      setStats(r.stats);
    }
  };

  return (
    <div style={S.backdrop}>
      <div style={S.panel}>
        <div style={S.head}>
          <b>🃏 {npc.name}의 카드 짝맞추기</b>
          <button style={S.x} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <div style={S.bar}>
          <span>⏱ {elapsed.toFixed(1)}초</span>
          <span>뒤집은 횟수 {moves}번</span>
          <span>짝 {cards.filter((c) => c.done).length / 2} / 8</span>
        </div>
        <div style={S.grid}>
          {cards.map((c, i) => (
            <button key={i} style={{ ...S.card, ...(c.up ? S.cardUp : null), ...(c.done ? S.cardDone : null) }} onClick={() => flip(i)}>
              {c.up ? (
                <>
                  <span style={{ fontSize: 30 }}>{c.symbol}</span>
                  <span style={S.name}>{NAMES[c.symbol]}</span>
                </>
              ) : (
                <span style={S.back}>U+</span>
              )}
            </button>
          ))}
        </div>
        {!startAt.current && !result && <p style={S.hint}>카드를 뒤집어 같은 그림 두 장을 찾아요. 첫 카드를 누르는 순간부터 시간이 흘러요!</p>}
        {result && (
          <div style={S.result}>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#7c3aed" }}>
              완료! {result.seconds}초 · {result.moves}번 🎉
            </div>
            <div style={{ fontSize: 13, margin: "4px 0 10px", color: "#374151" }}>
              {result.moves <= 10 ? "기억력 천재! 고객 정보도 한 번에 기억하겠어요." : result.moves <= 14 ? "훌륭해요! 집중력이 대단해요." : "잘했어요! 다시 하면 더 빨라질 거예요."}
            </div>
            <button style={S.btnMain} onClick={begin}>
              다시 도전
            </button>
          </div>
        )}
        {msg && <p style={S.err}>{msg}</p>}
        {stats && (
          <div style={S.stats}>
            📋 나의 기록 · {stats.total}회 도전{stats.best !== null ? ` · 최고 ${stats.best}초 · 최소 ${stats.fewest}번` : ""}
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
  x: { border: 0, background: "#f3f4f6", borderRadius: 999, width: 32, height: 32, fontSize: 15 },
  bar: { display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: "#5b21b6", background: "#f5f3ff", borderRadius: 10, padding: "6px 10px", marginBottom: 10 },
  grid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 },
  card: { aspectRatio: "3 / 4", border: 0, borderRadius: 12, background: "linear-gradient(135deg,#e6007e,#7c3aed)", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, boxShadow: "0 2px 6px rgba(0,0,0,.2)", touchAction: "manipulation", transition: "transform .15s" },
  cardUp: { background: "#fff", color: "#111827", border: "2px solid #c4b5fd" },
  cardDone: { background: "#f0fdf4", border: "2px solid #86efac", opacity: 0.85 },
  back: { fontWeight: 900, fontSize: 18, opacity: 0.9 },
  name: { fontSize: 10, color: "#6b7280", fontWeight: 700 },
  hint: { fontSize: 12, color: "#6b7280", textAlign: "center", margin: "10px 0 0" },
  result: { textAlign: "center", padding: "12px 0 2px" },
  btnMain: { border: 0, borderRadius: 10, background: "#e6007e", color: "#fff", fontWeight: 700, padding: "10px 22px", fontSize: 15 },
  err: { color: "#dc2626", fontSize: 13, textAlign: "center", margin: "6px 0 0" },
  stats: { marginTop: 10, background: "#f9fafb", borderRadius: 12, padding: "8px 12px", fontSize: 13, textAlign: "center" },
};
