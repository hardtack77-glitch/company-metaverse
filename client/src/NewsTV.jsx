// 📺 1층 엘리베이터 통로 U+tv · 7~9층 상담실 입구 TV 화면: 보물 발견 · 미니게임 기록 · 신규 가입 · 이번 주 1위를 계속 띄움
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { socket, newsInfo } from "./socket.js";

const W = 1024;
const H = 560;
const SLIDE_MS = 5000;
const FONT = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const DEFAULT = [
  { icon: "🎁", text: "각 층에 숨겨진 보물 10개를 찾아 보세요!" },
  { icon: "🎮", text: "NPC에게 말을 걸면 미니게임을 할 수 있어요" },
  { icon: "🏆", text: "화면 오른쪽 위 🏆 랭킹에서 이번 주 순위를 확인하세요" },
];

function wrap(ctx, text, maxW) {
  const lines = [];
  let cur = "";
  for (const ch of text) {
    if (ctx.measureText(cur + ch).width > maxW && cur) {
      lines.push(cur);
      cur = ch;
    } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}

const ago = (iso) => {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
};

export default function NewsTV({ position, rotation = [0, 0, 0], width = 1.17, height = 0.64 }) {
  const data = useRef({ feed: [], champs: [], fresh: null, freshAt: 0 });
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    return c;
  }, []);
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [canvas]);
  const last = useRef(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      newsInfo().then((r) => {
        if (!alive || !r.ok) return;
        data.current.feed = r.feed || [];
        data.current.champs = r.champs || [];
      });
    load();
    const iv = setInterval(load, 60000);
    const onNews = (item) => {
      const d = data.current;
      d.feed = [item, ...d.feed.filter((f) => f.id !== item.id)].slice(0, 20);
      d.fresh = item;
      d.freshAt = Date.now();
    };
    socket.on("news", onNews);
    return () => {
      alive = false;
      clearInterval(iv);
      socket.off("news", onNews);
      tex.dispose();
    };
  }, [tex]);

  useFrame(() => {
    const now = Date.now();
    if (now - last.current < 50) return;
    last.current = now;
    const d = data.current;
    const ctx = canvas.getContext("2d");
    // 돌아가며 보여 줄 슬라이드: 최근 소식 6개 + 이번 주 1위
    const slides = [
      ...d.feed.slice(0, 6).map((f) => ({ tag: "LIVE 소식", icon: f.icon, text: f.text, sub: ago(f.at) })),
      ...d.champs.map((c) => ({ tag: "이번 주 1위", icon: "🏆", text: `${c.game} ${c.name}님`, sub: c.value })),
    ];
    if (!slides.length) DEFAULT.forEach((x) => slides.push({ tag: "센터 소식", ...x, sub: "" }));
    let slide;
    const fresh = d.fresh && now - d.freshAt < 8000;
    if (fresh) slide = { tag: "방금 들어온 소식", icon: d.fresh.icon, text: d.fresh.text, sub: "방금" };
    else slide = slides[Math.floor(now / SLIDE_MS) % slides.length];

    // 배경
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#1b1030");
    g.addColorStop(1, "#3a0b2e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // 상단 바
    ctx.fillStyle = "#e6007e";
    ctx.fillRect(0, 0, W, 78);
    ctx.fillStyle = "#fff";
    ctx.font = `800 40px ${FONT}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText("U+ 대구센터 소식", 28, 40);
    const blink = Math.floor(now / 600) % 2;
    ctx.textAlign = "right";
    ctx.font = `700 30px ${FONT}`;
    const t = new Date();
    ctx.fillText(`${blink ? "●" : "○"} LIVE  ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`, W - 28, 40);
    // 태그
    ctx.textAlign = "left";
    ctx.font = `700 30px ${FONT}`;
    const tagW = ctx.measureText(slide.tag).width + 36;
    ctx.fillStyle = fresh ? "#ffd400" : "rgba(255,255,255,0.16)";
    ctx.beginPath();
    ctx.roundRect(36, 110, tagW, 50, 25);
    ctx.fill();
    ctx.fillStyle = fresh ? "#3a0b2e" : "#ffd6ec";
    ctx.fillText(slide.tag, 54, 136);
    // 본문
    ctx.font = `100px ${FONT}`;
    ctx.fillText(slide.icon, 40, 260);
    ctx.fillStyle = "#fff";
    ctx.font = `800 56px ${FONT}`;
    const lines = wrap(ctx, slide.text, W - 220).slice(0, 3);
    lines.forEach((l, i) => ctx.fillText(l, 180, 230 + i * 70 - (lines.length - 1) * 30));
    if (slide.sub) {
      ctx.fillStyle = "#ffb3dd";
      ctx.font = `700 38px ${FONT}`;
      ctx.fillText(slide.sub, 180, 230 + lines.length * 70 - (lines.length - 1) * 30 + 6);
    }
    // 하단 흐르는 자막
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, H - 80, W, 80);
    const ticker =
      (d.feed.length ? d.feed.slice(0, 10).map((f) => `${f.icon} ${f.text}`) : DEFAULT.map((f) => `${f.icon} ${f.text}`)).join("      ·      ") +
      "      ·      ";
    ctx.font = `700 34px ${FONT}`;
    ctx.fillStyle = "#fff";
    const tw = ctx.measureText(ticker).width;
    const x = W - ((now / 1000) * 120) % (tw + W);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, H - 80, W, 80);
    ctx.clip();
    ctx.fillText(ticker, x, H - 40);
    ctx.fillText(ticker, x + tw, H - 40);
    ctx.restore();
    tex.needsUpdate = true;
  });

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}
