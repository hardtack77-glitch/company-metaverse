// 🎓 1층 강의장 스크린: 교육 슬라이드가 8초마다 넘어감 (LG U+ 전산 · 공감상담 · 고객응대)
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const W = 1280;
const H = 800;
const SLIDE_MS = 8000;
const FONT = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const MAGENTA = "#e6007e";

// type: "bullets" (제목 + 글머리) · "system" (전산 화면 예시) · "steps" (단계 흐름) · "talk" (대화 예시)
export const DECKS = {
  lecture: {
    room: "일반강의장 · 이론 교육",
    slides: [
      { type: "bullets", title: "공감상담이란?", points: ["고객의 말 속 '감정'까지 듣는 상담", "문제 해결 전에 마음을 먼저 알아주기", "공감 → 확인 → 해결 → 마무리", "대구고객센터의 핵심 상담 철학"] },
      { type: "steps", title: "고객응대 5단계", steps: ["첫인사", "경청·공감", "니즈 확인", "해결·안내", "끝인사"] },
      { type: "talk", title: "공감 표현 예시", lines: [["고객", "요금이 왜 이렇게 많이 나왔어요?"], ["상담사", "많이 놀라셨겠어요. 바로 확인해 드릴게요."], ["고객", "몇 번을 전화했는지 몰라요."], ["상담사", "여러 번 연락 주시게 해서 죄송합니다."]] },
      { type: "bullets", title: "적극적 경청 3가지", points: ["끄덕임 표현: '네', '그러셨군요'", "요약 확인: '말씀하신 내용은 ~이시죠?'", "끊지 않기: 고객 말이 끝날 때까지", "메모하며 듣고 다시 묻지 않기"] },
      { type: "bullets", title: "쿠션어로 부드럽게", points: ["죄송하지만 ~", "번거로우시겠지만 ~", "괜찮으시다면 ~", "실례지만 ~", "'안 됩니다' 대신 '~하시면 가능합니다'"] },
    ],
  },
  comp1: {
    room: "전산강의장1 · U+ 상담 전산",
    slides: [
      { type: "system", title: "고객 조회 화면", menu: ["고객조회", "요금", "상품", "상담이력"], rows: [["고객명", "김*현"], ["휴대폰", "010-****-1234"], ["요금제", "5G 프리미어 에센셜"], ["약정", "24개월 (잔여 9개월)"], ["결합", "인터넷 + IPTV"]] },
      { type: "steps", title: "상담 전산 처리 순서", steps: ["본인 확인", "고객 조회", "문의 처리", "상담이력 입력", "통화 종료"] },
      { type: "bullets", title: "본인 확인 필수 항목", points: ["명의자 성함 · 생년월일", "가입 휴대폰 번호", "변경 업무는 인증번호 추가 확인", "개인정보는 필요한 만큼만 묻기"] },
      { type: "system", title: "요금 조회 화면", menu: ["고객조회", "요금", "상품", "상담이력"], rows: [["청구월", "2026년 11월"], ["기본료", "75,000원"], ["부가서비스", "3,300원"], ["할인", "-25,000원 (결합)"], ["청구금액", "53,300원"]] },
      { type: "bullets", title: "상담이력 잘 남기기", points: ["누가 봐도 알 수 있게 짧고 정확하게", "고객 요청 → 처리 결과 → 안내 내용", "재통화 약속은 날짜·시간 기록", "감정 상태(불만 등)도 함께 메모"] },
    ],
  },
  comp2: {
    room: "전산강의장2 · 업무 처리 실습",
    slides: [
      { type: "steps", title: "요금제 변경 처리", steps: ["현재 요금제 확인", "사용 패턴 분석", "추천·비교 안내", "변경 동의", "적용일 안내"] },
      { type: "system", title: "부가서비스 관리 화면", menu: ["고객조회", "부가서비스", "변경", "이력"], rows: [["컬러링", "이용 중 (1,650원)"], ["데이터 쉐어링", "이용 중 (무료)"], ["스팸 차단", "미가입"], ["로밍 요금제", "미가입"], ["처리", "해지 / 가입 선택"]] },
      { type: "bullets", title: "자주 쓰는 단축키", points: ["F2 : 고객 조회", "F4 : 상담이력 입력", "F8 : 요금 상세", "Ctrl + S : 저장", "Esc : 화면 닫기"] },
      { type: "bullets", title: "업무 처리 체크리스트", points: ["처리 전 고객 동의 받았나요?", "변경 내용을 다시 안내했나요?", "적용 시점·요금 변화 설명했나요?", "상담이력에 남겼나요?"] },
    ],
  },
  practice: {
    room: "실습실 · 콜 롤플레이",
    slides: [
      { type: "talk", title: "실습 ① 요금 문의", lines: [["고객", "이번 달 요금이 평소보다 많아요."], ["상담사", "걱정되셨죠. 상세 내역 같이 볼게요."], ["상담사", "소액결제 3건이 추가로 있었어요."], ["고객", "아, 아이가 게임 결제를 했나 봐요."]] },
      { type: "talk", title: "실습 ② 불만 고객", lines: [["고객", "인터넷이 또 끊겼어요! 벌써 세 번째예요."], ["상담사", "여러 번 불편을 겪으셔서 정말 죄송합니다."], ["상담사", "오늘 바로 기사님 방문을 잡아 드릴게요."], ["고객", "그럼 오후 시간으로 부탁해요."]] },
      { type: "bullets", title: "실습 평가 포인트", points: ["첫인사 · 끝인사 밝은 목소리", "공감 표현 2회 이상", "정확한 정보 안내", "통화 시간 관리", "상담이력 입력 완료"] },
      { type: "steps", title: "롤플레이 진행 순서", steps: ["시나리오 받기", "2인 1조 실습", "녹취 듣기", "피드백", "다시 해 보기"] },
    ],
  },
};

