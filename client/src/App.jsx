// 메인 3D 캔버스 + 모바일 터치 UI
// 1F / 6F / 7F 층 전환(엘리베이터) + 층별 블렌더 .glb 맵 + NPC + 보물찾기
import React, { Component, Suspense, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { socket, connectAs, claimTreasure, changeFloor } from "./socket.js";

/* ───────────── 설정 ───────────── */

// 층별 맵 파일: client/public/floor_1f.glb, floor_6f.glb, floor_7f.glb
const floorMapUrl = (floor) => `/floor_${floor.toLowerCase()}.glb`;
const MAP_SCALE = 1; // 블렌더 1단위 = 1m 로 만들었다면 1 그대로
const MAP_OFFSET = [0, 0, 0]; // 맵 전체를 옮겨야 할 때 [x, y, z]

// 캐릭터 모델: client/public/characters.glb (없으면 기본 도형 캐릭터)
const CHAR_URL = "/characters.glb";
const PLAYER_MODEL = "Character_Player_Consultant";

// 입장할 때 고르는 캐릭터 모양 (characters.glb 안의 이름)
const CHARACTER_TYPES = [
  { id: "male", label: "남성", sub: "기본", model: "Character_Player_Consultant" },
  { id: "female_long", label: "여성", sub: "긴 머리", model: "Character_Female_LongHair" },
  { id: "female_short", label: "여성", sub: "단발", model: "Character_Female_ShortHair" },
];
// 가디건 색상
const OUTFIT_COLORS = [
  { hex: "#2f5fb3", label: "블루" },
  { hex: "#e6007e", label: "마젠타" },
  { hex: "#d62839", label: "레드" },
  { hex: "#f08a24", label: "오렌지" },
  { hex: "#e5b81c", label: "옐로" },
  { hex: "#2e9e5b", label: "그린" },
  { hex: "#2bb3a3", label: "민트" },
  { hex: "#7b4bb7", label: "퍼플" },
  { hex: "#f39ac7", label: "핑크" },
  { hex: "#1f2a44", label: "네이비" },
  { hex: "#8a8f99", label: "그레이" },
  { hex: "#f4f1ea", label: "아이보리" },
];
const DEFAULT_LOOK = { type: "male", outfit: OUTFIT_COLORS[0].hex };
const lookModel = (look) => CHARACTER_TYPES.find((t) => t.id === look?.type)?.model || PLAYER_MODEL;
// 천장·조명처럼 위에서 내려다볼 때 가리는 물체 숨기기 (이름 규칙 또는 바닥에서 2.6m 이상 떠 있는 것)
const HIDE_NAME = /ceiling|soffit|roof|천장/i;
const HIDE_ABOVE = 2.6;
// 카메라 시점 (캐릭터 기준 위치 [좌우, 높이, 앞뒤], 바라보는 높이)
const CAMERA_MODES = {
  front: { label: "정면 보기", offset: [0, 2.4, 4.6], lookY: 1.2, fov: 50 }, // 캐릭터 얼굴이 화면을 바라봄
  fp: { label: "1인칭 보기", firstPerson: true, eyeY: 1.5, fov: 70 }, // 캐릭터 눈으로 보는 화면
  top: { label: "위에서 보기", offset: [0, 11, 6.5], lookY: 0.8, fov: 50 }, // 쿼터뷰
};
const CAMERA_ORDER = ["front", "fp", "top"]; // 🎥 버튼을 누를 때마다 이 순서로 바뀜
const TURN_SPEED = 2.4; // 1인칭에서 좌우로 돌아보는 속도 (rad/s)
const CAMERA_OFFSET = CAMERA_MODES.top.offset;
const FACE_CAMERA_DELAY = 0.5; // 정면 보기에서 멈춘 뒤 이 시간(초)이 지나면 캐릭터가 화면 쪽으로 돌아봄
const FADE_OPACITY = 0.18; // 캐릭터를 가리는 벽의 투명도

// 지금 화면에 올라간 블렌더 맵 (가림 처리용)
const mapRootRef = { current: null };

// 벽 충돌: 블렌더 맵에서 캐릭터 몸 높이(0.3~1.5m)에 걸치는 물체를 장애물로 사용
const PLAYER_RADIUS = 0.28; // 캐릭터 몸 반지름(m)
const PASS_THROUGH = /door|ceiling|soffit|roof|천장/i; // 이 이름이 들어간 물체는 통과 (문은 지나다닐 수 있게)

const MOVE_SPEED = 4; // m/s
const SEND_INTERVAL = 0.07; // 서버 전송 간격(초)
const BOUNDS = 14; // 임시 맵 이동 범위(±m). 블렌더 맵은 바닥 크기에 맞춰 자동 계산
const INTERACT_DISTANCE = 1.8; // NPC·보물 버튼이 뜨는 거리 (서버 허용 2m보다 약간 작게)
const ELEVATOR_DISTANCE = 2.0; // 엘리베이터 버튼이 뜨는 거리 (서버 허용 2.5m)

// 사내 고정 NPC — 층별 2명 (층·위치·대사 자유롭게 수정. 대사 여러 줄 = 여러 페이지)
const NPCS = [
  {
    id: "npc_1f_desk", floor: "1F", name: "안내데스크 매니저", color: "#e6007e", position: [3.95, 0, 5.6], rotationY: -Math.PI / 2,
    dialog: [
      "LG유플러스 대구고객센터 가상 오피스에 오신 걸 환영합니다!",
      "1층·6층·7층에 보물 9개가 숨겨져 있어요. 노란 상자를 찾아보세요.",
      "층 이동은 엘리베이터 홀의 파란 원 위에서 할 수 있어요.",
    ],
  },
  {
    id: "npc_1f_trainer", floor: "1F", name: "강사", model: "Character_NPC_Instructor", color: "#10b981", position: [8.25, 0, -9.0],
    dialog: ["일반강의장과 강사실은 이 복도 오른쪽에 있어요. 신입 상담사 교육은 여기서 시작돼요.", "공감상담의 첫걸음은 고객의 말을 끝까지 듣는 거예요!"],
  },
  {
    id: "npc_6f_leader", floor: "6F", name: "CS1그룹 팀장", color: "#6d28d9", position: [0.8, 0, 3.5],
    dialog: ["오늘도 콜 많았죠? 수고했어요, 오늘도^^!", "우리 층 어딘가에 KSQI 인증패가 있다던데…"],
  },
  {
    id: "npc_6f_safety", floor: "6F", name: "안전관리 매니저", model: "Character_NPC_YellowVest", color: "#eab308", position: [-4.6, 0, 10.4],
    dialog: ["비상시엔 소방담요 위치부터 확인하세요.", "안전 수칙을 잘 지킨 분께는 배지를 드려요!"],
  },
  {
    id: "npc_7f_bar", floor: "7F", name: "REST BAR 매니저", color: "#f97316", position: [5.5, 0, 3.0],
    dialog: ["REST BAR에서 잠깐 쉬어가세요~", "일언천금! 말 한마디가 천금이에요."],
  },
  {
    id: "npc_7f_room", floor: "7F", name: "상담실 리더", color: "#0ea5e9", position: [-8.35, 0, -2.4],
    dialog: ["64석 상담실이에요. 통화 중이니 조용히 부탁해요.", "상담실 에티켓을 잘 지키면 좋은 일이 생길지도?"],
  },
];

// glb 가 없을 때 쓰는 임시 맵의 층별 분위기
const FLOOR_THEME = {
  "1F": { floorColor: "#e5ddd0", label: "1F 로비" },
  "6F": { floorColor: "#d9dee7", label: "6F 사무실" },
  "7F": { floorColor: "#d8d2e6", label: "7F 임원실" },
};

/* ───────────── 3D 맵 ───────────── */

// public 폴더에 파일이 실제로 있는지 확인 (Vite 는 없는 파일에도 index.html 을 돌려주므로 content-type 으로 판별)
const fileExists = (url) =>
  fetch(url, { method: "HEAD" })
    .then((r) => r.ok && !(r.headers.get("content-type") || "").includes("text/html"))
    .catch(() => false);

// public 폴더에 층별 glb 가 있는지 확인하고, 있는 파일은 미리 불러오기(Preload)
function useAvailableMaps(floors) {
  const [available, setAvailable] = useState({});
  useEffect(() => {
    if (!floors.length) return;
    let alive = true;
    Promise.all(
      floors.map((f) =>
        fileExists(floorMapUrl(f)).then((ok) => [f, ok])
      )
    ).then((entries) => {
      if (!alive) return;
      const result = Object.fromEntries(entries);
      // 엘리베이터 탈 때 끊기지 않도록 실제 있는 파일만 미리 로드
      entries.forEach(([f, ok]) => ok && useGLTF.preload(floorMapUrl(f)));
      setAvailable(result);
    });
    return () => {
      alive = false;
    };
  }, [floors.join(",")]); // eslint-disable-line
  return available;
}

function GlbMap({ url, onBounds, onColliders }) {
  const { scene } = useGLTF(url);
  useEffect(() => {
    scene.updateMatrixWorld(true);
    const floorBox = new THREE.Box3();
    const box = new THREE.Box3();
    const colliders = []; // [minX, minZ, maxX, maxZ] 목록
    scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false; // 맵 물체는 그림자를 받기만 (휴대폰 성능 절약)
      o.receiveShadow = true;
      box.setFromObject(o);
      // 천장 숨기기
      if (HIDE_NAME.test(o.name) || box.min.y > HIDE_ABOVE) o.visible = false;
      // 바닥(높이 0.15m 이하의 넓은 판)으로 이동 가능 범위 계산
      const size = box.getSize(new THREE.Vector3());
      if (box.max.y < 0.15 && size.x * size.z > 1) floorBox.union(box);
      // 벽·가구 → 충돌 상자 (캐릭터 몸 높이에 걸치고, 너무 작지 않은 것)
      const name = o.name || o.parent?.name || "";
      if (o.visible && box.min.y < 1.5 && box.max.y > 0.3 && size.x * size.z > 0.02 && !PASS_THROUGH.test(name)) {
        colliders.push([box.min.x, box.min.z, box.max.x, box.max.z]);
      }
    });
    if (!floorBox.isEmpty()) onBounds?.([floorBox.min.x, floorBox.min.z, floorBox.max.x, floorBox.max.z]);
    onColliders?.(colliders);
    mapRootRef.current = scene;
    if (import.meta.env.DEV) window.__cmCol = colliders; // 개발용
    return () => {
      restoreFaded();
      if (mapRootRef.current === scene) mapRootRef.current = null;
    };
  }, [scene]); // eslint-disable-line
  // 블렌더(Z-up) → glTF 내보내기 시 자동으로 Y-up 변환되므로 회전 없이 그대로 사용
  return <primitive object={scene} scale={MAP_SCALE} position={MAP_OFFSET} />;
}

