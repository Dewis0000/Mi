import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { ArrowLeft, KeyRound, Send } from 'lucide-react'
import { CodeInput } from '../components/CodeInput'
import { LogoMark } from '../components/Logo'
import { PhoneInput } from '../components/PhoneInput'
import { Button, Field } from '../components/ui'
import { ApiError, api, errorMessage, type AuthResponse } from '../lib/api'
import { useAuth } from '../lib/auth'
import { DEMO } from '../lib/env'
import { getCaptchaToken } from '../lib/captcha'
import { MESSENGERS, isPhoneComplete } from '../lib/format'
import { useSecondsLeft, useSeo } from '../lib/hooks'
import type { Messenger, User } from '../lib/types'

type Step = 'phone' | 'code' | 'profile' | 'password'

const MessengerIcon = ({ id }: { id: Messenger }) =>
  id === 'TELEGRAM' ? (
    <Send className="size-5" />
  ) : id === 'VK' ? (
    <span className="font-display text-sm font-bold">VK</span>
  ) : (
    <span className="font-display text-sm font-bold">MAX</span>
  )

/** Безопасный редирект только внутри сайта */
function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/auth') ? next : '/profile'
}

export default function Auth() {
  useSeo('Вход и регистрация — Чёрный ход')
  const { user, ready, signIn, setUser } = useAuth()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [channel, setChannel] = useState<Messenger>('TELEGRAM')
  const [consent, setConsent] = useState(false)
  const [honeypot, setHoneypot] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resendUntil, setResendUntil] = useState(0)
  const left = useSecondsLeft(resendUntil)
  const [profile, setProfile] = useState({ name: '', birthDate: '', email: '' })

  // после входа — возвращаем к выбранному квесту
  const [justSignedIn, setJustSignedIn] = useState(false)
  if (ready && user && step !== 'profile' && !justSignedIn) return <Navigate to={next} replace />

  async function requestCode(e?: FormEvent) {
    e?.preventDefault()
    setError(null)
    if (!isPhoneComplete(phone)) return setError('Введите номер полностью')
    if (!consent) return setError('Нужно согласие на обработку персональных данных')
    setLoading(true)
    try {
      const captchaToken = await getCaptchaToken()
      const res = await api<{ resendIn: number; devCode?: string }>('/auth/code', {
        method: 'POST',
        body: { phone, channel, consent, captchaToken, website: honeypot },
      })
      setDevCode(res.devCode ?? null)
      setResendUntil(Date.now() + res.resendIn * 1000)
      setCode('')
      setStep('code')
    } catch (err) {
      if (err instanceof ApiError && err.data.retryIn) {
        setResendUntil(Date.now() + Number(err.data.retryIn) * 1000)
        if (err.code === 'RESEND_WAIT') setStep('code')
      }
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function finish(res: AuthResponse) {
    setJustSignedIn(true)
    signIn(res)
    if (res.needsProfile) setStep('profile')
    else navigate(next, { replace: true })
  }

  async function verify(value = code) {
    if (value.length !== 6) return
    setError(null)
    setLoading(true)
    try {
      await finish(await api<AuthResponse>('/auth/verify', { method: 'POST', body: { phone, code: value, channel } }))
    } catch (err) {
      setError(errorMessage(err))
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  async function loginPassword(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!isPhoneComplete(phone)) return setError('Введите номер полностью')
    setLoading(true)
    try {
      await finish(await api<AuthResponse>('/auth/password', { method: 'POST', body: { phone, password } }))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (profile.name.trim().length < 2) return setError('Как к вам обращаться?')
    setLoading(true)
    try {
      const u = await api<User>('/profile', {
        method: 'PATCH',
        body: { name: profile.name, birthDate: profile.birthDate || null, email: profile.email || null },
      })
      setUser(u)
      navigate(next, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-[calc(100vh-5rem)] items-center justify-center overflow-hidden px-4 py-16">
      <div className="absolute inset-0 -z-10">
        <img src="/images/fon.webp" alt="" className="h-full w-full object-cover opacity-30 blur-md" />
        <div className="absolute inset-0 bg-gradient-to-b from-bg/70 via-bg/90 to-bg" />
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="card w-full max-w-md p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark className="size-10" />
          <div>
            <h1 className="font-display text-2xl uppercase tracking-wide">
              {step === 'profile' ? 'Почти готово' : step === 'password' ? 'Вход по паролю' : 'Вход и регистрация'}
            </h1>
            {next.startsWith('/book/') && step !== 'profile' && <p className="text-sm text-muted">Войдите, чтобы продолжить запись</p>}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === 'phone' && (
            <motion.form key="phone" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} onSubmit={requestCode} className="space-y-5">
              <Field label="Номер телефона">{(id) => <PhoneInput id={id} value={phone} onChange={setPhone} autoFocus />}</Field>

              <fieldset>
                <legend className="mb-2 text-sm font-medium">Куда отправить код</legend>
                <div className="grid grid-cols-3 gap-2">
                  {MESSENGERS.map((m) => (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => setChannel(m.id)}
                      aria-pressed={channel === m.id}
                      className={clsx(
                        'flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium transition-colors',
                        channel === m.id ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:text-fg',
                      )}
                    >
                      <MessengerIcon id={m.id} />
                      {m.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">{MESSENGERS.find((m) => m.id === channel)?.hint}</p>
              </fieldset>

              {/* honeypot для ботов: скрыто от людей и скринридеров */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                className="absolute -left-[9999px] h-0 w-0 opacity-0"
                aria-hidden
              />

              <label className="flex cursor-pointer gap-3 text-sm text-muted">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" required />
                <span>
                  Даю согласие на{' '}
                  <Link to="/personal-data" target={DEMO ? undefined : '_blank'} className="text-fg underline underline-offset-2 hover:text-accent">
                    обработку персональных данных
                  </Link>{' '}
                  в соответствии с 152-ФЗ и принимаю{' '}
                  <Link to="/privacy" target={DEMO ? undefined : '_blank'} className="text-fg underline underline-offset-2 hover:text-accent">
                    политику конфиденциальности
                  </Link>
                </span>
              </label>

              {error && <p className="text-sm text-rose-500" role="alert">{error}</p>}
              <Button type="submit" className="w-full" loading={loading}>
                Получить код
              </Button>
              <button type="button" onClick={() => { setError(null); setStep('password') }} className="flex w-full items-center justify-center gap-2 text-sm text-muted hover:text-fg">
                <KeyRound className="size-4" /> Войти по паролю
              </button>
            </motion.form>
          )}

          {step === 'code' && (
            <motion.div key="code" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
              <p className="text-sm text-muted">
                Отправили 6-значный код в {MESSENGERS.find((m) => m.id === channel)?.label} для номера <span className="whitespace-nowrap text-fg">{phone}</span>
              </p>
              <CodeInput
                value={code}
                error={!!error}
                disabled={loading}
                onChange={(v) => {
                  setCode(v)
                  setError(null)
                  if (v.length === 6) verify(v)
                }}
              />
              {devCode && (
                <p className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
                  Режим разработки: код <b className="font-mono text-sm">{devCode}</b>
                </p>
              )}
              {error && <p className="text-sm text-rose-500" role="alert">{error}</p>}
              <Button className="w-full" loading={loading} disabled={code.length !== 6} onClick={() => verify()}>
                Подтвердить
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button onClick={() => { setStep('phone'); setError(null) }} className="flex items-center gap-1 text-muted hover:text-fg">
                  <ArrowLeft className="size-4" /> Изменить номер
                </button>
                {left > 0 ? (
                  <span className="text-muted" aria-live="polite">
                    Повторно через {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
                  </span>
                ) : (
                  <button onClick={() => requestCode()} className="font-medium text-accent hover:underline" disabled={loading}>
                    Отправить повторно
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {step === 'password' && (
            <motion.form key="password" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} onSubmit={loginPassword} className="space-y-5">
              <Field label="Номер телефона">{(id) => <PhoneInput id={id} value={phone} onChange={setPhone} autoFocus />}</Field>
              <Field label="Пароль" hint="Пароль можно задать в настройках профиля">
                {(id) => <input id={id} type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />}
              </Field>
              {error && <p className="text-sm text-rose-500" role="alert">{error}</p>}
              <Button type="submit" className="w-full" loading={loading}>
                Войти
              </Button>
              <button type="button" onClick={() => { setError(null); setStep('phone') }} className="flex w-full items-center justify-center gap-2 text-sm text-muted hover:text-fg">
                <ArrowLeft className="size-4" /> Вход по коду
              </button>
            </motion.form>
          )}

          {step === 'profile' && (
            <motion.form key="profile" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} onSubmit={saveProfile} className="space-y-5">
              <p className="text-sm text-muted">Номер подтверждён. Расскажите немного о себе.</p>
              <Field label="Имя *">{(id) => <input id={id} className="input" autoComplete="given-name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} autoFocus />}</Field>
              <Field label="Дата рождения" hint="Необязательно. Пришлём подарок ко дню рождения">
                {(id) => <input id={id} type="date" className="input" value={profile.birthDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setProfile({ ...profile, birthDate: e.target.value })} />}
              </Field>
              <Field label="E-mail" hint="Необязательно. Для чеков и сертификатов">
                {(id) => <input id={id} type="email" className="input" autoComplete="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />}
              </Field>
              {error && <p className="text-sm text-rose-500" role="alert">{error}</p>}
              <Button type="submit" className="w-full" loading={loading}>
                {next.startsWith('/book/') ? 'Продолжить запись' : 'Готово'}
              </Button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
