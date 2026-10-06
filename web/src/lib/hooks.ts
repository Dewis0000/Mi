import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import type { Content, Quest } from './types'

export const useContent = () => useQuery({ queryKey: ['content'], queryFn: () => api<Content>('/content'), staleTime: 5 * 60_000 })
export const useQuests = () => useQuery({ queryKey: ['quests'], queryFn: () => api<Quest[]>('/quests'), staleTime: 60_000 })

/** Заголовок и мета-описание страницы */
export function useSeo(title: string, description?: string) {
  useEffect(() => {
    const prev = document.title
    document.title = title
    const meta = document.querySelector('meta[name="description"]')
    const prevDesc = meta?.getAttribute('content')
    if (description && meta) meta.setAttribute('content', description)
    return () => {
      document.title = prev
      if (meta && prevDesc) meta.setAttribute('content', prevDesc)
    }
  }, [title, description])
}

/** Микроразметка schema.org (JSON-LD) */
export function useJsonLd(id: string, data: unknown) {
  useEffect(() => {
    if (!data) return
    let el = document.getElementById(id) as HTMLScriptElement | null
    if (!el) {
      el = document.createElement('script')
      el.type = 'application/ld+json'
      el.id = id
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(data)
    return () => el?.remove()
  }, [id, data])
}

/** Секунд осталось до момента deadline (ms), обновляется раз в секунду */
export function useSecondsLeft(deadline: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (deadline <= Date.now()) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [deadline])
  return Math.max(0, Math.ceil((deadline - now) / 1000))
}

export function useMediaQuery(q: string) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const fn = () => setM(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [q])
  return m
}
