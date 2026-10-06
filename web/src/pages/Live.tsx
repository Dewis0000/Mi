import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Copy, Radio, Share2 } from 'lucide-react'
import { HlsPlayer } from '../components/HlsPlayer'
import { FakeFeed } from '../demo/FakeFeed'
import { DEMO } from '../lib/env'
import { Button, EmptyState, ErrorBox, Skeleton, buttonClass, useUi } from '../components/ui'
import { api, errorMessage } from '../lib/api'
import { fmtDateTime, fmtTime } from '../lib/format'
import { useSecondsLeft, useSeo } from '../lib/hooks'
import { useRequireAuth } from '../lib/useRequireAuth'

type StreamInfo = {
  bookingId: string
  quest: { title: string; photoUrl: string; roomNumber: number }
  startAt: string
  endAt: string
  status: 'live' | 'upcoming' | 'ended'
  hlsUrl: string | null
  token: string | null
}

function StreamView({ info, owner }: { info: StreamInfo; owner?: boolean }) {
  const { toast } = useUi()
  const [invite, setInvite] = useState<{ url: string; path?: string } | null>(null)
  const left = useSecondsLeft(new Date(info.endAt).getTime())

  async function share() {
    try {
      const r = await api<{ url: string; path?: string }>(`/streams/booking/${info.bookingId}/invite`, { method: 'POST' })
      setInvite(r)
      const copied = await navigator.clipboard?.writeText(r.url).then(() => true).catch(() => false)
      toast(copied ? 'Ссылка для зрителей скопирована' : 'Ссылка для зрителей готова', 'success')
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-accent">
            <Radio className="size-4 animate-pulse" /> {info.status === 'live' ? 'Прямой эфир' : info.status === 'upcoming' ? 'Скоро начнётся' : 'Трансляция завершена'}
          </p>
          <h1 className="mt-2 font-display text-3xl uppercase sm:text-4xl">{info.quest.title}</h1>
          <p className="text-sm text-muted">
            {fmtDateTime(info.startAt)} – {fmtTime(info.endAt)}
            {info.status === 'live' && ` · до конца ${Math.floor(left / 60)} мин`}
          </p>
        </div>
        {owner && info.status !== 'ended' && (
          <Button variant="outline" onClick={share}>
            <Share2 className="size-4" /> Пригласить зрителей
          </Button>
        )}
      </div>
      {invite && (
        <div className="card mb-6 flex items-center gap-3 p-3 text-sm">
          <input readOnly value={invite.url} className="input min-w-0 flex-1 text-xs" onFocus={(e) => e.target.select()} aria-label="Ссылка для зрителей" />
          <Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(invite.url).catch(() => null)} aria-label="Скопировать ссылку">
            <Copy className="size-4" />
          </Button>
          {DEMO && invite.path && (
            <Link to={invite.path} className={buttonClass('ghost', 'sm')}>
              Открыть как зритель
            </Link>
          )}
        </div>
      )}
      {info.status === 'live' && info.hlsUrl && info.token ? (
        DEMO ? (
          <FakeFeed photo={info.quest.photoUrl} title={info.quest.title} room={info.quest.roomNumber} />
        ) : (
          <HlsPlayer src={info.hlsUrl} token={info.token} />
        )
      ) : (
        <EmptyState
          icon={<Radio className="size-7" />}
          title={info.status === 'upcoming' ? 'Трансляция ещё не началась' : 'Сеанс завершён'}
          text={info.status === 'upcoming' ? `Поток с камер появится в ${fmtTime(info.startAt)}, когда команда войдёт в комнату. Страница обновится сама.` : 'Трансляция закрывается автоматически по окончании сеанса. Видео можно купить в личном кабинете.'}
          action={owner && info.status === 'ended' ? <Link to="/profile/videos" className={buttonClass('primary')}>К видеозаписям</Link> : undefined}
        />
      )}
      <p className="mt-4 text-xs text-muted">Трансляция доступна только владельцу записи и приглашённым по временной ссылке. Звук отключён по умолчанию.</p>
    </div>
  )
}

function useAutoRefresh(info: StreamInfo | undefined, refetch: () => void) {
  // переключаемся в эфир при начале и закрываем по окончании сеанса
  useEffect(() => {
    if (!info || info.status === 'ended') return
    const target = new Date(info.status === 'upcoming' ? info.startAt : info.endAt).getTime()
    const t = setTimeout(refetch, Math.max(1000, target - Date.now() + 1000))
    return () => clearTimeout(t)
  }, [info, refetch])
}

export function LiveOwner() {
  useSeo('Онлайн-трансляция — Neru-Квест')
  const { id } = useParams()
  const { user } = useRequireAuth()
  const q = useQuery({ queryKey: ['stream', id], queryFn: () => api<StreamInfo>(`/streams/booking/${id}`), enabled: !!user })
  useAutoRefresh(q.data, q.refetch)
  if (q.error) return <div className="mx-auto max-w-3xl px-4 py-20"><ErrorBox error={q.error} /></div>
  if (!q.data) return <div className="mx-auto max-w-5xl px-4 py-10"><Skeleton className="aspect-video" /></div>
  return <StreamView info={q.data} owner />
}

export function WatchInvite() {
  useSeo('Трансляция квеста — Neru-Квест')
  const { token } = useParams()
  const q = useQuery({ queryKey: ['invite', token], queryFn: () => api<StreamInfo>(`/streams/invite/${token}`), retry: false })
  useAutoRefresh(q.data, q.refetch)
  if (q.error) return <div className="mx-auto max-w-3xl px-4 py-20"><EmptyState icon={<Radio className="size-7" />} title="Трансляция недоступна" text={errorMessage(q.error)} action={<Link to="/" className={buttonClass('outline')}>На главную</Link>} /></div>
  if (!q.data) return <div className="mx-auto max-w-5xl px-4 py-10"><Skeleton className="aspect-video" /></div>
  return <StreamView info={q.data} />
}
