// 1층 북카페 BULLSEYE 다트 머신 미니게임
// - 화면을 누른 채 움직여 조준 → 손을 떼면 던짐 (손떨림처럼 조준점이 살짝 흔들림)
// - 3라운드 × 3발, 실제 다트판 점수 (싱글 · 더블 ×2 · 트리플 ×3 · 불 25/50)
// - 끝나면 서버에 점수를 보내 오늘의 랭킹을 받아 옴
import { useEffect, useRef, useState } from "react";

const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
// 실제 다트판 비율 (더블 바깥 반지름 = 1)
const R_BULL = 6.35 / 170;
const R_OUTER_BULL = 15.9 / 170;
const R_TRIPLE_IN = 99 / 170;
const R_TRIPLE_OUT = 107 / 170;
const R_DOUBLE_IN = 162 / 170;
const ROUNDS = 3;
const DARTS_PER_ROUND = 3;

// 판 중심 기준 (x, y) — 반지름 1 기준 좌표 → 점수
function scoreAt(x, y) {
  const r = Math.hypot(x, y);
  if (r > 1) return { score: 0, label: "MISS" };
  if (r <= R_BULL) return { score: 50, label: "BULL!" };
  if (r <= R_OUTER_BULL) return { score: 25, label: "25" };
  const deg = ((Math.atan2(x, -y) * 180) / Math.PI + 360 + 9) % 360; // 위쪽(20)부터 시계방향
  const n = ORDER[Math.floor(deg / 18)];
  if (r >= R_TRIPLE_IN && r <= R_TRIPLE_OUT) return { score: n * 3, label: `T${n}` };
  if (r >= R_DOUBLE_IN) return { score: n * 2, label: `D${n}` };
  return { score: n, label: `${n}` };
}

