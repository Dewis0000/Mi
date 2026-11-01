import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { useGame, tierOf, fmtScore } from './store.js';
import { materials, geometries, webGeometry } from './materials.js';
import { SPRING } from './tokens.js';
import * as fx from './fx.js';
import { coo } from './sound.js';

// Расстановка пьедесталов полукругом: центр ближе к зрителю
export const bustX = (i, n) => (i - (n - 1) / 2) * 1.75;
export const bustZ = (x) => 1.0 - 0.08 * x * x;

// Венок из листьев вокруг головы
function Wreath() {
  const M = materials();
  const G = geometries();
  const leaves = useMemo(() => Array.from({ length: 18 }, (_, i) => {
    const t = (i / 18) * Math.PI * 2;
    return { p: [Math.cos(t) * 0.31, 1.42, Math.sin(t) * 0.31], r: t };
  }), []);
  return (
    <group>
      <mesh geometry={G.wreath} material={M.goldLeaf} position={[0, 1.42, 0]} rotation={[Math.PI / 2, 0, 0]} />
      {leaves.map((l, i) => (
        <mesh key={i} geometry={G.leaf} material={M.goldLeaf} position={l.p} rotation={[0, -l.r, 0.5]} scale={[1, 0.4, 0.6]} />
      ))}
    </group>
  );
}

// Пудреный парик: белая шапка с завитками
function Wig() {
  const M = materials();
  const G = geometries();
  return (
    <group>
      <mesh geometry={G.wig} material={M.wig} position={[0, 1.4, -0.02]} scale={[1, 1.12, 1.05]} />
      {[-0.27, 0.27].map((x) => (
        <mesh key={x} geometry={G.curl} material={M.wig} position={[x, 1.3, 0.1]} rotation={[0, Math.PI / 2, 0]} />
      ))}
    </group>
  );
}

// Голубь на плече. Клик: пять раз — он улетает и роняет перо. Глубокий минус — одна капля с физикой
function Dove({ onDrip }) {
  const M = materials();
  const G = geometries();
  const root = useRef();
  const count = useRef(0);
  const gone = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!root.current || gone.current) return;
      const wp = new THREE.Vector3();
      root.current.getWorldPosition(wp);
      const beak = wp.clone().add(new THREE.Vector3(0, 0.04, 0.18));
      fx.spawn('drop', [beak.x, beak.y, beak.z], 1, { vel: [0, -0.2, 0], floor: wp.y - 0.12 });
      onDrip?.();
    }, 1200);
    return () => clearTimeout(t);
  }, [onDrip]);

  const onClick = (e) => {
    e.stopPropagation();
    if (gone.current) return;
    count.current += 1;
    coo();
    gsap.fromTo(root.current.rotation, { z: 0 }, { z: 0.18, duration: 0.1, yoyo: true, repeat: 1 });
    if (count.current < 5) return;
    gone.current = true;
    const wp = new THREE.Vector3();
    root.current.getWorldPosition(wp);
    fx.spawn('feather', [wp.x, wp.y, wp.z], 1, { vel: [1.2, 0.8, 0.4], spread: 0.3, floor: 0.02, scale: 1.4 });
    gsap.to(root.current.position, { y: root.current.position.y + 8, duration: 2.4, ease: 'power2.in' });
    gsap.to(root.current.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 2.4, ease: 'power2.in' });
  };

  return (
    <group ref={root} position={[0.32, 0.95, 0.02]} rotation={[0, 0.4, 0]} onPointerDown={onClick}>
      <mesh geometry={G.dove} material={M.dove} castShadow />
      <mesh geometry={G.doveHead} material={M.dove} position={[0, 0.09, 0.12]} />
      <mesh geometry={G.nose} material={M.beak} position={[0, 0.08, 0.2]} scale={[0.35, 0.5, 0.35]} />
      <mesh geometry={G.doveWing} material={M.dove} position={[0.11, 0.02, -0.02]} rotation={[0, 0, -0.35]} />
      <mesh geometry={G.doveWing} material={M.dove} position={[-0.11, 0.02, -0.02]} rotation={[0, 0, 0.35]} />
      <mesh geometry={G.doveTail} material={M.dove} position={[0, 0.02, -0.2]} />
    </group>
  );
}

