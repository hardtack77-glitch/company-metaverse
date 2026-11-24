// 📜 퀘스트 창 (1층 김지연 센터장에게서 받기 · 한 번에 1개)
import { useEffect, useState } from "react";
import { questInfo, questStart, questCancel } from "./socket.js";

export default function Quest({ onClose, onChange }) {
  const [data, setData] = useState(null); // { active, list }
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null); // 남은 대상 펼친 퀘스트 id

  const apply = (r) => {
    if (r.list) {
      setData({ active: r.active, list: r.list });
      onChange?.(r.active ? { ...r.active, title: r.list.find((q) => q.id === r.active.id)?.title } : null);
    }
  };
  useEffect(() => {
    questInfo().then((r) => (r.ok ? apply(r) : setMsg(r.message || "퀘스트를 불러오지 못했어요.")));
  }, []); // eslint-disable-line

  const run = async (fn, arg) => {
    if (busy) return;
    setBusy(true);
    const r = await fn(arg);
    setBusy(false);
    setMsg(r.message || "");
    if (r.ok) apply(r);
  };

  const active = data?.active;
  return (
    <div style={S.backdrop}>
      <div style={S.panel}>
        <div style={S.head}>
          <b>📜 김지연 센터장의 퀘스트</b>
          <button style={S.x} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <div style={S.bar}>
          {active
            ? `진행 중: ${data.list.find((q) => q.id === active.id)?.title} (${active.done}/${active.total})`
            : "퀘스트를 하나 골라 시작해 보세요. 한 번에 1개만 할 수 있어요."}
        </div>
        <div style={S.list}>
          {!data && <div style={S.empty}>불러오는 중…</div>}
          {data?.list.map((q) => {
            const isOn = active?.id === q.id;
            return (
              <div key={q.id} style={{ ...S.item, ...(isOn ? S.itemOn : null), ...(q.completedAt ? S.itemDone : null) }}>
                <div style={{ flex: 1 }}>
                  <div style={S.title}>
                    {q.title} <span style={S.reward}>+{q.reward.toLocaleString()}P</span>
                  </div>
                  <div style={S.goal}>{q.goal}</div>
                  {isOn && (
                    <div style={S.prog}>
                      진행 {q.done} / {q.total}
                      {q.left.length > 0 && (
                        <button style={S.link} onClick={() => setOpen(open === q.id ? null : q.id)}>
                          {open === q.id ? "접기" : "남은 대상 보기"}
                        </button>
                      )}
                    </div>
                  )}
                  {isOn && open === q.id && <div style={S.left}>{q.left.join(" · ")}</div>}
                </div>
                {q.completedAt ? (
                  <span style={S.doneTag}>✅ 완료</span>
                ) : isOn ? (
                  <button style={{ ...S.btn, background: "#6b7280" }} disabled={busy} onClick={() => run(questCancel)}>
                    그만두기
                  </button>
                ) : (
                  <button style={{ ...S.btn, ...(active ? S.btnOff : null) }} disabled={busy || !!active} onClick={() => run(questStart, q.id)}>
                    시작
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {msg && <p style={S.msg}>{msg}</p>}
        <p style={S.note}>
          감사인사는 각 NPC 에게 말을 걸어 "💌 메시지 남기기"로 남겨요. 퀘스트를 시작한 뒤에 한 것만 인정돼요. 퀘스트마다 한 번만 완료할 수 있어요.
        </p>
      </div>
    </div>
  );
}

const S = {
  backdrop: { position: "absolute", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: 10 },
  panel: { width: "100%", maxWidth: 440, maxHeight: "94vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 18, padding: 14, boxShadow: "0 10px 30px rgba(0,0,0,.35)" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 16, marginBottom: 8 },
  x: { border: 0, background: "#f3f4f6", borderRadius: 999, width: 32, height: 32, fontSize: 15 },
  bar: { fontSize: 13, fontWeight: 700, color: "#92400e", background: "#fef3c7", borderRadius: 10, padding: "6px 10px", marginBottom: 8 },
  list: { overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, minHeight: 120 },
  item: { display: "flex", alignItems: "center", gap: 10, border: "1px solid #e5e7eb", borderRadius: 12, padding: "8px 10px" },
  itemOn: { borderColor: "#f59e0b", background: "#fffbeb" },
  itemDone: { opacity: 0.6 },
  title: { fontSize: 14, fontWeight: 800, color: "#111827" },
  reward: { fontSize: 12, fontWeight: 800, color: "#e6007e", marginLeft: 4 },
  goal: { fontSize: 12, color: "#4b5563", marginTop: 2 },
  prog: { fontSize: 12, fontWeight: 700, color: "#b45309", marginTop: 4, display: "flex", gap: 8, alignItems: "center" },
  link: { border: 0, background: "none", color: "#2563eb", fontSize: 12, fontWeight: 700, padding: 0, textDecoration: "underline" },
  left: { fontSize: 11, color: "#6b7280", marginTop: 4, lineHeight: 1.45 },
  btn: { border: 0, borderRadius: 10, background: "#f59e0b", color: "#fff", fontWeight: 800, fontSize: 12, padding: "6px 8px", minWidth: 62 },
  btnOff: { background: "#d1d5db" },
  doneTag: { fontSize: 12, fontWeight: 800, color: "#16a34a", whiteSpace: "nowrap" },
  empty: { textAlign: "center", color: "#6b7280", fontSize: 13, padding: "20px 0" },
  msg: { textAlign: "center", fontSize: 13, fontWeight: 700, color: "#111827", margin: "8px 0 0" },
  note: { fontSize: 11, color: "#6b7280", margin: "8px 0 0", lineHeight: 1.4 },
};
