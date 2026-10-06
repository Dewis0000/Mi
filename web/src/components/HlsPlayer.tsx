import { useEffect, useRef, useState } from 'react'
import { VideoOff } from 'lucide-react'

/** HLS-плеер. Токен доступа добавляется к каждому запросу плейлиста и сегментов. */
export function HlsPlayer({ src, token }: { src: string; token: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const video = ref.current
    if (!video) return
    setError(false)
    const withToken = (url: string) => `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = withToken(src) // Safari — нативный HLS
      video.onerror = () => setError(true)
      return
    }
    // hls.js подгружается только на странице трансляции
    let destroy = () => {}
    let cancelled = false
    import('hls.js').then(({ default: Hls }) => {
      if (cancelled) return
      if (!Hls.isSupported()) return setError(true)
      const hls = new Hls({
        lowLatencyMode: true,
        xhrSetup: (xhr, url) => xhr.open('GET', withToken(url), true),
      })
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.ERROR, (_e, data) => data.fatal && setError(true))
      destroy = () => hls.destroy()
    })
    return () => {
      cancelled = true
      destroy()
    }
  }, [src, token])

  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
      <video ref={ref} className="h-full w-full" autoPlay muted playsInline controls />
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black/80 p-6 text-center text-white">
          <div>
            <VideoOff className="mx-auto mb-3 size-10 text-white/60" />
            <p className="font-medium">Поток с камер пока недоступен</p>
            <p className="mt-1 text-sm text-white/60">Трансляция начнётся, как только команда войдёт в комнату.</p>
          </div>
        </div>
      )}
    </div>
  )
}
