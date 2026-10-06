import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Loader2, X } from 'lucide-react'

/* ---------- Кнопки ---------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const buttonClass = (variant: ButtonProps['variant'] = 'primary', size: ButtonProps['size'] = 'md') =>
  clsx(
    'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 select-none',
    'disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]',
    size === 'sm' && 'h-9 px-3.5 text-sm',
    size === 'md' && 'h-11 px-5 text-[0.95rem]',
    size === 'lg' && 'h-14 px-8 text-base tracking-wide uppercase font-display font-semibold',
    variant === 'primary' &&
      'bg-accent text-accent-fg hover:bg-accent-hover shadow-[0_8px_30px_-8px_var(--glow)] hover:shadow-[0_10px_40px_-6px_var(--glow)]',
    variant === 'secondary' && 'bg-surface-2 text-fg hover:bg-line',
    variant === 'outline' && 'border border-line text-fg hover:border-accent hover:text-accent',
    variant === 'ghost' && 'text-muted hover:text-fg hover:bg-surface-2',
    variant === 'danger' && 'bg-rose-600/15 text-rose-500 hover:bg-rose-600 hover:text-white',
  )

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button ref={ref} className={clsx(buttonClass(variant, size), className)} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
})

/* ---------- Поля ---------- */

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: ReactNode
  hint?: ReactNode
  error?: string | null
  children: (id: string) => ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <div className={clsx('space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-fg/90">
          {label}
        </label>
      )}
      {children(id)}
      {error ? (
        <p className="text-sm text-rose-500" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line')}
      >
        <span className={clsx('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all', checked ? 'left-5.5' : 'left-0.5')} />
      </button>
    </label>
  )
}

/* ---------- Мелочи ---------- */

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', className)}>{children}</span>
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-xl bg-surface-2', className)} aria-hidden />
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('size-6 animate-spin text-accent', className)} aria-label="Загрузка" />
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-surface-2 text-muted">{icon}</div>}
      <h3 className="font-display text-xl uppercase tracking-wide">{title}</h3>
      {text && <p className="mt-2 max-w-md text-sm text-muted">{text}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="card flex items-center gap-3 border-rose-500/40 p-4 text-sm" role="alert">
      <AlertTriangle className="size-5 shrink-0 text-rose-500" />
      <span className="flex-1">{error instanceof Error ? error.message : 'Не удалось загрузить данные'}</span>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  )
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: T; label: ReactNode }[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div role="tablist" className={clsx('no-scrollbar flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={clsx(
            'relative shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-colors',
            value === t.id ? 'text-accent-fg' : 'text-muted hover:text-fg',
          )}
        >
          {value === t.id && <motion.span layoutId={`tab-${tabs.map((x) => x.id).join()}`} className="absolute inset-0 rounded-xl bg-accent" transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }} />}
          <span className="relative flex items-center gap-2">{t.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Accordion({ items }: { items: { q: string; a: ReactNode }[] }) {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {items.map((it, i) => (
        <div key={i}>
          <button
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-medium hover:text-accent"
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? null : i)}
          >
            {it.q}
            <ChevronDown className={clsx('size-5 shrink-0 transition-transform', open === i && 'rotate-180 text-accent')} />
          </button>
          <AnimatePresence initial={false}>
            {open === i && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="px-5 pb-5 text-sm leading-relaxed text-muted">{it.a}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  )
}

/* ---------- Модальное окно ---------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])')?.focus(), 50)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus()
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
          <motion.div className="absolute inset-0 bg-black/70 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
            className={clsx(
              'card relative max-h-[92vh] w-full overflow-y-auto rounded-b-none p-6 shadow-2xl sm:rounded-b-[1.25rem]',
              wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
            )}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              {title && <h2 className="font-display text-xl uppercase tracking-wide">{title}</h2>}
              <button data-close onClick={onClose} className="-m-1 ml-auto rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Закрыть">
                <X className="size-5" />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/* ---------- Подтверждение действий и уведомления ---------- */

type ConfirmOpts = { title: string; text?: ReactNode; confirmText?: string; danger?: boolean }
type Toast = { id: number; text: string; kind: 'success' | 'error' | 'info' }

const UiCtx = createContext<{
  confirm: (o: ConfirmOpts) => Promise<boolean>
  toast: (text: string, kind?: Toast['kind']) => void
} | null>(null)

export function UiProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setDialog({ ...o, resolve })), [])
  const toast = useCallback((text: string, kind: Toast['kind'] = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500)
  }, [])

  const close = (v: boolean) => {
    dialog?.resolve(v)
    setDialog(null)
  }

  return (
    <UiCtx.Provider value={{ confirm, toast }}>
      {children}
      <Modal open={!!dialog} onClose={() => close(false)} title={dialog?.title}>
        {dialog?.text && <div className="text-sm text-muted">{dialog.text}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => close(false)}>
            Отмена
          </Button>
          <Button variant={dialog?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
            {dialog?.confirmText ?? 'Подтвердить'}
          </Button>
        </div>
      </Modal>
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[200] flex flex-col items-center gap-2 px-4" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="card pointer-events-auto flex max-w-md items-center gap-3 px-4 py-3 text-sm shadow-xl"
            >
              {t.kind === 'success' && <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />}
              {t.kind === 'error' && <AlertTriangle className="size-5 shrink-0 text-rose-500" />}
              {t.kind === 'info' && <Info className="size-5 shrink-0 text-sky-500" />}
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </UiCtx.Provider>
  )
}

export function useUi() {
  const ctx = useContext(UiCtx)
  if (!ctx) throw new Error('useUi outside provider')
  return ctx
}

/* ---------- Появление при скролле ---------- */

export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ y: 18 }}
      whileInView={{ y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

export function SectionTitle({ eyebrow, title, text, className }: { eyebrow?: string; title: ReactNode; text?: ReactNode; className?: string }) {
  return (
    <Reveal className={clsx('mb-10 max-w-2xl', className)}>
      {eyebrow && <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-accent">{eyebrow}</p>}
      <h2 className="font-display text-3xl font-semibold uppercase leading-tight tracking-wide sm:text-4xl md:text-5xl">{title}</h2>
      {text && <p className="mt-4 text-muted">{text}</p>}
    </Reveal>
  )
}
