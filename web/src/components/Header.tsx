import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { CalendarDays, ChevronDown, LayoutDashboard, LogOut, Menu, Moon, Sun, User as UserIcon, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { formatPhone } from '../lib/format'
import { useContent } from '../lib/hooks'
import { useTheme } from '../lib/theme'
import { Logo } from './Logo'
import { buttonClass } from './ui'

export const NAV = [
  { href: '/#quests', label: 'Квесты' },
  { href: '/#about', label: 'О нас' },
  { href: '/#address', label: 'Адрес' },
  { href: '/#contacts', label: 'Контакты' },
]

function ThemeToggle({ className, light }: { className?: string; light?: boolean }) {
  const { theme, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      className={clsx(
        'size-10 place-items-center rounded-xl transition-colors',
        light ? 'text-white/80 hover:bg-white/10 hover:text-white' : 'text-muted hover:bg-surface-2 hover:text-fg',
        className ?? 'grid',
      )}
      aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
    >
      {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  )
}

function ProfileMenu({ light }: { light?: boolean }) {
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const fn = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  if (!user) {
    return (
      <Link to="/auth" className={buttonClass('primary', 'sm')}>
        <UserIcon className="size-4" />
        <span className="hidden sm:inline">Зарегистрироваться</span>
        <span className="sm:hidden">Войти</span>
      </Link>
    )
  }
  const initial = (user.name ?? '?').trim()[0]?.toUpperCase()
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={clsx('flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 transition-colors', light ? 'text-white hover:bg-white/10' : 'hover:bg-surface-2')}
      >
        <span className="grid size-8 place-items-center rounded-lg bg-accent font-display text-sm font-semibold text-accent-fg">{initial}</span>
        <span className="hidden max-w-[9rem] truncate text-sm font-medium md:block">{user.name ?? 'Профиль'}</span>
        <ChevronDown className={clsx('size-4 transition-transform', light ? 'text-white/70' : 'text-muted', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="card absolute right-0 top-full mt-2 w-56 overflow-hidden p-1.5 shadow-2xl"
          >
            <div className="px-3 py-2 text-xs text-muted">{formatPhone(user.phone)}</div>
            {[
              { to: '/profile', icon: UserIcon, label: 'Профиль' },
              { to: '/profile/bookings', icon: CalendarDays, label: 'Мои записи' },
              ...(user.isStaff ? [{ to: '/admin', icon: LayoutDashboard, label: 'Админ-панель' }] : []),
            ].map((i) => (
              <Link key={i.to} role="menuitem" to={i.to} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-surface-2">
                <i.icon className="size-4 text-muted" /> {i.label}
              </Link>
            ))}
            <button
              role="menuitem"
              onClick={async () => {
                setOpen(false)
                await signOut()
                navigate('/')
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-rose-500 hover:bg-rose-500/10"
            >
              <LogOut className="size-4" /> Выход
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [mobile, setMobile] = useState(false)
  const { data: content } = useContent()
  const location = useLocation()

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24)
    fn()
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])
  useEffect(() => setMobile(false), [location.pathname, location.hash])

  const transparent = location.pathname === '/' && !scrolled && !mobile

  return (
    <header
      className={clsx(
        'sticky top-0 z-50 transition-all duration-300',
        transparent ? 'bg-transparent' : 'border-b border-line/70 bg-bg/80 backdrop-blur-xl',
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 md:h-20">
        {/* слева — логотип */}
        <Logo name={content?.site.name} light={transparent} />

        {/* по центру со смещением вправо — навигация */}
        <nav className="ml-auto hidden items-center gap-1 md:flex lg:mr-10" aria-label="Основная навигация">
          {NAV.map((n) => (
            <NavLink
              key={n.href}
              to={n.href}
              className={clsx(
                'rounded-lg px-3.5 py-2 text-sm font-medium uppercase tracking-wider transition-colors',
                transparent ? 'text-white/85 hover:text-white' : 'text-fg/80 hover:text-accent',
              )}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>

        {/* справа — профиль */}
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <ThemeToggle className="hidden sm:grid" light={transparent} />
          <ProfileMenu light={transparent} />
          <button
            className={clsx('grid size-10 place-items-center rounded-xl md:hidden', transparent ? 'text-white hover:bg-white/10' : 'hover:bg-surface-2')}
            onClick={() => setMobile((m) => !m)}
            aria-label={mobile ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={mobile}
          >
            {mobile ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobile && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-line md:hidden"
            aria-label="Мобильная навигация"
          >
            <div className="flex flex-col px-4 py-3">
              {NAV.map((n, i) => (
                <motion.div key={n.href} initial={{ x: -12, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.04 }}>
                  <Link to={n.href} className="block border-b border-line/60 py-4 font-display text-2xl uppercase tracking-wide">
                    {n.label}
                  </Link>
                </motion.div>
              ))}
              <div className="flex items-center justify-between pt-3 text-sm text-muted">
                Тема оформления <ThemeToggle />
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}
