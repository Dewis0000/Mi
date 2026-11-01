// Частицы: конфетти, пыль, осколки, капли и перо. Простая физика: гравитация, отскок от пола,
// трение и время жизни. Всё в одном пуле, рисуется одним InstancedMesh (см. Effects.jsx).

export const KIND = {
  confetti: { g: 0.9, life: [3.2, 4.4], bounce: 0.35, size: [0.05, 0.12], spin: 6 },
  dust: { g: 0.5, life: [0.8, 1.6], bounce: 0, size: [0.02, 0.04], spin: 1 },
  debris: { g: 1.0, life: [1.8, 2.6], bounce: 0.3, size: [0.04, 0.12], spin: 5 },
  drop: { g: 1.0, life: [1.5, 2.0], bounce: 0, size: [0.03, 0.03], spin: 0 },
  feather: { g: 0.22, life: [6, 7], bounce: 0, size: [0.03, 0.12], spin: 2, flutter: true },
};

export const PALETTE = {
  confetti: ['#F2D37B', '#C9A227', '#A8801A', '#F4EEE2', '#5C0B14', '#4E7A63'],
  dust: ['#F4EEE2', '#E6DCC6'],
  debris: ['#F4EEE2', '#E6DCC6', '#CFC3A8'],
  drop: ['#CFE0E8'],
  feather: ['#F4EEE2', '#DCD3C2'],
};

export const pool = [];
let limit = 400;
let seq = 0;

export function setLimit(n) {
  limit = n;
}

const rnd = (a, b) => a + Math.random() * (b - a);

function color(kind) {
  const list = PALETTE[kind] || PALETTE.debris;
  return list[Math.floor(Math.random() * list.length)];
}

// Порождаем count частиц в точке origin. spread — разброс скорости
export function spawn(kind, origin, count, { vel = [0, 0, 0], spread = 1, scale = 1, floor = 0.02 } = {}) {
  const cfg = KIND[kind];
  if (!cfg) return;
  for (let i = 0; i < count && pool.length < limit; i++) {
    const life = rnd(cfg.life[0], cfg.life[1]);
    pool.push({
      id: seq++,
      kind,
      x: origin[0], y: origin[1], z: origin[2],
      vx: vel[0] + rnd(-1, 1) * spread,
      vy: vel[1] + rnd(0, 1) * spread,
      vz: vel[2] + rnd(-1, 1) * spread,
      rx: rnd(0, 6.28), ry: rnd(0, 6.28), rz: rnd(0, 6.28),
      vrx: rnd(-1, 1) * cfg.spin, vry: rnd(-1, 1) * cfg.spin, vrz: rnd(-1, 1) * cfg.spin,
      life, max: life,
      s: rnd(cfg.size[0], cfg.size[1]) * scale,
      c: color(kind),
      t: rnd(0, 6.28),
      floor, // высота, на которой частица падает и отскакивает
    });
  }
}

// Два залпа конфетти по бокам сцены
export function confettiCannons(count) {
  const half = Math.floor(count / 2);
  [[-4.2, 0.2, 2.2, 1], [4.2, 0.2, 2.2, -1]].forEach(([x, y, z, dir]) => {
    spawn('confetti', [x, y, z], half, { vel: [dir * rnd(2.2, 4.4), rnd(4.5, 7.5), rnd(-1.8, -0.2)], spread: 1.6 });
  });
}

// Шаг физики. Удаляем мёртвые частицы перестановкой с последней
export function step(dt) {
  for (let i = pool.length - 1; i >= 0; i--) {
    const p = pool[i];
    const cfg = KIND[p.kind];
    p.life -= dt;
    if (p.life <= 0) {
      pool[i] = pool[pool.length - 1];
      pool.pop();
      continue;
    }
    p.vy -= 9.8 * cfg.g * dt;
    if (cfg.flutter) {
      p.t += dt * 3;
      p.vx = Math.sin(p.t) * 0.6;
      p.vz = Math.cos(p.t * 0.7) * 0.4;
    }
    if (p.kind === 'drop' && p.y <= p.floor) {
      // капля разбивается о плечо: несколько брызг, сама капля исчезает
      spawn('dust', [p.x, p.floor, p.z], 6, { spread: 0.6 });
      p.life = 0;
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.rx += p.vrx * dt;
    p.ry += p.vry * dt;
    p.rz += p.vrz * dt;
    if (p.y < p.floor) {
      p.y = p.floor;
      if (cfg.bounce > 0 && Math.abs(p.vy) > 0.6) {
        p.vy = -p.vy * cfg.bounce;
        p.vx *= 0.7;
        p.vz *= 0.7;
        p.vrx *= 0.5;
        p.vry *= 0.5;
        p.vrz *= 0.5;
      } else {
        p.vy = 0;
        p.vx *= 0.85;
        p.vz *= 0.85;
        p.vrx *= 0.85;
        p.vry *= 0.85;
        p.vrz *= 0.85;
      }
    }
  }
}