// 카메라와 캐릭터 사이를 가리는 벽·물체를 반투명하게
const faded = new Set();
function fadeMesh(o) {
  if (o.userData.origMaterial) return;
  o.userData.origMaterial = o.material;
  const m = Array.isArray(o.material) ? o.material.map((x) => x.clone()) : o.material.clone();
  (Array.isArray(m) ? m : [m]).forEach((x) => {
    x.transparent = true;
    x.opacity = FADE_OPACITY;
    x.depthWrite = false;
  });
  o.material = m;
  faded.add(o);
}
function unfadeMesh(o) {
  if (!o.userData.origMaterial) return;
  (Array.isArray(o.material) ? o.material : [o.material]).forEach((x) => x.dispose());
  o.material = o.userData.origMaterial;
  delete o.userData.origMaterial;
  faded.delete(o);
}
function restoreFaded() {
  [...faded].forEach(unfadeMesh);
}

function OcclusionFader({ myPosRef, disabled }) {
  const { camera } = useThree();
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const timer = useRef(0);
  useFrame((_, dt) => {
    timer.current += dt;
    if (timer.current < 0.12) return;
    timer.current = 0;
    const root = mapRootRef.current;
    if (!root) return;
    if (disabled) return restoreFaded();
    const hits = new Set();
    // 머리·몸통 두 높이로 검사
    for (const h of [1.5, 0.8]) {
      target.set(myPosRef.current.x, h, myPosRef.current.z);
      dir.subVectors(target, camera.position);
      const dist = dir.length();
      ray.set(camera.position, dir.normalize());
      ray.far = Math.max(0.01, dist - 0.35);
      for (const hit of ray.intersectObject(root, true)) if (hit.object.visible) hits.add(hit.object);
    }
    hits.forEach(fadeMesh);
    [...faded].forEach((o) => !hits.has(o) && unfadeMesh(o));
  });
  return null;
}

class MapBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    console.warn(`${this.props.floor} 맵 로드 실패 → 임시 맵 사용:`, err?.message);
  }
  render() {
    return this.state.failed ? <FallbackFloor floor={this.props.floor} /> : this.props.children;
  }
}

function FloorWorldMap({ floor, available, onBounds, onColliders }) {
  if (available[floor] === undefined) return null; // 확인 중
  if (!available[floor]) return <FallbackFloor floor={floor} />;
  return (
    <MapBoundary key={floor} floor={floor}>
      <Suspense fallback={<Html center><div style={styles.loading}>{floor} 맵 불러오는 중…</div></Html>}>
        <GlbMap url={floorMapUrl(floor)} onBounds={(b) => onBounds(floor, b)} onColliders={(c) => onColliders(floor, c)} />
      </Suspense>
    </MapBoundary>
  );
}

// glb 가 없을 때 보여줄 임시 층
function FallbackFloor({ floor }) {
  const theme = FLOOR_THEME[floor] || FLOOR_THEME["6F"];
  const size = BOUNDS * 2 + 2;
  const desks = [];
  if (floor === "6F") for (let x = -6; x <= 6; x += 4) for (let z = -6; z <= 0; z += 3) desks.push([x, z]);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color={theme.floorColor} />
      </mesh>
      <gridHelper args={[size, 30, "#b8c0cc", "#c9d0da"]} position-y={0.01} />
      {[
        [0, 1.5, -BOUNDS - 1, size, 3, 0.3],
        [0, 1.5, BOUNDS + 1, size, 3, 0.3],
        [-BOUNDS - 1, 1.5, 0, 0.3, 3, size],
        [BOUNDS + 1, 1.5, 0, 0.3, 3, size],
      ].map(([x, y, z, w, h, d], i) => (
        <mesh key={i} position={[x, y, z]} receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color="#eef1f5" />
        </mesh>
      ))}
      <Html position={[0, 2.8, -BOUNDS]} center distanceFactor={14}>
        <div style={styles.floorSign}>{theme.label}</div>
      </Html>

      {floor === "1F" && (
        <>
          {/* 안내데스크 */}
          <mesh position={[0, 0.5, -5.5]} castShadow>
            <boxGeometry args={[4, 1, 1]} />
            <meshStandardMaterial color="#e6007e" />
          </mesh>
          {/* 회의실 테이블 */}
          <mesh position={[-9, 0.4, 10]} castShadow>
            <cylinderGeometry args={[1.6, 1.6, 0.8, 32]} />
            <meshStandardMaterial color="#8b6b4a" />
          </mesh>
          <Html position={[-9, 1.6, 10]} center distanceFactor={12}>
            <div style={styles.sign}>회의실</div>
          </Html>
        </>
      )}

      {desks.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position-y={0.75} castShadow>
            <boxGeometry args={[1.8, 0.08, 0.9]} />
            <meshStandardMaterial color="#8b6b4a" />
          </mesh>
          <mesh position={[0, 1.05, -0.25]} castShadow>
            <boxGeometry args={[0.7, 0.45, 0.05]} />
            <meshStandardMaterial color="#222" />
          </mesh>
        </group>
      ))}
      {floor === "6F" && (
        <Html position={[-6, 1.4, 4]} center distanceFactor={12}>
          <div style={styles.sign}>탕비실</div>
        </Html>
      )}

      {floor === "7F" && (
        <>
          {/* 대표님실 책상 */}
          <mesh position={[5, 0.45, -7]} castShadow>
            <boxGeometry args={[3, 0.9, 1.4]} />
            <meshStandardMaterial color="#3f2a1d" />
          </mesh>
          <Html position={[5, 1.8, -7]} center distanceFactor={12}>
            <div style={styles.sign}>대표님실</div>
          </Html>
        </>
      )}
    </group>
  );
}