function draw(ctx, deck, slide, idx, total) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  // 위쪽 바
  ctx.fillStyle = MAGENTA;
  ctx.fillRect(0, 0, W, 92);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText("LG U+  대구고객센터 교육", 36, 47);
  ctx.textAlign = "right";
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText(deck.room, W - 36, 47);
  // 제목
  ctx.textAlign = "left";
  ctx.fillStyle = "#1f2937";
  ctx.font = `800 64px ${FONT}`;
  ctx.fillText(slide.title, 60, 170);
  ctx.fillStyle = MAGENTA;
  ctx.fillRect(60, 212, 120, 8);

  if (slide.type === "bullets") {
    ctx.font = `600 44px ${FONT}`;
    slide.points.forEach((p, i) => {
      const y = 300 + i * 88;
      ctx.fillStyle = MAGENTA;
      ctx.beginPath();
      ctx.arc(84, y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#374151";
      ctx.fillText(p, 116, y);
    });
  } else if (slide.type === "steps") {
    const n = slide.steps.length;
    const bw = (W - 120 - (n - 1) * 30) / n;
    slide.steps.forEach((st, i) => {
      const x = 60 + i * (bw + 30);
      ctx.fillStyle = i % 2 ? "#fde7f3" : "#fbcfe8";
      ctx.beginPath();
      ctx.roundRect(x, 330, bw, 260, 20);
      ctx.fill();
      ctx.fillStyle = MAGENTA;
      ctx.font = `800 60px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(String(i + 1), x + bw / 2, 400);
      ctx.fillStyle = "#1f2937";
      ctx.font = `700 ${st.length > 6 ? 30 : 36}px ${FONT}`;
      ctx.fillText(st, x + bw / 2, 500);
      if (i < n - 1) {
        ctx.fillStyle = "#9ca3af";
        ctx.font = `800 40px ${FONT}`;
        ctx.fillText("▶", x + bw + 15, 460);
      }
      ctx.textAlign = "left";
    });
  } else if (slide.type === "talk") {
    slide.lines.forEach(([who, txt], i) => {
      const y = 280 + i * 115;
      const me = who === "상담사";
      const x = me ? 260 : 60;
      ctx.fillStyle = me ? "#fde7f3" : "#eef2f7";
      ctx.beginPath();
      ctx.roundRect(x, y - 40, 960, 84, 18);
      ctx.fill();
      ctx.fillStyle = me ? MAGENTA : "#475569";
      ctx.font = `800 32px ${FONT}`;
      ctx.fillText(who, x + 24, y + 2);
      ctx.fillStyle = "#1f2937";
      ctx.font = `600 38px ${FONT}`;
      ctx.fillText(txt, x + 150, y + 2);
    });
  } else if (slide.type === "system") {
    // 전산 프로그램 창 예시
    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(60, 250, W - 120, 470);
    ctx.fillStyle = "#334155";
    ctx.fillRect(60, 250, W - 120, 50);
    ctx.fillStyle = "#fff";
    ctx.font = `700 28px ${FONT}`;
    ctx.fillText("U+ 상담 시스템 (교육용 예시 화면)", 80, 276);
    slide.menu.forEach((m, i) => {
      ctx.fillStyle = i === 0 ? MAGENTA : "#cbd5e1";
      ctx.fillRect(80 + i * 200, 315, 185, 54);
      ctx.fillStyle = i === 0 ? "#fff" : "#1f2937";
      ctx.font = `700 28px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(m, 80 + i * 200 + 92, 343);
      ctx.textAlign = "left";
    });
    slide.rows.forEach(([k, v], i) => {
      const y = 395 + i * 62;
      ctx.fillStyle = "#fff";
      ctx.fillRect(80, y, W - 160, 54);
      ctx.fillStyle = "#f1f5f9";
      ctx.fillRect(80, y, 260, 54);
      ctx.fillStyle = "#475569";
      ctx.font = `700 30px ${FONT}`;
      ctx.fillText(k, 100, y + 28);
      ctx.fillStyle = "#111827";
      ctx.font = `600 32px ${FONT}`;
      ctx.fillText(v, 370, y + 28);
    });
  }
  // 아래쪽 쪽번호
  ctx.fillStyle = "#9ca3af";
  ctx.font = `600 26px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(`${idx + 1} / ${total}`, W - 36, H - 30);
  ctx.textAlign = "left";
  ctx.fillText("교육 자료는 예시이며 실제 고객 정보가 아닙니다", 36, H - 30);
}

export default function LectureScreen({ deck, position, rotation = [0, 0, 0], width = 2.4, height = 1.5, offset = 0 }) {
  const d = DECKS[deck];
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
  const shown = useRef(-1);
  useEffect(() => () => tex.dispose(), [tex]);
  useFrame(() => {
    const idx = (Math.floor(Date.now() / SLIDE_MS) + offset) % d.slides.length;
    if (idx === shown.current) return; // 슬라이드가 바뀔 때만 다시 그림
    shown.current = idx;
    draw(canvas.getContext("2d"), d, d.slides[idx], idx, d.slides.length);
    tex.needsUpdate = true;
  });
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}
