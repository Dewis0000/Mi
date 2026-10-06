import { Link } from 'react-router-dom'
import clsx from 'clsx'

export function LogoMark({ className }: { className?: string }) {
  // приоткрытая дверь, из которой пробивается красный свет
  return (
    <svg viewBox="0 0 40 40" className={clsx('size-9', className)} aria-hidden>
      <rect x="7" y="4" width="26" height="33" rx="2" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M11 8 L23 10 L23 35 L11 34 Z" fill="currentColor" opacity=".9" />
      <path d="M23 10 L30 7 L30 34 L23 35 Z" fill="var(--accent)" className="flicker" />
      <circle cx="20" cy="22" r="1.4" fill="var(--bg)" />
    </svg>
  )
}

export function Logo({ name = 'Чёрный ход', compact, light }: { name?: string; compact?: boolean; light?: boolean }) {
  return (
    <Link to="/" className={clsx('group flex items-center gap-2.5', light && 'text-white')} aria-label={`${name} — на главную`}>
      <LogoMark className={clsx('transition-transform group-hover:-rotate-3', light ? 'text-white' : 'text-fg')} />
      {!compact && (
        <span className="whitespace-nowrap font-brand text-lg leading-none tracking-wide sm:text-2xl">
          {name}
        </span>
      )}
    </Link>
  )
}
