import * as THREE from 'three';
import { COLOR } from './tokens.js';

// Текстуры рисуются на canvas: ни одного внешнего файла. Кэш — по ключу, чтобы не плодить текстуры.

function rng(seed) {
  let s = seed % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(c, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

// Шлифованный мрамор: облака, прожилки, при необходимости трещины
export function marbleCanvas(w = 1024, h = 1024, seed = 7, cracked = false) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const r = rng(seed);
  g.fillStyle = COLOR.marble;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 46; i++) {
    g.fillStyle = `rgba(190,178,156,${0.04 + r() * 0.08})`;
    g.beginPath();
    g.ellipse(r() * w, r() * h, 30 + r() * 220, 12 + r() * 80, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 16; i++) {
    g.strokeStyle = `rgba(118,104,86,${0.10 + r() * 0.18})`;
    g.lineWidth = 0.8 + r() * 2.4;
    g.beginPath();
    let x = r() * w;
    let y = r() * h;
    g.moveTo(x, y);
    for (let k = 0; k < 9; k++) {
      x += (r() - 0.5) * 180;
      y += (r() - 0.2) * 130;
      g.quadraticCurveTo(x + (r() - 0.5) * 70, y + (r() - 0.5) * 70, x, y);
    }
    g.stroke();
  }
  if (cracked) crack(g, w, h, r, 9);
  return c;
}

// Трещины: ломаные линии с ветвями, тёмные и тонкие
export function crack(g, w, h, r, count) {
  g.strokeStyle = 'rgba(52,42,34,0.6)';
  for (let i = 0; i < count; i++) {
    let x = r() * w;
    let y = r() * h;
    let angle = r() * Math.PI * 2;
    g.lineWidth = 0.6 + r() * 1.4;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 10; k++) {
      angle += (r() - 0.5) * 1.2;
      const len = 14 + r() * 26;
      x += Math.cos(angle) * len;
      y += Math.sin(angle) * len;
      g.lineTo(x, y);
      if (r() < 0.25) {
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 60);
        g.moveTo(x, y);
      }
    }
    g.stroke();
  }
}

// Тиснёный бархат: ворс как мелкие штрихи света и тени
export function velvetCanvas(w = 512, h = 512, seed = 3) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const r = rng(seed);
  g.fillStyle = COLOR.velvet;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    g.strokeStyle = r() < 0.5 ? 'rgba(140,38,50,0.16)' : 'rgba(40,6,10,0.22)';
    g.lineWidth = 1 + r();
    const x = r() * w;
    const y = r() * h;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 5, y + 4 + r() * 6);
    g.stroke();
  }
  return c;
}

// Золотая гравировка: градиент золота, тень под буквой, светлая кромка
export function engrave(g, text, x, y, font, align = 'center') {
  g.font = font;
  g.textAlign = align;
  g.textBaseline = 'middle';
  const grad = g.createLinearGradient(0, y - 80, 0, y + 80);
  grad.addColorStop(0, COLOR.gold[0]);
  grad.addColorStop(0.5, COLOR.gold[1]);
  grad.addColorStop(1, COLOR.gold[2]);
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.55)';
  g.shadowOffsetY = 4;
  g.shadowBlur = 6;
  g.fillStyle = grad;
  g.fillText(text, x, y);
  g.restore();
  g.save();
  g.strokeStyle = 'rgba(255,240,190,0.55)';
  g.lineWidth = 1.2;
  g.strokeText(text, x, y - 1);
  g.restore();
}

const cache = new Map();

function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

export function marbleTexture(seed = 7, cracked = false, repeat = 1) {
  return cached(`marble-${seed}-${cracked}-${repeat}`, () => toTexture(marbleCanvas(1024, 1024, seed, cracked), repeat));
}

export function velvetTexture(repeat = 2) {
  return cached(`velvet-${repeat}`, () => toTexture(velvetCanvas(), repeat));
}

// Табличка с номиналом: плита мрамора и золотая цифра. Погашенная плитка — с трещинами и потемневшей цифрой
export function tileTexture(value, used) {
  return cached(`tile-${value}-${used}`, () => {
    const c = canvas(512, 320);
    const g = c.getContext('2d');
    g.drawImage(marbleCanvas(512, 320, value * 13 + 5, used), 0, 0);
    if (used) {
      g.fillStyle = 'rgba(24,18,14,0.55)';
      g.fillRect(0, 0, 512, 320);
    }
    g.save();
    g.globalAlpha = used ? 0.45 : 1;
    engrave(g, 'ЦЕНА', 46, 56, '800 22px "Unbounded", sans-serif', 'left');
    engrave(g, String(value), 256, 176, '900 180px "Playfair Display", serif');
    g.restore();
    return toTexture(c);
  });
}

// Надпись над колонкой темы
export function headerTexture(name) {
  return cached(`header-${name}`, () => {
    const c = canvas(1024, 200);
    const g = c.getContext('2d');
    g.drawImage(marbleCanvas(1024, 200, name.length * 31, false), 0, 0);
    engrave(g, name.toUpperCase(), 512, 104, '900 92px "Playfair Display", serif');
    return toTexture(c);
  });
}

// Прожилки для лепнины и осколков: светлая гипсовая поверхность
export function stuccoTexture() {
  return cached('stucco', () => toTexture(marbleCanvas(512, 512, 41, false), 1));
}

// Пустой мраморный фон стены с тонкими трещинами по краям
export function wallTexture() {
  return cached('wall', () => toTexture(marbleCanvas(2048, 1024, 19, true), 1));
}