function drawBoard(ctx, cx, cy, R) {
  // 바깥 검은 테두리 + 숫자
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.18, 0, Math.PI * 2);
  ctx.fill();
  const ring = (r0, r1, colorA, colorB) => {
    for (let i = 0; i < 20; i++) {
      const a0 = ((i * 18 - 9 - 90) * Math.PI) / 180;
      const a1 = (((i + 1) * 18 - 9 - 90) * Math.PI) / 180;
      ctx.fillStyle = i % 2 === 0 ? colorA : colorB;
      ctx.beginPath();
      ctx.arc(cx, cy, R * r1, a0, a1);
      ctx.arc(cx, cy, R * r0, a1, a0, true);
      ctx.closePath();
      ctx.fill();
    }
  };
  ring(R_DOUBLE_IN, 1, "#d62828", "#1f8a3a"); // 더블
  ring(R_TRIPLE_OUT, R_DOUBLE_IN, "#1b1b1b", "#efe4c8"); // 싱글 바깥
  ring(R_TRIPLE_IN, R_TRIPLE_OUT, "#d62828", "#1f8a3a"); // 트리플
  ring(R_OUTER_BULL, R_TRIPLE_IN, "#1b1b1b", "#efe4c8"); // 싱글 안쪽
  ctx.fillStyle = "#1f8a3a";
  ctx.beginPath();
  ctx.arc(cx, cy, R * R_OUTER_BULL, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d62828";
  ctx.beginPath();
  ctx.arc(cx, cy, R * R_BULL, 0, Math.PI * 2);
  ctx.fill();
  // 철사 선
  ctx.strokeStyle = "rgba(200,200,200,0.55)";
  ctx.lineWidth = 1;
  for (const r of [R_OUTER_BULL, R_TRIPLE_IN, R_TRIPLE_OUT, R_DOUBLE_IN, 1]) {
    ctx.beginPath();
    ctx.arc(cx, cy, R * r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.round(R * 0.11)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ORDER.forEach((n, i) => {
    const a = ((i * 18 - 90) * Math.PI) / 180;
    ctx.fillText(String(n), cx + Math.cos(a) * R * 1.09, cy + Math.sin(a) * R * 1.09);
  });
}

function drawDart(ctx, x, y, s = 1) {
  // 판에 꽂힌 다트 (위에서 본 모습)
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = "#ffd400";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(10, 22);
  ctx.lineTo(2, 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#e6007e";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-8, 22);
  ctx.lineTo(-1, 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export default function DartGame({ playerName, onSubmit, onClose }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const st = useRef({
    aiming: false, // 누르고 있는지
    finger: { x: 0, y: 0 }, // 손가락 위치 (판 좌표, 반지름 1 기준)
    darts: [], // 이번 라운드에 꽂힌 다트 [{x, y}]
    flying: null, // { from, to, t }
    t: 0,
  });
  const [round, setRound] = useState(1);
  const [throws, setThrows] = useState([]); // 이번 라운드 [{score,label}]
  const [total, setTotal] = useState(0);
  const [lastHit, setLastHit] = useState(null);
  const [phase, setPhase] = useState("play"); // play | between | done
  const [result, setResult] = useState(null); // 서버 랭킹 응답
  const [size, setSize] = useState(320);

  // 화면 크기에 맞춰 다트판 크기
  useEffect(() => {
    const fit = () => setSize(Math.min(window.innerWidth - 24, window.innerHeight - 280, 460));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // 그리기 루프
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = size * dpr;
    cv.height = size * dpr;
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = size / 2;
    const cy = size / 2;
    const R = (size / 2) * 0.82;
    let raf;
    let prev = performance.now();
    const loop = (now) => {
      const s = st.current;
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      s.t += dt;
      ctx.clearRect(0, 0, size, size);
      drawBoard(ctx, cx, cy, R);
      s.darts.forEach((d) => drawDart(ctx, cx + d.x * R, cy + d.y * R));
      // 날아가는 다트
      if (s.flying) {
        s.flying.t += dt / 0.28;
        const k = Math.min(1, s.flying.t);
        const e = 1 - (1 - k) * (1 - k);
        const x = s.flying.from.x + (s.flying.to.x - s.flying.from.x) * e;
        const y = s.flying.from.y + (s.flying.to.y - s.flying.from.y) * e;
        drawDart(ctx, cx + x * R, cy + y * R, 2.4 - 1.4 * e);
        if (k >= 1) {
          const done = s.flying;
          s.flying = null;
          done.onLand();
        }
      }
      // 조준점 (손떨림)
      if (s.aiming && !s.flying) {
        const a = aimPoint(s);
        ctx.strokeStyle = "#00e5ff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx + a.x * R, cy + a.y * R, 9, 0, Math.PI * 2);
        ctx.moveTo(cx + a.x * R - 15, cy + a.y * R);
        ctx.lineTo(cx + a.x * R + 15, cy + a.y * R);
        ctx.moveTo(cx + a.x * R, cy + a.y * R - 15);
        ctx.lineTo(cx + a.x * R, cy + a.y * R + 15);
        ctx.stroke();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  // 손떨림: 두 개의 사인파를 섞어 조준점이 천천히 흔들림
  const aimPoint = (s) => {
    const A = 0.11; // 흔들림 크기 (클수록 어려움)
    return {
      x: s.finger.x + A * Math.sin(s.t * 1.9) + A * 0.5 * Math.sin(s.t * 3.7 + 1.3),
      y: s.finger.y + A * Math.cos(s.t * 1.5 + 0.4) + A * 0.5 * Math.sin(s.t * 4.1),
    };
  };

  // 손가락 → 판 좌표 (손가락에 가리지 않게 조준점은 손가락보다 위쪽)
  const toBoard = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const R = (size / 2) * 0.82;
    const lift = e.pointerType === "touch" ? 70 : 0;
    return {
      x: (e.clientX - rect.left - size / 2) / R,
      y: (e.clientY - rect.top - lift - size / 2) / R,
    };
  };

  const canThrow = phase === "play" && throws.length < DARTS_PER_ROUND;

  const onDown = (e) => {
    if (!canThrow || st.current.flying) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    st.current.aiming = true;
    st.current.finger = toBoard(e);
  };
  const onMove = (e) => {
    if (st.current.aiming) st.current.finger = toBoard(e);
  };
  const onUp = () => {
    const s = st.current;
    if (!s.aiming || !canThrow) return;
    s.aiming = false;
    const a = aimPoint(s);
    // 던질 때 약간의 흩어짐
    const g = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.05;
    const to = { x: a.x + g(), y: a.y + g() };
    s.flying = {
      from: { x: to.x * 0.6, y: 1.25 },
      to,
      t: 0,
      onLand: () => {
        s.darts.push(to);
        const hit = scoreAt(to.x, to.y);
        navigator.vibrate?.(hit.score >= 50 ? [30, 40, 30] : 25);
        setLastHit(hit);
        clearTimeout(s.hitTimer);
        s.hitTimer = setTimeout(() => setLastHit(null), 900); // 맞힌 점수 잠깐 표시
        setTotal((v) => v + hit.score);
        setThrows((list) => [...list, hit]);
      },
    };
  };

  // 3발 던지면 다음 라운드 / 게임 끝
  useEffect(() => {
    if (throws.length < DARTS_PER_ROUND || phase !== "play") return;
    setPhase("between");
    const id = setTimeout(async () => {
      if (round < ROUNDS) {
        st.current.darts = [];
        setThrows([]);
        setLastHit(null);
        setRound((r) => r + 1);
        setPhase("play");
      } else {
        setPhase("done");
        setResult(await onSubmit(total));
      }
    }, 1300);
    return () => clearTimeout(id);
  }, [throws.length]); // eslint-disable-line

  const restart = () => {
    st.current.darts = [];
    st.current.flying = null;
    setRound(1);
    setThrows([]);
    setTotal(0);
    setLastHit(null);
    setResult(null);
    setPhase("play");
  };

  const roundScore = throws.reduce((a, b) => a + b.score, 0);

  return (
    <div style={S.backdrop}>
      <div style={S.panel} ref={wrapRef}>
        <div style={S.header}>
          <span style={S.logo}>🎯 BULLSEYE</span>
          <span>
            {phase === "done" ? "게임 끝" : `${round} / ${ROUNDS} 라운드`} · 총점 <b style={{ color: "#ffd400" }}>{total}</b>
          </span>
          <button style={S.x} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
          <canvas
            ref={canvasRef}
            style={{ width: size, height: size, touchAction: "none", display: "block" }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => (st.current.aiming = false)}
          />
          {lastHit && phase !== "done" && (
            <div key={`${round}-${throws.length}`} style={S.hit}>
              {lastHit.label}
              {lastHit.score > 0 && <span style={{ fontSize: 16, marginLeft: 6 }}>+{lastHit.score}</span>}
            </div>
          )}
          {phase === "done" && (
            <div style={S.result}>
              <div style={{ fontSize: 15, color: "#cbd5e1" }}>{playerName} 님의 점수</div>
              <div style={{ fontSize: 44, fontWeight: 800, color: "#ffd400" }}>{total}</div>
              {!result ? (
                <div style={{ color: "#cbd5e1" }}>랭킹 불러오는 중…</div>
              ) : result.ok ? (
                <>
                  <div style={{ margin: "4px 0 10px", color: "#e2e8f0" }}>
                    {result.isBest ? "🎉 내 최고 기록!" : `내 최고 기록 ${result.best}점`} · 현재 {result.rank}위
                  </div>
                  <div style={S.rankBox}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>🏆 다트 랭킹</div>
                    {result.top.slice(0, 5).map((r, i) => (
                      <div key={i} style={S.rankRow}>
                        <span>
                          {["🥇", "🥈", "🥉"][i] || `${i + 1}.`} {r.name}
                        </span>
                        <b>{r.score}</b>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ color: "#fca5a5" }}>{result.message}</div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "center" }}>
                <button style={S.btn} onClick={restart}>
                  다시 하기
                </button>
                <button style={{ ...S.btn, background: "#475569" }} onClick={onClose}>
                  닫기
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={S.footer}>
          <div style={S.slots}>
            {Array.from({ length: DARTS_PER_ROUND }).map((_, i) => (
              <div key={i} style={{ ...S.slot, opacity: throws[i] ? 1 : 0.35 }}>
                {throws[i] ? throws[i].label : "🎯"}
              </div>
            ))}
            <div style={S.roundScore}>이번 라운드 {roundScore}</div>
          </div>
          <div style={S.hint}>
            {phase === "play"
              ? "화면을 누른 채 움직여 조준하고, 손을 떼면 던져요"
              : phase === "between"
              ? round < ROUNDS
                ? "다음 라운드 준비…"
                : "점수 계산 중…"
              : "다트판 가운데(불)는 50점, 바깥 좁은 칸은 2배, 안쪽 좁은 칸은 3배!"}
          </div>
        </div>
      </div>
    </div>
  );
}

const S = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(5,10,25,0.86)",
    zIndex: 50,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  panel: {
    width: "min(480px, 100vw)",
    color: "#fff",
    padding: "10px 12px 14px",
    userSelect: "none",
    WebkitUserSelect: "none",
  },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, fontSize: 15 },
  logo: { fontWeight: 800, color: "#ff4d6d", letterSpacing: 1, textShadow: "0 0 8px #38bdf8" },
  x: { background: "rgba(255,255,255,0.15)", color: "#fff", border: 0, borderRadius: 999, width: 34, height: 34, fontSize: 16 },
  hit: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -150%)",
    background: "rgba(0,0,0,0.72)",
    padding: "6px 18px",
    borderRadius: 999,
    fontSize: 28,
    fontWeight: 800,
    color: "#ffd400",
    pointerEvents: "none",
  },
  result: {
    position: "absolute",
    inset: 0,
    background: "rgba(10,15,30,0.9)",
    borderRadius: 16,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: 16,
  },
  rankBox: { background: "rgba(255,255,255,0.08)", borderRadius: 12, padding: "8px 14px", minWidth: 220, fontSize: 14 },
  rankRow: { display: "flex", justifyContent: "space-between", gap: 16, padding: "2px 0" },
  btn: { background: "#e6007e", color: "#fff", border: 0, borderRadius: 10, padding: "10px 18px", fontSize: 15, fontWeight: 700 },
  footer: { marginTop: 10 },
  slots: { display: "flex", alignItems: "center", gap: 8, justifyContent: "center" },
  slot: {
    minWidth: 56,
    textAlign: "center",
    background: "rgba(255,255,255,0.12)",
    borderRadius: 10,
    padding: "6px 8px",
    fontWeight: 700,
  },
  roundScore: { marginLeft: 6, fontSize: 14, color: "#cbd5e1" },
  hint: { textAlign: "center", fontSize: 13, color: "#94a3b8", marginTop: 8 },
};
