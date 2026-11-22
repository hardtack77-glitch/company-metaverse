// 사진 구역에 들어가면 왼쪽 위에 작은 사진 카드 → 터치하면 크게 보기
// 사진이 여러 장이면 옆으로 밀거나(스와이프) ‹ › 단추로 넘겨 보기
import { useEffect, useRef, useState } from "react";
import { photoUrl } from "./photoZones.js";

const photosOf = (z) => (z.photos ? z.photos : [z.photo]);

export default function PhotoSpot({ zone, open, setOpen }) {
  const [shown, setShown] = useState(zone);
  const [idx, setIdx] = useState(0);
  const touch = useRef(null);
  useEffect(() => {
    if (zone && zone.id !== shown?.id) {
      setShown(zone);
      setIdx(0);
    }
  }, [zone]); // eslint-disable-line
  if (!shown) return null;
  const list = photosOf(shown);
  const n = list.length;
  const go = (d) => setIdx((i) => (i + d + n) % n);
  const onStart = (e) => (touch.current = e.touches[0].clientX);
  const onEnd = (e) => {
    if (touch.current == null) return;
    const dx = e.changedTouches[0].clientX - touch.current;
    touch.current = null;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
  };
  return (
    <>
      {zone && !open && (
        <button
          style={S.card}
          onClick={() => {
            setIdx(0);
            setOpen(true);
          }}
          aria-label={`${zone.title} 사진 크게 보기`}
        >
          <span style={{ position: "relative" }}>
            <img src={photoUrl(zone.thumb || photosOf(zone)[0])} alt="" style={S.thumb} />
            {photosOf(zone).length > 1 && <span style={S.count}>{photosOf(zone).length}장</span>}
          </span>
          <span style={S.cardText}>
            <b style={{ overflow: "hidden", textOverflow: "ellipsis" }}>📷 {zone.title}</b>
            <small style={{ opacity: 0.8 }}>{photosOf(zone).length > 1 ? "터치해서 사진 넘겨 보기" : "터치해서 크게 보기"}</small>
          </span>
        </button>
      )}
      {open && (
        <div style={S.backdrop} onClick={() => setOpen(false)}>
          <div style={S.panel} onClick={(e) => e.stopPropagation()}>
            <div style={S.head}>
              <b>
                📷 {shown.title}
                {n > 1 && <span style={S.page}> {idx + 1} / {n}</span>}
              </b>
              <button style={S.x} onClick={() => setOpen(false)} aria-label="닫기">
                ✕
              </button>
            </div>
            <div style={S.stage} onTouchStart={onStart} onTouchEnd={onEnd}>
              <img src={photoUrl(list[idx])} alt={`${shown.title} 실제 사진 ${idx + 1}`} style={S.big} draggable={false} />
              {n > 1 && (
                <>
                  <button style={{ ...S.nav, left: 6 }} onClick={() => go(-1)} aria-label="이전 사진">
                    ‹
                  </button>
                  <button style={{ ...S.nav, right: 6 }} onClick={() => go(1)} aria-label="다음 사진">
                    ›
                  </button>
                </>
              )}
            </div>
            {n > 1 && (
              <div style={S.dots}>
                {list.map((_, i) => (
                  <button key={i} style={{ ...S.dot, ...(i === idx ? S.dotOn : null) }} onClick={() => setIdx(i)} aria-label={`${i + 1}번째 사진`} />
                ))}
              </div>
            )}
            {shown.text && <p style={S.text}>{shown.text}</p>}
          </div>
        </div>
      )}
      {/* 다음 사진 미리 불러오기 */}
      {open && n > 1 && <img src={photoUrl(list[(idx + 1) % n])} alt="" style={{ display: "none" }} />}
    </>
  );
}

const S = {
  card: {
    position: "absolute", top: "calc(176px + env(safe-area-inset-top))", left: 12, zIndex: 12, display: "flex", alignItems: "center", gap: 8,
    padding: 6, paddingRight: 12, maxWidth: "calc(100% - 24px)", border: "2px solid #fff", borderRadius: 12, background: "rgba(17,24,39,.75)", color: "#fff",
    boxShadow: "0 4px 12px rgba(0,0,0,.35)", textAlign: "left",
  },
  thumb: { flexShrink: 0, width: 96, height: 64, objectFit: "cover", borderRadius: 8, display: "block" },
  count: { position: "absolute", right: 4, bottom: 4, background: "rgba(0,0,0,.7)", color: "#fff", fontSize: 10, borderRadius: 6, padding: "1px 5px" },
  cardText: { display: "flex", flexDirection: "column", gap: 2, fontSize: 13, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden" },
  backdrop: { position: "absolute", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 },
  panel: { width: "100%", maxWidth: 720, maxHeight: "94vh", display: "flex", flexDirection: "column", background: "#111827", color: "#fff", borderRadius: 16, padding: 12, boxShadow: "0 10px 30px rgba(0,0,0,.5)" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 17, margin: "2px 2px 10px" },
  page: { fontSize: 13, fontWeight: 400, opacity: 0.75, marginLeft: 6 },
  x: { border: 0, background: "rgba(255,255,255,.15)", color: "#fff", borderRadius: 999, width: 32, height: 32, fontSize: 15 },
  stage: { position: "relative", touchAction: "pan-y", userSelect: "none" },
  big: { width: "100%", display: "block", objectFit: "contain", borderRadius: 10, background: "#000", maxHeight: "62vh" },
  nav: { position: "absolute", top: "50%", transform: "translateY(-50%)", width: 40, height: 40, borderRadius: 999, border: 0, background: "rgba(0,0,0,.5)", color: "#fff", fontSize: 26, lineHeight: "36px" },
  dots: { display: "flex", justifyContent: "center", gap: 8, marginTop: 10 },
  dot: { width: 8, height: 8, borderRadius: 999, border: 0, padding: 0, background: "rgba(255,255,255,.35)" },
  dotOn: { background: "#e6007e", width: 20 },
  text: { margin: "12px 4px 4px", fontSize: 15, lineHeight: 1.6, wordBreak: "keep-all" },
};