/* ───────────── 엘리베이터 · 보물 · NPC ───────────── */

// position = 엘리베이터 앞 '파란 원형 마커' 위치 (이 위에 서서 층간 이동)
function Elevator({ position, floor, showDoors }) {
  const ring = useRef();
  useFrame((state) => {
    if (ring.current) ring.current.material.opacity = 0.55 + Math.sin(state.clock.elapsedTime * 3) * 0.25;
  });
  return (
    <group position={position}>
      {/* 파란 원형 마커 */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.03}>
        <circleGeometry args={[0.9, 40]} />
        <meshBasicMaterial color="#2563eb" transparent opacity={0.35} />
      </mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.04}>
        <ringGeometry args={[0.8, 0.95, 40]} />
        <meshBasicMaterial color="#60a5fa" transparent opacity={0.8} />
      </mesh>
      {/* 임시 맵일 때만 엘리베이터 문을 그림 (블렌더 맵에는 실제 엘리베이터가 있음) */}
      {showDoors ? (
      <group position={[0, 0, -1.6]}>
        <mesh position-y={1.4} castShadow>
          <boxGeometry args={[2.2, 2.8, 0.4]} />
          <meshStandardMaterial color="#8a6a45" metalness={0.6} roughness={0.35} />
        </mesh>
        {[-0.45, 0.45].map((x) => (
          <mesh key={x} position={[x, 1.2, 0.21]}>
            <boxGeometry args={[0.85, 2.2, 0.02]} />
            <meshStandardMaterial color="#c9a26b" metalness={0.8} roughness={0.25} />
          </mesh>
        ))}
        <Html position-y={3.2} center distanceFactor={10} zIndexRange={[10, 0]}>
          <div style={styles.elevatorSign}>🛗 엘리베이터 · {floor}</div>
        </Html>
      </group>
      ) : (
        <Html position-y={2.2} center distanceFactor={10} zIndexRange={[10, 0]}>
          <div style={styles.elevatorSign}>🛗 엘리베이터 · {floor}</div>
        </Html>
      )}
    </group>
  );
}

// 노란 보물 상자
function Treasure({ t }) {
  const ref = useRef();
  const labelScale = useContext(LabelScaleContext);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.position.y = Math.sin(state.clock.elapsedTime * 2) * 0.08;
  });
  const [x, , z] = t.position;
  return (
    <group position={[x, 0, z]}>
      <group ref={ref}>
        <mesh position-y={0.25} castShadow>
          <boxGeometry args={[0.7, 0.45, 0.5]} />
          <meshStandardMaterial color="#facc15" metalness={0.3} roughness={0.4} />
        </mesh>
        <mesh position-y={0.55} castShadow>
          <boxGeometry args={[0.74, 0.15, 0.54]} />
          <meshStandardMaterial color="#eab308" metalness={0.4} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.4, 0.26]}>
          <boxGeometry args={[0.12, 0.16, 0.03]} />
          <meshStandardMaterial color="#78350f" />
        </mesh>
      </group>
      <pointLight position-y={0.8} color="#ffe08a" intensity={1.5} distance={3} />
      <Html position-y={1.1} center distanceFactor={labelScale} zIndexRange={[10, 0]}>
        <div style={styles.treasureMark}>★ 보물</div>
      </Html>
    </group>
  );
}

// NPC: 상담사와 같은 모양, 가디건 색만 다르게
const STILL = { current: 0 };
function Npc({ npc }) {
  return (
    <group position={npc.position} rotation-y={npc.rotationY ?? 0}>
      <AvatarBody name={npc.name} speedRef={STILL} outfit={npc.model ? undefined : npc.color} model={npc.model} isNpc />
    </group>
  );
}

// 내 위치에서 가장 가까운 상호작용 대상을 찾아 App 에 알려줌 (0.2초마다, 바뀔 때만)
function NearbyWatcher({ myPosRef, targets, onNearby }) {
  const timer = useRef(0);
  const last = useRef("");
  useFrame((_, dt) => {
    timer.current += dt;
    if (timer.current < 0.2) return;
    timer.current = 0;
    const p = myPosRef.current;
    let best = null;
    let bestScore = Infinity;
    for (const t of targets) {
      const d = Math.hypot(p.x - t.position[0], p.z - t.position[2]);
      if (d <= t.range && d / t.range < bestScore) {
        best = { type: t.type, id: t.id };
        bestScore = d / t.range;
      }
    }
    const key = best ? `${best.type}:${best.id}` : "";
    if (key !== last.current) {
      last.current = key;
      onNearby(best);
    }
  });
  return null;
}

/* ───────────── 아바타 ───────────── */

// 상담사 캐릭터: 파란 가디건 + 헤드셋 + 마젠타 사원증, 걸을 때 팔다리 흔들림
const CARDIGAN = "#2f5fb3";
const PANTS = "#1f2a44";
const SKIN = "#ffd9b8";

// 이름표 크기 (1인칭에서는 가까이 보이므로 작게)
const LabelScaleContext = createContext(10);

// characters.glb 사용 가능 여부 (App 에서 확인해 내려줌)
const CharsContext = createContext(false);

// 블렌더 characters.glb 캐릭터: Hip_L/R, Shoulder_L/R 관절을 흔들어 걷기 동작
function GlbCharacter({ model = PLAYER_MODEL, outfit, speedRef }) {
  const { scene } = useGLTF(CHAR_URL);
  const { object, limbs } = useMemo(() => {
    const src = scene.getObjectByName(model) || scene.getObjectByName(PLAYER_MODEL);
    if (!src) throw new Error(`characters.glb 에 ${model} 이(가) 없습니다`);
    const object = src.clone(true);
    object.position.set(0, 0, 0);
    object.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      // NPC 는 가디건 색만 바꿔서 구분
      if (outfit && /cardigan/i.test(o.material?.name || "")) {
        o.material = o.material.clone();
        o.material.color.set(outfit);
      }
    });
    const find = (re) => {
      let hit = null;
      object.traverse((o) => !hit && re.test(o.name) && (hit = o));
      return hit ? { node: hit, base: hit.rotation.x } : null;
    };
    return {
      object,
      limbs: {
        hipL: find(/_Hip_L$/), hipR: find(/_Hip_R$/),
        shL: find(/_Shoulder_L$/), shR: find(/_Shoulder_R$/),
      },
    };
  }, [scene, model, outfit]);

  const phase = useRef(0);
  useFrame((_, dt) => {
    const sp = speedRef.current;
    phase.current += dt * 9 * Math.max(sp, 0.001);
    const swing = Math.sin(phase.current) * 0.6 * sp;
    const set = (l, v) => l && (l.node.rotation.x = l.base + v);
    set(limbs.hipL, -swing);
    set(limbs.hipR, swing);
    set(limbs.shL, swing);
    set(limbs.shR, -swing);
  });
  return <primitive object={object} />;
}

class CharBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    console.warn("characters.glb 사용 실패 → 기본 캐릭터:", err?.message);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function AvatarBody({ tagColor, name, bubble, isMe, speedRef, outfit, isNpc, model, hideLabel }) {
  const charsOk = useContext(CharsContext);
  const labelScale = useContext(LabelScaleContext);
  const procedural = <ProceduralBody speedRef={speedRef} outfit={outfit || CARDIGAN} />;
  return (
    <group>
      {charsOk ? (
        <CharBoundary fallback={procedural}>
          <Suspense fallback={procedural}>
            <GlbCharacter model={model} outfit={outfit} speedRef={speedRef} />
          </Suspense>
        </CharBoundary>
      ) : (
        procedural
      )}
      {!hideLabel && (
      <Html position-y={1.8} center distanceFactor={labelScale} zIndexRange={[10, 0]}>
        <div style={{ ...styles.labelWrap, transform: "translateY(-50%)" /* 이름표 아래쪽이 머리 위에 오도록 */ }}>
          {isNpc && <div style={styles.npcMark}>💬</div>}
          {bubble && <div style={styles.bubble}>{bubble}</div>}
          <div style={{ ...styles.name, background: isNpc ? "#b45309" : isMe ? "#e6007e" : tagColor || "rgba(0,0,0,.6)" }}>
            {isNpc ? `[NPC] ${name}` : name}
          </div>
        </div>
      </Html>
      )}
    </group>
  );
}

// characters.glb 가 없을 때 쓰는 기본 도형 캐릭터
function ProceduralBody({ speedRef, outfit }) {
  const lArm = useRef(), rArm = useRef(), lLeg = useRef(), rLeg = useRef();
  const phase = useRef(0);
  useFrame((_, dt) => {
    const sp = speedRef.current; // 0 ~ 1
    phase.current += dt * 9 * Math.max(sp, 0.001);
    const swing = Math.sin(phase.current) * 0.7 * sp;
    if (lArm.current) {
      lArm.current.rotation.x = swing;
      rArm.current.rotation.x = -swing;
      lLeg.current.rotation.x = -swing;
      rLeg.current.rotation.x = swing;
    }
  });

  return (
    <group>
      {/* 다리 (엉덩이 높이 0.75 에서 회전) */}
      {[[-0.11, lLeg], [0.11, rLeg]].map(([x, r]) => (
        <group key={x} ref={r} position={[x, 0.75, 0]}>
          <mesh position-y={-0.36} castShadow>
            <boxGeometry args={[0.16, 0.72, 0.18]} />
            <meshStandardMaterial color={PANTS} />
          </mesh>
          <mesh position={[0, -0.72, 0.04]}>
            <boxGeometry args={[0.17, 0.08, 0.26]} />
            <meshStandardMaterial color="#111" />
          </mesh>
        </group>
      ))}
      {/* 몸통: 파란 가디건 + 흰 셔츠 */}
      <mesh position-y={1.07} castShadow>
        <boxGeometry args={[0.46, 0.62, 0.26]} />
        <meshStandardMaterial color={outfit} />
      </mesh>
      <mesh position={[0, 1.12, 0.131]}>
        <boxGeometry args={[0.12, 0.5, 0.01]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      {/* 마젠타 사원증 + 목걸이 줄 */}
      <mesh position={[0.07, 1.36, 0.135]} rotation-z={0.35}>
        <boxGeometry args={[0.025, 0.22, 0.01]} />
        <meshStandardMaterial color="#e6007e" />
      </mesh>
      <mesh position={[0, 1.1, 0.14]}>
        <boxGeometry args={[0.13, 0.17, 0.015]} />
        <meshStandardMaterial color="#e6007e" />
      </mesh>
      <mesh position={[0, 1.12, 0.149]}>
        <boxGeometry args={[0.09, 0.06, 0.004]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {/* 팔 (어깨 높이 1.33 에서 회전) */}
      {[[-0.3, lArm], [0.3, rArm]].map(([x, r]) => (
        <group key={x} ref={r} position={[x, 1.33, 0]}>
          <mesh position-y={-0.27} castShadow>
            <boxGeometry args={[0.13, 0.54, 0.15]} />
            <meshStandardMaterial color={outfit} />
          </mesh>
          <mesh position-y={-0.58}>
            <boxGeometry args={[0.11, 0.1, 0.12]} />
            <meshStandardMaterial color={SKIN} />
          </mesh>
        </group>
      ))}
      {/* 머리 + 머리카락 */}
      <mesh position-y={1.6} castShadow>
        <sphereGeometry args={[0.21, 24, 24]} />
        <meshStandardMaterial color={SKIN} />
      </mesh>
      <mesh position={[0, 1.65, -0.02]}>
        <sphereGeometry args={[0.225, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#2b1d14" />
      </mesh>
      {[-0.07, 0.07].map((x) => (
        <mesh key={x} position={[x, 1.61, 0.195]}>
          <sphereGeometry args={[0.025, 10, 10]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      ))}
      {/* 헤드셋: 머리띠 + 귀 패드 + 마이크 */}
      <mesh position-y={1.62} rotation-y={Math.PI / 2}>
        <torusGeometry args={[0.235, 0.022, 8, 24, Math.PI]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      {[-0.235, 0.235].map((x) => (
        <mesh key={x} position={[x, 1.6, 0]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.07, 0.07, 0.05, 16]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
      ))}
      <mesh position={[-0.17, 1.52, 0.12]} rotation={[0, -0.6, 0.3]}>
        <boxGeometry args={[0.02, 0.02, 0.2]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh position={[-0.09, 1.49, 0.2]}>
        <sphereGeometry args={[0.025, 10, 10]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
    </group>
  );
}

// (x, z) 위치에 캐릭터가 서면 장애물과 겹치는지
function hitsWall(colliders, x, z) {
  if (!colliders) return false;
  const r = PLAYER_RADIUS;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (x > c[0] - r && x < c[2] + r && z > c[1] - r && z < c[3] + r) return true;
  }
  return false;
}

function MyAvatar({ me, inputRef, bubble, myPosRef, frozen, bounds, colliders, camMode = "top" }) {
  const ref = useRef();
  const sendTimer = useRef(0);
  const lastSent = useRef("");
  const { camera } = useThree();
  const camTarget = useMemo(() => new THREE.Vector3(), []);
  const speedRef = useRef(0);
  const idleTime = useRef(0);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const cam = CAMERA_MODES[camMode] || CAMERA_MODES.top;
    const { x, y } = frozen ? { x: 0, y: 0 } : inputRef.current; // x: 좌우, y: 앞뒤(-1이 위)
    let len = Math.hypot(x, y);
    // 이동 방향(dx, dz)과 속도 비율 정하기
    let dx = 0, dz = 0, amount = 0;
    if (cam.firstPerson) {
      // 1인칭: 좌우 = 몸 돌리기, 위아래 = 앞뒤로 걷기
      if (Math.abs(x) > 0.05) g.rotation.y -= x * TURN_SPEED * Math.min(dt, 0.25);
      if (Math.abs(y) > 0.05) {
        dx = Math.sin(g.rotation.y) * -y;
        dz = Math.cos(g.rotation.y) * -y;
        amount = Math.min(Math.abs(y), 1) / Math.abs(y);
      }
      len = Math.max(Math.abs(y), Math.abs(x) * 0.4); // 제자리 회전도 살짝 걷는 동작
    } else if (len > 0.05) {
      // 정면·위에서 보기: 화면 기준 방향으로 걷기
      dx = x;
      dz = y;
      amount = Math.min(len, 1) / len;
      g.rotation.y = lerpAngle(g.rotation.y, Math.atan2(x, y), Math.min(1, dt * 12));
    }
    if (amount > 0) {
      const [x0, z0, x1, z1] = bounds || [-BOUNDS, -BOUNDS, BOUNDS, BOUNDS];
      const dist = Math.min(dt, 0.25) * MOVE_SPEED * amount;
      const n = Math.max(1, Math.ceil(dist / 0.1)); // 0.1m 씩 나눠 이동 → 프레임이 느려도 얇은 벽을 뚫지 않음
      for (let i = 0; i < n; i++) {
        const nx = THREE.MathUtils.clamp(g.position.x + (dx * dist) / n, x0, x1);
        const nz = THREE.MathUtils.clamp(g.position.z + (dz * dist) / n, z0, z1);
        // 이미 물체 안에 끼어 있으면 빠져나올 수 있게 허용, 아니면 x·z 따로 검사해 벽을 따라 미끄러지듯 이동
        const stuck = hitsWall(colliders, g.position.x, g.position.z);
        if (stuck || !hitsWall(colliders, nx, g.position.z)) g.position.x = nx;
        if (stuck || !hitsWall(colliders, g.position.x, nz)) g.position.z = nz;
      }
    }
    // 정면 보기: 멈춰 있으면 캐릭터가 화면(카메라) 쪽으로 돌아봄
    idleTime.current = len > 0.05 ? 0 : idleTime.current + dt;
    if (camMode === "front" && idleTime.current > FACE_CAMERA_DELAY) {
      g.rotation.y = lerpAngle(g.rotation.y, 0, Math.min(1, dt * 5));
    }
    speedRef.current = THREE.MathUtils.lerp(speedRef.current, len > 0.05 ? Math.min(len, 1) : 0, Math.min(1, dt * 10));
    myPosRef.current.copy(g.position);
    if (import.meta.env.DEV) window.__cmPos = [+g.position.x.toFixed(2), +g.position.z.toFixed(2)]; // 개발용 위치 확인

    // 카메라
    if (camera.fov !== cam.fov) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
    if (cam.firstPerson) {
      // 1인칭: 캐릭터 눈 위치에서 바라보는 방향으로
      const fx = Math.sin(g.rotation.y), fz = Math.cos(g.rotation.y);
      camera.position.set(g.position.x + fx * 0.15, g.position.y + cam.eyeY, g.position.z + fz * 0.15);
      camera.lookAt(g.position.x + fx * 5, g.position.y + cam.eyeY - 0.45, g.position.z + fz * 5);
    } else {
      camTarget.set(g.position.x + cam.offset[0], g.position.y + cam.offset[1], g.position.z + cam.offset[2]);
      camera.position.lerp(camTarget, Math.min(1, dt * 5));
      camera.lookAt(g.position.x, g.position.y + cam.lookY, g.position.z);
    }

    // 서버 전송 (변화 있을 때만)
    sendTimer.current += dt;
    if (sendTimer.current >= SEND_INTERVAL) {
      sendTimer.current = 0;
      const pos = [g.position.x, g.position.y, g.position.z].map((v) => +v.toFixed(2));
      const rot = +g.rotation.y.toFixed(2);
      const key = pos.join(",") + "|" + rot;
      if (key !== lastSent.current) {
        lastSent.current = key;
        if (!frozen) socket.emit("move", { position: pos, rotationY: rot });
      }
    }
  });

  return (
    <group ref={ref} position={me.position}>
      {/* 1인칭에서는 내 몸이 카메라를 가리지 않도록 숨김 */}
      {!CAMERA_MODES[camMode]?.firstPerson && <AvatarBody name={me.name} bubble={bubble} isMe speedRef={speedRef} model={lookModel(me.look)} outfit={me.look?.outfit} />}
    </group>
  );
}

function OtherAvatar({ player, bubble }) {
  const ref = useRef();
  const target = useMemo(() => new THREE.Vector3(...player.position), []); // eslint-disable-line
  target.set(...player.position);
  const speedRef = useRef(0);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const gap = g.position.distanceTo(target);
    speedRef.current = THREE.MathUtils.lerp(speedRef.current, gap > 0.05 ? Math.min(gap * 3, 1) : 0, Math.min(1, dt * 8));
    g.position.lerp(target, Math.min(1, dt * 10)); // 부드럽게 보간
    g.rotation.y = lerpAngle(g.rotation.y, player.rotationY || 0, Math.min(1, dt * 10));
  });

  return (
    <group ref={ref} position={player.position}>
      <AvatarBody
        tagColor={player.color}
        name={player.name}
        bubble={bubble}
        speedRef={speedRef}
        model={lookModel(player.look)}
        outfit={player.look?.outfit}
      />
    </group>
  );
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/* ───────────── 입장 화면: 캐릭터 미리보기 ───────────── */

function TurntableAvatar({ look }) {
  const ref = useRef();
  const speedRef = useRef(0);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.9;
  });
  return (
    <group ref={ref}>
      <AvatarBody model={lookModel(look)} outfit={look.outfit} speedRef={speedRef} hideLabel />
    </group>
  );
}

function LookPreview({ look, charsOk }) {
  return (
    <div style={styles.previewBox}>
      <Canvas dpr={[1, 2]} camera={{ fov: 30, position: [0, 1.05, 3.4] }} onCreated={({ camera }) => camera.lookAt(0, 0.82, 0)}>
        <hemisphereLight intensity={0.9} groundColor="#9aa" />
        <directionalLight position={[2, 4, 3]} intensity={1.3} />
        <mesh rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.7, 40]} />
          <meshStandardMaterial color="#e9e3f0" />
        </mesh>
        <CharsContext.Provider value={charsOk}>
          <Suspense fallback={null}>
            <TurntableAvatar look={look} />
          </Suspense>
        </CharsContext.Provider>
      </Canvas>
    </div>
  );
}

