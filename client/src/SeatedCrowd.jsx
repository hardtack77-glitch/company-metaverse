// 상담석에 앉아 일하는 직원들 (배경용)
// 수십 명을 가볍게 그리려고 InstancedMesh 사용 → 사람 수와 상관없이 그리기 호출 7번
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const SKIN = "#ffd9b8";
const PANTS = "#2a3045";

// 앉은 사람 한 명의 부품 (원점 = 의자 자리, +z 쪽 책상을 바라봄)
function boxAt(w, h, d, x, y, z, rx = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return g;
}
function makeParts() {
  const legs = mergeGeometries([
    boxAt(0.13, 0.13, 0.42, -0.08, 0.5, 0.14), // 허벅지
    boxAt(0.13, 0.13, 0.42, 0.08, 0.5, 0.14),
    boxAt(0.12, 0.44, 0.12, -0.08, 0.25, 0.36), // 종아리
    boxAt(0.12, 0.44, 0.12, 0.08, 0.25, 0.36),
  ]);
  const torso = boxAt(0.34, 0.46, 0.21, 0, 0.8, -0.06);
  const arms = mergeGeometries([
    boxAt(0.085, 0.085, 0.4, -0.2, 0.82, 0.1, -0.35), // 키보드 쪽으로 뻗은 팔
    boxAt(0.085, 0.085, 0.4, 0.2, 0.82, 0.1, -0.35),
  ]);
  const head = new THREE.SphereGeometry(0.125, 14, 10).translate(0, 1.17, -0.04);
  const hairCap = new THREE.SphereGeometry(0.138, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)
    .scale(1, 1, 1.05)
    .translate(0, 1.19, -0.06);
  const hairLong = boxAt(0.27, 0.36, 0.08, 0, 1.0, -0.16);
  const headset = mergeGeometries([
    boxAt(0.3, 0.025, 0.04, 0, 1.31, -0.04),
    boxAt(0.03, 0.08, 0.08, -0.14, 1.17, -0.04),
    boxAt(0.03, 0.08, 0.08, 0.14, 1.17, -0.04),
  ]);
  return { legs, torso, arms, head, hairCap, hairLong, headset };
}

export default function SeatedCrowd({ workers }) {
  const parts = useMemo(makeParts, []);
  const mats = useMemo(
    () => ({
      pants: new THREE.MeshStandardMaterial({ color: PANTS, roughness: 0.8 }),
      outfit: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.75 }),
      skin: new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 }),
      hair: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.7 }),
      headset: new THREE.MeshStandardMaterial({ color: "#1b1b1b", roughness: 0.4 }),
    }),
    []
  );
  const refs = {
    legs: useRef(), torso: useRef(), arms: useRef(), head: useRef(),
    hairCap: useRef(), hairLong: useRef(), headset: useRef(),
  };
  const n = workers.length;

  // 자리·색 배치
  useEffect(() => {
    const m = new THREE.Matrix4();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const c = new THREE.Color();
    workers.forEach((w, i) => {
      m.makeRotationY(w.rotationY).setPosition(w.position[0], 0, w.position[2]);
      for (const k of Object.keys(refs)) {
        const mesh = refs[k].current;
        if (!mesh) continue;
        mesh.setMatrixAt(i, k === "hairLong" && !w.longHair ? zero : m);
      }
      refs.torso.current.setColorAt(i, c.set(w.outfit));
      refs.arms.current.setColorAt(i, c.set(w.outfit));
      refs.hairCap.current.setColorAt(i, c.set(w.hair));
      refs.hairLong.current.setColorAt(i, c.set(w.hair));
    });
    for (const k of Object.keys(refs)) {
      const mesh = refs[k].current;
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [workers]); // eslint-disable-line

  // 타자 치듯 팔·머리가 살짝 움직임 (0.1초마다만 갱신해서 가볍게)
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), t: new THREE.Matrix4(), acc: 0 }), []);
  useFrame(({ clock }, dt) => {
    tmp.acc += dt;
    if (tmp.acc < 0.1 || !refs.arms.current) return;
    tmp.acc = 0;
    const time = clock.elapsedTime;
    workers.forEach((w, i) => {
      tmp.m.makeRotationY(w.rotationY).setPosition(w.position[0], 0, w.position[2]);
      tmp.t.makeTranslation(0, Math.max(0, Math.sin(time * 9 + w.phase)) * 0.012, 0);
      refs.arms.current.setMatrixAt(i, tmp.m.clone().multiply(tmp.t));
      tmp.t.makeTranslation(0, Math.sin(time * 1.3 + w.phase) * 0.008, 0);
      const headM = tmp.m.clone().multiply(tmp.t);
      refs.head.current.setMatrixAt(i, headM);
      refs.hairCap.current.setMatrixAt(i, headM);
      refs.headset.current.setMatrixAt(i, headM);
    });
    for (const k of ["arms", "head", "hairCap", "headset"]) refs[k].current.instanceMatrix.needsUpdate = true;
  });

  if (!n) return null;
  const im = (key, geo, mat, shadow = true) => (
    <instancedMesh key={key} ref={refs[key]} args={[geo, mat, n]} castShadow={shadow} frustumCulled={false} />
  );
  return (
    <group>
      {im("legs", parts.legs, mats.pants, false)}
      {im("torso", parts.torso, mats.outfit)}
      {im("arms", parts.arms, mats.outfit, false)}
      {im("head", parts.head, mats.skin)}
      {im("hairCap", parts.hairCap, mats.hair, false)}
      {im("hairLong", parts.hairLong, mats.hair, false)}
      {im("headset", parts.headset, mats.headset, false)}
    </group>
  );
}
