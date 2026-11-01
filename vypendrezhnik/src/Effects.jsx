import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import * as fx from './fx.js';
import { stuccoGeometry, materials } from './materials.js';
import { shatter } from './sound.js';

// Лепнина: падает с потолка на бюст, разбивается у его ног. Состояние — вне React, чтобы кадры не дёргались.
export const stucco = { active: false, x: 0, y: 7, z: 0.8, vy: 0, cracked: false };

export function dropStucco(x, z) {
  Object.assign(stucco, { active: true, x, y: 7.2, z, vy: 0, cracked: false });
}

const LAND_Y = 2.0; // высота, на которой лепнина встречает бюст
const dummy = new THREE.Object3D();
const color = new THREE.Color();

// Все частицы — одним InstancedMesh; лепнина — отдельный меш
export default function Effects({ max }) {
  const M = materials();
  const particles = useRef();
  const piece = useRef();
  const stuccoGeo = useMemo(stuccoGeometry, []);

  useEffect(() => {
    fx.setLimit(max);
  }, [max]);

  useFrame((_, dt) => {
    const h = Math.min(dt, 0.033);
    fx.step(h);

    // частицы
    const mesh = particles.current;
    if (mesh) {
      mesh.count = fx.pool.length;
      for (let i = 0; i < fx.pool.length; i++) {
        const p = fx.pool[i];
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(p.rx, p.ry, p.rz);
        if (p.kind === 'feather') dummy.scale.set(p.s * 1.6, p.s * 0.18, p.s * 0.7);
        else dummy.scale.setScalar(p.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, color.set(p.c));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    // лепнина падает, пока не встретит бюст
    if (stucco.active && piece.current) {
      stucco.vy -= 9.8 * h * 1.4;
      stucco.y += stucco.vy * h;
      piece.current.visible = true;
      piece.current.position.set(stucco.x, stucco.y, stucco.z);
      piece.current.rotation.x += h * 2.3;
      piece.current.rotation.y += h * 1.7;
      if (stucco.y <= LAND_Y) {
        stucco.active = false;
        piece.current.visible = false;
        fx.spawn('debris', [stucco.x, LAND_Y, stucco.z], 60, { vel: [0, 1.2, 0], spread: 2.4, floor: 0.02 });
        shatter();
      }
    }
  });

  return (
    <>
      <instancedMesh ref={particles} args={[undefined, undefined, max]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.45} metalness={0.15} />
      </instancedMesh>
      <mesh ref={piece} geometry={stuccoGeo} material={M.stucco} visible={false} castShadow />
    </>
  );
}
