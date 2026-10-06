import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { FlaskConical, RotateCcw } from 'lucide-react'
import { api, errorMessage, type AuthResponse } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useUi } from '../components/ui'
import { resetDemo } from './server'

const ACCOUNTS = [
  { label: 'Клиент', phone: '+79990000002', password: 'demo12345', to: '/profile' },
  { label: 'Главный админ', phone: '+79990000001', password: 'admin12345', to: '/admin' },
  { label: 'Оператор', phone: '+79990000013', password: 'operator12345', to: '/admin' },
]

/** Полоса демо-режима: быстрый вход под разными ролями и сброс данных */
export function DemoBar() {
  const { signIn, signOut, user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { toast, confirm } = useUi()
  const [busy, setBusy] = useState<string | null>(null)

  async function loginAs(a: (typeof ACCOUNTS)[number]) {
    setBusy(a.label)
    try {
      const res = await api<AuthResponse>('/auth/password', { method: 'POST', body: { phone: a.phone, password: a.password } })
      qc.clear()
      signIn(res)
      navigate(a.to)
      toast(`Вы вошли: ${res.user.name}`, 'info')
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function reset() {
    if (!(await confirm({ title: 'Сбросить демо-данные?', text: 'Все записи, изменения и новые пользователи в этом браузере вернутся к исходному состоянию.', confirmText: 'Сбросить', danger: true }))) return
    resetDemo()
    await signOut()
    navigate('/')
    toast('Демо-данные сброшены', 'info')
  }

  return (
    <div className="relative z-[60] border-b border-amber-500/30 bg-amber-500/10 text-xs">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
        <span className="flex items-center gap-1.5 font-semibold text-amber-600 light:text-amber-700">
          <FlaskConical className="size-3.5" aria-hidden /> Демо-версия
        </span>
        <span className="hidden text-muted md:inline">Сервер работает прямо в браузере, данные хранятся только у вас.</span>
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted">Войти как:</span>
          {ACCOUNTS.map((a) => (
            <button
              key={a.label}
              onClick={() => loginAs(a)}
              disabled={busy !== null}
              className="rounded-md border border-line bg-surface px-2 py-1 font-medium hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {busy === a.label ? '…' : a.label}
            </button>
          ))}
        </span>
        <button onClick={reset} className="ml-auto flex items-center gap-1 text-muted hover:text-fg">
          <RotateCcw className="size-3.5" aria-hidden /> Сбросить данные
        </button>
        {user && <span className="sr-only">Вы вошли как {user.name}</span>}
      </div>
    </div>
  )
}
