import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, EmptyState, ErrorBox, Field, Modal, Skeleton, Switch, useUi } from '../../components/ui'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { fmtDate, rub } from '../../lib/format'
import type { Content as ContentT, Tier } from '../../lib/types'
import { PageHeader } from './shared'

/* ---------------- Промокоды и сертификаты ---------------- */

type Promo = { id: string; code: string; isCertificate: boolean; discountPercent: number | null; discountAmount: number | null; validTo: string | null; usesLeft: number | null; isActive: boolean; createdAt: string }

export function PromoCodes() {
  const { toast, confirm } = useUi()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin', 'promo'], queryFn: () => api<Promo[]>('/admin/promocodes') })
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ code: '', isCertificate: false, kind: 'percent' as 'percent' | 'amount', value: '10', validTo: '', usesLeft: '' })

  const create = useMutation({
    mutationFn: () =>
      api<Promo>('/admin/promocodes', {
        method: 'POST',
        body: {
          code: form.code || undefined,
          isCertificate: form.isCertificate,
          discountPercent: form.kind === 'percent' && !form.isCertificate ? Number(form.value) : null,
          discountAmount: form.kind === 'amount' || form.isCertificate ? Number(form.value) : null,
          validTo: form.validTo || null,
          usesLeft: form.usesLeft ? Number(form.usesLeft) : null,
        },
      }),
    onSuccess: (p) => {
      toast(`Создан код ${p.code}`)
      qc.invalidateQueries({ queryKey: ['admin', 'promo'] })
      setOpen(false)
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const toggle = useMutation({
    mutationFn: (p: Promo) => api(`/admin/promocodes/${p.id}`, { method: 'PATCH', body: { isActive: !p.isActive } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'promo'] }),
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  return (
    <div>
      <PageHeader title="Промокоды и сертификаты" text="Сертификат — фиксированная сумма на одно использование; промокод — процент или сумма.">
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" /> Создать</Button>
      </PageHeader>
      {q.error && <ErrorBox error={q.error} />}
      {!q.data ? (
        <Skeleton className="h-64" />
      ) : q.data.length === 0 ? (
        <EmptyState title="Кодов пока нет" />
      ) : (
        <div className="card divide-y divide-line">
          {q.data.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-4 p-4 text-sm">
              <button className="flex items-center gap-2 font-mono text-base font-semibold hover:text-accent" onClick={() => { navigator.clipboard?.writeText(p.code); toast('Код скопирован', 'info') }}>
                {p.code} <Copy className="size-3.5 text-muted" />
              </button>
              <Badge className={p.isCertificate ? 'bg-violet-500/15 text-violet-400 ring-violet-500/30' : 'bg-sky-500/15 text-sky-500 ring-sky-500/30'}>{p.isCertificate ? 'Сертификат' : 'Промокод'}</Badge>
              <span>{p.discountPercent ? `−${p.discountPercent}%` : `−${rub(p.discountAmount ?? 0)}`}</span>
              <span className="text-muted">
                {p.validTo ? `до ${fmtDate(p.validTo, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'бессрочно'}
                {p.usesLeft !== null && ` · осталось ${p.usesLeft}`}
              </span>
              <div className="ml-auto">
                <Switch checked={p.isActive} onChange={async () => (await confirm({ title: p.isActive ? 'Отключить код?' : 'Включить код?' })) && toggle.mutate(p)} label={p.isActive ? 'Активен' : 'Выключен'} />
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Новый код">
        <div className="space-y-4">
          <Switch checked={form.isCertificate} onChange={(v) => setForm({ ...form, isCertificate: v, kind: v ? 'amount' : form.kind, value: v ? '3000' : '10' })} label="Подарочный сертификат" />
          <Field label="Код" hint="Пусто — сгенерировать автоматически">{(id) => <input id={id} className="input uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />}</Field>
          {!form.isCertificate && (
            <div className="flex gap-2">
              {(['percent', 'amount'] as const).map((k) => (
                <button key={k} type="button" onClick={() => setForm({ ...form, kind: k })} className={`flex-1 rounded-xl border px-3 py-2 text-sm ${form.kind === k ? 'border-accent text-accent' : 'border-line text-muted'}`}>
                  {k === 'percent' ? 'Процент' : 'Сумма'}
                </button>
              ))}
            </div>
          )}
          <Field label={form.kind === 'percent' && !form.isCertificate ? 'Скидка, %' : 'Номинал, ₽'}>{(id) => <input id={id} type="number" min={1} className="input" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Действует до">{(id) => <input id={id} type="date" className="input" value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} />}</Field>
            {!form.isCertificate && <Field label="Лимит использований">{(id) => <input id={id} type="number" min={1} className="input" value={form.usesLeft} onChange={(e) => setForm({ ...form, usesLeft: e.target.value })} placeholder="без лимита" />}</Field>}
          </div>
          <Button className="w-full" loading={create.isPending} disabled={!Number(form.value)} onClick={() => create.mutate()}>Создать</Button>
        </div>
      </Modal>
    </div>
  )
}

/* ---------------- Настройки и тексты ---------------- */

type Settings = Omit<ContentT, 'booking' | 'recordings'> & {
  booking: ContentT['booking'] & { horizonDays: number }
  recordings: { price: number; linkDays: number; retentionDays: number }
}

function Section({ title, children, onSave, saving, disabled }: { title: string; children: React.ReactNode; onSave: () => void; saving: boolean; disabled?: boolean }) {
  return (
    <section className="card space-y-4 p-6">
      <h2 className="font-display text-lg uppercase">{title}</h2>
      <fieldset disabled={disabled} className="space-y-4">{children}</fieldset>
      {!disabled && (
        <div className="flex justify-end">
          <Button loading={saving} onClick={onSave}>Сохранить</Button>
        </div>
      )}
    </section>
  )
}

export function SettingsPage() {
  const { can } = useAuth()
  const { toast, confirm } = useUi()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api<Settings>('/admin/settings') })
  const [s, setS] = useState<Settings | null>(null)
  useEffect(() => {
    if (q.data) setS(q.data)
  }, [q.data])

  const save = useMutation({
    mutationFn: ({ key, value }: { key: keyof Settings; value: unknown }) => api(`/admin/settings/${key}`, { method: 'PUT', body: value }),
    onSuccess: () => {
      toast('Настройки сохранены')
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] })
      qc.invalidateQueries({ queryKey: ['content'] })
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const submit = async (key: keyof Settings) => {
    if (await confirm({ title: 'Сохранить изменения?', text: 'Изменения сразу появятся на сайте и попадут в журнал действий.' })) save.mutate({ key, value: s![key] })
  }

  if (q.error) return <ErrorBox error={q.error} />
  if (!s) return <Skeleton className="h-[40rem]" />
  const content = !can('content.edit')
  const settings = !can('settings.edit')
  const up = <K extends keyof Settings>(key: K, patch: Partial<Settings[K]>) => setS({ ...s, [key]: { ...s[key], ...patch } })
  const pending = (k: keyof Settings) => save.isPending && save.variables?.key === k

  return (
    <div className="space-y-6">
      <PageHeader title="Настройки и тексты" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Главная страница" onSave={() => submit('site')} saving={pending('site')} disabled={content}>
          <Field label="Название сети">{(id) => <input id={id} className="input" value={s.site.name} onChange={(e) => up('site', { name: e.target.value })} />}</Field>
          <Field label="Слоган">{(id) => <input id={id} className="input" value={s.site.tagline} onChange={(e) => up('site', { tagline: e.target.value })} />}</Field>
          <Field label="Заголовок (перенос строки — Enter)">{(id) => <textarea id={id} rows={2} className="input" value={s.site.heroTitle} onChange={(e) => up('site', { heroTitle: e.target.value })} />}</Field>
          <Field label="Текст под заголовком">{(id) => <textarea id={id} rows={3} className="input" value={s.site.heroText} onChange={(e) => up('site', { heroText: e.target.value })} />}</Field>
          <Field label="О нас">{(id) => <textarea id={id} rows={4} className="input" value={s.site.aboutText} onChange={(e) => up('site', { aboutText: e.target.value })} />}</Field>
        </Section>

        <Section title="Адрес и контакты" onSave={() => submit('contacts')} saving={pending('contacts')} disabled={content}>
          <Field label="Адрес">{(id) => <input id={id} className="input" value={s.contacts.address} onChange={(e) => up('contacts', { address: e.target.value })} />}</Field>
          <Field label="Как найти вход">{(id) => <input id={id} className="input" value={s.contacts.addressNote} onChange={(e) => up('contacts', { addressNote: e.target.value })} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Широта">{(id) => <input id={id} type="number" step="0.0001" className="input" value={s.contacts.lat} onChange={(e) => up('contacts', { lat: Number(e.target.value) })} />}</Field>
            <Field label="Долгота">{(id) => <input id={id} type="number" step="0.0001" className="input" value={s.contacts.lon} onChange={(e) => up('contacts', { lon: Number(e.target.value) })} />}</Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Телефон">{(id) => <input id={id} className="input" value={s.contacts.phone} onChange={(e) => up('contacts', { phone: e.target.value })} />}</Field>
            <Field label="E-mail">{(id) => <input id={id} className="input" value={s.contacts.email} onChange={(e) => up('contacts', { email: e.target.value })} />}</Field>
          </div>
          <Field label="Часы работы">{(id) => <input id={id} className="input" value={s.contacts.hours} onChange={(e) => up('contacts', { hours: e.target.value })} />}</Field>
          <div className="grid items-end gap-3 sm:grid-cols-3">
            <Field label="Telegram">{(id) => <input id={id} className="input" value={s.contacts.telegram} onChange={(e) => up('contacts', { telegram: e.target.value })} />}</Field>
            <Field label="ВКонтакте">{(id) => <input id={id} className="input" value={s.contacts.vk} onChange={(e) => up('contacts', { vk: e.target.value })} />}</Field>
            <Field label="MAX">{(id) => <input id={id} className="input" value={s.contacts.max} onChange={(e) => up('contacts', { max: e.target.value })} />}</Field>
          </div>
        </Section>

        <Section title="Запись и оплата" onSave={() => submit('booking')} saving={pending('booking')} disabled={settings}>
          <Field label="Режим оплаты">
            {(id) => (
              <select id={id} className="input" value={s.booking.prepayMode} onChange={(e) => up('booking', { prepayMode: e.target.value as 'none' | 'prepay' })}>
                <option value="none">Бронирование без оплаты</option>
                <option value="prepay">Онлайн-предоплата</option>
              </select>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Предоплата, %">{(id) => <input id={id} type="number" min={0} max={100} className="input" value={s.booking.prepayPercent} onChange={(e) => up('booking', { prepayPercent: Number(e.target.value) })} />}</Field>
            <Field label="Блокировка слота, мин">{(id) => <input id={id} type="number" min={1} className="input" value={s.booking.holdMinutes} onChange={(e) => up('booking', { holdMinutes: Number(e.target.value) })} />}</Field>
            <Field label="Отмена не позднее, ч">{(id) => <input id={id} type="number" min={0} className="input" value={s.booking.cancelHours} onChange={(e) => up('booking', { cancelHours: Number(e.target.value) })} />}</Field>
            <Field label="Запись вперёд, дней">{(id) => <input id={id} type="number" min={1} className="input" value={s.booking.horizonDays} onChange={(e) => up('booking', { horizonDays: Number(e.target.value) })} />}</Field>
          </div>
        </Section>

        <Section title="Видеозаписи" onSave={() => submit('recordings')} saving={pending('recordings')} disabled={settings}>
          <div className="grid items-end gap-3 sm:grid-cols-3">
            <Field label="Цена, ₽">{(id) => <input id={id} type="number" min={0} className="input" value={s.recordings.price} onChange={(e) => up('recordings', { price: Number(e.target.value) })} />}</Field>
            <Field label="Ссылка действует, дн.">{(id) => <input id={id} type="number" min={1} className="input" value={s.recordings.linkDays} onChange={(e) => up('recordings', { linkDays: Number(e.target.value) })} />}</Field>
            <Field label="Хранение, дн." hint="Затем автоудаление">{(id) => <input id={id} type="number" min={1} className="input" value={s.recordings.retentionDays} onChange={(e) => up('recordings', { retentionDays: Number(e.target.value) })} />}</Field>
          </div>
        </Section>

        <Section title="Программа лояльности" onSave={() => submit('loyalty')} saving={pending('loyalty')} disabled={settings}>
          <div className="grid items-end gap-3 sm:grid-cols-3">
            <Field label="Баллов за посещение">{(id) => <input id={id} type="number" min={0} className="input" value={s.loyalty.pointsPerVisit} onChange={(e) => up('loyalty', { pointsPerVisit: Number(e.target.value) })} />}</Field>
            <Field label="Сгорание после, мес.">{(id) => <input id={id} type="number" min={1} className="input" value={s.loyalty.burnAfterMonths} onChange={(e) => up('loyalty', { burnAfterMonths: Number(e.target.value) })} />}</Field>
            <Field label="Сгорает в месяц, %">{(id) => <input id={id} type="number" min={1} max={100} className="input" value={s.loyalty.burnPercentPerMonth} onChange={(e) => up('loyalty', { burnPercentPerMonth: Number(e.target.value) })} />}</Field>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Уровни скидки</p>
            <div className="space-y-2">
              {s.loyalty.tiers.map((t: Tier, i: number) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-muted">от</span>
                  <input type="number" min={0} className="input h-9 w-28 py-1" value={t.from} onChange={(e) => up('loyalty', { tiers: s.loyalty.tiers.map((x, j) => (j === i ? { ...x, from: Number(e.target.value) } : x)) })} aria-label="Порог баллов" />
                  <span className="text-muted">баллов —</span>
                  <input type="number" min={0} max={50} className="input h-9 w-20 py-1" value={t.percent} onChange={(e) => up('loyalty', { tiers: s.loyalty.tiers.map((x, j) => (j === i ? { ...x, percent: Number(e.target.value) } : x)) })} aria-label="Скидка" />
                  <span className="text-muted">%</span>
                  {s.loyalty.tiers.length > 1 && (
                    <button type="button" className="ml-auto text-muted hover:text-rose-500" onClick={() => up('loyalty', { tiers: s.loyalty.tiers.filter((_, j) => j !== i) })} aria-label="Удалить уровень">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="text-sm text-accent" onClick={() => up('loyalty', { tiers: [...s.loyalty.tiers, { from: (s.loyalty.tiers.at(-1)?.from ?? 0) + 500, percent: (s.loyalty.tiers.at(-1)?.percent ?? 0) + 5 }] })}>
                + добавить уровень
              </button>
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}
