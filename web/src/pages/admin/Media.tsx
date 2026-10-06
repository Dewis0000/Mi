import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Download, Film, Link2, Trash2, Upload } from 'lucide-react'
import { Badge, Button, EmptyState, ErrorBox, Field, Modal, Skeleton, useUi } from '../../components/ui'
import { api, errorMessage, isDemoNotice } from '../../lib/api'
import { fmtBytes, fmtDate, fmtDateTime, fmtDuration, fromVenueInput, rub, venueDateKey } from '../../lib/format'
import type { Booking, Paged } from '../../lib/types'
import { PageHeader, Pagination } from './shared'

type Rec = {
  id: string
  bookingId: string | null
  roomNumber: number
  fileKey: string
  durationSec: number
  sizeBytes: number
  recordedAt: string
  price: number
  isPurchased: boolean
  expiresAt: string | null
  deleteAfter: string | null
  booking: (Booking & { user: { name: string | null; phone: string } }) | null
}

/** Ручная привязка: ищем заявки в этой комнате около времени записи */
function BindModal({ rec, onClose }: { rec: Rec | null; onClose: () => void }) {
  const { toast } = useUi()
  const qc = useQueryClient()
  const [manualId, setManualId] = useState('')
  const day = rec ? venueDateKey(rec.recordedAt) : ''
  const candidates = useQuery({
    queryKey: ['admin', 'bind-candidates', rec?.id],
    queryFn: () => api<Booking[]>('/admin/bookings/calendar', { query: { from: day, to: day } }),
    enabled: !!rec,
  })
  const bind = useMutation({
    mutationFn: (bookingId: string | null) => api(`/admin/recordings/${rec!.id}`, { method: 'PATCH', body: { bookingId } }),
    onSuccess: () => {
      toast('Привязка сохранена')
      qc.invalidateQueries({ queryKey: ['admin', 'recordings'] })
      onClose()
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const list = (candidates.data ?? []).filter((b) => b.quest.roomNumber === rec?.roomNumber)
  return (
    <Modal open={!!rec} onClose={onClose} title="Привязать запись к заявке">
      {rec && (
        <div className="space-y-4">
          <p className="text-sm text-muted">Комната {rec.roomNumber}, запись от {fmtDateTime(rec.recordedAt)}. Сеансы в этой комнате в тот день:</p>
          {candidates.isLoading && <Skeleton className="h-24" />}
          {list.length === 0 && !candidates.isLoading && <p className="text-sm text-muted">Сеансов не найдено — укажите ID заявки вручную.</p>}
          <ul className="space-y-2">
            {list.map((b) => (
              <li key={b.id}>
                <button onClick={() => bind.mutate(b.id)} className={clsx('w-full rounded-xl border p-3 text-left text-sm hover:border-accent', rec.bookingId === b.id ? 'border-accent' : 'border-line')}>
                  <b>{fmtDateTime(b.startAt)}</b> · {b.quest.title} · {b.user?.name ?? b.user?.phone}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input className="input" placeholder="ID заявки" value={manualId} onChange={(e) => setManualId(e.target.value)} aria-label="ID заявки" />
            <Button variant="secondary" disabled={!manualId.trim()} onClick={() => bind.mutate(manualId.trim())}>Привязать</Button>
          </div>
          {rec.bookingId && <Button variant="ghost" size="sm" onClick={() => bind.mutate(null)}>Отвязать</Button>}
        </div>
      )}
    </Modal>
  )
}

function UploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useUi()
  const qc = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [room, setRoom] = useState('1')
  const [at, setAt] = useState('')
  const [minutes, setMinutes] = useState('60')
  const [bookingId, setBookingId] = useState('')
  const up = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('file', file!)
      fd.append('room', room)
      fd.append('recordedAt', fromVenueInput(at))
      fd.append('durationSec', String(Number(minutes) * 60))
      if (bookingId) fd.append('bookingId', bookingId)
      return api('/admin/recordings', { method: 'POST', body: fd })
    },
    onSuccess: () => {
      toast('Видео загружено')
      qc.invalidateQueries({ queryKey: ['admin', 'recordings'] })
      onClose()
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  return (
    <Modal open={open} onClose={onClose} title="Загрузить запись вручную">
      <div className="space-y-4">
        <Field label="Видеофайл">{(id) => <input id={id} type="file" accept="video/*" className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Комната №">{(id) => <input id={id} type="number" min={1} className="input" value={room} onChange={(e) => setRoom(e.target.value)} />}</Field>
          <Field label="Длительность, мин">{(id) => <input id={id} type="number" min={1} className="input" value={minutes} onChange={(e) => setMinutes(e.target.value)} />}</Field>
        </div>
        <Field label="Начало записи">{(id) => <input id={id} type="datetime-local" className="input" value={at} onChange={(e) => setAt(e.target.value)} />}</Field>
        <Field label="ID заявки" hint="Пусто — привяжется автоматически по комнате и времени">{(id) => <input id={id} className="input" value={bookingId} onChange={(e) => setBookingId(e.target.value)} />}</Field>
        <Button className="w-full" disabled={!file || !at} loading={up.isPending} onClick={() => up.mutate()}>Загрузить</Button>
      </div>
    </Modal>
  )
}

export function Recordings() {
  const [unbound, setUnbound] = useState(false)
  const [bindRec, setBindRec] = useState<Rec | null>(null)
  const [uploading, setUploading] = useState(false)
  const { confirm, toast } = useUi()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['admin', 'recordings', unbound],
    queryFn: () => api<{ items: Rec[]; retentionDays: number }>('/admin/recordings', { query: { unbound: unbound ? 'true' : undefined } }),
    placeholderData: keepPreviousData,
  })
  const del = useMutation({
    mutationFn: (id: string) => api(`/admin/recordings/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast('Запись удалена')
      qc.invalidateQueries({ queryKey: ['admin', 'recordings'] })
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  async function download(id: string) {
    try {
      const r = await api<{ url: string }>(`/admin/recordings/${id}/download`)
      window.open(r.url, '_blank', 'noopener')
    } catch (e) {
      toast(errorMessage(e), isDemoNotice(e) ? 'info' : 'error')
    }
  }

  return (
    <div>
      <PageHeader title="Видеозаписи" text={q.data && `Записи с камер загружаются автоматически по окончании сеанса. Срок хранения — ${q.data.retentionDays} дн., затем автоудаление (меняется в настройках).`}>
        <Button size="sm" variant="secondary" onClick={() => setUploading(true)}><Upload className="size-4" /> Загрузить</Button>
      </PageHeader>
      <label className="mb-4 inline-flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-[var(--accent)]" checked={unbound} onChange={(e) => setUnbound(e.target.checked)} /> Только не привязанные к заявке
      </label>
      {q.error && <ErrorBox error={q.error} onRetry={q.refetch} />}
      {!q.data ? (
        <Skeleton className="h-80" />
      ) : q.data.items.length === 0 ? (
        <EmptyState icon={<Film className="size-7" />} title="Записей нет" />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="p-3 font-medium">Записано</th>
                  <th className="p-3 font-medium">Комната</th>
                  <th className="p-3 font-medium">Заявка</th>
                  <th className="p-3 font-medium">Файл</th>
                  <th className="p-3 font-medium">Продажа</th>
                  <th className="p-3 font-medium">Удаление</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {q.data.items.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3 tabular-nums">{fmtDateTime(r.recordedAt)}</td>
                    <td className="p-3">№{r.roomNumber}</td>
                    <td className="p-3">
                      {r.booking ? (
                        <>
                          <div>{r.booking.quest.title}</div>
                          <div className="text-xs text-muted">{r.booking.user.name ?? r.booking.user.phone}</div>
                        </>
                      ) : (
                        <Badge className="bg-amber-500/15 text-amber-500 ring-amber-500/30">не привязана</Badge>
                      )}
                    </td>
                    <td className="p-3 text-muted">{fmtDuration(r.durationSec)} · {fmtBytes(r.sizeBytes)}</td>
                    <td className="p-3">{r.isPurchased ? <Badge className="bg-emerald-500/15 text-emerald-500 ring-emerald-500/30">куплена</Badge> : <span className="text-muted">{rub(r.price)}</span>}</td>
                    <td className="p-3 text-muted">{r.deleteAfter ? fmtDate(r.deleteAfter) : '—'}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setBindRec(r)} aria-label="Привязать к заявке"><Link2 className="size-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => download(r.id)} aria-label="Скачать"><Download className="size-4" /></Button>
                        <Button size="sm" variant="ghost" aria-label="Удалить" onClick={async () => (await confirm({ title: 'Удалить видеозапись?', text: r.isPurchased ? 'Запись уже куплена клиентом — он потеряет доступ к скачиванию.' : 'Файл будет удалён из хранилища без возможности восстановления.', danger: true, confirmText: 'Удалить' })) && del.mutate(r.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <BindModal rec={bindRec} onClose={() => setBindRec(null)} />
      <UploadModal open={uploading} onClose={() => setUploading(false)} />
    </div>
  )
}

type Payment = { id: string; purpose: string; amount: number; status: string; provider: string; createdAt: string; paidAt: string | null; user: { name: string | null; phone: string } }

export function Payments() {
  const [page, setPage] = useState(1)
  const q = useQuery({ queryKey: ['admin', 'payments', page], queryFn: () => api<Paged<Payment>>('/admin/payments', { query: { page } }), placeholderData: keepPreviousData })
  return (
    <div>
      <PageHeader title="Платежи" text="Предоплаты квестов и покупки видеозаписей" />
      {q.error && <ErrorBox error={q.error} />}
      {!q.data ? (
        <Skeleton className="h-80" />
      ) : q.data.items.length === 0 ? (
        <EmptyState title="Платежей пока нет" />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="p-3 font-medium">Дата</th>
                  <th className="p-3 font-medium">Клиент</th>
                  <th className="p-3 font-medium">Назначение</th>
                  <th className="p-3 text-right font-medium">Сумма</th>
                  <th className="p-3 font-medium">Статус</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {q.data.items.map((p) => (
                  <tr key={p.id}>
                    <td className="p-3 tabular-nums">{fmtDateTime(p.createdAt)}</td>
                    <td className="p-3">{p.user.name ?? '—'} <span className="text-muted">{p.user.phone}</span></td>
                    <td className="p-3">{p.purpose === 'RECORDING' ? 'Видеозапись' : 'Предоплата'}</td>
                    <td className="p-3 text-right tabular-nums">{rub(p.amount)}</td>
                    <td className="p-3">
                      <Badge className={p.status === 'SUCCEEDED' ? 'bg-emerald-500/15 text-emerald-500 ring-emerald-500/30' : p.status === 'PENDING' ? 'bg-amber-500/15 text-amber-500 ring-amber-500/30' : 'bg-zinc-500/15 text-muted ring-line'}>
                        {p.status === 'SUCCEEDED' ? 'Оплачен' : p.status === 'PENDING' ? 'Ожидает' : 'Отменён'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
        </div>
      )}
    </div>
  )
}
