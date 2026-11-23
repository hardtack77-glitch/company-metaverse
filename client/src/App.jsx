// 메인 3D 캔버스 + 모바일 터치 UI
// 1F / 6F / 7F·8F·9F(상담실) 층 전환(엘리베이터) + 층별 블렌더 .glb 맵 + NPC + 보물찾기
import React, { Component, Suspense, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import Shop from "./Shop.jsx";
import NewsTV from "./NewsTV.jsx";
import LectureScreen from "./LectureScreen.jsx";
import { shopInfo } from "./socket.js";
import { socket, connectAs, claimTreasure, changeFloor, submitDart, sendMove, rememberPose, signup, login, checkSession, logout, getToken, sendAction } from "./socket.js";
import { openExternal, shouldAutoResume, clearResume } from "./openLink.js";
import DartGame from "./DartGame.jsx";
import NpcMessage from "./NpcMessage.jsx";
import ChatLog from "./ChatLog.jsx";
import Inbox from "./Inbox.jsx";
import RpsGame from "./RpsGame.jsx";
import OmokGame from "./OmokGame.jsx";
import ShellGame from "./ShellGame.jsx";
import ReactionGame from "./ReactionGame.jsx";
import EmpathyGame from "./EmpathyGame.jsx";
import Rankings from "./Rankings.jsx";
import BaseballGame from "./BaseballGame.jsx";
import MemoryGame from "./MemoryGame.jsx";
import PhotoSpot from "./PhotoSpot.jsx";
import { zoneAt } from "./photoZones.js";
import { ACTIONS, ACTION_MAP, startAction, cancelAction, actionState, actionPose, onAction, PLANE_RELEASE } from "./actions.js";
import { STAFF_NPCS, COUNSEL_FLOORS, seatedWorkers, classroomWorkers, RECRUITERS, RECRUIT_LINKS, RECRUIT_GREETING, RECRUIT_HELLOS } from "./staff.js";
import SeatedCrowd from "./SeatedCrowd.jsx";

/* ───────────── 설정 ───────────── */

// 층별 맵 파일: client/public/floor_1f.glb, floor_6f.glb, floor_7f.glb
// 주소 끝 ?v=… 는 배포 번호: 새로 배포하면 주소가 바뀌어 예전에 저장된(캐시) 맵 대신 새 맵을 받음
const BUILD_ID = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";
const floorMapUrl = (floor) => `/floor_${floor.toLowerCase()}.glb?v=${BUILD_ID}`;
const MAP_SCALE = 1; // 블렌더 1단위 = 1m 로 만들었다면 1 그대로
const MAP_OFFSET = [0, 0, 0]; // 맵 전체를 옮겨야 할 때 [x, y, z]

// 캐릭터 모델: client/public/characters.glb (없으면 기본 도형 캐릭터)
const CHAR_URL = `/characters.glb?v=${BUILD_ID}`;
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
// 자동문: 사람이 다가가면 좌우로 미끄러져 열림
//  - 6~9층 메인 출입문(Main_LGU_Door_L/R, Main_Glass_Door_L/R) → 그룹 "main"
//  - 이름이 AutoDoor_<그룹>_ / AutoDoorLogo_<그룹>_ 로 시작하는 물체 (예: 1층 교육장 문 AutoDoor_Edu_L)
//  - 문짝은 그룹 가운데에서 바깥쪽(긴 방향)으로 밀려남. 로고도 붙은 문짝과 같이 움직임
const autoDoorGroup = (name) => {
  if (/^Main_(LGU|Glass)_Door_[LR]$/.test(name)) return ["main", true];
  if (/^Main_Door_Logo_[LR]/.test(name)) return ["main", false];
  const m = /^AutoDoor(Logo)?_([A-Za-z0-9]+)_/.exec(name);
  return m ? [m[2], !m[1]] : null;
};
const AUTO_DOOR_SLIDE = 0.8; // 한쪽 문이 옆으로 밀려나는 거리(m)
const AUTO_DOOR_RANGE = 2.1; // 이 거리 안에 사람이 있으면 열림
// 회전문: Revolving_Door_Wing_* 날개를 가운데 기둥 기준으로 돌림 (사람이 안을 지나가면 회전)
const REVOLVING_WING = /^Revolving_Door_Wing_/;
const REVOLVING_POST = /^Revolving_Door_Center_Post/;
const REVOLVING_RANGE = 1.5; // 회전문 가운데에서 이 거리 안이면 회전
const LIVE_ME = new THREE.Vector3(9999, 0, 9999); // 내 위치 (자동문 감지용)
const LIVE_OTHERS = new Map(); // 같은 층 다른 직원 위치
const LIVE_ME_ROT = { y: 0 }; // 내 몸 방향 (종이비행기 날리는 방향)
const LIVE_ROT = new Map(); // 다른 직원 몸 방향
const PASS_THROUGH = /door|ceiling|soffit|roof|천장/i; // 이 이름이 들어간 물체는 통과 (문은 지나다닐 수 있게)

const MOVE_SPEED = 4; // m/s
const SEND_INTERVAL = 0.07; // 서버 전송 간격(초)
const BOUNDS = 14; // 임시 맵 이동 범위(±m). 블렌더 맵은 바닥 크기에 맞춰 자동 계산
// 1층 북카페 BULLSEYE 다트 머신 앞 (이 근처에 가면 🎯 다트 게임 버튼)
const DART_SPOT = { floor: "1F", position: [1.0, 0, -0.72], range: 1.8 };
const INTERACT_DISTANCE = 1.8; // NPC·보물 버튼이 뜨는 거리 (서버 허용 2m보다 약간 작게)
const ELEVATOR_DISTANCE = 2.0; // 엘리베이터 버튼이 뜨는 거리 (서버 허용 2.5m)

// 사내 고정 NPC (층·위치·대사 자유롭게 수정. 대사 여러 줄 = 여러 페이지)
// 강사·실장·팀장·코치 명단은 staff.js 에 따로 있음
const BASE_NPCS = [
  {
    // 1층 로비 가운데, 정문(남쪽)을 바라보고 맞이함
    id: "npc_1f_center_head", floor: "1F", name: "김지연 센터장", model: "Character_Female_LongHair", color: "#e6007e",
    position: [-1.2, 0, 5.8], rotationY: 0,
    dialog: [
      "안녕하세요, 대구고객센터에 오신 것을 환영합니다.",
      "저희 LG유플러스 고객센터는 NCSI(국가고객만족도조사) 2년 연속 1위를 달성한 역량 있는 센터이며,",
      "직원의 만족이 고객의 만족으로 이어진다는 믿음으로 직원들이 즐겁고 편하게 회사를 다닐 수 있도록 최선을 다하는 회사입니다.",
      "편하게 둘러보시고 보물찾기와 미니게임도 즐겨 보세요~ 감사합니다.",
    ],
  },
  {
    id: "npc_1f_desk", floor: "1F", name: "안내데스크 매니저", color: "#e6007e", position: [3.95, 0, 5.6], rotationY: -Math.PI / 2,
    dialog: [
      "LG유플러스 대구고객센터 가상 오피스에 오신 걸 환영합니다!",
      "보물은 1층부터 6·7·8·9층까지 모든 층 곳곳에 숨겨져 있어요. 노란 상자를 찾아보세요!",
      "층 이동은 엘리베이터 홀의 파란 원 위에서 할 수 있어요.",
      "층마다 있는 채용담당자에게 말을 걸면 미니게임, 임직원 추천 등 더 많은 정보를 얻을 수 있어요!",
    ],
  },
  {
    id: "npc_6f_safety", floor: "6F", name: "안전관리 매니저", model: "Character_NPC_YellowVest", color: "#eab308", position: [-4.6, 0, 10.4],
    dialog: ["비상시엔 소방담요 위치부터 확인하세요.", "우리 층 어딘가에 KSQI 인증패가 숨어 있다던데…"],
  },
];
const NPCS = [...BASE_NPCS, ...STAFF_NPCS, ...RECRUITERS];

// glb 가 없을 때 쓰는 임시 맵의 층별 분위기
const FLOOR_THEME = {
  "1F": { floorColor: "#e5ddd0", label: "1F 로비" },
  "6F": { floorColor: "#d9dee7", label: "6F 사무실" },
  "7F": { floorColor: "#d8d2e6", label: "7F 상담실" },
  "8F": { floorColor: "#d8d2e6", label: "8F 상담실" },
  "9F": { floorColor: "#d8d2e6", label: "9F 상담실" },
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
  const doors = useRef({ groups: [], revolve: null });
  useFrame((_, dt) => {
    const { groups, revolve } = doors.current;
    const near = (c, r) => {
      const hit = (p) => Math.hypot(p.x - c.x, p.z - c.z) < r;
      if (hit(LIVE_ME)) return true;
      for (const p of LIVE_OTHERS.values()) if (hit(p)) return true;
      return false;
    };
    for (const g of groups) {
      const want = near(g.center, AUTO_DOOR_RANGE) ? 1 : 0;
      const next = THREE.MathUtils.damp(g.open, want, want ? 5 : 3, dt);
      if (Math.abs(next - g.open) < 1e-4) continue;
      g.open = next;
      const e = next * next * (3 - 2 * next); // 부드럽게 (smoothstep)
      for (const { obj, base, dir } of g.parts) obj.position[g.axis] = base + dir * AUTO_DOOR_SLIDE * e;
    }
    if (revolve) {
      const want = near(revolve.center, REVOLVING_RANGE) ? 1.0 : 0; // rad/s (초당 약 1/6바퀴)
      revolve.speed = THREE.MathUtils.damp(revolve.speed, want, want ? 4 : 1.5, dt);
      if (revolve.speed > 0.002) revolve.pivot.rotation.y += revolve.speed * dt;
    }
  });
  useEffect(() => {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const byGroup = {};
    scene.traverse((o) => {
      const g = autoDoorGroup(o.name || "");
      if (!g) return;
      if (o.userData.doorBase === undefined) o.userData.doorBase = o.position.clone();
      o.position.copy(o.userData.doorBase);
      (byGroup[g[0]] ||= []).push({ obj: o, isPanel: g[1] });
    });
    scene.updateMatrixWorld(true);
    const groups = [];
    for (const items of Object.values(byGroup)) {
      const panels = items.filter((i) => i.isPanel);
      if (!panels.length) continue;
      const all = new THREE.Box3();
      panels.forEach((p) => all.union(box.setFromObject(p.obj)));
      const size = all.getSize(new THREE.Vector3());
      const axis = size.x >= size.z ? "x" : "z"; // 문이 놓인 긴 방향으로 미끄러짐
      const cx = (all.min.x + all.max.x) / 2;
      const cz = (all.min.z + all.max.z) / 2;
      const mid = axis === "x" ? cx : cz;
      const parts = items.map(({ obj }) => {
        const c = box.setFromObject(obj).getCenter(new THREE.Vector3());
        return { obj, base: obj.userData.doorBase[axis], dir: (axis === "x" ? c.x : c.z) < mid ? -1 : 1 };
      });
      groups.push({ axis, parts, open: 0, center: { x: cx * MAP_SCALE + MAP_OFFSET[0], z: cz * MAP_SCALE + MAP_OFFSET[2] } });
    }
    // 회전문 날개를 가운데 기둥 축으로 도는 묶음에 넣기 (한 번만)
    let revolve = null;
    let post = null;
    const wings = [];
    scene.traverse((o) => {
      if (REVOLVING_POST.test(o.name || "")) post = o;
      if (REVOLVING_WING.test(o.name || "")) wings.push(o);
    });
    if (post && wings.length) {
      let pivot = scene.getObjectByName("__RevolvingPivot");
      if (!pivot) {
        const c = box.setFromObject(post).getCenter(new THREE.Vector3());
        pivot = new THREE.Group();
        pivot.name = "__RevolvingPivot";
        pivot.position.set(c.x, 0, c.z);
        scene.add(pivot);
        scene.updateMatrixWorld(true);
        wings.forEach((w) => pivot.attach(w));
      }
      revolve = { pivot, speed: 0, center: { x: pivot.position.x * MAP_SCALE + MAP_OFFSET[0], z: pivot.position.z * MAP_SCALE + MAP_OFFSET[2] } };
    }
    doors.current = { groups, revolve };
  }, [scene]);
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

// 계단실(비상구) 계단참의 초록 원형 마커 — 이 위에 서면 계단으로 층간 이동
const STAIR_DISTANCE = 1.0;
function StairMarker({ position, floor }) {
  const ring = useRef();
  useFrame((state) => {
    if (ring.current) ring.current.material.opacity = 0.55 + Math.sin(state.clock.elapsedTime * 3) * 0.25;
  });
  return (
    <group position={position}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.03}>
        <circleGeometry args={[0.55, 32]} />
        <meshBasicMaterial color="#16a34a" transparent opacity={0.35} />
      </mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.04}>
        <ringGeometry args={[0.48, 0.58, 32]} />
        <meshBasicMaterial color="#4ade80" transparent opacity={0.8} />
      </mesh>
      <Html position-y={2.0} center distanceFactor={10} zIndexRange={[10, 0]}>
        <div style={{ ...styles.elevatorSign, background: "#15803d" }}>🚶 계단실(비상구) · {floor}</div>
      </Html>
    </group>
  );
}

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
  // small: 절반 크기 · 표시 없음 (찾기 어려운 보물) / hidden: 스캐너로 드러난 보물 (하늘색 빛)
  const s = t.small ? 0.5 : 1;
  return (
    <group position={[x, 0, z]}>
      <group ref={ref} scale={s}>
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
      <pointLight position-y={0.8 * s} color={t.hidden ? "#67e8f9" : "#ffe08a"} intensity={t.small ? 0.6 : 1.5} distance={t.small ? 1.5 : 3} />
      {!t.small && (
        <Html position-y={1.1} center distanceFactor={labelScale} zIndexRange={[10, 0]}>
          <div style={{ ...styles.treasureMark, ...(t.hidden ? { background: "#0891b2", color: "#fff" } : null) }}>{t.hidden ? "📡 숨은 보물" : "★ 보물"}</div>
        </Html>
      )}
    </group>
  );
}

