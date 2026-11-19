// 화면 오른쪽 아래 반투명 채팅창
// - 이 층의 대화를 10줄 정도 보여 주고, ▲▼ 단추(또는 손가락 스크롤)로 최근 30줄까지 볼 수 있음
// - 새 대화가 오면 맨 아래로 자동 이동 (위로 올려서 보는 중이면 그대로 두고 "새 메시지" 표시)
import { useEffect, useRef, useState } from "react";

const LINE = 17; // 한 줄 높이(px)
const VISIBLE = 10;

const hhmm = (t) => new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });

export default function ChatLog({ lines, myId, floor }) {
  const box = useRef();
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const [folded, setFolded] = useState(false);
  const lastLen = useRef(lines.length);

  useEffect(() => {
    const el = box.current;
    const added = lines.length - lastLen.current;
    lastLen.current = lines.length;
    if (!el) return;
    if (atBottom || added < 0) {
      el.scrollTop = el.scrollHeight;
      setUnseen(0);
    } else if (added > 0) setUnseen((n) => n + added);
  }, [lines]); // eslint-disable-line

  useEffect(() => {
    if (!folded && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [folded, floor]);

  const onScroll = () => {
    const el = box.current;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 6;
    setAtBottom(bottom);
    if (bottom) setUnseen(0);
  };
  const scroll = (dir) => box.current?.scrollBy({ top: dir * LINE * 3, behavior: "smooth" });

  if (folded)
    return (
      <button style={{ ...S.fold, ...S.foldOnly }} onClick={() => setFolded(false)}>
        💬 대화 {lines.length ? `(${lines.length})` : ""}
      </button>
    );

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <span>💬 {floor} 대화</span>
        <button style={S.fold} onClick={() => setFolded(true)} aria-label="채팅창 접기">
          접기
        </button>
      </div>
      <div style={S.body}>
        <div ref={box} style={S.list} onScroll={onScroll}>
          {lines.length === 0 && <div style={{ ...S.line, opacity: 0.7 }}>아직 대화가 없어요. 아래 입력창으로 인사해 보세요!</div>}
          {lines.map((l, i) => (
            <div key={`${l.at}_${i}`} style={S.line}>
              <span style={S.time}>{hhmm(l.at)}</span>
              <b style={{ color: l.id === myId ? "#fde047" : "#f9a8d4" }}>{l.id === myId ? "나" : l.name}</b>
              <span>: {l.text}</span>
            </div>
          ))}
        </div>
        <div style={S.btns}>
          <button style={S.arrow} onClick={() => scroll(-1)} aria-label="위로">
            ▲
          </button>
          <button style={S.arrow} onClick={() => scroll(1)} aria-label="아래로">
            ▼
          </button>
        </div>
      </div>
      {unseen > 0 && (
        <button
          style={S.newMsg}
          onClick={() => {
            box.current.scrollTop = box.current.scrollHeight;
            setUnseen(0);
          }}
        >
          ↓ 새 메시지 {unseen}
        </button>
      )}
    </div>
  );
}

const S = {
  wrap: {
    position: "absolute", right: 10, bottom: "calc(62px + env(safe-area-inset-bottom))", width: "min(58vw, 300px)",
    background: "rgba(0,0,0,.32)", borderRadius: 12, color: "#fff", fontSize: 12, zIndex: 12,
    textShadow: "0 1px 2px rgba(0,0,0,.8)", backdropFilter: "blur(1px)",
  },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px 0 10px", fontSize: 11, opacity: 0.85 },
  body: { display: "flex" },
  list: { flex: 1, height: LINE * VISIBLE, overflowY: "auto", padding: "2px 4px 6px 10px", lineHeight: `${LINE}px`, wordBreak: "break-all", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" },
  line: { minHeight: LINE },
  time: { opacity: 0.6, fontSize: 10, marginRight: 4 },
  btns: { display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "2px 4px 6px 0" },
  arrow: { width: 28, height: 28, borderRadius: 8, border: 0, background: "rgba(255,255,255,.25)", color: "#fff", fontSize: 12, touchAction: "manipulation" },
  fold: { border: 0, background: "rgba(255,255,255,.2)", color: "#fff", borderRadius: 999, fontSize: 11, padding: "2px 8px" },
  foldOnly: { position: "absolute", right: 10, bottom: "calc(66px + env(safe-area-inset-bottom))", fontSize: 13, padding: "6px 12px", background: "rgba(0,0,0,.45)", zIndex: 12 },
  newMsg: { position: "absolute", left: "50%", bottom: 8, transform: "translateX(-50%)", border: 0, borderRadius: 999, background: "#e6007e", color: "#fff", fontSize: 11, padding: "3px 10px" },
};
