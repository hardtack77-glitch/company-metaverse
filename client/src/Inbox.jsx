// 📬 내 메시지함: 내가 NPC 에게 남긴 메시지와 받은 답장을 모아 보기
import { useEffect, useState } from "react";
import { getMyMessages } from "./socket.js";

const fmt = (iso) =>
  new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export default function Inbox({ onClose, onRead }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    getMyMessages().then((res) => {
      setData(res);
      onRead?.();
    });
  }, []); // eslint-disable-line

  const items = data?.items || [];
  const replied = items.filter((m) => m.reply).length;
  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.panel} onClick={(e) => e.stopPropagation()}>
        <div style={S.head}>
          <b>📬 내 메시지함</b>
          <button style={S.x} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        {data?.guest && <p style={S.note}>방문자로 입장하셨어요. 메시지함은 이 기기에서만 볼 수 있어요. (임직원은 회원가입하면 어느 기기에서든 확인 가능)</p>}
        {!data ? (
          <p style={S.empty}>불러오는 중…</p>
        ) : items.length === 0 ? (
          <p style={S.empty}>
            아직 보낸 메시지가 없어요.
            <br />
            NPC 에게 말을 건 뒤 <b>💌 메시지 남기기</b>를 눌러 보세요!
          </p>
        ) : (
          <>
            <p style={S.note}>
              보낸 메시지 {items.length}개 · 받은 답장 {replied}개
            </p>
            <div style={S.list}>
              {items.map((m) => (
                <div key={m.id} style={S.item}>
                  <div style={S.meta}>
                    <span>
                      → <b>{m.npcName}</b> · {m.floor}
                    </span>
                    <span>
                      {fmt(m.at)} {m.isPublic ? "" : "🔒"}
                    </span>
                  </div>
                  <div style={S.text}>{m.text}</div>
                  {m.reply ? (
                    <div style={S.reply}>
                      <div style={S.meta}>
                        <b>
                          ↳ {m.npcName}의 답장 {m.unread && <span style={S.newTag}>NEW</span>}
                        </b>
                        <span>{fmt(m.replyAt)}</span>
                      </div>
                      {m.reply}
                    </div>
                  ) : (
                    <div style={S.wait}>답장을 기다리는 중이에요…</div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const S = {
  backdrop: { position: "absolute", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 },
  panel: { width: "100%", maxWidth: 440, maxHeight: "82vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 16, padding: "14px 14px 12px", boxShadow: "0 10px 30px rgba(0,0,0,.35)" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 17, marginBottom: 6 },
  x: { border: 0, background: "#f3f4f6", borderRadius: 999, width: 32, height: 32, fontSize: 15 },
  note: { fontSize: 12, color: "#6b7280", margin: "0 0 8px" },
  empty: { fontSize: 14, color: "#6b7280", textAlign: "center", padding: "28px 0", lineHeight: 1.6 },
  list: { overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingRight: 2 },
  item: { border: "1px solid #e5e7eb", borderRadius: 12, padding: "10px 12px" },
  meta: { display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, color: "#6b7280", marginBottom: 4 },
  text: { fontSize: 14, whiteSpace: "pre-wrap", wordBreak: "break-all" },
  reply: { marginTop: 8, background: "#fdf2f8", borderRadius: 10, padding: "8px 10px", fontSize: 14, whiteSpace: "pre-wrap", wordBreak: "break-all" },
  wait: { marginTop: 6, fontSize: 12, color: "#9ca3af" },
  newTag: { background: "#e6007e", color: "#fff", borderRadius: 999, fontSize: 10, padding: "1px 6px", marginLeft: 4 },
};