/* ───────────── 입력: 키보드 + 가상 조이스틱 ───────────── */

function useKeyboard(inputRef, joyRef) {
  useEffect(() => {
    const keys = new Set();
    const update = () => {
      if (joyRef.current.active) return;
      inputRef.current.x = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
      inputRef.current.y = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
    };
    const down = (e) => {
      if (e.target.tagName === "INPUT") return;
      if (e.key === " " || e.key === "Enter") return window.dispatchEvent(new Event("cm-interact"));
      keys.add(e.key.toLowerCase());
      update();
    };
    const up = (e) => {
      keys.delete(e.key.toLowerCase());
      update();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [inputRef, joyRef]);
}

function Joystick({ inputRef, joyRef }) {
  const RADIUS = 50;
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const baseRef = useRef();
  const pointerId = useRef(null);

  const move = (e) => {
    const r = baseRef.current.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) {
      dx = (dx / d) * RADIUS;
      dy = (dy / d) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    inputRef.current.x = dx / RADIUS;
    inputRef.current.y = dy / RADIUS;
  };
  const start = (e) => {
    pointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    joyRef.current.active = true;
    move(e);
  };
  const end = (e) => {
    if (e.pointerId !== pointerId.current) return;
    pointerId.current = null;
    joyRef.current.active = false;
    setKnob({ x: 0, y: 0 });
    inputRef.current.x = 0;
    inputRef.current.y = 0;
  };

  return (
    <div
      ref={baseRef}
      style={styles.joyBase}
      onPointerDown={start}
      onPointerMove={(e) => e.pointerId === pointerId.current && move(e)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div style={{ ...styles.joyKnob, transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

/* ───────────── 메인 앱 ───────────── */

export default function App() {
  const [me, setMe] = useState(null);
  const [others, setOthers] = useState({}); // 같은 층 직원만
  const [onlineCount, setOnlineCount] = useState(0);
  const [world, setWorld] = useState({ floors: [], elevators: {} });
  const [bubbles, setBubbles] = useState({});
  const [connected, setConnected] = useState(false);
  const [nameInput, setNameInput] = useState(() => localStorage.getItem("cm_name") || "");
  const [look, setLook] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("cm_look"));
      if (saved && CHARACTER_TYPES.some((t) => t.id === saved.type) && OUTFIT_COLORS.some((c) => c.hex === saved.outfit)) return saved;
    } catch {}
    return DEFAULT_LOOK;
  });
  const [chat, setChat] = useState("");
  const [treasures, setTreasures] = useState([]);
  const [nearbyTarget, setNearbyTarget] = useState(null); // { type: "npc" | "treasure" | "elevator", id }
  const [dialog, setDialog] = useState(null); // { title, lines: [], page }
  const [elevatorOpen, setElevatorOpen] = useState(false);
  const [busy, setBusy] = useState(false); // 서버 응답 대기 중
  const [spawnSeq, setSpawnSeq] = useState(0); // 층 이동 시 내 아바타를 새 위치에 다시 배치
  const [toast, setToast] = useState(null);
  const [lobbyMsg, setLobbyMsg] = useState("");
  const myPosRef = useRef(new THREE.Vector3());
  const toastTimer = useRef();
  const inputRef = useRef({ x: 0, y: 0 });
  const joyRef = useRef({ active: false });
  useKeyboard(inputRef, joyRef);

  const floor = me?.floor;
  const maps = useAvailableMaps(world.floors);
  const [floorBounds, setFloorBounds] = useState({}); // 층별 이동 범위 (블렌더 맵 바닥 크기)
  const [floorColliders, setFloorColliders] = useState({}); // 층별 벽·가구 충돌 상자
  const [camMode, setCamMode] = useState(() => {
    try {
      const saved = localStorage.getItem("cm_cam");
      return CAMERA_MODES[saved] ? saved : "front";
    } catch {
      return "front";
    }
  });
  const toggleCam = () => {
    const next = CAMERA_ORDER[(CAMERA_ORDER.indexOf(camMode) + 1) % CAMERA_ORDER.length];
    setCamMode(next);
    try {
      localStorage.setItem("cm_cam", next);
    } catch {}
  };
  const [charsOk, setCharsOk] = useState(false);
  useEffect(() => {
    fileExists(CHAR_URL).then((ok) => {
      if (ok) useGLTF.preload(CHAR_URL);
      setCharsOk(ok);
    });
  }, []);

  const showToast = (text) => {
    clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onInit = ({ me, players, treasures, world }) => {
      setMe(me);
      setWorld(world);
      setTreasures(treasures || []);
      setOthers(Object.fromEntries(players.filter((p) => p.id !== me.id).map((p) => [p.id, p])));
      setSpawnSeq((n) => n + 1);
    };
    const onJoined = (p) => setOthers((o) => ({ ...o, [p.id]: p }));
    const onMoved = ({ id, position, rotationY }) =>
      setOthers((o) => (o[id] ? { ...o, [id]: { ...o[id], position, rotationY } } : o));
    const onLeft = (id) =>
      setOthers((o) => {
        if (!o[id]) return o;
        const n = { ...o };
        delete n[id];
        return n;
      });
    const onChat = ({ id, text }) => {
      setBubbles((b) => ({ ...b, [id]: text }));
      setTimeout(() => setBubbles((b) => (b[id] === text ? { ...b, [id]: null } : b)), 4000);
    };
    const onTreasureClaimed = ({ treasureId, name, itemName, foundCount, claimed }) => {
      setTreasures((ts) => ts.map((t) => (t.id === treasureId ? { ...t, foundCount, claimed } : t)));
      if (name) showToast(`📢 ${name}님이 [${itemName}]을(를) 찾았어요!`);
    };
    const onJoinRejected = ({ message }) => {
      setMe(null);
      setLobbyMsg(message);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("init", onInit);
    socket.on("playerJoined", onJoined);
    socket.on("playerMoved", onMoved);
    socket.on("playerLeft", onLeft);
    socket.on("chat", onChat);
    socket.on("treasureClaimed", onTreasureClaimed);
    socket.on("joinRejected", onJoinRejected);
    socket.on("onlineCount", setOnlineCount);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("init", onInit);
      socket.off("playerJoined", onJoined);
      socket.off("playerMoved", onMoved);
      socket.off("playerLeft", onLeft);
      socket.off("chat", onChat);
      socket.off("treasureClaimed", onTreasureClaimed);
      socket.off("joinRejected", onJoinRejected);
      socket.off("onlineCount", setOnlineCount);
    };
  }, []);

  /* ── 지금 층에 있는 것들 ── */
  const floorNpcs = NPCS.filter((n) => n.floor === floor);
  const floorTreasures = treasures.filter((t) => t.floor === floor && !t.foundByMe && !t.claimed);
  const elevatorPos = world.elevators[floor];

  const targets = useMemo(
    () => [
      ...floorNpcs.map((n) => ({ type: "npc", id: n.id, position: n.position, range: INTERACT_DISTANCE })),
      ...floorTreasures.map((t) => ({ type: "treasure", id: t.id, position: t.position, range: INTERACT_DISTANCE })),
      ...(elevatorPos ? [{ type: "elevator", id: floor, position: elevatorPos, range: ELEVATOR_DISTANCE }] : []),
    ],
    [floor, treasures, world] // eslint-disable-line
  );

  const nearby =
    nearbyTarget?.type === "npc"
      ? { type: "npc", data: floorNpcs.find((n) => n.id === nearbyTarget.id) }
      : nearbyTarget?.type === "treasure"
      ? { type: "treasure", data: floorTreasures.find((t) => t.id === nearbyTarget.id) }
      : nearbyTarget?.type === "elevator" && nearbyTarget.id === floor
      ? { type: "elevator", data: { floor } }
      : null;
  const modalOpen = !!dialog || elevatorOpen;
  const canInteract = nearby?.data && !modalOpen;

  /* ── 상호작용 ── */
  const openDialog = (title, lines) => setDialog({ title, lines: [].concat(lines), page: 0 });
  const nextDialog = () =>
    setDialog((d) => (d && d.page < d.lines.length - 1 ? { ...d, page: d.page + 1 } : null));

  const interact = () => {
    if (!canInteract || busy) return;
    if (nearby.type === "npc") openDialog(nearby.data.name, nearby.data.dialog);
    else if (nearby.type === "treasure") pickUp(nearby.data);
    else if (nearby.type === "elevator") setElevatorOpen(true);
  };

  const pickUp = async (target) => {
    setBusy(true);
    const res = await claimTreasure(target.id); // 서버 Acknowledgement 응답 대기
    setBusy(false);
    openDialog(res.success ? "🎉 보물 획득!" : "알림", res.message);
    if (res.success) {
      setTreasures((ts) => ts.map((t) => (t.id === res.treasureId ? { ...t, foundByMe: true } : t)));
    } else if (/이미 획득|먼저 찾았/.test(res.message)) {
      setTreasures((ts) =>
        ts.map((t) =>
          t.id === target.id
            ? { ...t, foundByMe: t.foundByMe || /이미/.test(res.message), claimed: t.claimed || /먼저/.test(res.message) }
            : t
        )
      );
    }
  };

  const goFloor = async (target) => {
    if (busy) return;
    setElevatorOpen(false);
    setBusy(true);
    const res = await changeFloor(target);
    if (res.ok) {
      await new Promise((r) => setTimeout(r, 600)); // 엘리베이터 연출
      setMe((m) => ({ ...m, floor: res.floor, position: res.position }));
      setOthers(Object.fromEntries(res.players.filter((p) => p.id !== socket.id).map((p) => [p.id, p])));
      setBubbles({});
      setNearbyTarget(null);
      setSpawnSeq((n) => n + 1);
      showToast(`🛗 ${res.floor}에 도착했어요`);
    } else {
      openDialog("알림", res.message);
    }
    setBusy(false);
  };

  const showInventory = () => {
    const mine = treasures.filter((t) => t.foundByMe).map((t) => `🎁 ${t.name} (${t.floor})`);
    openDialog("내가 찾은 보물", mine.length ? mine.join("\n") : "아직 찾은 보물이 없어요.");
  };

  // PC: 스페이스/엔터로 상호작용, 대화창 넘기기
  const interactRef = useRef();
  interactRef.current = () => (dialog ? nextDialog() : elevatorOpen ? null : interact());
  useEffect(() => {
    const h = () => interactRef.current?.();
    window.addEventListener("cm-interact", h);
    return () => window.removeEventListener("cm-interact", h);
  }, []);

  const enter = (e) => {
    e.preventDefault();
    const name = nameInput.trim();
    if (!name) return;
    localStorage.setItem("cm_name", name);
    localStorage.setItem("cm_look", JSON.stringify(look));
    setLobbyMsg("");
    connectAs(name, look);
  };

  const sendChat = (e) => {
    e.preventDefault();
    if (!chat.trim()) return;
    socket.emit("chat", chat);
    setChat("");
    document.activeElement?.blur(); // 모바일 키보드 닫기
  };

  /* ── 로비 ── */
  if (!me) {
    return (
      <div style={styles.lobby}>
        <form onSubmit={enter} style={styles.lobbyCard}>
          <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>🏢 회사 메타버스</h1>
          <p style={{ margin: "0 0 10px", color: "#6b7280", fontSize: 13 }}>캐릭터와 옷 색을 고르고 입장하세요</p>
          <LookPreview look={look} charsOk={charsOk} />
          <div style={styles.typeRow}>
            {CHARACTER_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                style={{ ...styles.typeBtn, ...(look.type === t.id ? styles.typeBtnOn : null) }}
                onClick={() => setLook((l) => ({ ...l, type: t.id }))}
              >
                <b>{t.label}</b>
                <span style={{ fontSize: 11, opacity: 0.8 }}>{t.sub}</span>
              </button>
            ))}
          </div>
          <div style={styles.swatchGrid}>
            {OUTFIT_COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                title={c.label}
                aria-label={c.label}
                style={{ ...styles.swatch, background: c.hex, ...(look.outfit === c.hex ? styles.swatchOn : null) }}
                onClick={() => setLook((l) => ({ ...l, outfit: c.hex }))}
              />
            ))}
          </div>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "#6b7280" }}>
            가디건 색: {OUTFIT_COLORS.find((c) => c.hex === look.outfit)?.label}
          </p>
          <input
            style={styles.input}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="예: 김승현"
            maxLength={12}
            autoFocus
          />
          <button style={styles.button} type="submit">입장하기</button>
          {lobbyMsg && <p style={{ color: "#dc2626", fontSize: 13, margin: "12px 0 0" }}>{lobbyMsg}</p>}
        </form>
      </div>
    );
  }

  const floorCount = Object.keys(others).length + 1;
  const buttonStyle = {
    npc: ["#3b82f6", "💬\n대화하기"],
    treasure: ["#eab308", "🎁\n보물 열기"],
    elevator: ["#2563eb", "🛗\n층간 이동"],
  };

  /* ── 3D 화면 ── */
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Canvas shadows dpr={[1, 1.75]} camera={{ fov: 50, position: CAMERA_OFFSET }}>
        <color attach="background" args={["#cfe3f5"]} />
        <hemisphereLight intensity={0.6} groundColor="#888" />
        <directionalLight
          position={[8, 15, 6]}
          intensity={1.2}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-20}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
        />

        <CharsContext.Provider value={charsOk}>
        <LabelScaleContext.Provider value={CAMERA_MODES[camMode]?.firstPerson ? 3.5 : 10}>
        <FloorWorldMap
          floor={floor}
          available={maps}
          onBounds={(f, b) => setFloorBounds((o) => ({ ...o, [f]: b }))}
          onColliders={(f, c) => setFloorColliders((o) => ({ ...o, [f]: c }))}
        />
        {elevatorPos && <Elevator position={elevatorPos} floor={floor} showDoors={maps[floor] === false} />}
        {floorNpcs.map((n) => (
          <Npc key={n.id} npc={n} />
        ))}
        {floorTreasures.map((t) => (
          <Treasure key={t.id} t={t} />
        ))}
        <NearbyWatcher myPosRef={myPosRef} targets={targets} onNearby={setNearbyTarget} />
        <OcclusionFader myPosRef={myPosRef} disabled={CAMERA_MODES[camMode]?.firstPerson} />

        <MyAvatar
          key={`${floor}-${spawnSeq}`}
          me={me}
          inputRef={inputRef}
          bubble={bubbles[me.id]}
          myPosRef={myPosRef}
          frozen={modalOpen || busy}
          bounds={maps[floor] ? floorBounds[floor] : null}
          colliders={maps[floor] ? floorColliders[floor] : null}
          camMode={camMode}
        />
        {Object.values(others).map((p) => (
          <OtherAvatar key={p.id} player={p} bubble={bubbles[p.id]} />
        ))}
        </LabelScaleContext.Provider>
        </CharsContext.Provider>
      </Canvas>

      <div style={{ ...styles.topBar, left: "auto", right: 12 }}>
        <span style={{ ...styles.dot, background: connected ? "#22c55e" : "#ef4444" }} />
        {connected ? (
          <>
            <b>📍 {floor}</b>&nbsp;· {floorCount}명 / 전체 {Math.max(onlineCount, floorCount)}
          </>
        ) : (
          "연결 끊김 · 재연결 중…"
        )}
      </div>
      <button style={{ ...styles.topBar, border: 0, fontWeight: 700 }} onClick={showInventory}>
        🎁 보물 {treasures.filter((t) => t.foundByMe).length} / {treasures.length}개
      </button>

      <button style={styles.camBtn} onClick={toggleCam}>
        🎥 {CAMERA_MODES[CAMERA_ORDER[(CAMERA_ORDER.indexOf(camMode) + 1) % CAMERA_ORDER.length]].label}
      </button>

      <Joystick inputRef={inputRef} joyRef={joyRef} />

      {canInteract && (
        <button
          style={{ ...styles.actionBtn, background: buttonStyle[nearby.type][0] }}
          onClick={interact}
          disabled={busy}
        >
          {busy ? "확인 중…" : buttonStyle[nearby.type][1]}
        </button>
      )}

      {elevatorOpen && (
        <div style={styles.backdrop} onClick={() => setElevatorOpen(false)}>
          <div style={styles.elevatorPanel} onClick={(e) => e.stopPropagation()}>
            <div style={styles.dialogTitle}>🛗 몇 층으로 갈까요?</div>
            {[...world.floors].reverse().map((f) => (
              <button
                key={f}
                style={{ ...styles.floorBtn, ...(f === floor ? styles.floorBtnCurrent : null) }}
                disabled={f === floor}
                onClick={() => goFloor(f)}
              >
                {f}
                <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 8 }}>
                  {f === floor ? "현재 층" : FLOOR_THEME[f]?.label.replace(`${f} `, "") || ""}
                </span>
              </button>
            ))}
            <button style={styles.closeBtn} onClick={() => setElevatorOpen(false)}>닫기</button>
          </div>
        </div>
      )}

      {busy && nearby?.type !== "treasure" && <div style={styles.moving}>🛗 이동 중…</div>}

      {dialog && (
        <div style={styles.dialog} onClick={nextDialog}>
          <div style={styles.dialogTitle}>{dialog.title}</div>
          <p style={styles.dialogText}>{dialog.lines[dialog.page]}</p>
          <div style={styles.dialogHint}>
            {dialog.page < dialog.lines.length - 1 ? "▼ 터치해서 계속" : "터치해서 닫기"}
          </div>
        </div>
      )}

      {toast && <div style={styles.toast}>{toast}</div>}

      <form onSubmit={sendChat} style={styles.chatBar}>
        <input
          style={styles.chatInput}
          value={chat}
          onChange={(e) => setChat(e.target.value)}
          placeholder={`${floor} 사람들에게 메시지`}
          maxLength={80}
          enterKeyHint="send"
        />
        <button style={styles.chatBtn} type="submit">전송</button>
      </form>
    </div>
  );
}

