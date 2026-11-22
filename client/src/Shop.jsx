// 🛒 아이템 상점 · 🎒 가방 (회원 전용)
//  - mode "shop": 채용담당자에게서 사기·팔기
//  - mode "bag" : 어디서나 내 아이템 사용·장착
import { useEffect, useState } from "react";
import { shopInfo, buyItem, sellItem, useItem } from "./socket.js";

const TYPE_KO = { consumable: "소모품", equipment: "장착형", gacha: "특수형" };

export default function Shop({ mode = "shop", onClose, onWallet, onUsed, canUse }) {
  const [tab, setTab] = useState(mode === "shop" ? "buy" : "bag");
  const [catalog, setCatalog] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    shopInfo().then((r) => {
      if (!r.ok) return setMsg(r.message || "상점을 열지 못했어요.");
      setCatalog(r.catalog);
      setWallet(r.wallet);
      onWallet?.(r.wallet);
    });
  }, []); // eslint-disable-line

  const run = async (fn, item) => {
    if (busy) return;
    if (fn === useItem) {
      const block = canUse?.(item);
      if (block) return setMsg(block);
    }
    setBusy(true);
    const r = await fn(item.id);
    setBusy(false);
    setMsg(r.message || "");
    if (!r.ok) return;
    setWallet(r.wallet);
    onWallet?.(r.wallet);
    if (fn === useItem) onUsed?.(item, r);
  };

  const owned = catalog.filter((it) => wallet?.bag?.[it.id] > 0);
  const isOn = (it) => it.type === "equipment" && wallet?.equipped?.[it.slot] === it.id;
  const list = tab === "buy" ? catalog : owned;

  return (
    <div style={S.backdrop}>
      <div style={S.panel}>
        <div style={S.head}>
          <b>{mode === "shop" ? "🛒 채용담당자의 아이템 상점" : "🎒 내 가방"}</b>
          <button style={S.x} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <div style={S.bar}>
          <span>💰 보유 {wallet ? wallet.points.toLocaleString() : "-"}P</span>
          <span>🎮 오늘 미니게임으로 더 받을 수 있는 포인트 {wallet ? wallet.gameLeft : "-"}P</span>
        </div>
        <div style={S.tabs}>
          {(mode === "shop" ? [["buy", "사기"], ["sell", "팔기"]] : [["bag", "사용·장착"]]).map(([k, label]) => (
            <button key={k} style={{ ...S.tab, ...(tab === k ? S.tabOn : null) }} onClick={() => (setTab(k), setMsg(""))}>
              {label}
            </button>
          ))}
        </div>
        <div style={S.list}>
          {wallet && !list.length && (
            <p style={S.empty}>{tab === "buy" ? "상품 준비 중이에요." : "가방이 비어 있어요. 채용담당자에게 가서 아이템을 사 보세요!"}</p>
          )}
          {list.map((it) => (
            <div key={it.id} style={{ ...S.item, ...(isOn(it) ? S.itemOn : null) }}>
              <div style={S.icon}>{it.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={S.name}>
                  {it.name} <span style={S.type}>{TYPE_KO[it.type]}</span>
                  {wallet?.bag?.[it.id] > 0 && <span style={S.count}>×{wallet.bag[it.id]}</span>}
                </div>
                <div style={S.desc}>{it.desc}</div>
              </div>
              {tab === "buy" && (
                <button style={S.btn} disabled={busy} onClick={() => run(buyItem, it)}>
                  {it.buyPrice}P
                  <br />
                  사기
                </button>
              )}
              {tab === "sell" && (
                <button style={{ ...S.btn, background: "#0f766e" }} disabled={busy} onClick={() => run(sellItem, it)}>
                  +{it.sellPrice}P
                  <br />
                  팔기
                </button>
              )}
              {tab === "bag" && (
                <button style={{ ...S.btn, background: isOn(it) ? "#6b7280" : "#7c3aed" }} disabled={busy} onClick={() => run(useItem, it)}>
                  {it.type === "equipment" ? (isOn(it) ? "해제" : "장착") : "사용"}
                </button>
              )}
            </div>
          ))}
        </div>
        {msg && <p style={S.msg}>{msg}</p>}
        <p style={S.note}>
          포인트 얻는 법: 보물 찾기 1개 300P · 미니게임 결과에 따라 5~50P (하루 최대 300P)
          {mode === "shop" ? " · 산 아이템은 화면 오른쪽 위 🎒 가방에서 써요." : " · 사고팔기는 각 층 채용담당자에게서 해요."}
        </p>
      </div>
    </div>
  );
}

const S = {
  backdrop: { position: "absolute", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: 10 },
  panel: { width: "100%", maxWidth: 420, maxHeight: "94vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 18, padding: 14, boxShadow: "0 10px 30px rgba(0,0,0,.35)" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 16, marginBottom: 8 },
  x: { border: 0, background: "#f3f4f6", borderRadius: 999, width: 32, height: 32, fontSize: 15 },
  bar: { display: "flex", flexDirection: "column", gap: 2, fontSize: 13, fontWeight: 700, color: "#9d174d", background: "#fdf2f8", borderRadius: 10, padding: "6px 10px", marginBottom: 8 },
  tabs: { display: "flex", gap: 6, marginBottom: 8 },
  tab: { flex: 1, border: "1px solid #e5e7eb", background: "#f9fafb", borderRadius: 10, padding: "8px 0", fontWeight: 700, fontSize: 14, color: "#374151" },
  tabOn: { background: "#e6007e", borderColor: "#e6007e", color: "#fff" },
  list: { overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, minHeight: 120 },
  item: { display: "flex", alignItems: "center", gap: 10, border: "1px solid #e5e7eb", borderRadius: 12, padding: "8px 10px" },
  itemOn: { borderColor: "#a78bfa", background: "#f5f3ff" },
  icon: { fontSize: 30, width: 40, textAlign: "center" },
  name: { fontSize: 14, fontWeight: 800, color: "#111827" },
  type: { fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", display: "inline-block", color: "#6b7280", background: "#f3f4f6", borderRadius: 6, padding: "1px 5px", marginLeft: 2 },
  count: { fontSize: 12, fontWeight: 800, color: "#e6007e", marginLeft: 4 },
  desc: { fontSize: 12, color: "#4b5563", marginTop: 2, lineHeight: 1.35 },
  btn: { border: 0, borderRadius: 10, background: "#e6007e", color: "#fff", fontWeight: 800, fontSize: 12, padding: "6px 8px", minWidth: 58, lineHeight: 1.3 },
  empty: { textAlign: "center", color: "#6b7280", fontSize: 13, padding: "20px 0" },
  msg: { textAlign: "center", fontSize: 14, fontWeight: 700, color: "#111827", margin: "8px 0 0" },
  note: { fontSize: 11, color: "#6b7280", margin: "8px 0 0", lineHeight: 1.4 },
};
