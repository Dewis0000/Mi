import { gsap } from 'gsap';
import { TIME, EASE } from './tokens.js';

// Зоны зала: положение камеры (p) и точка, на которую она смотрит (l). Перелёт — 1.2 с, ease-in-out-cubic.
export const ZONES = {
  skrizhal: { p: [0, 1.9, 6.4], l: [0, 1.7, -2.4] },
  pedestals: { p: [0, 1.45, 3.7], l: [0, 1.2, 0.3] },
};

// Текущее состояние камеры. Сцена читает его каждый кадр, GSAP двигает его
export const cam = {
  px: 0, py: 1.9, pz: 6.4,
  lx: 0, ly: 1.7, lz: -2.4,
  shake: 0,
  zone: 'skrizhal',
};

export const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Кроссфейд вместо полёта: затемнение и смена кадра в середине
function crossfade(onMid) {
  const el = document.querySelector('.cx-fade');
  if (!el) return onMid();
  gsap.timeline()
    .to(el, { opacity: 1, duration: TIME.camera * 0.45, ease: 'power1.in' })
    .add(onMid)
    .to(el, { opacity: 0, duration: TIME.camera * 0.55, ease: 'power1.out' });
}

export function moveCamera(zone) {
  const z = ZONES[zone];
  if (!z || cam.zone === zone) return;
  cam.zone = zone;
  const target = {
    px: z.p[0], py: z.p[1], pz: z.p[2],
    lx: z.l[0], ly: z.l[1], lz: z.l[2],
  };
  if (reducedMotion) {
    crossfade(() => Object.assign(cam, target));
    return;
  }
  gsap.to(cam, { ...target, duration: TIME.camera, ease: EASE.camera });
}

// Дёрганье камеры при неверном ответе: 0.15 с
export function shakeCamera() {
  if (reducedMotion) return;
  gsap.fromTo(cam, { shake: 0.12 }, { shake: 0, duration: TIME.shake, ease: 'power2.out' });
}