// Один пьедестал с бюстом. Счёт определяет ступень украшений и патину.
export function Bust({ id, position, onDrip }) {
  const player = useGame((s) => s.players.find((p) => p.id === id));
  const active = useGame((s) => s.active === id);
  const M = materials();
  const G = geometries();
  const body = useRef();
  const lean = useRef();
  const spring = useRef({ x: 0, v: 0 });
  const seenJump = useRef(player.jumpSeq);
  const webG = useMemo(webGeometry, []);
  const tier = tierOf(player.score);
  const streak = player.streak;

  // Пружина: при верном ответе бюст подпрыгивает, жёсткость 180
  useEffect(() => {
    if (player.jumpSeq !== seenJump.current) {
      seenJump.current = player.jumpSeq;
      spring.current.v = 3.4;
    }
  }, [player.jumpSeq]);

  useFrame((_, dt) => {
    const h = Math.min(dt, 0.033);
    const s = spring.current;
    const k = SPRING.stiffness;
    const c = 2 * SPRING.damping * Math.sqrt(k);
    s.v += (-k * s.x - c * s.v) * h;
    s.x += s.v * h;
    if (body.current) body.current.position.y = 0.9 + s.x;
    if (lean.current) {
      // три минуса подряд — бюст сутулится
      const target = streak >= 3 ? 0.14 : 0;
      lean.current.rotation.x += (target - lean.current.rotation.x) * Math.min(1, h * 4);
    }
  });

  const stone = tier.minus ? M.marbleCracked : M.marble;

  return (
    <group position={position}>
      {/* постамент и верхняя плита */}
      <mesh geometry={G.pedestal} material={stone} position={[0, 0.45, 0]} castShadow receiveShadow />
      <mesh geometry={G.plinth} material={M.marble} position={[0, 0.06, 0]} receiveShadow />
      <mesh geometry={G.plinth} material={M.marble} position={[0, 0.9, 0]} receiveShadow />

      <group ref={body} position={[0, 0.9, 0]}>
        <group ref={lean}>
          <mesh geometry={G.torso} material={stone} castShadow />
          <mesh geometry={G.head} material={stone} position={[0, 1.35, 0.02]} scale={[0.92, 1.1, 0.98]} castShadow />
          <mesh geometry={G.nose} material={stone} position={[0, 1.32, 0.27]} />
          <mesh geometry={G.brow} material={stone} position={[0, 1.45, 0.22]} />

          {tier.wreath && !tier.wig && <Wreath />}
          {tier.epaulettes && (
            <>
              <mesh geometry={G.epaulette} material={M.gold} position={[-0.47, 0.9, 0]} rotation={[0, 0, 0.35]} />
              <mesh geometry={G.epaulette} material={M.gold} position={[0.47, 0.9, 0]} rotation={[0, 0, -0.35]} />
            </>
          )}
          {tier.monocle && <mesh geometry={G.monocle} material={M.gold} position={[0.1, 1.37, 0.25]} />}
          {tier.wig && <Wig />}
          {tier.cloak && <mesh geometry={G.cloak} material={M.marbleDouble} position={[0, 0.45, -0.1]} />}
          {tier.halo && <mesh geometry={G.halo} material={M.halo} position={[0, 1.72, 0]} rotation={[Math.PI / 2, 0, 0]} />}
          {tier.deepMinus && <lineSegments geometry={webG} material={M.web} position={[0.3, 0.98, 0.2]} />}
          {tier.deepMinus && <Dove onDrip={onDrip} />}
        </group>
      </group>

      <Html position={[0, 0.45, 0.6]} center distanceFactor={9} zIndexRange={[20, 0]}>
        <div className={active ? 'cx-tag is-active' : 'cx-tag'}>
          <span className="cx-tag-name">{player.name}</span>
          <span className="cx-tag-score">{fmtScore(player.score)}</span>
        </div>
      </Html>
    </group>
  );
}
