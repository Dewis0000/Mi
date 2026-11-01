import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, Noise, ChromaticAberration } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { gsap } from 'gsap';
import { useGame } from './store.js';
import { cam, shakeCamera } from './camera.js';
import { Bust, bustX, bustZ } from './Busts.jsx';
import Skrizhal from './Skrizhal.jsx';
import Effects, { dropStucco } from './Effects.jsx';
import { confettiCannons } from './fx.js';
import { materials } from './materials.js';
import { fanfare, applause, swish } from './sound.js';
import { LIMITS, TIME, EASE } from './tokens.js';

// Точки света и цель прожекторов. Вынесены в константы, чтобы не пересоздавать геометрию лучей на каждом рендере
const SPOT_L = [-3.8, 9, 4];
const SPOT_R = [3.8, 9, 4];
const AIM = [0, 1.2, -0.6];

const floorGeo = new THREE.PlaneGeometry(40, 40);
const wallGeo = new THREE.PlaneGeometry(16, 9);
const friezeGeo = new THREE.BoxGeometry(16, 0.28, 0.14);
const baseboardGeo = new THREE.BoxGeometry(16, 0.36, 0.22);
const columnGeo = new THREE.CylinderGeometry(0.42, 0.5, 6.4, 40);
const capitalGeo = new THREE.BoxGeometry(1.1, 0.34, 1.1);

// Занавес: полотно с мягкими складками (смещение вершин по синусам)
function curtainGeometry() {
  const g = new THREE.PlaneGeometry(7, 8, 80, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, 0.12 * Math.sin(x * 5.2 + y * 0.1) + 0.05 * Math.cos(y * 0.7));
  }
  g.computeVertexNormals();
  return g;
}

// Луч прожектора: открытый конус от источника к цели. Широкий конец — у пола, аддитивный и почти прозрачный
function Beam({ from, to }) {
  const { geo, quat, mid } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const g = new THREE.CylinderGeometry(1.9, 0.12, len, 32, 1, true);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return { geo: g, quat: q, mid: a.add(b).multiplyScalar(0.5) };
  }, [from, to]);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#FFE2A8', transparent: true, opacity: 0.05, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }), []);
  return <mesh geometry={geo} material={mat} position={mid} quaternion={quat} />;
}

// Пылинки в луче: медленно плывут и чуть покачиваются
function Motes() {
  const count = 220;
  const base = useMemo(() => {
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      a[i * 3] = (Math.random() - 0.5) * 8;
      a[i * 3 + 1] = 0.6 + Math.random() * 5.4;
      a[i * 3 + 2] = -1 + Math.random() * 5;
    }
    return a;
  }, []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(base), 3));
    return g;
  }, [base]);
  const ref = useRef();
  useFrame(({ clock }) => {
    const p = ref.current?.geometry.attributes.position;
    if (!p) return;
    const t = clock.elapsedTime * 0.25;
    for (let i = 0; i < count; i++) {
      p.array[i * 3] = base[i * 3] + Math.sin(t + i) * 0.06;
      p.array[i * 3 + 1] = base[i * 3 + 1] + Math.cos(t * 0.8 + i * 0.7) * 0.05;
    }
    p.needsUpdate = true;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial color="#FFE9C0" size={0.025} transparent opacity={0.55} depthWrite={false} />
    </points>
  );
}

