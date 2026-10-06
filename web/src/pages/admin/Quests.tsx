import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { EyeOff, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { FearMeter } from '../../components/FearMeter'
import { Badge, Button, ErrorBox, Field, Modal, Skeleton, Switch, useUi } from '../../components/ui'
import { api, errorMessage } from '../../lib/api'
import { FEAR_LEVELS, rub } from '../../lib/format'
import type { AdminQuest, Schedule } from '../../lib/types'
import { PageHeader, useAdminQuests } from './shared'

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const ORDER = [1, 2, 3, 4, 5, 6, 0]

const empty: Omit<AdminQuest, 'id'> = {
  slug: '',
  title: '',
  shortDescription: '',
  description: '',
  photoUrl: '',
  fearLevel: 3,
  minPlayers: 2,
  maxPlayers: 5,
  durationMin: 60,
  minAge: 14,
  basePrice: 4000,
  peakExtra: 1000,
  roomNumber: 1,
  isActive: true,
  sortOrder: 0,
  tags: [],
  schedules: ORDER.map((weekday) => ({ weekday, timeFrom: '10:00', timeTo: '23:00', breakMin: 20 })),
}

const translit = (s: string) =>
  s
    .toLowerCase()
    .split('')
    .map((c) => ({ а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' })[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function ScheduleEditor({ value, onChange }: { value: Schedule[]; onChange: (v: Schedule[]) => void }) {
  const byDay = (d: number) => value.find((s) => s.weekday === d)
  const setDay = (d: number, patch: Partial<Schedule> | null) => {
    const rest = value.filter((s) => s.weekday !== d)
    if (patch === null) return onChange(rest)
    const cur = byDay(d) ?? { weekday: d, timeFrom: '10:00', timeTo: '23:00', breakMin: 20 }
    onChange([...rest, { ...cur, ...patch }])
  }
  return (
    <div className="space-y-2">
      {ORDER.map((d) => {
        const s = byDay(d)
        return (
          <div key={d} className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex w-16 items-center gap-2">
              <input type="checkbox" className="accent-[var(--accent)]" checked={!!s} onChange={(e) => setDay(d, e.target.checked ? {} : null)} />
              {WEEKDAYS[d]}
            </label>
            {s ? (
              <>
                <input type="time" className="input h-9 w-28 py-1" value={s.timeFrom} onChange={(e) => setDay(d, { timeFrom: e.target.value })} aria-label={`${WEEKDAYS[d]}: начало`} />
                <span className="text-muted">—</span>
                <input type="time" className="input h-9 w-28 py-1" value={s.timeTo} onChange={(e) => setDay(d, { timeTo: e.target.value })} aria-label={`${WEEKDAYS[d]}: конец`} />
                <input type="number" min={0} className="input h-9 w-20 py-1" value={s.breakMin} onChange={(e) => setDay(d, { breakMin: Number(e.target.value) })} aria-label={`${WEEKDAYS[d]}: перерыв, мин`} />
                <span className="text-xs text-muted">мин перерыв</span>
              </>
            ) : (
              <span className="text-muted">выходной</span>
            )}
          </div>
        )
      })}
      <button
        type="button"
        className="text-xs text-accent underline"
        onClick={() => {
          const first = byDay(1) ?? value[0]
          if (first) onChange(ORDER.map((weekday) => ({ ...first, weekday, id: undefined })))
        }}
      >
        Применить понедельник ко всем дням
      </button>
      <p className="text-xs text-muted">Если конец раньше начала — сеансы идут после полуночи. Сетка: длительность квеста + перерыв.</p>
    </div>
  )
}

function QuestForm({ quest, onClose }: { quest: AdminQuest | 'new'; onClose: () => void }) {
  const initial = quest === 'new' ? empty : quest
  const [f, setF] = useState(initial)
  const [uploading, setUploading] = useState(false)
  const { toast, confirm } = useUi()
  const qc = useQueryClient()

  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, schedules: f.schedules.map(({ weekday, timeFrom, timeTo, breakMin }) => ({ weekday, timeFrom, timeTo, breakMin })) }
      delete (body as Partial<AdminQuest>).id
      return quest === 'new' ? api('/admin/quests', { method: 'POST', body }) : api(`/admin/quests/${quest.id}`, { method: 'PUT', body })
    },
    onSuccess: () => {
      toast('Квест сохранён')
      qc.invalidateQueries({ queryKey: ['admin', 'quests'] })
      qc.invalidateQueries({ queryKey: ['quests'] })
      onClose()
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  async function upload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await api<{ url: string }>('/admin/uploads', { method: 'POST', body: fd })
      setF((x) => ({ ...x, photoUrl: r.url }))
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setUploading(false)
    }
  }

  const num = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value) })

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Название">{(id) => <input id={id} className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value, slug: quest === 'new' ? translit(e.target.value) : f.slug })} />}</Field>
        <Field label="Адрес страницы (slug)" hint={`/quests/${f.slug || '…'}`}>{(id) => <input id={id} className="input" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} />}</Field>
        <Field label="Краткое описание" className="sm:col-span-2" hint="2–3 строки для карточки">{(id) => <textarea id={id} rows={2} className="input resize-none" value={f.shortDescription} onChange={(e) => setF({ ...f, shortDescription: e.target.value })} />}</Field>
        <Field label="Полное описание" className="sm:col-span-2">{(id) => <textarea id={id} rows={5} className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        {f.photoUrl ? <img src={f.photoUrl} alt="" className="h-32 w-28 rounded-xl object-cover" /> : <div className="grid h-32 w-28 place-items-center rounded-xl bg-surface-2 text-xs text-muted">нет фото</div>}
        <div className="flex-1 space-y-2">
          <Field label="Фото (URL)">{(id) => <input id={id} className="input" value={f.photoUrl} onChange={(e) => setF({ ...f, photoUrl: e.target.value })} />}</Field>
          <label className={clsx('inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm hover:border-accent', uploading && 'opacity-60')}>
            <Upload className="size-4" /> {uploading ? 'Загрузка…' : 'Загрузить файл'}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Уровень страха</p>
        <div className="flex flex-wrap gap-2">
          {FEAR_LEVELS.map((l, i) => (
            <button key={l.label} type="button" onClick={() => setF({ ...f, fearLevel: i + 1 })} className={clsx('rounded-xl border px-3 py-1.5 text-sm', f.fearLevel === i + 1 ? 'border-accent bg-accent/10' : 'border-line text-muted')}>
              {i + 1} · {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Мин. игроков">{(id) => <input id={id} type="number" min={1} className="input" value={f.minPlayers} onChange={num('minPlayers')} />}</Field>
        <Field label="Макс. игроков">{(id) => <input id={id} type="number" min={1} className="input" value={f.maxPlayers} onChange={num('maxPlayers')} />}</Field>
        <Field label="Длительность, мин">{(id) => <input id={id} type="number" min={15} className="input" value={f.durationMin} onChange={num('durationMin')} />}</Field>
        <Field label="Возраст, +">{(id) => <input id={id} type="number" min={0} className="input" value={f.minAge} onChange={num('minAge')} />}</Field>
        <Field label="Цена, ₽" hint="Будни до 17:00">{(id) => <input id={id} type="number" min={0} className="input" value={f.basePrice} onChange={num('basePrice')} />}</Field>
        <Field label="Надбавка, ₽" hint="Вечер и выходные">{(id) => <input id={id} type="number" min={0} className="input" value={f.peakExtra} onChange={num('peakExtra')} />}</Field>
        <Field label="Комната №" hint="Для привязки камер">{(id) => <input id={id} type="number" min={1} className="input" value={f.roomNumber} onChange={num('roomNumber')} />}</Field>
        <Field label="Порядок">{(id) => <input id={id} type="number" className="input" value={f.sortOrder} onChange={num('sortOrder')} />}</Field>
      </div>
      <Field label="Теги" hint="Через запятую">{(id) => <input id={id} className="input" value={f.tags.join(', ')} onChange={(e) => setF({ ...f, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} />}</Field>

      <div>
        <p className="mb-2 text-sm font-medium">Расписание доступности</p>
        <ScheduleEditor value={f.schedules} onChange={(schedules) => setF({ ...f, schedules })} />
      </div>
      <Switch checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label="Квест активен (виден на сайте)" />
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button loading={save.isPending} onClick={async () => (await confirm({ title: quest === 'new' ? 'Создать квест?' : 'Сохранить изменения?' })) && save.mutate()}>
          Сохранить
        </Button>
      </div>
    </div>
  )
}

export default function Quests() {
  const { data, isLoading, error, refetch } = useAdminQuests()
  const [edit, setEdit] = useState<AdminQuest | 'new' | null>(null)
  const { confirm, toast } = useUi()
  const qc = useQueryClient()
  const remove = useMutation({
    mutationFn: (id: string) => api<{ hidden?: boolean }>(`/admin/quests/${id}`, { method: 'DELETE' }),
    onSuccess: (r) => {
      toast(r.hidden ? 'У квеста есть записи — он скрыт, а не удалён' : 'Квест удалён')
      qc.invalidateQueries({ queryKey: ['admin', 'quests'] })
      qc.invalidateQueries({ queryKey: ['quests'] })
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  return (
    <div>
      <PageHeader title="Квесты" text="Карусель на главной перестраивается автоматически: 1, 2 или 3+ активных квеста">
        <Button size="sm" onClick={() => setEdit('new')}><Plus className="size-4" /> Новый квест</Button>
      </PageHeader>
      {error && <ErrorBox error={error} onRetry={refetch} />}
      {isLoading && <Skeleton className="h-96" />}
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {data?.map((q) => (
          <article key={q.id} className={clsx('card flex gap-4 p-4', !q.isActive && 'opacity-60')}>
            <img src={q.photoUrl} alt="" className="h-36 w-28 shrink-0 rounded-xl object-cover" />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-2">
                <h3 className="truncate font-display text-lg uppercase">{q.title}</h3>
                {!q.isActive && <Badge className="bg-zinc-500/15 text-muted ring-line"><EyeOff className="size-3" />скрыт</Badge>}
              </div>
              <p className="text-xs text-muted">Комната {q.roomNumber} · {q.minPlayers}–{q.maxPlayers} игр. · {q.durationMin} мин · {q.minAge}+</p>
              <p className="text-sm">от {rub(q.basePrice)}</p>
              <FearMeter level={q.fearLevel} compact className="mt-2 max-w-40" />
              <div className="mt-auto flex gap-2 pt-3">
                <Button size="sm" variant="secondary" onClick={() => setEdit(q)}><Pencil className="size-4" /> Изменить</Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Удалить"
                  onClick={async () => (await confirm({ title: `Удалить «${q.title}»?`, text: 'Если по квесту есть записи, он будет скрыт с сайта, а история сохранится.', danger: true, confirmText: 'Удалить' })) && remove.mutate(q.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit === 'new' ? 'Новый квест' : 'Редактирование квеста'} wide>
        {edit && <QuestForm key={edit === 'new' ? 'new' : edit.id} quest={edit} onClose={() => setEdit(null)} />}
      </Modal>
    </div>
  )
}
