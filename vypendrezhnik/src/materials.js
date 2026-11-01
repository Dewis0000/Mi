import * as THREE from 'three';
import { COLOR } from './tokens.js';
import { marbleTexture, velvetTexture, stuccoTexture } from './textures.js';

// Материалы и геометрия собираются один раз и делятся между всеми объектами: это экономит память и draw calls.

let mats = null;
let geos = null;

export function materials() {
  if (!mats) {
    mats = {
      gold: new THREE.MeshStandardMaterial({ color: COLOR.gold[1], metalness: 1, roughness: 0.28 }),
      goldLeaf: new THREE.MeshStandardMaterial({ color: '#B8922E', metalness: 0.9, roughness: 0.4 }),
      halo: new THREE.MeshStandardMaterial({ color: COLOR.gold[0], metalness: 1, roughness: 0.2, emissive: COLOR.gold[0], emissiveIntensity: 0.7 }),
      marble: new THREE.MeshPhysicalMaterial({ map: marbleTexture(7), roughness: 0.22, clearcoat: 0.45, clearcoatRoughness: 0.18 }),
      marbleCracked: new THREE.MeshPhysicalMaterial({ map: marbleTexture(11, true), color: '#D9CFBC', roughness: 0.42, clearcoat: 0.1 }),
      marbleDouble: new THREE.MeshPhysicalMaterial({ map: marbleTexture(13), roughness: 0.3, clearcoat: 0.3, side: THREE.DoubleSide }),
      patina: new THREE.MeshStandardMaterial({ color: COLOR.patina, roughness: 0.75, metalness: 0.05 }),
      wig: new THREE.MeshStandardMaterial({ color: '#FBF8F1', roughness: 0.92 }),
      velvet: new THREE.MeshStandardMaterial({ map: velvetTexture(2), roughness: 0.95, side: THREE.DoubleSide }),
      dove: new THREE.MeshStandardMaterial({ color: '#E9E6E0', roughness: 0.65 }),
      beak: new THREE.MeshStandardMaterial({ color: COLOR.gold[2], metalness: 0.6, roughness: 0.4 }),
      drop: new THREE.MeshPhysicalMaterial({ color: '#CFE0E8', roughness: 0.05, transparent: true, opacity: 0.85 }),
      stucco: new THREE.MeshStandardMaterial({ map: stuccoTexture(), roughness: 0.85 }),
      web: new THREE.LineBasicMaterial({ color: '#D8D2C4', transparent: true, opacity: 0.55 }),
      feather: new THREE.MeshStandardMaterial({ color: '#F4EEE2', roughness: 0.8, side: THREE.DoubleSide }),
      floor: new THREE.MeshPhysicalMaterial({ map: marbleTexture(5, false, 3), roughness: 0.3, clearcoat: 0.35 }),
      wall: new THREE.MeshStandardMaterial({ map: marbleTexture(19, true, 1), roughness: 0.4 }),
    };
  }
  return mats;
}

export function geometries() {
  if (!geos) {
    const torso = [
      [0.42, 0], [0.46, 0.05], [0.4, 0.2], [0.34, 0.42], [0.36, 0.62],
      [0.5, 0.74], [0.52, 0.8], [0.44, 0.9], [0.2, 0.96], [0.14, 1.02], [0.001, 1.04],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    geos = {
      torso: new THREE.LatheGeometry(torso, 48),
      head: new THREE.SphereGeometry(0.26, 40, 32),
      nose: new THREE.ConeGeometry(0.045, 0.14, 12),
      brow: new THREE.BoxGeometry(0.2, 0.03, 0.05),
      wreath: new THREE.TorusGeometry(0.31, 0.022, 10, 48),
      leaf: new THREE.SphereGeometry(0.05, 10, 8),
      epaulette: new THREE.BoxGeometry(0.22, 0.1, 0.34),
      monocle: new THREE.TorusGeometry(0.055, 0.007, 8, 24),
      wig: new THREE.SphereGeometry(0.31, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.6),
      curl: new THREE.TorusGeometry(0.06, 0.02, 8, 16),
      cloak: new THREE.CylinderGeometry(0.66, 0.72, 0.9, 40, 1, true, Math.PI / 2, Math.PI), // полуцилиндр за спиной
      halo: new THREE.TorusGeometry(0.36, 0.022, 12, 56),
      pedestal: new THREE.CylinderGeometry(0.5, 0.56, 0.9, 40),
      plinth: new THREE.BoxGeometry(1.2, 0.12, 1.2),
      dove: new THREE.SphereGeometry(0.1, 16, 12),
      doveHead: new THREE.SphereGeometry(0.05, 12, 10),
      doveWing: new THREE.BoxGeometry(0.03, 0.14, 0.2),
      doveTail: new THREE.BoxGeometry(0.06, 0.02, 0.14),
      drop: new THREE.SphereGeometry(0.035, 10, 8),
      feather: new THREE.PlaneGeometry(0.06, 0.2),
    };
    geos.nose.rotateX(Math.PI / 2);
    geos.dove.scale(1.1, 0.85, 1.6);
  }
  return geos;
}

// Слегка неровная поверхность лепнины: вершины смещаем детерминированно
export function stuccoGeometry() {
  const g = new THREE.IcosahedronGeometry(0.34, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = 0.8 + 0.4 * Math.abs(Math.sin(i * 12.9898));
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * (0.7 + 0.3 * k), pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

// Паутина на плече у глубокого минуса: радиальные нити и кольца
export function webGeometry() {
  const pts = [];
  for (let a = 0; a < 7; a++) {
    const t = (a / 7) * Math.PI * 2;
    pts.push(0, 0, 0, Math.cos(t) * 0.22, Math.sin(t) * 0.22, 0);
  }
  for (let r = 1; r <= 3; r++) {
    for (let a = 0; a < 16; a++) {
      const t1 = (a / 16) * Math.PI * 2;
      const t2 = ((a + 1) / 16) * Math.PI * 2;
      pts.push(Math.cos(t1) * r * 0.07, Math.sin(t1) * r * 0.07, 0, Math.cos(t2) * r * 0.07, Math.sin(t2) * r * 0.07, 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}