// NPC: 서 있기 / 앉기(pose: "sit") / 길(path)을 따라 돌아다니기
// 돌아다니는 NPC 의 지금 위치 (대화 버튼 거리 계산용)
const NPC_LIVE = {};
const NPC_WALK_SPEED = 0.8; // m/s
const STILL = { current: 0 };
function Npc({ npc, myPosRef }) {
  const g = useRef();
  const speedRef = useRef(0);
  const start = npc.path ? Math.floor((npc.pathOffset || 0) * npc.path.length) % npc.path.length : 0;
  const st = useRef({ i: (start + 1) % (npc.path?.length || 1), wait: 1 + (npc.pathOffset || 0) * 4 });
  const startPos = npc.path ? npc.path[start] : npc.position;
  // 강사·안전조끼 같은 특수 모델은 원래 색 그대로, 나머지는 가디건 색으로 구분
  const keepModelColor = npc.model === "Character_NPC_Instructor" || npc.model === "Character_NPC_YellowVest";

  useFrame((_, dt) => {
    const o = g.current;
    if (!o || !npc.path) return;
    const s = st.current;
    const me = myPosRef?.current;
    let moving = false;
    if (me && Math.hypot(me.x - o.position.x, me.z - o.position.z) < 1.6) {
      // 가까이 오면 멈춰서 바라봄
      o.rotation.y = lerpAngle(o.rotation.y, Math.atan2(me.x - o.position.x, me.z - o.position.z), Math.min(1, dt * 6));
    } else if (s.wait > 0) {
      s.wait -= dt;
    } else {
      const [tx, , tz] = npc.path[s.i];
      const dx = tx - o.position.x;
      const dz = tz - o.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) {
        s.i = (s.i + 1) % npc.path.length;
        s.wait = 1.2 + Math.random() * 2.5; // 잠깐 멈춰 둘러보기
      } else {
        const step = Math.min(d, NPC_WALK_SPEED * Math.min(dt, 0.1));
        o.position.x += (dx / d) * step;
        o.position.z += (dz / d) * step;
        o.rotation.y = lerpAngle(o.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 8));
        moving = true;
      }
    }
    speedRef.current = THREE.MathUtils.lerp(speedRef.current, moving ? 0.55 : 0, Math.min(1, dt * 8));
    NPC_LIVE[npc.id] = [o.position.x, 0, o.position.z];
  });

  return (
    <group ref={g} position={startPos} rotation-y={npc.rotationY ?? 0}>
      <group position-y={npc.pose === "sit" ? -0.12 : 0}>
        <AvatarBody
          name={npc.name}
          speedRef={npc.path ? speedRef : STILL}
          outfit={keepModelColor ? undefined : npc.color}
          model={npc.model}
          pose={npc.pose}
          isNpc
        />
      </group>
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
      const pos = (t.live && NPC_LIVE[t.id]) || t.position;
      const d = Math.hypot(p.x - pos[0], p.z - pos[2]);
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
function GlbCharacter({ model = PLAYER_MODEL, outfit, speedRef, pose, actorId }) {
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
      return hit
        ? { node: hit, base: hit.rotation.x, baseZ: hit.rotation.z, baseY: hit.position.y, baseRY: hit.rotation.y, side: Math.sign(hit.position.x) || 1 }
        : null;
    };
    return {
      object,
      limbs: {
        hipL: find(/_Hip_L$/), hipR: find(/_Hip_R$/),
        shL: find(/_Shoulder_L$/), shR: find(/_Shoulder_R$/),
        torso: find(/_Torso$/),
      },
    };
  }, [scene, model, outfit]);

  const phase = useRef(0);
  useFrame((_, dt) => {
    if (pose === "sit") {
      // 앉은 자세: 다리는 앞으로, 팔은 키보드 쪽으로 (살짝 타자 치는 움직임)
      phase.current += dt;
      const tap = Math.max(0, Math.sin(phase.current * 9)) * 0.06;
      const put = (l, v) => l && (l.node.rotation.x = l.base + v);
      put(limbs.hipL, -1.5);
      put(limbs.hipR, -1.5);
      put(limbs.shL, -0.95 - tap);
      put(limbs.shR, -1.0 + tap);
      return;
    }
    const sp = speedRef.current;
    phase.current += dt * 9 * Math.max(sp, 0.001);
    const swing = Math.sin(phase.current) * 0.6 * sp;
    // 동작(손 흔들기·춤 등) — 걷기 시작하면 멈춤
    let st = actionState(actorId);
    if (st && sp > 0.35) {
      cancelAction(actorId);
      st = null;
    }
    const p = st ? actionPose(st.type, st.t, st.sec) : null;
    const set = (l, v) => l && (l.node.rotation.x = l.base + v);
    const arm = (l, v, a) => {
      if (!l) return;
      l.node.rotation.x = l.base + v + (a ? a.x : 0);
      l.node.rotation.z = l.baseZ + (a ? a.z * l.side : 0);
    };
    set(limbs.hipL, -swing + (p ? p.hipL : 0));
    set(limbs.hipR, swing + (p ? p.hipR : 0));
    arm(limbs.shL, swing * (p ? 1 - p.k : 1), p && p.shL);
    arm(limbs.shR, -swing * (p ? 1 - p.k : 1), p && p.shR);
    if (limbs.torso) {
      limbs.torso.node.position.y = limbs.torso.baseY + (p ? p.bounce : 0);
      limbs.torso.node.rotation.y = limbs.torso.baseRY + (p ? p.twist : 0);
    }
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

function AvatarBody({ tagColor, name, bubble, isMe, speedRef, outfit, isNpc, model, hideLabel, pose, actorId, equipped, coffee, aura }) {
  const charsOk = useContext(CharsContext);
  const labelScale = useContext(LabelScaleContext);
  const procedural = <ProceduralBody speedRef={speedRef} outfit={outfit || CARDIGAN} actorId={actorId} />;
  return (
    <group>
      {charsOk ? (
        <CharBoundary fallback={procedural}>
          <Suspense fallback={procedural}>
            <GlbCharacter model={model} outfit={outfit} speedRef={speedRef} pose={pose} actorId={actorId} />
          </Suspense>
        </CharBoundary>
      ) : (
        procedural
      )}
      {actorId && <ActionEmoji actorId={actorId} />}
      <Accessories equipped={equipped} coffee={coffee} aura={aura} />
      {!hideLabel && (
      <Html position-y={1.8} center distanceFactor={labelScale} zIndexRange={[10, 0]}>
        <div style={{ ...styles.labelWrap, transform: "translateY(-50%)" /* 이름표 아래쪽이 머리 위에 오도록 */ }}>
          {isNpc && <div style={styles.npcMark}>💬</div>}
          {aura && <div style={styles.aura}>{aura}</div>}
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

/* ───────── 🛒 상점 아이템 겉모습 (모두에게 보임) ─────────
   캐릭터는 +Z 를 바라봄 · 머리 꼭대기 약 1.6m                                      */
const ACC = { headY: 1.5, handY: 0.82, handX: 0.27 };
const GOLD = { color: "#f5c518", metalness: 0.85, roughness: 0.25 };
function Accessories({ equipped, coffee, aura }) {
  if (!equipped?.headset && !equipped?.pet && !equipped?.hand && !equipped?.shoulder && !coffee && !aura) return null;
  return (
    <group>
      {equipped?.headset && <GoldHeadset />}
      {equipped?.pet && <DinoPet />}
      {equipped?.hand && <MiniFan />}
      {equipped?.shoulder && <GoldBird />}
      {coffee && <CoffeeCup />}
      {aura && <AuraRing />}
    </group>
  );
}
function GoldHeadset() {
  return (
    <group position-y={ACC.headY}>
      <mesh>
        <torusGeometry args={[0.135, 0.018, 8, 24, Math.PI]} />
        <meshStandardMaterial {...GOLD} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.135, -0.01, 0]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.055, 0.055, 0.04, 16]} />
          <meshStandardMaterial {...GOLD} />
        </mesh>
      ))}
      <mesh position={[0.12, -0.07, 0.07]} rotation-x={Math.PI / 2.6}>
        <cylinderGeometry args={[0.008, 0.008, 0.16, 6]} />
        <meshStandardMaterial {...GOLD} />
      </mesh>
      <mesh position={[0.1, -0.11, 0.14]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial color="#222" />
      </mesh>
    </group>
  );
}
// 🐦 황금새: 왼쪽 어깨 위에 앉아 날개를 파닥이고 고개를 갸웃거림
function GoldBird() {
  const body = useRef();
  const wingL = useRef();
  const wingR = useRef();
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const flap = Math.sin(t * 14) * 0.5 * (Math.sin(t * 0.9) > 0.6 ? 1 : 0.15);
    if (wingL.current) wingL.current.rotation.z = 0.25 + flap;
    if (wingR.current) wingR.current.rotation.z = -0.25 - flap;
    if (body.current) {
      body.current.rotation.y = Math.sin(t * 1.3) * 0.35;
      body.current.position.y = Math.abs(Math.sin(t * 3)) * 0.015;
    }
  });
  const G = { color: "#f5c518", metalness: 0.75, roughness: 0.28 };
  return (
    <group position={[0.2, 1.38, -0.02]}>
      <group ref={body}>
        <mesh scale={[0.07, 0.075, 0.1]}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshStandardMaterial {...G} />
        </mesh>
        <mesh position={[0, 0.085, 0.05]}>
          <sphereGeometry args={[0.05, 16, 12]} />
          <meshStandardMaterial {...G} />
        </mesh>
        <mesh position={[0, 0.08, 0.105]} rotation-x={Math.PI / 2}>
          <coneGeometry args={[0.016, 0.05, 8]} />
          <meshStandardMaterial color="#f97316" />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.028, 0.1, 0.085]}>
            <sphereGeometry args={[0.009, 8, 8]} />
            <meshStandardMaterial color="#111" />
          </mesh>
        ))}
        <mesh position={[0, 0.14, 0.04]} rotation-x={-0.4}>
          <coneGeometry args={[0.018, 0.05, 6]} />
          <meshStandardMaterial {...G} />
        </mesh>
        <group ref={wingL} position={[0.06, 0.01, -0.01]}>
          <mesh position={[0.04, 0, 0]} scale={[0.06, 0.012, 0.07]}>
            <sphereGeometry args={[1, 10, 8]} />
            <meshStandardMaterial {...G} />
          </mesh>
        </group>
        <group ref={wingR} position={[-0.06, 0.01, -0.01]}>
          <mesh position={[-0.04, 0, 0]} scale={[0.06, 0.012, 0.07]}>
            <sphereGeometry args={[1, 10, 8]} />
            <meshStandardMaterial {...G} />
          </mesh>
        </group>
        <mesh position={[0, -0.01, -0.12]} rotation-x={-1.2} scale={[1, 1, 0.4]}>
          <coneGeometry args={[0.04, 0.1, 6]} />
          <meshStandardMaterial {...G} />
        </mesh>
      </group>
    </group>
  );
}
function DinoPet() {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = 0.05 + Math.abs(Math.sin(clock.elapsedTime * 5)) * 0.05;
  });
  const Y = { color: "#facc15", roughness: 0.6 };
  return (
    <group position={[0.55, 0, -0.2]}>
      <group ref={ref} scale={0.9}>
        <mesh position={[0, 0.2, 0]} scale={[0.14, 0.15, 0.2]}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshStandardMaterial {...Y} />
        </mesh>
        <mesh position={[0, 0.38, 0.14]}>
          <sphereGeometry args={[0.1, 16, 12]} />
          <meshStandardMaterial {...Y} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.045, 0.42, 0.23]}>
            <sphereGeometry args={[0.018, 8, 8]} />
            <meshStandardMaterial color="#111" />
          </mesh>
        ))}
        <mesh position={[0, 0.17, -0.25]} rotation-x={-Math.PI / 2.4}>
          <coneGeometry args={[0.07, 0.2, 10]} />
          <meshStandardMaterial {...Y} />
        </mesh>
        {[0.12, 0.0, -0.12].map((z, i) => (
          <mesh key={i} position={[0, 0.36 - Math.abs(z) * 0.3, z]}>
            <coneGeometry args={[0.03, 0.07, 6]} />
            <meshStandardMaterial color="#fb923c" />
          </mesh>
        ))}
        {[-1, 1].map((s) => (
          <mesh key={`l${s}`} position={[s * 0.07, 0.05, 0.02]}>
            <cylinderGeometry args={[0.035, 0.04, 0.1, 8]} />
            <meshStandardMaterial {...Y} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
function MiniFan() {
  const blades = useRef();
  useFrame((_, dt) => {
    if (blades.current) blades.current.rotation.z += dt * 25;
  });
  return (
    <group position={[-ACC.handX, ACC.handY, 0.08]}>
      <mesh position-y={0.06}>
        <cylinderGeometry args={[0.014, 0.018, 0.14, 8]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <group position={[0, 0.17, 0]}>
        <mesh>
          <torusGeometry args={[0.07, 0.008, 6, 20]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
        <group ref={blades}>
          {[0, 1, 2].map((i) => (
            <group key={i} rotation-z={(i * Math.PI * 2) / 3}>
              <mesh position-x={0.032}>
                <boxGeometry args={[0.06, 0.026, 0.005]} />
                <meshStandardMaterial color="#bae6fd" />
              </mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}
function CoffeeCup() {
  return (
    <group position={[ACC.handX, ACC.handY + 0.05, 0.08]}>
      <mesh>
        <cylinderGeometry args={[0.045, 0.035, 0.13, 12]} />
        <meshStandardMaterial color="#e0f2fe" transparent opacity={0.7} />
      </mesh>
      <mesh position-y={-0.01}>
        <cylinderGeometry args={[0.04, 0.034, 0.1, 12]} />
        <meshStandardMaterial color="#6b3e1d" />
      </mesh>
      <mesh position={[0.012, 0.1, 0]} rotation-z={-0.2}>
        <cylinderGeometry args={[0.006, 0.006, 0.12, 6]} />
        <meshStandardMaterial color="#16a34a" />
      </mesh>
    </group>
  );
}
function AuraRing() {
  const ref = useRef();
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const t = (clock.elapsedTime * 0.8) % 1;
    g.scale.setScalar(0.4 + t * 1.0);
    g.material.opacity = 0.7 * (1 - t);
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position-y={0.04}>
      <ringGeometry args={[0.5, 0.6, 40]} />
      <meshBasicMaterial color="#5eead4" transparent depthWrite={false} />
    </mesh>
  );
}

// 📡 보물 스캐너: 내 발밑에서 가장 가까운 못 찾은 보물 쪽을 가리키는 화살표
function RadarArrow({ targets }) {
  const ref = useRef();
  const label = useRef();
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g || !targets.length) return;
    let best = null, bd = Infinity;
    for (const t of targets) {
      const d = Math.hypot(t.position[0] - LIVE_ME.x, t.position[2] - LIVE_ME.z);
      if (d < bd) (bd = d), (best = t);
    }
    const ang = Math.atan2(best.position[0] - LIVE_ME.x, best.position[2] - LIVE_ME.z);
    const r = 0.95 + Math.sin(clock.elapsedTime * 6) * 0.08;
    g.position.set(LIVE_ME.x + Math.sin(ang) * r, 0.12, LIVE_ME.z + Math.cos(ang) * r);
    g.rotation.y = ang;
    if (label.current) label.current.textContent = `📡 보물까지 ${bd.toFixed(1)}m`;
  });
  if (!targets.length) return null;
  return (
    <group ref={ref}>
      <mesh rotation-x={Math.PI / 2}>
        <coneGeometry args={[0.16, 0.36, 3]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.9} depthTest={false} />
      </mesh>
      <Html position-y={0.35} center zIndexRange={[9, 0]}>
        <div ref={label} style={styles.radarLabel} />
      </Html>
    </group>
  );
}

// characters.glb 가 없을 때 쓰는 기본 도형 캐릭터
function ProceduralBody({ speedRef, outfit, actorId }) {
  const lArm = useRef(), rArm = useRef(), lLeg = useRef(), rLeg = useRef();
  const phase = useRef(0);
  useFrame((_, dt) => {
    const sp = speedRef.current; // 0 ~ 1
    phase.current += dt * 9 * Math.max(sp, 0.001);
    const swing = Math.sin(phase.current) * 0.7 * sp;
    const st = sp > 0.35 ? null : actionState(actorId);
    const p = st ? actionPose(st.type, st.t, st.sec) : null;
    if (lArm.current) {
      lArm.current.rotation.x = swing + (p ? p.shL.x : 0);
      lArm.current.rotation.z = p ? -p.shL.z : 0;
      rArm.current.rotation.x = -swing + (p ? p.shR.x : 0);
      rArm.current.rotation.z = p ? p.shR.z : 0;
      lLeg.current.rotation.x = -swing + (p ? p.hipL : 0);
      rLeg.current.rotation.x = swing + (p ? p.hipR : 0);
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

function MyAvatar({ me, inputRef, bubble, myPosRef, frozen, bounds, colliders, camMode = "top", speedMul = 1, coffee, aura }) {
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
      const dist = Math.min(dt, 0.25) * MOVE_SPEED * speedMul * amount;
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
    LIVE_ME.copy(g.position);
    LIVE_ME_ROT.y = g.rotation.y;
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
        if (!frozen) sendMove(pos, rot);
      }
    }
  });

  return (
    <group ref={ref} position={me.position}>
      {/* 1인칭에서는 내 몸이 카메라를 가리지 않도록 숨김 */}
      {!CAMERA_MODES[camMode]?.firstPerson && <AvatarBody name={me.guest ? `${me.name} (방문자)` : me.name} bubble={bubble} isMe speedRef={speedRef} model={lookModel(me.look)} outfit={me.look?.outfit} actorId={me.id} equipped={me.equipped} coffee={coffee} aura={aura} />}
    </group>
  );
}

function OtherAvatar({ player, bubble }) {
  const ref = useRef();
  const target = useMemo(() => new THREE.Vector3(...player.position), []); // eslint-disable-line
  target.set(...player.position);
  const speedRef = useRef(0);
  useEffect(
    () => () => {
      LIVE_OTHERS.delete(player.id);
      LIVE_ROT.delete(player.id);
    },
    [player.id]
  );

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const gap = g.position.distanceTo(target);
    speedRef.current = THREE.MathUtils.lerp(speedRef.current, gap > 0.05 ? Math.min(gap * 3, 1) : 0, Math.min(1, dt * 8));
    g.position.lerp(target, Math.min(1, dt * 10)); // 부드럽게 보간
    LIVE_OTHERS.set(player.id, g.position);
    g.rotation.y = lerpAngle(g.rotation.y, player.rotationY || 0, Math.min(1, dt * 10));
    LIVE_ROT.set(player.id, g.rotation.y);
  });

  return (
    <group ref={ref} position={player.position}>
      <AvatarBody
        actorId={player.id}
        tagColor={player.color}
        name={player.guest ? `${player.name} (방문자)` : player.name}
        bubble={bubble}
        speedRef={speedRef}
        model={lookModel(player.look)}
        outfit={player.look?.outfit}
        equipped={player.equipped}
        coffee={player.coffee}
        aura={player.aura}
      />
    </group>
  );
}

/* ───────────── 동작: 머리 위 이모지 · 종이비행기 ───────────── */

// 동작 중일 때 머리 위에 이모지가 떠오름 (리렌더 없이 매 프레임 스타일만 바꿈)
function ActionEmoji({ actorId }) {
  const el = useRef();
  const last = useRef("");
  useFrame(() => {
    const d = el.current;
    if (!d) return;
    const st = actionState(actorId);
    if (!st) {
      if (last.current) {
        d.style.opacity = 0;
        last.current = "";
      }
      return;
    }
    const emoji = ACTION_MAP[st.type].emoji;
    if (last.current !== emoji) d.textContent = last.current = emoji;
    const fade = Math.min(1, st.t / 0.12, (1 - st.t) / 0.25);
    d.style.opacity = Math.max(0, fade);
    d.style.transform = `translateY(${-st.t * 26}px) scale(${0.8 + Math.min(1, st.t * 5) * 0.4})`;
  });
  return (
    <Html position-y={2.55} center zIndexRange={[9, 0]} style={{ pointerEvents: "none" }}>
      <div ref={el} style={{ fontSize: 30, opacity: 0, textShadow: "0 2px 6px rgba(0,0,0,.35)", transition: "none" }} />
    </Html>
  );
}

// 종이비행기: 동작이 시작되고 손을 떠나는 순간, 그 사람 앞으로 날아감 (약 3초 뒤 사라짐)
const PLANE_GEO = (() => {
  const g = new THREE.BufferGeometry();
  // 코(+z) · 왼날개 · 오른날개 · 아래 용골
  const v = [0, 0, 0.2, -0.15, 0.01, -0.13, 0, 0.02, -0.11, 0, 0, 0.2, 0, 0.02, -0.11, 0.15, 0.01, -0.13, 0, 0, 0.2, 0, -0.05, -0.12, 0, 0.02, -0.11];
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
})();
const PLANE_MAT = new THREE.MeshStandardMaterial({ color: "#ffffff", side: THREE.DoubleSide, roughness: 0.6 });
const PLANE_LIFE = 3.0;

function PaperPlanes({ myId }) {
  const group = useRef();
  const pending = useRef([]); // { actorId, at }
  const planes = useRef([]); // { mesh, born, pos, dir }
  useEffect(
    () =>
      onAction((actorId, type) => {
        if (type === "plane") pending.current.push({ actorId, at: performance.now() / 1000 + PLANE_RELEASE });
      }),
    []
  );
  useFrame((_, dt) => {
    const t = performance.now() / 1000;
    pending.current = pending.current.filter((p) => {
      if (t < p.at) return true;
      const pos = p.actorId === myId ? LIVE_ME : LIVE_OTHERS.get(p.actorId);
      const ry = p.actorId === myId ? LIVE_ME_ROT.y : LIVE_ROT.get(p.actorId);
      if (!pos || ry === undefined || !group.current) return false;
      const dir = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
      const mesh = new THREE.Mesh(PLANE_GEO, PLANE_MAT);
      mesh.castShadow = true;
      const start = pos.clone().addScaledVector(dir, 0.35);
      start.y = 1.6;
      mesh.position.copy(start);
      group.current.add(mesh);
      planes.current.push({ mesh, born: t, start, dir, ry, sway: Math.random() * 6 });
      if (planes.current.length > 12) {
        const old = planes.current.shift();
        group.current.remove(old.mesh);
      }
      return false;
    });
    planes.current = planes.current.filter((pl) => {
      const age = t - pl.born;
      if (age > PLANE_LIFE) {
        group.current?.remove(pl.mesh);
        return false;
      }
      const dist = 3.2 * age - 0.25 * age * age; // 점점 느려짐
      const side = Math.sin(age * 2.2 + pl.sway) * 0.35 * age; // 살랑살랑 옆으로
      pl.mesh.position.set(
        pl.start.x + pl.dir.x * dist + Math.cos(pl.ry) * side,
        Math.max(0.05, pl.start.y + 0.35 * Math.sin(Math.min(age, 1.2) * 2.2) - 0.32 * age * age * 0.5),
        pl.start.z + pl.dir.z * dist - Math.sin(pl.ry) * side
      );
      pl.mesh.rotation.set(-0.15 + age * 0.12, pl.ry + Math.sin(age * 2.2 + pl.sway) * 0.35, Math.sin(age * 2.2 + pl.sway) * 0.5);
      return true;
    });
  });
  return <group ref={group} />;
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
  const [dartOpen, setDartOpen] = useState(false); // 다트 게임 화면
  const [recruiter, setRecruiter] = useState(null); // 채용담당자 메뉴 { text }
  const [shopMode, setShopMode] = useState(null); // 🛒 "shop" | 🎒 "bag"
  const [points, setPoints] = useState(null); // 내 포인트 (회원)
  const [myCoffee, setMyCoffee] = useState(false);
  const [myAura, setMyAura] = useState(null);
  const [radarOn, setRadarOn] = useState(false);
  const buffTimers = useRef({});
  const [msgTarget, setMsgTarget] = useState(null); // 메시지를 남길 NPC { id, name }
  const [rpsNpc, setRpsNpc] = useState(null); // 가위바위보 상대 NPC
  const [omokNpc, setOmokNpc] = useState(null); // 오목 상대 NPC
  const [shellNpc, setShellNpc] = useState(null); // 야바위 상대 NPC
  const [reactionNpc, setReactionNpc] = useState(null); // 콜 받기 반응속도
  const [empathyNpc, setEmpathyNpc] = useState(null); // 공감 응대 챌린지
  const [rankOpen, setRankOpen] = useState(false); // 🏆 랭킹 게시판
  const [baseballNpc, setBaseballNpc] = useState(null); // 숫자야구
  const [memoryNpc, setMemoryNpc] = useState(null); // 카드 짝맞추기
  const [chatLines, setChatLines] = useState([]); // 이 층 대화 (최근 30줄)
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxUnread, setInboxUnread] = useState(0);
  const [photoZone, setPhotoZone] = useState(null); // 지금 서 있는 사진 구역
  const [photoOpen, setPhotoOpen] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false); // 동작 고르기 창
  const lastEmote = useRef(0);
  const highfive = useRef({}); // id → 하이파이브 시각 (둘이 동시에 하면 성공)
  const helloIdx = useRef(Math.floor(Math.random() * RECRUIT_HELLOS.length));
  const [busy, setBusy] = useState(false); // 서버 응답 대기 중
  const [spawnSeq, setSpawnSeq] = useState(0); // 층 이동 시 내 아바타를 새 위치에 다시 배치
  const [toast, setToast] = useState(null);
  const [lobbyMsg, setLobbyMsg] = useState("");
  // 로비 입장 방식: guest(방문자) | login(로그인) | signup(회원가입, 내부 임직원)
  const [mode, setMode] = useState(() => (getToken() ? "login" : "guest"));
  const [account, setAccount] = useState(null); // 로그인한 임직원 { name, empNo, look }
  const [form, setForm] = useState({ name: "", empNo: "", password: "", password2: "" });
  const [authBusy, setAuthBusy] = useState(false);
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
    const onInit = ({ me, players, treasures, world, chatLog, inboxUnread }) => {
      setMe(me);
      setChatLines(chatLog || []);
      setInboxUnread(inboxUnread || 0);
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
    const onChat = ({ id, name, text, at }) => {
      setChatLines((l) => [...l, { id, name, text, at }].slice(-30));
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
    const onDartNews = ({ name, score }) => showToast(`🎯 ${name}님이 다트 ${score}점을 기록했어요!`);
    socket.on("dartNews", onDartNews);
    const onInboxNew = ({ npcName, unread }) => {
      setInboxUnread(unread);
      showToast(`📬 ${npcName}의 답장이 도착했어요! (내 메시지함)`);
    };
    socket.on("inboxNew", onInboxNew);
    const onRemoteAction = ({ id, type }) => startAction(id, type);
    socket.on("action", onRemoteAction);
    // 🛒 아이템: 포인트 적립 알림, 다른 사람의 장착·스프레이·커피
    const onWallet = ({ points, gained, reason }) => {
      setPoints(points);
      if (reason) showToast(gained ? `💰 +${gained}P · ${reason}` : `💰 ${reason}`);
    };
    const patchPlayer = (id, patch) => {
      setMe((m) => (m && m.id === id ? { ...m, ...patch } : m));
      setOthers((o) => (o[id] ? { ...o, [id]: { ...o[id], ...patch } } : o));
    };
    const onEquip = ({ id, equipped }) => patchPlayer(id, { equipped });
    const onAura = ({ id, aura }) => patchPlayer(id, { aura });
    const onCoffee = ({ id, on }) => patchPlayer(id, { coffee: on });
    socket.on("wallet", onWallet);
    socket.on("playerEquip", onEquip);
    socket.on("playerAura", onAura);
    socket.on("playerCoffee", onCoffee);
    return () => {
      socket.off("wallet", onWallet);
      socket.off("playerEquip", onEquip);
      socket.off("playerAura", onAura);
      socket.off("playerCoffee", onCoffee);
      socket.off("action", onRemoteAction);
      socket.off("inboxNew", onInboxNew);
      socket.off("dartNews", onDartNews);
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

  // 회원이 입장하면 포인트를 받아 🎒 버튼에 표시
  useEffect(() => {
    if (me?.id && !me.guest) shopInfo().then((r) => r.ok && setPoints(r.wallet.points));
  }, [me?.id]); // eslint-disable-line

  /* ── 지금 층에 있는 것들 ── */
  const floorNpcs = NPCS.filter((n) => n.floor === floor);
  const crowd = useMemo(() => (COUNSEL_FLOORS.includes(floor) ? seatedWorkers(floor) : floor === "1F" ? classroomWorkers() : []), [floor]);
  const allFloorTreasures = treasures.filter((t) => t.floor === floor && !t.foundByMe && !t.claimed);
  // 숨은 보물(hidden)은 U+ 5G 보물 위치 스캐너를 켠 동안만 보이고 열 수 있음
  const floorTreasures = allFloorTreasures.filter((t) => !t.hidden || radarOn);
  const elevatorPos = world.elevators[floor];
  const stairPos = world.stairs?.[floor];

  const targets = useMemo(
    () => [
      ...floorNpcs.map((n) => ({ type: "npc", id: n.id, position: n.position || n.path[0], live: !!n.path, range: INTERACT_DISTANCE })),
      ...floorTreasures.map((t) => ({ type: "treasure", id: t.id, position: t.position, range: INTERACT_DISTANCE + (me?.equipped?.pet ? 1.2 : 0) })),
      ...(elevatorPos ? [{ type: "elevator", id: floor, position: elevatorPos, range: ELEVATOR_DISTANCE }] : []),
      ...(stairPos ? [{ type: "stairs", id: floor, position: stairPos, range: STAIR_DISTANCE }] : []),
      ...(floor === DART_SPOT.floor ? [{ type: "dart", id: "dart", position: DART_SPOT.position, range: DART_SPOT.range }] : []),
    ],
    [floor, treasures, world, me?.equipped?.pet, radarOn] // eslint-disable-line
  );

  const nearby =
    nearbyTarget?.type === "npc"
      ? { type: "npc", data: floorNpcs.find((n) => n.id === nearbyTarget.id) }
      : nearbyTarget?.type === "treasure"
      ? { type: "treasure", data: floorTreasures.find((t) => t.id === nearbyTarget.id) }
      : nearbyTarget?.type === "elevator" && nearbyTarget.id === floor
      ? { type: "elevator", data: { floor } }
      : nearbyTarget?.type === "stairs" && nearbyTarget.id === floor
      ? { type: "stairs", data: { floor } }
      : nearbyTarget?.type === "dart" && floor === DART_SPOT.floor
      ? { type: "dart", data: {} }
      : null;
  const modalOpen = !!dialog || elevatorOpen || dartOpen || !!recruiter || !!msgTarget || inboxOpen || photoOpen || !!rpsNpc || !!omokNpc || !!shellNpc || !!reactionNpc || !!empathyNpc || rankOpen || !!baseballNpc || !!memoryNpc || !!shopMode;
  const canInteract = nearby?.data && !modalOpen;

  /* ── 상호작용 ── */
  // npc 를 넘기면 마지막 페이지에 "메시지 남기기" 메뉴가 나옴
  const openDialog = (title, lines, npc = null) => setDialog({ title, lines: [].concat(lines), page: 0, npc });
  const nextDialog = () =>
    setDialog((d) => {
      if (!d) return null;
      if (d.page < d.lines.length - 1) return { ...d, page: d.page + 1 };
      return d.npc ? d : null; // NPC 대화의 마지막 페이지는 버튼으로 닫음
    });

  const interact = () => {
    if (!canInteract || busy) return;
    if (nearby.type === "npc" && nearby.data.menu === "recruiter") setRecruiter({ text: RECRUIT_GREETING });
    else if (nearby.type === "npc")
      openDialog(
        nearby.data.name,
        nearby.data.game === "rps"
          ? [...nearby.data.dialog, "심심하면 나랑 가위바위보 한 판 할래요? 이기면 기록이 남아요! ✊✌️✋"]
          : nearby.data.game === "memory"
          ? [...nearby.data.dialog, "LG U+ 서비스 카드 짝맞추기 한 판 어때요? 🃏 빨리, 적게 뒤집을수록 좋아요!"]
          : nearby.data.game === "baseball"
          ? [...nearby.data.dialog, "숫자야구 한 판 할래요? ⚾ 제가 생각한 세 자리 숫자를 10번 안에 맞혀 보세요!"]
          : nearby.data.game === "reaction"
          ? [...nearby.data.dialog, "콜 받기 반응속도 게임 해 볼래요? 📞 벨이 울리면 최대한 빨리 받아 주세요!"]
          : nearby.data.game === "empathy"
          ? [...nearby.data.dialog, "공감 응대 챌린지에 도전해 볼래요? 💗 고객의 말에 가장 공감하는 답변을 골라 주세요!"]
          : nearby.data.game === "shell"
          ? [...nearby.data.dialog, "컵 세 개 중 어디에 공이 있을까요? 야바위 3판! 갈수록 빨라져요. 눈 크게 뜨세요 👀"]
          : nearby.data.game === "omok"
          ? [...nearby.data.dialog, "저랑 오목 한 판 두실래요? 다섯 알을 먼저 잇는 사람이 이겨요. 봐 드리진 않아요! ⚫⚪"]
          : nearby.data.dialog,
        { id: nearby.data.id, name: nearby.data.name, game: nearby.data.game }
      );
    else if (nearby.type === "treasure") pickUp(nearby.data);
    else if (nearby.type === "elevator") setElevatorOpen(true);
    else if (nearby.type === "stairs") setElevatorOpen("stairs");
    else if (nearby.type === "dart") setDartOpen(true);
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
    const via = elevatorOpen === "stairs" ? "stairs" : undefined;
    const res = await changeFloor(target, via);
    if (res.ok) {
      await new Promise((r) => setTimeout(r, 600)); // 엘리베이터 연출
      setMe((m) => ({ ...m, floor: res.floor, position: res.position }));
      rememberPose({ floor: res.floor, position: res.position });
      setOthers(Object.fromEntries(res.players.filter((p) => p.id !== socket.id).map((p) => [p.id, p])));
      setBubbles({});
      setChatLines(res.chatLog || []);
      setNearbyTarget(null);
      setSpawnSeq((n) => n + 1);
      showToast(via ? `🚶 계단으로 ${res.floor}에 도착했어요` : `🛗 ${res.floor}에 도착했어요`);
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

  // 채용담당자 링크를 열었다가 30분 안에 돌아오면 → 로비 없이 마지막 자리에서 바로 이어서
  useEffect(() => {
    if (!shouldAutoResume()) return;
    clearResume();
    const name = localStorage.getItem("cm_name");
    if (!name) return;
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem("cm_look"));
    } catch {
      /* 무시 */
    }
    connectAs(name, saved || look, { resume: true, guest: localStorage.getItem("cm_mode") === "guest" });
  }, []); // eslint-disable-line

  // 저장된 로그인이 있으면 자동으로 확인
  useEffect(() => {
    if (!getToken()) return;
    checkSession().then((res) => {
      if (res.ok) {
        setAccount(res.user);
        if (res.user.look) setLook(res.user.look);
      } else if (!res.offline) setMode("guest");
    });
  }, []);

  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: k === "empNo" ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value }));

  const onAuth = async (e) => {
    e.preventDefault();
    if (authBusy) return;
    const empNo = form.empNo.trim();
    if (mode === "signup") {
      if (!form.name.trim()) return setLobbyMsg("이름을 입력해 주세요.");
      if (!/^\d{6}$/.test(empNo)) return setLobbyMsg("사번은 숫자 6자리예요.");
      if (form.password.length < 4) return setLobbyMsg("비밀번호는 4자 이상으로 정해 주세요.");
      if (form.password !== form.password2) return setLobbyMsg("비밀번호 확인이 일치하지 않아요.");
    } else if (!/^\d{6}$/.test(empNo) || !form.password) return setLobbyMsg("사번 6자리와 비밀번호를 입력해 주세요.");
    setAuthBusy(true);
    setLobbyMsg("");
    const res = mode === "signup" ? await signup({ name: form.name.trim(), empNo, password: form.password }) : await login({ empNo, password: form.password });
    setAuthBusy(false);
    if (!res.ok) return setLobbyMsg(res.message || "다시 시도해 주세요.");
    setAccount(res.user);
    if (res.user.look) setLook(res.user.look);
    setForm({ name: "", empNo: "", password: "", password2: "" });
    setMode("login");
  };

  const doLogout = () => {
    logout();
    setAccount(null);
    setMode("login");
    setLobbyMsg("");
  };

  // 사진 구역 들어감/나감 확인 (0.4초마다)
  useEffect(() => {
    if (!me) return;
    const t = setInterval(() => {
      const p = myPosRef.current;
      const z = zoneAt(me.floor, p.x, p.z);
      setPhotoZone((prev) => (prev?.id === z?.id ? prev : z));
    }, 400);
    return () => clearInterval(t);
  }, [me?.floor, !!me]); // eslint-disable-line

  // 동작 버튼 → 내 캐릭터가 바로 동작하고, 서버로 동작 이름만 보내서 같은 층 사람들 화면에도 보임
  const doEmote = (type) => {
    if (!me) return;
    const t = performance.now();
    if (t - lastEmote.current < 800) return; // 연타 방지
    lastEmote.current = t;
    startAction(me.id, type);
    sendAction(type);
    setEmoteOpen(false);
  };
  // 하이파이브: 가까이(2m) 있는 두 사람이 2.5초 안에 같이 하면 성공 알림
  useEffect(() => {
    if (!me) return;
    return onAction((id, type) => {
      if (type !== "highfive") return;
      const t = performance.now() / 1000;
      highfive.current[id] = t;
      const mine = highfive.current[me.id];
      if (!mine || t - mine > 2.5) return;
      for (const [oid, ot] of Object.entries(highfive.current)) {
        if (oid === me.id || t - ot > 2.5) continue;
        const p = LIVE_OTHERS.get(oid);
        if (p && Math.hypot(p.x - LIVE_ME.x, p.z - LIVE_ME.z) < 2.0) {
          showToast(`🙌 ${others[oid]?.name || "동료"}님과 하이파이브!`);
          highfive.current = {};
          return;
        }
      }
    });
  }, [me?.id, others]); // eslint-disable-line

  const enter = (e) => {
    e.preventDefault();
    if (mode !== "guest" && !account) return;
    const name = mode === "guest" ? nameInput.trim() : account.name;
    if (!name) return setLobbyMsg("이름을 입력해 주세요.");
    localStorage.setItem("cm_name", name);
    localStorage.setItem("cm_look", JSON.stringify(look));
    localStorage.setItem("cm_mode", mode === "guest" ? "guest" : "member");
    setLobbyMsg("");
    connectAs(name, look, { guest: mode === "guest" });
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
    const picker = (
      <>
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
      </>
    );
    const tabs = [
      ["login", "로그인"],
      ["signup", "회원가입"],
      ["guest", "게스트 입장"],
    ];
    const showAuthForm = (mode === "login" && !account) || mode === "signup";
    return (
      <div style={styles.lobby}>
        <form onSubmit={showAuthForm ? onAuth : enter} style={styles.lobbyCard}>
          <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>🏢 회사 메타버스</h1>
          <div style={styles.tabs}>
            {tabs.map(([id, label]) => (
              <button
                key={id}
                type="button"
                style={{ ...styles.tab, ...(mode === id ? styles.tabOn : null) }}
                onClick={() => {
                  setMode(id);
                  setLobbyMsg("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p style={styles.tabHelp}>
            {mode === "guest"
              ? "방문자는 이름만 입력하고 바로 들어가요. (기록은 이 기기에만 남아요)"
              : mode === "signup"
              ? "내부 임직원 전용 · 사번으로 가입하면 보물 기록과 캐릭터가 저장돼요."
              : account
              ? ""
              : "가입한 사번과 비밀번호로 로그인하세요."}
          </p>

          {mode === "signup" && (
            <>
              <input style={styles.input} value={form.name} onChange={setF("name")} placeholder="이름 (예: 김승현)" maxLength={12} autoComplete="name" />
              <input style={styles.input} value={form.empNo} onChange={setF("empNo")} placeholder="사번 (숫자 6자리)" inputMode="numeric" autoComplete="username" />
              <input style={styles.input} type="password" value={form.password} onChange={setF("password")} placeholder="비밀번호 (4자 이상)" autoComplete="new-password" />
              <input style={styles.input} type="password" value={form.password2} onChange={setF("password2")} placeholder="비밀번호 확인" autoComplete="new-password" />
              <button style={styles.button} type="submit" disabled={authBusy}>
                {authBusy ? "가입하는 중…" : "회원가입"}
              </button>
            </>
          )}

          {mode === "login" && !account && (
            <>
              <input style={styles.input} value={form.empNo} onChange={setF("empNo")} placeholder="사번 (숫자 6자리)" inputMode="numeric" autoComplete="username" />
              <input style={styles.input} type="password" value={form.password} onChange={setF("password")} placeholder="비밀번호" autoComplete="current-password" />
              <button style={styles.button} type="submit" disabled={authBusy}>
                {authBusy ? "확인하는 중…" : "로그인"}
              </button>
              <p style={{ fontSize: 12, color: "#6b7280", margin: "10px 0 0" }}>
                처음이신가요?{" "}
                <a href="#" onClick={(e) => (e.preventDefault(), setMode("signup"), setLobbyMsg(""))}>
                  회원가입
                </a>
              </p>
            </>
          )}

          {mode === "login" && account && (
            <>
              <div style={styles.welcome}>
                👋 <b>{account.name}</b>님 환영합니다 <span style={{ color: "#6b7280", fontSize: 12 }}>(사번 {account.empNo})</span>
              </div>
              {picker}
              <button style={styles.button} type="submit">
                입장하기
              </button>
              <button type="button" style={styles.linkBtn} onClick={doLogout}>
                로그아웃
              </button>
            </>
          )}

          {mode === "guest" && (
            <>
              {picker}
              <input style={styles.input} value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="이름 (예: 홍길동)" maxLength={12} />
              <button style={styles.button} type="submit">
                게스트로 입장하기
              </button>
            </>
          )}
          {lobbyMsg && <p style={{ color: "#dc2626", fontSize: 13, margin: "12px 0 0", whiteSpace: "pre-line" }}>{lobbyMsg}</p>}
        </form>
      </div>
    );
  }

  const floorCount = Object.keys(others).length + 1;
  const buttonStyle = {
    npc: ["#3b82f6", "💬\n대화하기"],
    treasure: ["#eab308", "🎁\n보물 열기"],
    elevator: ["#2563eb", "🛗\n층간 이동"],
    stairs: ["#16a34a", "🚶\n층간 이동"],
    dart: ["#ef4444", "🎯\n다트 게임"],
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
        {stairPos && maps[floor] !== false && <StairMarker position={stairPos} floor={floor} />}
        {floorNpcs.map((n) => (
          <Npc key={n.id} npc={n} myPosRef={myPosRef} />
        ))}
        {(COUNSEL_FLOORS.includes(floor) || floor === "1F") && maps[floor] && <SeatedCrowd workers={crowd} />}
        {floor === "1F" && <NewsTV position={[-5.45, 1.61, 4.828]} />}
        {floor === "1F" && (
          <>
            <LectureScreen deck="lecture" position={[13.5, 1.7, -18.1]} />
            <LectureScreen deck="comp1" position={[13.5, 1.7, -8.5]} offset={1} />
            <LectureScreen deck="comp2" position={[13.5, 1.7, 2.3]} offset={2} />
            <LectureScreen deck="practice" position={[9.31, 1.7, -16.5]} rotation={[0, -Math.PI / 2, 0]} />
          </>
        )}
        {["7F", "8F", "9F"].includes(floor) && <NewsTV position={[-0.965, 1.7, 6.6]} rotation={[0, Math.PI / 2, 0]} width={1.1} height={0.62} />}
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
          speedMul={(myCoffee ? 1.5 : 1) * (me.equipped?.hand ? 1.15 : 1)}
          coffee={myCoffee}
          aura={myAura}
        />
        {radarOn && <RadarArrow targets={allFloorTreasures} />}
        {Object.values(others).map((p) => (
          <OtherAvatar key={p.id} player={p} bubble={bubbles[p.id]} />
        ))}
        <PaperPlanes myId={me.id} />
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

      {!me.guest && (
        <button style={styles.bagBtn} onClick={() => setShopMode("bag")}>
          🎒 {points === null ? "가방" : `${points.toLocaleString()}P`}
        </button>
      )}
      {shopMode && (
        <Shop
          key={shopMode}
          mode={shopMode}
          onClose={() => setShopMode(null)}
          onWallet={(w) => {
            setPoints(w.points);
            setMe((m) => (m ? { ...m, equipped: w.equipped } : m));
          }}
          canUse={(it) =>
            it.effect === "RADAR_SCAN" && !allFloorTreasures.length ? "이 층에는 아직 못 찾은 보물이 없어요. 다른 층에서 써 보세요!" : null
          }
          onUsed={(it, r) => {
            if (!r.buff) return;
            const { effect, duration } = r.buff;
            const key = effect;
            clearTimeout(buffTimers.current[key]);
            const set = effect === "SPEED_BOOST" ? setMyCoffee : effect === "RADAR_SCAN" ? setRadarOn : (v) => setMyAura(v ? "✨ 상쾌함 충전!" : null);
            set(true);
            buffTimers.current[key] = setTimeout(() => set(false), duration);
            setShopMode(null);
            showToast(r.message);
          }}
        />
      )}
      <button style={styles.rankBtn} onClick={() => setRankOpen(true)}>
        🏆 랭킹
      </button>
      <button style={styles.inboxBtn} onClick={() => setInboxOpen(true)}>
        📬 메시지함
        {inboxUnread > 0 && <span style={styles.badge}>{inboxUnread}</span>}
      </button>
      {!modalOpen && (
        <>
          <button style={{ ...styles.emoteBtn, ...(emoteOpen ? styles.emoteBtnOn : null) }} onClick={() => setEmoteOpen((v) => !v)} aria-label="동작">
            {emoteOpen ? "✕" : "😊"}
            <span style={styles.emoteBtnLabel}>동작</span>
          </button>
          {emoteOpen && (
            <div style={styles.emoteBar}>
              {ACTIONS.map((a) => (
                <button key={a.id} style={styles.emoteItem} onClick={() => doEmote(a.id)}>
                  <span style={{ fontSize: 24 }}>{a.emoji}</span>
                  <span style={{ fontSize: 10 }}>{a.label}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <PhotoSpot zone={photoZone} open={photoOpen} setOpen={setPhotoOpen} />
      {inboxOpen && <Inbox onClose={() => setInboxOpen(false)} onRead={() => setInboxUnread(0)} />}

      {!dialog && !recruiter && <ChatLog lines={chatLines} myId={me.id} floor={floor} />}

      {msgTarget && <NpcMessage npc={msgTarget} onClose={() => setMsgTarget(null)} />}
      {rpsNpc && <RpsGame npc={rpsNpc} onClose={() => setRpsNpc(null)} />}
      {omokNpc && <OmokGame npc={omokNpc} onClose={() => setOmokNpc(null)} />}
      {shellNpc && <ShellGame npc={shellNpc} onClose={() => setShellNpc(null)} />}
      {reactionNpc && <ReactionGame npc={reactionNpc} onClose={() => setReactionNpc(null)} />}
      {empathyNpc && <EmpathyGame npc={empathyNpc} onClose={() => setEmpathyNpc(null)} />}
      {memoryNpc && <MemoryGame npc={memoryNpc} onClose={() => setMemoryNpc(null)} />}
      {baseballNpc && <BaseballGame npc={baseballNpc} onClose={() => setBaseballNpc(null)} />}
      {rankOpen && <Rankings me={me} onClose={() => setRankOpen(false)} />}
      {dartOpen && <DartGame playerName={me.name} onSubmit={submitDart} onClose={() => setDartOpen(false)} />}

      {elevatorOpen && (
        <div style={styles.backdrop} onClick={() => setElevatorOpen(false)}>
          <div style={styles.elevatorPanel} onClick={(e) => e.stopPropagation()}>
            <div style={styles.dialogTitle}>{elevatorOpen === "stairs" ? "🚶 계단으로 몇 층에 갈까요?" : "🛗 몇 층으로 갈까요?"}</div>
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

      {recruiter && (
        <div style={styles.dialog}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={styles.dialogTitle}>채용담당자</div>
            <button style={styles.menuClose} onClick={() => setRecruiter(null)} aria-label="닫기">✕</button>
          </div>
          <p style={styles.dialogText}>{recruiter.text}</p>
          <div style={styles.menuList}>
            {/* 미니게임·채용 사이트는 새 창(탭)으로 열기 — 메타버스 화면은 그대로 남아 있어 탭만 바꾸면 복귀 */}
            <button style={styles.menuBtn} onClick={() => openExternal(RECRUIT_LINKS.game)}>
              1. 미니게임하기
            </button>
            <button style={styles.menuBtn} onClick={() => openExternal(RECRUIT_LINKS.apply)}>
              2. 임직원추천 지원하기
            </button>
            <button
              style={styles.menuBtn}
              onClick={() => {
                helloIdx.current = (helloIdx.current + 1) % RECRUIT_HELLOS.length;
                setRecruiter({ text: RECRUIT_HELLOS[helloIdx.current] });
              }}
            >
              3. 인사하기
            </button>
            <button
              style={styles.menuBtn}
              onClick={() => {
                setRecruiter(null);
                setMsgTarget({ id: "recruiter", name: "채용담당자" });
              }}
            >
              4. 💌 메시지 남기기
            </button>
            <button
              style={{ ...styles.menuBtn, background: "#e6007e", color: "#fff", borderColor: "#e6007e" }}
              onClick={() => {
                setRecruiter(null);
                if (me?.guest) openDialog("채용담당자", "아이템 상점은 회원가입한 임직원만 이용할 수 있어요. 로그인하고 다시 와 주세요! 🙂");
                else setShopMode("shop");
              }}
            >
              5. 🛒 아이템 상점
            </button>
            <div style={styles.menuNote}>1·2번은 새 창(바깥 브라우저)으로 열려요. 같은 창에서 열렸다면 뒤로 가기를 누르면 이 자리로 돌아와요.</div>
          </div>
        </div>
      )}

      {dialog && (
        <div style={styles.dialog} onClick={nextDialog}>
          <div style={styles.dialogTitle}>{dialog.title}</div>
          <p style={styles.dialogText}>{dialog.lines[dialog.page]}</p>
          {dialog.npc && dialog.page === dialog.lines.length - 1 ? (
            <div style={styles.dialogActions}>
              {dialog.npc.game === "memory" && (
                <button
                  style={{ ...styles.dialogMsgBtn, background: "#7c3aed" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const npc = dialog.npc;
                    setDialog(null);
                    if (me?.guest) openDialog(npc.name, "카드 짝맞추기는 회원가입한 임직원만 할 수 있어요. 로그인하고 다시 와 주세요! 🙂");
                    else setMemoryNpc(npc);
                  }}
                >
                  🃏 카드 짝맞추기
                </button>
              )}
              {dialog.npc.game === "baseball" && (
                <button
                  style={{ ...styles.dialogMsgBtn, background: "#15803d" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const npc = dialog.npc;
                    setDialog(null);
                    if (me?.guest) openDialog(npc.name, "숫자야구는 회원가입한 임직원만 할 수 있어요. 로그인하고 다시 와 주세요! 🙂");
                    else setBaseballNpc(npc);
                  }}
                >
                  ⚾ 숫자야구
                </button>
              )}
              {(dialog.npc.game === "reaction" || dialog.npc.game === "empathy") && (
                <button
                  style={{ ...styles.dialogMsgBtn, background: dialog.npc.game === "reaction" ? "#0891b2" : "#db2777" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const npc = dialog.npc;
                    setDialog(null);
                    if (me?.guest) openDialog(npc.name, "이 게임은 회원가입한 임직원만 할 수 있어요. 로그인하고 다시 와 주세요! 🙂");
                    else (npc.game === "reaction" ? setReactionNpc : setEmpathyNpc)(npc);
                  }}
                >
                  {dialog.npc.game === "reaction" ? "📞 콜 받기 게임" : "💗 공감 응대 챌린지"}
                </button>
              )}
              {dialog.npc.game === "shell" && (
                <button
                  style={{ ...styles.dialogMsgBtn, background: "#d97706" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const npc = dialog.npc;
                    setDialog(null);
                    if (me?.guest) openDialog(npc.name, "야바위 게임은 회원가입한 임직원만 할 수 있어요. 로그인하고 다시 와 주세요! 🙂");
                    else setShellNpc(npc);
                  }}
                >
                  🥤 야바위 게임
                </button>
              )}
              {dialog.npc.game === "omok" && (
                <button
                  style={{ ...styles.dialogMsgBtn, background: "#111827" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const npc = dialog.npc;
                    setDialog(null);
                    if (me?.guest) openDialog(npc.name, "오목 대결은 회원가입한 임직원만 할 수 있어요. 로그인하고 다시 와 주세요! 🙂");
                    else setOmokNpc(npc);
                  }}
                >
                  ⚫ 오목 대결
                </button>
              )}
              {dialog.npc.game === "rps" && (
                <button
                  style={{ ...styles.dialogMsgBtn, background: "#2563eb" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const npc = dialog.npc;
                    setDialog(null);
                    if (me?.guest) openDialog(npc.name, "가위바위보는 회원가입한 임직원만 할 수 있어요. 로그인하고 다시 와 주세요! 🙂");
                    else setRpsNpc(npc);
                  }}
                >
                  ✊ 가위바위보 하기
                </button>
              )}
              <button
                style={styles.dialogMsgBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setMsgTarget(dialog.npc);
                  setDialog(null);
                }}
              >
                💌 메시지 남기기
              </button>
              <button
                style={styles.dialogCloseBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setDialog(null);
                }}
              >
                닫기
              </button>
            </div>
          ) : (
            <div style={styles.dialogHint}>{dialog.page < dialog.lines.length - 1 ? "▼ 터치해서 계속" : "터치해서 닫기"}</div>
          )}
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
  tabs: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, background: "#f3f4f6", borderRadius: 12, padding: 4, margin: "10px 0 8px" },
  tab: { border: 0, borderRadius: 9, padding: "9px 0", fontSize: 14, fontWeight: 700, background: "transparent", color: "#6b7280" },
  tabOn: { background: "#fff", color: "#e6007e", boxShadow: "0 1px 3px rgba(0,0,0,.15)" },
  tabHelp: { margin: "0 0 12px", color: "#6b7280", fontSize: 12, minHeight: 16 },
  welcome: { background: "#fdf2f8", borderRadius: 10, padding: "10px 12px", margin: "0 0 10px", fontSize: 14 },
  linkBtn: { marginTop: 10, background: "transparent", border: 0, color: "#6b7280", fontSize: 13, textDecoration: "underline" },
  topBar: { position: "absolute", top: "max(12px, env(safe-area-inset-top))", left: 12, padding: "6px 12px", borderRadius: 999, background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 13, display: "flex", alignItems: "center", gap: 6, zIndex: 12 },
  dot: { width: 8, height: 8, borderRadius: "50%", display: "inline-block" },
  emoteBtn: { position: "absolute", left: 24, bottom: "calc(216px + env(safe-area-inset-bottom))", width: 58, height: 58, borderRadius: "50%", border: "2px solid #fff", background: "rgba(17,24,39,.6)", color: "#fff", fontSize: 24, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1, zIndex: 12, boxShadow: "0 3px 10px rgba(0,0,0,.3)" },
  emoteBtnOn: { background: "#e6007e" },
  emoteBtnLabel: { fontSize: 10, marginTop: 2, fontWeight: 700 },
  emoteBar: { position: "absolute", left: 92, bottom: "calc(208px + env(safe-area-inset-bottom))", display: "grid", gridTemplateColumns: "repeat(3, 60px)", gap: 6, padding: 8, borderRadius: 14, background: "rgba(17,24,39,.78)", zIndex: 13, boxShadow: "0 6px 16px rgba(0,0,0,.35)" },
  emoteItem: { height: 56, border: 0, borderRadius: 10, background: "rgba(255,255,255,.12)", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, touchAction: "manipulation" },
  joyBase: { position: "absolute", left: 24, bottom: "calc(84px + env(safe-area-inset-bottom))", width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,.25)", border: "2px solid rgba(255,255,255,.6)", display: "grid", placeItems: "center", touchAction: "none", zIndex: 12 },
  joyKnob: { width: 52, height: 52, borderRadius: "50%", background: "rgba(255,255,255,.9)", boxShadow: "0 2px 8px rgba(0,0,0,.3)", pointerEvents: "none" },
  chatBar: { position: "absolute", left: 12, right: 12, bottom: "max(12px, env(safe-area-inset-bottom))", display: "flex", gap: 8, zIndex: 12 },
  chatInput: { flex: 1, minWidth: 0, fontSize: 16, padding: "10px 14px", borderRadius: 999, border: 0, outline: "none", background: "rgba(255,255,255,.92)" },
  chatBtn: { fontSize: 15, fontWeight: 700, padding: "0 18px", borderRadius: 999, border: 0, background: "#e6007e", color: "#fff" },
  labelWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, pointerEvents: "none", whiteSpace: "nowrap" },
  name: { color: "#fff", fontSize: 12, padding: "2px 8px", borderRadius: 999 },
  bubble: { background: "#fff", color: "#111", fontSize: 13, padding: "6px 10px", borderRadius: 12, maxWidth: 180, whiteSpace: "normal", boxShadow: "0 2px 6px rgba(0,0,0,.25)" },
  actionBtn: { position: "absolute", right: 24, bottom: "calc(290px + env(safe-area-inset-bottom))", width: 100, height: 100, borderRadius: "50%", border: "3px solid #fff", color: "#fff", fontSize: 15, fontWeight: 800, lineHeight: 1.35, whiteSpace: "pre-line", boxShadow: "0 4px 14px rgba(0,0,0,.35)", touchAction: "manipulation", zIndex: 12 },
  toast: { position: "absolute", top: "calc(56px + env(safe-area-inset-top))", left: "50%", transform: "translateX(-50%)", maxWidth: "88%", background: "rgba(17,24,39,.9)", color: "#fff", padding: "10px 16px", borderRadius: 12, fontSize: 14, textAlign: "center", zIndex: 20 },
  npcMark: { fontSize: 18, lineHeight: 1 },
  dialog: { position: "absolute", left: 12, right: 12, bottom: "calc(70px + env(safe-area-inset-bottom))", maxWidth: 520, margin: "0 auto", background: "rgba(17,24,39,.95)", color: "#fff", padding: "16px 18px 12px", borderRadius: 14, border: "2px solid #fbbf24", zIndex: 30 },
  dialogTitle: { color: "#fbbf24", fontWeight: 800, fontSize: 14, marginBottom: 6 },
  dialogText: { margin: "0 0 8px", fontSize: 16, lineHeight: 1.55, whiteSpace: "pre-line" },
  menuList: { display: "grid", gap: 8, marginTop: 4 },
  menuNote: { fontSize: 12, color: "#9ca3af", lineHeight: 1.4 },
  menuBtn: { textAlign: "left", background: "#1f2937", color: "#fff", border: "1px solid #4b5563", borderRadius: 10, padding: "11px 14px", fontSize: 15, fontWeight: 700 },
  menuClose: { background: "transparent", color: "#9ca3af", border: 0, fontSize: 16, padding: 4 },
  dialogActions: { display: "flex", gap: 8, marginTop: 4 },
  dialogMsgBtn: { flex: 1, background: "#e6007e", color: "#fff", border: 0, borderRadius: 10, padding: "10px 0", fontSize: 15, fontWeight: 700 },
  dialogCloseBtn: { flex: "0 0 84px", background: "#374151", color: "#fff", border: 0, borderRadius: 10, padding: "10px 0", fontSize: 15 },
  dialogHint: { fontSize: 12, color: "#9ca3af", textAlign: "right" },
  backdrop: { position: "absolute", inset: 0, background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center", zIndex: 40 },
  elevatorPanel: { width: 240, background: "#1f2937", borderRadius: 16, padding: 16, border: "2px solid #94a3b8", display: "flex", flexDirection: "column", gap: 8 },
  floorBtn: { fontSize: 20, fontWeight: 800, padding: "12px 0", borderRadius: 12, border: "2px solid #64748b", background: "#334155", color: "#fff" },
  floorBtnCurrent: { background: "#fbbf24", borderColor: "#fbbf24", color: "#1f2937" },
  closeBtn: { marginTop: 4, fontSize: 14, padding: "8px 0", borderRadius: 10, border: 0, background: "transparent", color: "#cbd5e1" },
  moving: { position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(15,23,42,.55)", color: "#fff", fontSize: 22, fontWeight: 800, zIndex: 50 },
  loading: { background: "rgba(0,0,0,.6)", color: "#fff", padding: "6px 12px", borderRadius: 8, fontSize: 13, whiteSpace: "nowrap" },
  bagBtn: { position: "absolute", top: "calc(172px + env(safe-area-inset-top))", right: 12, padding: "6px 12px", borderRadius: 999, border: 0, background: "rgba(255,255,255,.88)", color: "#9d174d", fontSize: 13, fontWeight: 800, boxShadow: "0 2px 6px rgba(0,0,0,.2)", zIndex: 12 },
  aura: { background: "#ccfbf1", color: "#0f766e", border: "1px solid #5eead4", borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", marginBottom: 3 },
  radarLabel: { background: "rgba(8,145,178,.9)", color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", pointerEvents: "none" },
  rankBtn: { position: "absolute", top: "calc(132px + env(safe-area-inset-top))", right: 12, padding: "6px 12px", borderRadius: 999, border: 0, background: "rgba(255,255,255,.88)", color: "#111827", fontSize: 13, fontWeight: 700, boxShadow: "0 2px 6px rgba(0,0,0,.2)", zIndex: 12 },
  inboxBtn: { position: "absolute", top: "calc(92px + env(safe-area-inset-top))", right: 12, padding: "6px 12px", borderRadius: 999, border: 0, background: "rgba(255,255,255,.88)", color: "#111827", fontSize: 13, fontWeight: 700, boxShadow: "0 2px 6px rgba(0,0,0,.2)", zIndex: 12 },
  badge: { position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, lineHeight: "18px", borderRadius: 999, background: "#ef4444", color: "#fff", fontSize: 11, textAlign: "center", padding: "0 4px" },
  camBtn: { position: "absolute", top: "calc(52px + env(safe-area-inset-top))", right: 12, padding: "6px 12px", borderRadius: 999, border: 0, background: "rgba(255,255,255,.88)", color: "#111827", fontSize: 13, fontWeight: 700, boxShadow: "0 2px 6px rgba(0,0,0,.2)", zIndex: 12 },
  treasureMark: { color: "#fde047", fontSize: 12, fontWeight: 800, textShadow: "0 0 3px #000, 0 0 3px #000", whiteSpace: "nowrap", pointerEvents: "none" },
  sign: { background: "#fff", padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" },
  floorSign: { background: "#111827", color: "#fff", padding: "4px 12px", borderRadius: 8, fontSize: 16, fontWeight: 800, whiteSpace: "nowrap" },
  elevatorSign: { background: "#475569", color: "#fff", padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" },
};