// Одна сцена: свет, зал, занавес, бюсты, скрижаль, эффекты и камера
function Scene({ mobile }) {
  const { gl, scene } = useThree();
  const M = materials();
  const players = useGame((s) => s.players);
  const N = players.length;
  const spotA = useRef();
  const spotB = useRef();
  const curtainL = useRef();
  const curtainR = useRef();
  const target = useMemo(() => new THREE.Object3D(), []);
  const curtainGeo = useMemo(curtainGeometry, []);

  // Отражения: комната из PMREM. Без внешних файлов окружения. Яркость отражений приглушена
  const env = useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const t = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    return t;
  }, [gl]);
  useEffect(() => {
    scene.environment = env;
    scene.environmentIntensity = 0.35;
    return () => { scene.environment = null; };
  }, [scene, env]);

  // Камера каждый кадр: позиция и взгляд из общего состояния; при ударе — дрожь
  useFrame((state) => {
    const c = state.camera;
    const j = cam.shake;
    c.position.set(cam.px + (Math.random() - 0.5) * j, cam.py + (Math.random() - 0.5) * j * 0.6, cam.pz);
    c.lookAt(cam.lx, cam.ly, cam.lz);
  });

  // Занавес раздвигается на старте (1.8 с) — за ним скрижаль
  useEffect(() => {
    const tl = gsap.timeline({ delay: 0.4 });
    tl.add(() => swish(1.6), 0)
      .to(curtainL.current.position, { x: -10.5, duration: TIME.curtainOpen, ease: EASE.curtain }, 0)
      .to(curtainR.current.position, { x: 10.5, duration: TIME.curtainOpen, ease: EASE.curtain }, 0);
  }, []);

  // Прожекторы смещаются к бюсту, на который пал выбор
  const focusOn = (index) => {
    const x = bustX(index, N);
    gsap.to(target.position, { x, y: 1.2, z: bustZ(x), duration: 0.8, ease: 'power2.out' });
  };

  // Зеленоватый свет на секунду после неверного ответа
  const greenFlash = () => {
    [spotA, spotB].forEach((ref) => {
      if (!ref.current) return;
      gsap.timeline()
        .to(ref.current.color, { r: 0.71, g: 1, b: 0.69, duration: 0.15, ease: 'power1.out' })
        .to(ref.current.color, { r: 1, g: 0.886, b: 0.66, duration: TIME.greenFlash, ease: 'power1.inOut' });
    });
  };

  // Реакции сцены на события игры. Звук выбора плитки уже играет в Skrizhal, здесь — только ответ
  useEffect(() => {
    const unsub = useGame.subscribe((s, prev) => {
      const e = s.event;
      if (e.seq === prev.event.seq) return;
      const index = s.players.findIndex((p) => p.id === e.playerId);
      if (index < 0) return;
      const x = bustX(index, N);
      if (e.kind === 'correct') {
        fanfare();
        confettiCannons(mobile ? LIMITS.mobile.confetti : LIMITS.desktop.confetti);
        focusOn(index);
        applause(2.2);
        window.dispatchEvent(new Event('cx-applause'));
      }
      if (e.kind === 'wrong') {
        dropStucco(x, bustZ(x));
        shakeCamera();
        greenFlash();
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [N, mobile]);

  const busts = players.map((p, i) => {
    const x = bustX(i, N);
    return <Bust key={p.id} id={p.id} position={[x, 0, bustZ(x)]} />;
  });

  return (
    <>
      <ambientLight intensity={0.3} color="#3A2A22" />
      <primitive object={target} position={AIM} />
      <spotLight
        ref={spotA}
        position={SPOT_L}
        target={target}
        angle={0.42}
        penumbra={0.7}
        intensity={170}
        color="#FFE2A8"
        castShadow={!mobile}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
      />
      <spotLight
        ref={spotB}
        position={SPOT_R}
        target={target}
        angle={0.42}
        penumbra={0.7}
        intensity={170}
        color="#FFE2A8"
        castShadow={!mobile}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
      />
      {!mobile && (
        <>
          <Beam from={SPOT_L} to={AIM} />
          <Beam from={SPOT_R} to={AIM} />
          <Motes />
        </>
      )}

      {/* пол и стена */}
      <mesh geometry={floorGeo} material={M.floor} rotation={[-Math.PI / 2, 0, 0]} receiveShadow />
      <mesh geometry={wallGeo} material={M.wall} position={[0, 3.6, -3.3]} receiveShadow />
      <mesh geometry={friezeGeo} material={M.gold} position={[0, 8.0, -3.22]} />
      <mesh geometry={baseboardGeo} material={M.marble} position={[0, 0.18, -3.2]} receiveShadow />
      {[-6.4, 6.4].map((x) => (
        <group key={x} position={[x, 0, -2.2]}>
          <mesh geometry={columnGeo} material={M.marble} position={[0, 3.2, 0]} castShadow />
          <mesh geometry={capitalGeo} material={M.gold} position={[0, 6.6, 0]} />
        </group>
      ))}

      {/* занавес: две половины, раздвигаются на старте */}
      <group ref={curtainL} position={[-3.5, 3.9, -2.9]}>
        <mesh geometry={curtainGeo} material={M.velvet} castShadow />
      </group>
      <group ref={curtainR} position={[3.5, 3.9, -2.9]}>
        <mesh geometry={curtainGeo} material={M.velvet} castShadow />
      </group>

      {busts}
      <Skrizhal />
      <Effects max={mobile ? LIMITS.mobile.particles : LIMITS.desktop.particles} />
    </>
  );
}

export default function Hall() {
  const [ready, setReady] = useState(false);
  const mobile = useMemo(() => window.matchMedia('(max-width: 720px), (pointer: coarse) and (max-width: 1024px)').matches, []);

  // Шрифты нужны для табличек на плитках: ждём их, но не дольше 2.5 с
  useEffect(() => {
    let alive = true;
    const fonts = Promise.all([
      document.fonts.load('900 180px "Playfair Display"'),
      document.fonts.load('800 22px "Unbounded"'),
    ]).catch(() => null);
    Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))]).then(() => alive && setReady(true));
    return () => { alive = false; };
  }, []);

  if (!ready) return <div className="cx-hush" role="status">Расставляем бюсты…</div>;

  return (
    <Canvas
      shadows={!mobile}
      dpr={mobile ? LIMITS.mobile.dpr : LIMITS.desktop.dpr}
      camera={{ position: [cam.px, cam.py, cam.pz], fov: 40, near: 0.1, far: 80 }}
      gl={{ antialias: !mobile, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={['#0B0907']} />
      <Scene mobile={mobile} />
      <EffectComposer multisampling={0} disableNormalPass>
        {!mobile && <Bloom intensity={0.35} luminanceThreshold={0.85} luminanceSmoothing={0.2} mipmapBlur />}
        {!mobile && <ChromaticAberration offset={new THREE.Vector2(0.0008, 0.0008)} />}
        {!mobile && <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.06} />}
        <Vignette eskil={false} offset={0.28} darkness={0.7} />
      </EffectComposer>
    </Canvas>
  );
}
