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

/** Обновление access-токена по HttpOnly refresh-cookie */
export function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch(`${BASE}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error()
        const data = (await r.json()) as AuthResponse
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

/** Скачивание файла с авторизацией (экспорт отчётов) */
export async function download(path: string, query: Record<string, string>, filename: string) {
  const blob = await api<Blob>(path, { query })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Что-то пошло не так')
