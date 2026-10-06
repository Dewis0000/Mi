import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './auth'

/** Неавторизованного отправляет на вход с возвратом на текущую страницу */
export function useRequireAuth() {
  const { user, ready } = useAuth()
  const navigate = useNavigate()
  // путь берём из роутера на момент рендера: window.location к повторному
  // запуску эффекта (StrictMode) уже указывает на /auth
  const { pathname, search } = useLocation()
  useEffect(() => {
    if (ready && !user && !pathname.startsWith('/auth')) {
      navigate(`/auth?next=${encodeURIComponent(pathname + search)}`, { replace: true })
    }
  }, [ready, user, navigate, pathname, search])
  return { user, ready }
}
