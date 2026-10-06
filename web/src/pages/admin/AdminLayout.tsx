import { NavLink, Navigate, Outlet } from 'react-router-dom'
import clsx from 'clsx'
import {
  BadgePercent,
  CalendarDays,
  CreditCard,
  FileSpreadsheet,
  Film,
  Ghost,
  KeyRound,
  LayoutDashboard,
  ScrollText,
  Settings,
  Users,
} from 'lucide-react'
import { Spinner } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { useSeo } from '../../lib/hooks'

export const ADMIN_NAV = [
  { to: '/admin', label: 'Дашборд', icon: LayoutDashboard, perm: 'dashboard.view', end: true },
  { to: '/admin/bookings', label: 'Заявки', icon: CalendarDays, perm: 'bookings.view' },
  { to: '/admin/users', label: 'Пользователи', icon: Users, perm: 'users.view' },
  { to: '/admin/quests', label: 'Квесты', icon: Ghost, perm: 'quests.edit' },
  { to: '/admin/recordings', label: 'Видеозаписи', icon: Film, perm: 'recordings.manage' },
  { to: '/admin/reports', label: 'Отчёты', icon: FileSpreadsheet, perm: 'reports.view' },
  { to: '/admin/payments', label: 'Платежи', icon: CreditCard, perm: 'payments.view' },
  { to: '/admin/promo', label: 'Промокоды', icon: BadgePercent, perm: 'promo.edit' },
  { to: '/admin/settings', label: 'Настройки', icon: Settings, perm: ['content.edit', 'settings.edit'] },
  { to: '/admin/roles', label: 'Роли', icon: KeyRound, perm: 'roles.manage' },
  { to: '/admin/logs', label: 'Журнал', icon: ScrollText, perm: 'logs.view' },
] as const

export default function AdminLayout() {
  useSeo('Админ-панель — Neru-Квест')
  const { user, ready, can } = useAuth()
  if (!ready) return <div className="grid min-h-[60vh] place-items-center"><Spinner /></div>
  if (!user) return <Navigate to="/auth?next=/admin" replace />
  // раздел скрыт от обычных пользователей; реальная проверка прав — на сервере
  if (!user.isStaff) return <Navigate to="/" replace />

  const items = ADMIN_NAV.filter((i) => (Array.isArray(i.perm) ? i.perm.some(can) : can(i.perm as string)))

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:py-10">
      <aside className="lg:sticky lg:top-24 lg:h-fit lg:w-56 lg:shrink-0">
        <div className="mb-3 hidden px-3 lg:block">
          <p className="text-xs uppercase tracking-[0.25em] text-muted">Админ-панель</p>
          <p className="mt-1 truncate text-sm font-medium">{user.name}</p>
          {user.roleName && <p className="text-xs text-accent">{user.roleName}</p>}
        </div>
        <nav className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0" aria-label="Разделы админ-панели">
          {items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={'end' in i}
              className={({ isActive }) =>
                clsx(
                  'flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                  isActive ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
                )
              }
            >
              <i.icon className="size-4" /> {i.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  )
}
