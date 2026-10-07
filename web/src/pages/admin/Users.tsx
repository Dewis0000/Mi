import { useEffect, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Ban, BadgeCheck, Coins, Search, UserPlus } from 'lucide-react'
import { PhoneInput } from '../../components/PhoneInput'
import { Badge, Button, EmptyState, ErrorBox, Field, Modal, Skeleton, useUi } from '../../components/ui'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { fmtDate, fmtDateTime, formatPhone, isPhoneComplete } from '../../lib/format'
import type { Paged } from '../../lib/types'
import { PageHeader, Pagination, StatusPill } from './shared'

type AdminUser = {
  id: string
  name: string | null
  phone: string
  phoneVerified: boolean
  email: string | null
  points: number
  blocked: boolean
  createdAt: string
  lastVisitAt: string | null
  bookingsCount: number
  noShows: number
  role?: { key: string; name: string }
}

type UserDetail = AdminUser & {
  birthDate: string | null
  bookings: { id: string; startAt: string; status: string; finalPrice: number; quest: { title: string } }[]
  pointsLog: { id: string; delta: number; reason: string; comment: string | null; createdAt: string }[]
}

type RolesResp = {
  roles: { id: string; key: string; name: string; permissions: string[]; users: { id: string; name: string | null; phone: string }[] }[]
  permissions: Record<string, string>
}

function UserModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { can, user: me } = useAuth()
  const { confirm, toast } = useUi()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin', 'user', id], queryFn: () => api<UserDetail>(`/admin/users/${id}`), enabled: !!id })
  const roles = useQuery({ queryKey: ['admin', 'roles'], queryFn: () => api<RolesResp>('/admin/roles'), enabled: !!id && can('roles.manage') })
  const [delta, setDelta] = useState('')
  const [comment, setComment] = useState('')
  const u = q.data

  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown; ok: string }) => api(`/admin/users/${id}/${path}`, { method: path === 'role' ? 'PUT' : 'POST', body }),
    onSuccess: (_d, v) => {
      toast(v.ok)
      qc.invalidateQueries({ queryKey: ['admin'] })
      setDelta('')
      setComment('')
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  return (
    <Modal open={!!id} onClose={onClose} title="Пользователь" wide>
      {q.isLoading && <Skeleton className="h-80" />}
      {q.error && <ErrorBox error={q.error} />}
      {u && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold">{u.name ?? 'Без имени'}</h3>
              <p className="text-sm text-muted">
                {formatPhone(u.phone)} {u.phoneVerified ? <Badge className="ml-1 bg-emerald-500/15 text-emerald-500 ring-emerald-500/30">подтверждён</Badge> : <Badge className="ml-1 bg-amber-500/15 text-amber-500 ring-amber-500/30">не подтверждён</Badge>}
              </p>
              <p className="text-sm text-muted">
                {u.email ?? 'e-mail не указан'} · с {fmtDate(u.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}
                {u.birthDate && ` · ДР ${fmtDate(u.birthDate)}`}
              </p>
              {u.role && <p className="mt-1 text-sm text-accent">{u.role.name}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {can('users.edit') && !u.phoneVerified && (
                <Button size="sm" variant="secondary" onClick={async () => (await confirm({ title: 'Подтвердить номер вручную?', text: `Номер ${u.phone} будет отмечен как подтверждённый.` })) && act.mutate({ path: 'verify-phone', ok: 'Номер подтверждён' })}>
                  <BadgeCheck className="size-4" /> Подтвердить номер
                </Button>
              )}
              {can('users.edit') && u.id !== me?.id && (
                <Button
                  size="sm"
                  variant={u.blocked ? 'secondary' : 'danger'}
                  onClick={async () =>
                    (await confirm({ title: u.blocked ? 'Разблокировать?' : 'Заблокировать пользователя?', text: u.blocked ? 'Пользователь снова сможет записываться.' : `Неявок: ${u.noShows}. Пользователь не сможет войти и записаться.`, danger: !u.blocked })) &&
                    act.mutate({ path: 'block', body: { blocked: !u.blocked }, ok: u.blocked ? 'Разблокирован' : 'Заблокирован' })
                  }
                >
                  <Ban className="size-4" /> {u.blocked ? 'Разблокировать' : 'Заблокировать'}
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-surface-2 p-3"><div className="text-xs text-muted">Баллы</div><div className="text-2xl font-semibold">{u.points}</div></div>
            <div className="rounded-xl bg-surface-2 p-3"><div className="text-xs text-muted">Записей</div><div className="text-2xl font-semibold">{u.bookings.length}</div></div>
            <div className="rounded-xl bg-surface-2 p-3"><div className="text-xs text-muted">Последний визит</div><div className="text-lg font-semibold">{u.lastVisitAt ? fmtDate(u.lastVisitAt, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</div></div>
          </div>

          {can('points.edit') && (
            <div className="rounded-xl border border-line p-4">
              <h4 className="mb-3 flex items-center gap-2 font-medium"><Coins className="size-4 text-accent" />Корректировка баллов</h4>
              <div className="flex flex-wrap gap-2">
                <input type="number" className="input w-32" placeholder="+100 / −50" value={delta} onChange={(e) => setDelta(e.target.value)} aria-label="Изменение баллов" />
                <input className="input min-w-[12rem] flex-1" placeholder="Причина (обязательно)" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Причина" />
                <Button
                  variant="secondary"
                  disabled={!Number(delta) || comment.trim().length < 2}
                  onClick={async () => (await confirm({ title: 'Изменить баланс?', text: `${Number(delta) > 0 ? '+' : ''}${delta} баллов. Причина: ${comment}` })) && act.mutate({ path: 'points', body: { delta: Number(delta), comment }, ok: 'Баланс изменён' })}
                >
                  Применить
                </Button>
              </div>
            </div>
          )}

          {can('roles.manage') && roles.data && (
            <div className="rounded-xl border border-accent/30 p-4">
              <h4 className="mb-1 font-medium">Роль сотрудника</h4>
              <p className="mb-3 text-xs text-muted">Роли видит только главный администратор.</p>
              <select
                className="input"
                value={u.role?.key ?? ''}
                onChange={async (e) => {
                  const key = e.target.value || null
                  const name = roles.data.roles.find((r) => r.key === key)?.name ?? 'без роли'
                  if (await confirm({ title: 'Изменить роль?', text: `${u.name ?? u.phone} → ${name}` })) act.mutate({ path: 'role', body: { roleKey: key }, ok: 'Роль изменена' })
                }}
              >
                <option value="">Без роли (клиент)</option>
                {roles.data.roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <h4 className="mb-2 font-medium">Записи</h4>
            {u.bookings.length === 0 ? (
              <p className="text-sm text-muted">Записей нет</p>
            ) : (
              <ul className="max-h-60 divide-y divide-line overflow-y-auto rounded-xl border border-line text-sm">
                {u.bookings.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 p-3">
                    <span>{fmtDateTime(b.startAt)} · {b.quest.title}</span>
                    <StatusPill status={b.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          {u.pointsLog.length > 0 && (
            <div>
              <h4 className="mb-2 font-medium">История баллов</h4>
              <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-xl border border-line text-sm">
                {u.pointsLog.map((l) => (
                  <li key={l.id} className="flex justify-between gap-3 p-3">
                    <span>{fmtDate(l.createdAt)} · {l.comment ?? l.reason}</span>
                    <span className={l.delta > 0 ? 'text-emerald-500' : 'text-rose-500'}>{l.delta > 0 ? '+' : ''}{l.delta}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const { toast } = useUi()
  const qc = useQueryClient()
  const create = useMutation({
    mutationFn: () => api('/admin/users', { method: 'POST', body: { phone, name, email } }),
    onSuccess: () => {
      toast('Пользователь зарегистрирован')
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      onClose()
      setPhone('')
      setName('')
      setEmail('')
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  return (
    <Modal open={open} onClose={onClose} title="Регистрация вручную">
      <div className="space-y-4">
        <p className="text-sm text-muted">Для клиентов, записавшихся по телефону или пришедших без записи. Номер будет отмечен как подтверждённый.</p>
        <Field label="Телефон">{(id) => <PhoneInput id={id} value={phone} onChange={setPhone} />}</Field>
        <Field label="Имя">{(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="E-mail">{(id) => <input id={id} type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Button className="w-full" disabled={!isPhoneComplete(phone) || !name.trim()} loading={create.isPending} onClick={() => create.mutate()}>Зарегистрировать</Button>
      </div>
    </Modal>
  )
}

export default function Users() {
  const { can } = useAuth()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [blocked, setBlocked] = useState<'' | 'true'>('')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const q = useQuery({
    queryKey: ['admin', 'users', debounced, blocked, page],
    queryFn: () => api<Paged<AdminUser>>('/admin/users', { query: { q: debounced, blocked, page } }),
    placeholderData: keepPreviousData,
  })
  const showRoles = can('roles.manage')

  return (
    <div>
      <PageHeader title="Пользователи">
        {can('users.edit') && <Button size="sm" onClick={() => setCreating(true)}><UserPlus className="size-4" /> Зарегистрировать</Button>}
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input className="input h-9 py-1 pl-9" placeholder="Имя, телефон или e-mail" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Поиск" />
        </div>
        <select className="input h-9 w-auto py-1" value={blocked} onChange={(e) => { setBlocked(e.target.value as '' | 'true'); setPage(1) }} aria-label="Фильтр">
          <option value="">Все</option>
          <option value="true">Заблокированные</option>
        </select>
      </div>
      {q.error ? (
        <ErrorBox error={q.error} onRetry={q.refetch} />
      ) : !q.data ? (
        <Skeleton className="h-96" />
      ) : q.data.items.length === 0 ? (
        <EmptyState icon={<Search className="size-7" />} title="Никого не нашли" />
      ) : (
        <div className={clsx('card overflow-hidden', q.isFetching && 'opacity-70')}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="p-3 font-medium">Имя</th>
                  <th className="p-3 font-medium">Телефон</th>
                  <th className="p-3 text-right font-medium">Баллы</th>
                  <th className="p-3 text-right font-medium">Записей</th>
                  <th className="p-3 text-right font-medium">Неявок</th>
                  <th className="p-3 font-medium">Регистрация</th>
                  {showRoles && <th className="p-3 font-medium">Роль</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {q.data.items.map((u) => (
                  <tr key={u.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setOpen(u.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(u.id)}>
                    <td className="p-3">
                      {u.name ?? '—'} {u.blocked && <Badge className="ml-1 bg-rose-500/15 text-rose-500 ring-rose-500/30">блок</Badge>}
                    </td>
                    <td className="p-3 tabular-nums">
                      {formatPhone(u.phone)} {!u.phoneVerified && <span className="text-amber-500" title="Номер не подтверждён">•</span>}
                    </td>
                    <td className="p-3 text-right tabular-nums">{u.points}</td>
                    <td className="p-3 text-right tabular-nums">{u.bookingsCount}</td>
                    <td className={clsx('p-3 text-right tabular-nums', u.noShows >= 2 && 'font-semibold text-rose-500')}>{u.noShows}</td>
                    <td className="p-3 text-muted">{fmtDate(u.createdAt, { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                    {showRoles && <td className="p-3 text-accent">{u.role?.name ?? ''}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
        </div>
      )}
      <UserModal id={open} onClose={() => setOpen(null)} />
      <CreateUserModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

/** Управление ролями — только главный администратор */
export function Roles() {
  const { confirm, toast } = useUi()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin', 'roles'], queryFn: () => api<RolesResp>('/admin/roles') })
  const [edits, setEdits] = useState<Record<string, string[]>>({})
  const save = useMutation({
    mutationFn: ({ key, permissions }: { key: string; permissions: string[] }) => api(`/admin/roles/${key}`, { method: 'PUT', body: { permissions } }),
    onSuccess: () => {
      toast('Права роли обновлены')
      qc.invalidateQueries({ queryKey: ['admin', 'roles'] })
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  if (q.error) return <ErrorBox error={q.error} />
  if (!q.data) return <Skeleton className="h-96" />
  const perms = Object.entries(q.data.permissions ?? {})
  return (
    <div className="space-y-6">
      <PageHeader title="Роли" text="Роли и пометки о них видит только главный администратор. Назначить роль — в карточке пользователя." />
      <div className="grid gap-4 xl:grid-cols-2">
        {(q.data.roles ?? []).map((r) => {
          const current = edits[r.key] ?? r.permissions
          const locked = r.key === 'owner'
          return (
            <div key={r.key} className="card p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{r.name}</h3>
                  <p className="text-xs text-muted">{(r.users ?? []).length ? (r.users ?? []).map((u) => u.name ?? u.phone).join(', ') : 'Нет сотрудников'}</p>
                </div>
                {!locked && edits[r.key] && (
                  <Button size="sm" loading={save.isPending} onClick={async () => (await confirm({ title: `Изменить права роли «${r.name}»?` })) && save.mutate({ key: r.key, permissions: current })}>
                    Сохранить
                  </Button>
                )}
              </div>
              <div className="grid gap-1 sm:grid-cols-2">
                {perms.map(([p, label]) => (
                  <label key={p} className={clsx('flex items-center gap-2 rounded-lg px-2 py-1 text-sm', locked || p === 'roles.manage' ? 'opacity-60' : 'cursor-pointer hover:bg-surface-2')}>
                    <input
                      type="checkbox"
                      className="accent-[var(--accent)]"
                      checked={current.includes(p)}
                      disabled={locked || p === 'roles.manage'}
                      onChange={(e) => setEdits({ ...edits, [r.key]: e.target.checked ? [...current, p] : current.filter((x) => x !== p) })}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

type Log = { id: string; action: string; entity: string; entityId: string | null; details: unknown; createdAt: string; admin: { name: string | null; phone: string } }

const ACTION_LABEL: Record<string, string> = {
  'booking.create': 'Создал запись',
  'booking.update': 'Изменил запись',
  'booking.status': 'Сменил статус записи',
  'user.create': 'Зарегистрировал пользователя',
  'user.update': 'Изменил пользователя',
  'user.verifyPhone': 'Подтвердил номер',
  'user.block': 'Заблокировал',
  'user.unblock': 'Разблокировал',
  'user.points': 'Изменил баллы',
  'user.role': 'Сменил роль',
  'role.update': 'Изменил права роли',
  'quest.create': 'Создал квест',
  'quest.update': 'Изменил квест',
  'quest.hide': 'Скрыл квест',
  'quest.delete': 'Удалил квест',
  'settings.update': 'Изменил настройки',
  'promo.create': 'Создал промокод',
  'promo.update': 'Изменил промокод',
  'recording.upload': 'Загрузил видео',
  'recording.update': 'Изменил видео',
  'recording.delete': 'Удалил видео',
  'recording.download': 'Скачал видео',
  'report.export': 'Выгрузил отчёт',
  upload: 'Загрузил файл',
}

export function Logs() {
  const [page, setPage] = useState(1)
  const q = useQuery({ queryKey: ['admin', 'logs', page], queryFn: () => api<Paged<Log>>('/admin/logs', { query: { page } }), placeholderData: keepPreviousData })
  const [open, setOpen] = useState<Log | null>(null)
  if (q.error) return <ErrorBox error={q.error} />
  return (
    <div>
      <PageHeader title="Журнал действий" text="Кто, что и когда изменил" />
      {!q.data ? (
        <Skeleton className="h-96" />
      ) : q.data.items.length === 0 ? (
        <EmptyState title="Журнал пуст" text="Здесь появятся изменения записей, пользователей, квестов и настроек." />
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-line text-sm">
            {q.data.items.map((l) => (
              <li key={l.id}>
                <button className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 p-3 text-left hover:bg-surface-2" onClick={() => setOpen(l)}>
                  <span className="w-36 shrink-0 tabular-nums text-muted">{fmtDateTime(l.createdAt)}</span>
                  <span className="w-40 shrink-0 font-medium">{l.admin?.name ?? l.admin?.phone ?? '—'}</span>
                  <span className="flex-1">{ACTION_LABEL[l.action] ?? l.action}</span>
                  <span className="text-xs text-muted">{l.entity}{l.entityId && ` · ${l.entityId.slice(-6)}`}</span>
                </button>
              </li>
            ))}
          </ul>
          <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
        </div>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title="Детали действия" wide>
        {open && <pre className="max-h-[60vh] overflow-auto rounded-xl bg-surface-2 p-4 text-xs">{JSON.stringify(open.details, null, 2) ?? '—'}</pre>}
      </Modal>
    </div>
  )
}
