import { DEMO } from './env'

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  status: number
  code?: string
  data: Record<string, unknown>
  constructor(status: number, data: Record<string, unknown>) {
    super(String(data.error ?? 'Ошибка запроса'))
    this.status = status
    this.code = data.code as string | undefined
    this.data = data
  }
}

let accessToken: string | null = null
let refreshing: Promise<boolean> | null = null
let onAuthChange: ((data: AuthResponse | null) => void) | null = null

export type AuthResponse = { accessToken: string; user: import('./types').User; needsProfile: boolean }

export const hasSession = () => !!accessToken

export function setAccessToken(t: string | null) {
  accessToken = t
}
export function subscribeAuth(fn: typeof onAuthChange) {
  onAuthChange = fn
}

/** Демо: запрос уходит в эмулятор API внутри страницы */
async function demoRequest<T>(method: string, path: string, query?: Options['query'], body?: unknown): Promise<T> {
  const { handleDemoRequest } = await import('../demo/server')
  const res = await handleDemoRequest({ method, path, query, body, token: accessToken })
  if (res.status >= 400) throw new ApiError(res.status, res.data as Record<string, unknown>)
  return res.data as T
}

/** Обновление access-токена по HttpOnly refresh-cookie */
export function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    const request: Promise<AuthResponse> = DEMO
      ? demoRequest<AuthResponse>('POST', '/auth/refresh')
      : fetch(`${BASE}/api/auth/refresh`, { method: 'POST', credentials: 'include' }).then((r) => {
          if (!r.ok) throw new Error()
          return r.json() as Promise<AuthResponse>
        })
    refreshing = request
      .then((data) => {
        accessToken = data.accessToken
        onAuthChange?.(data)
        return true
      })
      .catch(() => {
        accessToken = null
        onAuthChange?.(null)
        return false
      })
      .finally(() => {
        refreshing = null
      })
  }
  return refreshing
}

type Options = Omit<RequestInit, 'body'> & { body?: unknown; query?: Record<string, string | number | boolean | undefined | null> }

export async function api<T = unknown>(path: string, opts: Options = {}, retry = true): Promise<T> {
  const { body, query, headers, ...rest } = opts
  if (DEMO) {
    try {
      return await demoRequest<T>(rest.method ?? 'GET', path, query, body)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && retry && !path.startsWith('/auth/') && (await refreshSession())) {
        return api<T>(path, opts, false)
      }
      throw e
    }
  }
  let url = `${BASE}/api${path}`
  if (query) {
    const q = new URLSearchParams()
    Object.entries(query).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && q.set(k, String(v)))
    const s = q.toString()
    if (s) url += `?${s}`
  }
  const isForm = body instanceof FormData
  const res = await fetch(url, {
    ...rest,
    credentials: 'include',
    headers: {
      ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  })
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refreshSession()) return api<T>(path, opts, false)
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: `Ошибка ${res.status}` }))
    throw new ApiError(res.status, data)
  }
  const type = res.headers.get('content-type') ?? ''
  return (type.includes('json') ? res.json() : res.blob()) as Promise<T>
}

/** Переход на страницу оплаты: внутренний путь (тестовая оплата) — через роутер, внешний (ЮKassa) — полноценный переход */
export function goToPayment(url: string, navigate: (to: string) => void) {
  if (url.startsWith('/')) navigate(url)
  else window.location.href = url
}

/** Скачивание файла с авторизацией (экспорт отчётов) */
export async function download(path: string, query: Record<string, string>, filename: string) {
  // песочница демо-версии не позволяет сохранять файлы — код скачивания в демо-сборку не попадает
  if (DEMO) throw new ApiError(400, { error: 'Это демо: браузерная песочница не даёт скачивать файлы. На рабочем сайте здесь выгружается таблица Excel или CSV.', code: 'DEMO' })
  const blob = await api<Blob>(path, { query })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Что-то пошло не так')

/** Ограничение демо-версии (скачивание файлов, внешние сервисы) — показывается как подсказка, а не ошибка */
export const isDemoNotice = (e: unknown) => e instanceof ApiError && e.code === 'DEMO'
