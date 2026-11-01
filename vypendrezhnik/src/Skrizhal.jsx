import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { useGame } from './store.js';
import { THEMES } from './texts.js';
import { materials } from './materials.js';
import { tileTexture, headerTexture } from './textures.js';
import { TIME, EASE } from './tokens.js';
import * as fx from './fx.js';
import { swish, crackle } from './sound.js';

// Сетка скрижали: пять тем по пять номиналов. Плитки стоят в стене, выше бюстов.
export const TILE = { w: 0.98, h: 0.6, gap: 0.12, x0: -2.4, y0: 2.45, z: -3.05 };
const TILE_GEO = new THREE.BoxGeometry(TILE.w, TILE.h, 0.1);
const FACE_GEO = new THREE.PlaneGeometry(TILE.w * 0.97, TILE.h * 0.97);
const HEADER_GEO = new THREE.PlaneGeometry(TILE.w * 1.02, 0.2);
const STAGE = [0, 2.6, 3.0]; // место, куда плитка вылетает к камере

export function tileWorld(col, row) {
  return [TILE.x0 + col * (TILE.w + TILE.gap), TILE.y0 + row * (TILE.h + TILE.gap), TILE.z];
}

// Группы плиток по id — чтобы анимация выбора двигала именно эту плитку
const refs = new Map();

// Полёт плитки: к камере (0.6 с), разворот на 180° с осыпанием крошки (0.5 с), возврат в слот уже открытой
function flyTile(tile) {
  const g = refs.get(tile.id);
  if (!g) return;
  const base = g.userData.base;
  gsap.timeline()
    .to(g.position, { x: STAGE[0], y: STAGE[1], z: STAGE[2], duration: TIME.tileFly, ease: EASE.tileFly })
    .to(g.rotation, {
      y: Math.PI,
      duration: TIME.tileSpin,
      ease: EASE.tileSpin,
      onStart: () => {
        fx.spawn('debris', STAGE, 40, { vel: [0, 0.8, 0.6], spread: 1.6, floor: 0.02 });
        crackle(0.9);
      },
    })
    .add(() => {
      g.userData.setUsed(true);
      useGame.getState().markUsed(tile.id);
    })
    .set(g.rotation, { y: 0 })
    .to(g.position, { x: base.x, y: base.y, z: base.z, duration: TIME.tileBack, ease: EASE.tileBack });
}

function Tile({ tile }) {
  const M = materials();
  const ref = useRef();
  const [x, y, z] = tileWorld(tile.col, tile.row);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    map: tileTexture(tile.value, tile.used),
    roughness: 0.32,
    emissive: '#F2D37B',
    emissiveIntensity: 0,
  }), [tile.value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Перерисовка номинала, когда плитку открыли
  const setUsed = (used) => {
    mat.map = tileTexture(tile.value, used);
    mat.needsUpdate = true;
  };

  useEffect(() => {
    const g = ref.current;
    if (!g) return undefined;
    g.userData.base = { x, y, z };
    g.userData.setUsed = setUsed;
    refs.set(tile.id, g);
    return () => refs.delete(tile.id);
  }, [tile.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tile.used) setUsed(true);
  }, [tile.used]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPick = (e) => {
    e.stopPropagation();
    if (tile.used) return;
    if (!useGame.getState().pickTile(tile.id)) return;
    swish(0.8);
    flyTile(tile);
  };

  const onOver = (e) => {
    e.stopPropagation();
    if (tile.used) return;
    document.body.style.cursor = 'pointer';
    gsap.to(ref.current.position, { z: z + 0.1, duration: 0.25, ease: 'power2.out' });
    gsap.to(mat, { emissiveIntensity: 0.18, duration: 0.25 });
  };

  const onOut = () => {
    document.body.style.cursor = '';
    if (ref.current) gsap.to(ref.current.position, { z, duration: 0.3, ease: 'power2.out' });
    gsap.to(mat, { emissiveIntensity: 0, duration: 0.3 });
  };

  return (
    <group ref={ref} position={[x, y, z]}>
      <mesh geometry={TILE_GEO} material={M.marble} castShadow />
      <mesh
        geometry={FACE_GEO}
        material={mat}
        position={[0, 0, 0.052]}
        onPointerDown={onPick}
        onPointerOver={onOver}
        onPointerOut={onOut}
      />
    </group>
  );
}

// Надпись над колонкой темы
function Header({ name, col }) {
  const [x] = tileWorld(col, 0);
  const tex = useMemo(() => headerTexture(name), [name]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 }), [tex]);
  return (
    <mesh geometry={HEADER_GEO} material={mat} position={[x, TILE.y0 + 5 * (TILE.h + TILE.gap) - 0.1, TILE.z + 0.02]} />
  );
}

export default function Skrizhal() {
  const tiles = useGame((s) => s.tiles);
  return (
    <group>
      {THEMES.map((t, col) => <Header key={t} name={t} col={col} />)}
      {tiles.map((tile) => <Tile key={tile.id} tile={tile} />)}
    </group>
  );
}
