// 🙋 캐릭터 동작 (손 흔들기 · 하이파이브 · 박수 · 엄지척 · 춤 · 종이비행기)
// - 버튼을 누르면 서버로 "동작 이름"만 한 번 보내고, 같은 층 사람들의 화면에서 각자 동작을 그림 (트래픽 아주 적음)
// - 팔·다리·몸통 관절(Shoulder/Hip/Torso)을 시간에 따라 돌려서 동작을 만듦

export const ACTIONS = [
  { id: "wave", emoji: "👋", label: "손 흔들기", dur: 2.2 },
  { id: "highfive", emoji: "🙌", label: "하이파이브", dur: 1.8 },
  { id: "clap", emoji: "👏", label: "박수", dur: 2.0 },
  { id: "thumbs", emoji: "👍", label: "엄지척", dur: 1.8 },
  { id: "dance", emoji: "💃", label: "춤", dur: 4.0 },
  { id: "plane", emoji: "✈️", label: "종이비행기", dur: 1.4 },
];
export const ACTION_MAP = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));

// 지금 동작 중인 사람: 플레이어 id → { type, start(초) }
const ACTIVE = new Map();
const listeners = new Set();
const now = () => performance.now() / 1000;

export function startAction(actorId, type) {
  if (!ACTION_MAP[type] || !actorId) return;
  ACTIVE.set(actorId, { type, start: now() });
  listeners.forEach((fn) => fn(actorId, type));
}
export const onAction = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export function cancelAction(actorId) {
  ACTIVE.delete(actorId);
}

// 지금 이 사람의 동작 상태 → { type, t(0~1), sec } 또는 null
export function actionState(actorId) {
  const a = actorId && ACTIVE.get(actorId);
  if (!a) return null;
  const sec = now() - a.start;
  const dur = ACTION_MAP[a.type].dur;
  if (sec > dur) {
    ACTIVE.delete(actorId);
    return null;
  }
  return { type: a.type, t: sec / dur, sec };
}

const ease = (t) => t * t * (3 - 2 * t);
// 시작·끝에서 부드럽게 들어가고 빠지는 정도 (0~1)
const envelope = (t, inT = 0.15, outT = 0.2) => Math.min(ease(Math.min(1, t / inT)), ease(Math.min(1, (1 - t) / outT)));

/* 동작별 관절 각도 (라디안)
   - sh*: 어깨 { x: 앞뒤 (음수 = 앞/위로 듦), z: 옆으로 벌림 (바깥쪽 +) }
   - hip*: 다리 앞뒤, bounce: 몸 위아래(m), twist: 몸통 좌우 비틀기 */
export function actionPose(type, t, sec) {
  const k = envelope(t);
  const zero = { shL: { x: 0, z: 0 }, shR: { x: 0, z: 0 }, hipL: 0, hipR: 0, bounce: 0, twist: 0, k };
  switch (type) {
    case "wave":
      return { ...zero, shR: { x: -0.25 * k, z: (2.55 + Math.sin(sec * 11) * 0.32) * k } };
    case "highfive":
      return { ...zero, shR: { x: -2.75 * k, z: 0.25 * k }, bounce: Math.max(0, Math.sin(Math.min(1, t * 2.2) * Math.PI)) * 0.08 };
    case "clap": {
      const c = (Math.sin(sec * 14) + 1) / 2; // 0 = 벌림, 1 = 짝
      return { ...zero, shL: { x: -1.35 * k, z: (0.35 - c * 0.55) * k }, shR: { x: -1.35 * k, z: (0.35 - c * 0.55) * k } };
    }
    case "thumbs":
      return { ...zero, shR: { x: -1.45 * k, z: 0.15 * k }, bounce: Math.sin(Math.min(1, t * 3) * Math.PI) * 0.03 };
    case "dance": {
      const b = sec * 7;
      return {
        ...zero,
        shL: { x: -0.4 * k, z: (1.6 + Math.sin(b) * 1.1) * k },
        shR: { x: -0.4 * k, z: (1.6 - Math.sin(b) * 1.1) * k },
        hipL: Math.max(0, Math.sin(b)) * -0.5 * k,
        hipR: Math.max(0, -Math.sin(b)) * -0.5 * k,
        bounce: Math.abs(Math.sin(b)) * 0.09 * k,
        twist: Math.sin(b / 2) * 0.45 * k,
      };
    }
    case "plane": {
      // 팔을 뒤로 젖혔다가(0~0.35) 앞으로 휙 던짐(0.35~0.5) → 내림
      const back = t < 0.35 ? ease(t / 0.35) : 1;
      const fwd = t < 0.35 ? 0 : ease(Math.min(1, (t - 0.35) / 0.15));
      return { ...zero, shR: { x: (-3.0 * back + 1.7 * fwd) * envelope(t, 0.05, 0.3), z: 0.2 * k }, twist: (0.3 * back - 0.5 * fwd) * k };
    }
    default:
      return null;
  }
}

// 종이비행기가 손을 떠나는 순간 (동작 시작 후 초)
export const PLANE_RELEASE = 0.62;
