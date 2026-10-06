import { useEffect, useRef } from 'react'
import { venueParts } from '../lib/format'

/**
 * Имитация камеры для демо-версии: кадр комнаты в стиле видеонаблюдения
 * (шум, строки развёртки, таймкод). На рабочем сайте здесь HLS-поток.
 */
export function FakeFeed({ photo, title, room }: { photo: string; title: string; room: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d', { willReadFrequently: true })
    if (!canvas || !ctx) return
    const img = new Image()
    img.src = photo
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let raf = 0
    let last = 0

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)
      if (t - last < 66) return // ~15 кадров в секунду, как у камер
      last = t
      frame++
      const w = (canvas.width = canvas.clientWidth * Math.min(2, devicePixelRatio))
      const h = (canvas.height = canvas.clientHeight * Math.min(2, devicePixelRatio))
      ctx.fillStyle = '#050505'
      ctx.fillRect(0, 0, w, h)
      if (img.complete && img.naturalWidth) {
        // медленный «наезд» камеры и подрагивание
        const zoom = 1.08 + Math.sin(frame / 90) * 0.02
        const iw = w * zoom
        const ih = (img.naturalHeight / img.naturalWidth) * iw
        const jitter = frame % 47 === 0 ? 4 : 0
        ctx.filter = 'grayscale(1) contrast(1.25) brightness(0.8)'
        ctx.drawImage(img, (w - iw) / 2 + jitter, (h - ih) / 2, iw, Math.max(ih, h * zoom))
        ctx.filter = 'none'
      }
      // шум
      const noise = ctx.getImageData(0, 0, w, h)
      const d = noise.data
      for (let i = 0; i < d.length; i += 4 * 3) {
        const n = (Math.random() - 0.5) * 38
        d[i] += n
        d[i + 1] += n
        d[i + 2] += n
      }
      ctx.putImageData(noise, 0, 0)
      // строки развёртки и бегущая полоса
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1)
      const band = ((frame * 6) % (h + 120)) - 60
      ctx.fillStyle = 'rgba(255,255,255,0.04)'
      ctx.fillRect(0, band, w, 60)
      // виньетка
      const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.9)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(1, 'rgba(0,0,0,0.75)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      // подписи
      const s = Math.max(12, Math.round(h / 26))
      ctx.font = `600 ${s}px ui-monospace, Menlo, Consolas, monospace`
      ctx.fillStyle = 'rgba(255,255,255,0.88)'
      ctx.fillText(`CAM 0${room} · ${title.toUpperCase()}`, s, s * 1.8)
      const p = venueParts(new Date())
      const sec = String(new Date().getSeconds()).padStart(2, '0')
      ctx.fillText(`${String(p.d).padStart(2, '0')}.${String(p.m).padStart(2, '0')}.${p.y}  ${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}:${sec}`, s, h - s)
      if (Math.floor(frame / 8) % 2 === 0) {
        ctx.fillStyle = '#ef4444'
        ctx.beginPath()
        ctx.arc(w - s * 4.6, s * 1.45, s * 0.38, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = 'rgba(255,255,255,0.88)'
      ctx.fillText('REC', w - s * 3.8, s * 1.8)
      if (reduce) cancelAnimationFrame(raf)
    }
    img.onload = () => {
      if (reduce) draw(1000)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [photo, title, room])

  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
      <canvas ref={ref} className="h-full w-full" role="img" aria-label={`Камера комнаты ${room}: ${title}`} />
      <span className="absolute right-3 bottom-3 rounded-md bg-black/70 px-2 py-1 text-[11px] text-white/80">демо-имитация камеры</span>
    </div>
  )
}
