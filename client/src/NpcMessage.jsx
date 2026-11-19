// NPC 에게 메시지 남기기 창
// - 다른 사람들이 남긴 공개 메시지(최근 15개)를 보여 주고
// - 내 메시지를 공개/비공개로 남김 (비공개는 관리자 페이지에서만 보임)
import { useEffect, useState } from "react";
import { getNpcMessages, sendNpcMessage } from "./socket.js";

const MAX = 200;

function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

export default function NpcMessage({ npc, onClose, onSent }) {
  const [list, setList] = useState(null);
  const [text, setText] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    getNpcMessages(npc.id).then((res) => alive && setList(res.ok ? res.messages : []));
    return () => {
      alive = false;
    };
  }, [npc.id]);

  const submit = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const res = await sendNpcMessage({ npcId: npc.id, npcName: npc.name, text: body, isPublic });
    setSending(false);
    if (res.ok) {
      setText("");
      setList(res.messages);
      setNotice(isPublic ? "메시지를 남겼어요! 💌 답장은 📬 메시지함에서 확인해요." : "비공개로 전달했어요. 🔒 답장은 📬 메시지함에서 확인해요.");
      document.activeElement?.blur();
      onSent?.();
    } else {
      setNotice(res.message);
    }
  };

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.panel} onClick={(e) => e.stopPropagation()}>
        <div style={S.head}>
          <b>💌 {npc.name}에게 메시지 남기기</b>
          <button style={S.x} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <form onSubmit={submit}>
          <textarea
            style={S.input}
            value={text}
            maxLength={MAX}
            rows={3}
            placeholder="응원, 감사 인사, 하고 싶은 말을 남겨 주세요 (200자)"
            onChange={(e) => setText(e.target.value)}
          />
          <div style={S.row}>
            <label style={S.check}>
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> 다른 사람에게도 공개
            </label>
            <span style={{ color: "#9ca3af", fontSize: 12 }}>
              {text.length}/{MAX}
            </span>
          </div>
          <button style={{ ...S.send, opacity: text.trim() && !sending ? 1 : 0.5 }} disabled={!text.trim() || sending}>
            {sending ? "보내는 중…" : "메시지 남기기"}
          </button>
          {notice && <div style={S.notice}>{notice}</div>}
        </form>

        <div style={S.listTitle}>남겨진 메시지 {list ? `(${list.length})` : ""}</div>
        <div style={S.list}>
          {!list ? (
            <div style={S.empty}>불러오는 중…</div>
          ) : list.length === 0 ? (
            <div style={S.empty}>아직 메시지가 없어요. 첫 메시지를 남겨 보세요!</div>
          ) : (
            list.map((m, i) => (
              <div key={i} style={S.item}>
                <div style={S.meta}>
                  <b>{m.from}</b> · {ago(m.at)}
                </div>
                <div style={S.text}>{m.text}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const S = {
  backdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 45, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  panel: {
    width: "min(520px, 100vw)",
    maxHeight: "82vh",
    display: "flex",
    flexDirection: "column",
    background: "rgba(17,24,39,.97)",
    color: "#fff",
    borderRadius: "16px 16px 0 0",
    border: "2px solid #fbbf24",
    borderBottom: 0,
    padding: "14px 14px calc(14px + env(safe-area-inset-bottom))",
  },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, color: "#fbbf24", fontSize: 15 },
  x: { background: "transparent", color: "#9ca3af", border: 0, fontSize: 18 },
  input: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 10,
    border: "1px solid #4b5563",
    background: "#111827",
    color: "#fff",
    padding: 10,
    fontSize: 16, // 16px 이상이어야 아이폰에서 화면이 확대되지 않음
    resize: "none",
  },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", margin: "6px 0 8px" },
  check: { fontSize: 13, color: "#d1d5db", display: "flex", alignItems: "center", gap: 6 },
  send: { width: "100%", background: "#e6007e", color: "#fff", border: 0, borderRadius: 10, padding: "11px 0", fontSize: 15, fontWeight: 700 },
  notice: { marginTop: 8, fontSize: 13, color: "#fde68a", textAlign: "center" },
  listTitle: { marginTop: 14, marginBottom: 6, fontSize: 13, color: "#9ca3af" },
  list: { overflowY: "auto", flex: 1, minHeight: 60, display: "grid", gap: 6, alignContent: "start" },
  item: { background: "rgba(255,255,255,.07)", borderRadius: 10, padding: "8px 10px" },
  meta: { fontSize: 12, color: "#9ca3af", marginBottom: 2 },
  text: { fontSize: 14, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  empty: { fontSize: 13, color: "#6b7280", padding: "6px 0" },
};