/* ───────────── 스타일 ───────────── */

const styles = {
  lobby: { position: "fixed", inset: 0, display: "flex", justifyContent: "center", alignItems: "safe center", overflowY: "auto", background: "linear-gradient(160deg,#1f2937,#4b0b33)", padding: 16, boxSizing: "border-box", touchAction: "pan-y" },
  lobbyCard: { width: "100%", maxWidth: 360, background: "#fff", borderRadius: 18, padding: "18px 18px 20px", boxSizing: "border-box", textAlign: "center", margin: "auto 0" },
  previewBox: { height: 210, borderRadius: 14, background: "linear-gradient(180deg,#f6f2fb,#ece6f3)", marginBottom: 10, overflow: "hidden" },
  typeRow: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 },
  typeBtn: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "8px 0", borderRadius: 10, border: "2px solid #e5e7eb", background: "#fff", color: "#374151", fontSize: 14 },
  typeBtnOn: { borderColor: "#e6007e", background: "#fdf0f7", color: "#be005f" },
  swatchGrid: { display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 6, justifyItems: "center" },
  swatch: { width: 34, height: 34, borderRadius: "50%", border: "2px solid rgba(0,0,0,.12)", boxShadow: "inset 0 0 0 2px #fff" },
  swatchOn: { border: "3px solid #111827", transform: "scale(1.1)" },
  input: { width: "100%", boxSizing: "border-box", fontSize: 16, padding: "12px 14px", borderRadius: 10, border: "1px solid #d1d5db", marginBottom: 12, outline: "none" },
  button: { width: "100%", fontSize: 16, fontWeight: 700, padding: "12px 0", border: 0, borderRadius: 10, background: "#e6007e", color: "#fff" },
  topBar: { position: "absolute", top: "max(12px, env(safe-area-inset-top))", left: 12, padding: "6px 12px", borderRadius: 999, background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 13, display: "flex", alignItems: "center", gap: 6, zIndex: 5 },
  dot: { width: 8, height: 8, borderRadius: "50%", display: "inline-block" },
  joyBase: { position: "absolute", left: 24, bottom: "calc(84px + env(safe-area-inset-bottom))", width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,.25)", border: "2px solid rgba(255,255,255,.6)", display: "grid", placeItems: "center", touchAction: "none" },
  joyKnob: { width: 52, height: 52, borderRadius: "50%", background: "rgba(255,255,255,.9)", boxShadow: "0 2px 8px rgba(0,0,0,.3)", pointerEvents: "none" },
  chatBar: { position: "absolute", left: 12, right: 12, bottom: "max(12px, env(safe-area-inset-bottom))", display: "flex", gap: 8 },
  chatInput: { flex: 1, minWidth: 0, fontSize: 16, padding: "10px 14px", borderRadius: 999, border: 0, outline: "none", background: "rgba(255,255,255,.92)" },
  chatBtn: { fontSize: 15, fontWeight: 700, padding: "0 18px", borderRadius: 999, border: 0, background: "#e6007e", color: "#fff" },
  labelWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, pointerEvents: "none", whiteSpace: "nowrap" },
  name: { color: "#fff", fontSize: 12, padding: "2px 8px", borderRadius: 999 },
  bubble: { background: "#fff", color: "#111", fontSize: 13, padding: "6px 10px", borderRadius: 12, maxWidth: 180, whiteSpace: "normal", boxShadow: "0 2px 6px rgba(0,0,0,.25)" },
  actionBtn: { position: "absolute", right: 24, bottom: "calc(110px + env(safe-area-inset-bottom))", width: 100, height: 100, borderRadius: "50%", border: "3px solid #fff", color: "#fff", fontSize: 15, fontWeight: 800, lineHeight: 1.35, whiteSpace: "pre-line", boxShadow: "0 4px 14px rgba(0,0,0,.35)", touchAction: "manipulation" },
  toast: { position: "absolute", top: "calc(56px + env(safe-area-inset-top))", left: "50%", transform: "translateX(-50%)", maxWidth: "88%", background: "rgba(17,24,39,.9)", color: "#fff", padding: "10px 16px", borderRadius: 12, fontSize: 14, textAlign: "center", zIndex: 20 },
  npcMark: { fontSize: 18, lineHeight: 1 },
  dialog: { position: "absolute", left: 12, right: 12, bottom: "calc(70px + env(safe-area-inset-bottom))", maxWidth: 520, margin: "0 auto", background: "rgba(17,24,39,.95)", color: "#fff", padding: "16px 18px 12px", borderRadius: 14, border: "2px solid #fbbf24", zIndex: 30 },
  dialogTitle: { color: "#fbbf24", fontWeight: 800, fontSize: 14, marginBottom: 6 },
  dialogText: { margin: "0 0 8px", fontSize: 16, lineHeight: 1.55, whiteSpace: "pre-line" },
  dialogHint: { fontSize: 12, color: "#9ca3af", textAlign: "right" },
  backdrop: { position: "absolute", inset: 0, background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center", zIndex: 40 },
  elevatorPanel: { width: 240, background: "#1f2937", borderRadius: 16, padding: 16, border: "2px solid #94a3b8", display: "flex", flexDirection: "column", gap: 8 },
  floorBtn: { fontSize: 20, fontWeight: 800, padding: "12px 0", borderRadius: 12, border: "2px solid #64748b", background: "#334155", color: "#fff" },
  floorBtnCurrent: { background: "#fbbf24", borderColor: "#fbbf24", color: "#1f2937" },
  closeBtn: { marginTop: 4, fontSize: 14, padding: "8px 0", borderRadius: 10, border: 0, background: "transparent", color: "#cbd5e1" },
  moving: { position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(15,23,42,.55)", color: "#fff", fontSize: 22, fontWeight: 800, zIndex: 50 },
  loading: { background: "rgba(0,0,0,.6)", color: "#fff", padding: "6px 12px", borderRadius: 8, fontSize: 13, whiteSpace: "nowrap" },
  camBtn: { position: "absolute", top: "calc(52px + env(safe-area-inset-top))", right: 12, padding: "6px 12px", borderRadius: 999, border: 0, background: "rgba(255,255,255,.88)", color: "#111827", fontSize: 13, fontWeight: 700, boxShadow: "0 2px 6px rgba(0,0,0,.2)", zIndex: 5 },
  treasureMark: { color: "#fde047", fontSize: 12, fontWeight: 800, textShadow: "0 0 3px #000, 0 0 3px #000", whiteSpace: "nowrap", pointerEvents: "none" },
  sign: { background: "#fff", padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" },
  floorSign: { background: "#111827", color: "#fff", padding: "4px 12px", borderRadius: 8, fontSize: 16, fontWeight: 800, whiteSpace: "nowrap" },
  elevatorSign: { background: "#475569", color: "#fff", padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" },
};
