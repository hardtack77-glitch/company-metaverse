// 🏆 랭킹 게시판 — 게임별 TOP 10 (이번 주 / 전체), 내 순위 표시
import { useEffect, useState } from "react";
import { getRankings } from "./socket.js";

const GAMES = [
  { id: "reaction", label: "📞 콜 받기", where: "9층 백영주 실장", rule: "5콜 평균이 빠른 순" },
  { id: "empathy", label: "💗 공감 응대", where: "7층 김윤혜 실장", rule: "최고 점수 순" },
  { id: "shell", label: "🥤 야바위", where: "7층 손설희 실장", rule: "3판 모두 성공 횟수 순" },
  { id: "omok", label: "⚫ 오목", where: "6층 허유경 센터장", rule: "승리 수 순" },
  { id: "rps", label: "✊ 가위바위보", where: "8층 이준민 실장", rule: "승리 수 순" },
];
const MEDAL = ["🥇", "🥈", "🥉"];

export default function Rankings({ me, onClose }) {
  const [period, setPeriod] = useState("week");
  const [game, setGame] = useState("reaction");
  const [data, setData] = useState(null);
  useEffect(() => {
    setData(null);
    getRankings(period).then((r) => setData(r.ok ? r.data : {}));
  }, [period]);
  const g = GAMES.find((x) => x.id === game);
  const d = data?.[game];
  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.panel} onClick={(e) => e.stopPropagation()}>
        <div style={S.head}>
          <b>🏆 랭킹 게시판</b>
          <button style={S.x} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <div style={S.period}>
          {[
            ["week", "이번 주"],
            ["all", "전체"],
          ].map(([id, label]) => (
            <button key={id} style={{ ...S.pBtn, ...(period === id ? S.pOn : null) }} onClick={() => setPeriod(id)}>
              {label}
            </button>
          ))}
        </div>
        <div style={S.tabs}>
          {GAMES.map((x) => (
            <button key={x.id} style={{ ...S.tab, ...(game === x.id ? S.tabOn : null) }} onClick={() => setGame(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
        <div style={S.rule}>
          {g.where} · {g.rule}
          {period === "week" ? " · 매주 월요일 0시 초기화" : ""}
        </div>
        <div style={S.list}>
          {!data && <p style={S.empty}>불러오는 중…</p>}
          {data && (!d || d.top.length === 0) && <p style={S.empty}>아직 기록이 없어요. 첫 1등의 주인공이 되어 보세요!</p>}
          {d?.top.map((r) => (
            <div key={r.rank} style={{ ...S.row, ...(r.me ? S.rowMe : null) }}>
              <span style={S.rank}>{MEDAL[r.rank - 1] || r.rank}</span>
              <span style={S.name}>
                {r.name}
                {r.me && " (나)"}
              </span>
              <span style={S.val}>{r.value}</span>
            </div>
          ))}
        </div>
        {d && (
          <div style={S.mine}>
            {me?.guest
              ? "회원가입한 임직원만 게임에 참여해 랭킹에 오를 수 있어요."
              : d.mine
              ? `내 순위: ${d.players}명 중 ${d.mine.rank}위 · ${d.mine.value}`
              : `아직 기록이 없어요. ${g.where}에게 말을 걸어 도전해 보세요!`}
          </div>
        )}
      </div>
    </div>
  );
}

const S = {
  backdrop: { position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: 10 },
  panel: { width: "100%", maxWidth: 440, maxHeight: "90vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 18, padding: 14, boxShadow: "0 10px 30px rgba(0,0,0,.35)" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 17, marginBottom: 8 },
  x: { border: 0, background: "#f3f4f6", borderRadius: 999, width: 32, height: 32, fontSize: 15 },
  period: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, background: "#f3f4f6", borderRadius: 10, padding: 3, marginBottom: 8 },
  pBtn: { border: 0, borderRadius: 8, padding: "7px 0", background: "transparent", fontWeight: 700, color: "#6b7280", fontSize: 13 },
  pOn: { background: "#fff", color: "#e6007e", boxShadow: "0 1px 3px rgba(0,0,0,.15)" },
  tabs: { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 },
  tab: { flexShrink: 0, border: "1px solid #e5e7eb", borderRadius: 999, padding: "6px 10px", background: "#fff", fontSize: 12, fontWeight: 700, color: "#374151" },
  tabOn: { background: "#111827", color: "#fff", borderColor: "#111827" },
  rule: { fontSize: 11, color: "#6b7280", margin: "6px 2px" },
  list: { overflowY: "auto", flex: 1, minHeight: 120 },
  empty: { textAlign: "center", color: "#6b7280", fontSize: 13, padding: "24px 0" },
  row: { display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderBottom: "1px solid #f3f4f6", fontSize: 14 },
  rowMe: { background: "#fdf2f8", borderRadius: 10 },
  rank: { width: 28, textAlign: "center", fontWeight: 900, fontSize: 16 },
  name: { flex: 1, fontWeight: 600 },
  val: { color: "#374151", fontSize: 13 },
  mine: { marginTop: 8, background: "#f9fafb", borderRadius: 12, padding: "8px 12px", fontSize: 13, textAlign: "center" },
};
