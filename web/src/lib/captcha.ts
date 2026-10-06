/**
 * Невидимая Яндекс SmartCaptcha. Если ключ не задан (разработка) — возвращает undefined,
 * а сервер в этом случае проверку пропускает.
 */
const KEY = import.meta.env.VITE_SMARTCAPTCHA_KEY as string | undefined

type SmartCaptcha = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => number
  execute: (id: number) => void
  reset: (id: number) => void
}
declare global {
  interface Window {
    smartCaptcha?: SmartCaptcha
  }
}

let loader: Promise<SmartCaptcha> | null = null
function load() {
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://smartcaptcha.yandexcloud.net/captcha.js'
      s.async = true
      s.onload = () => (window.smartCaptcha ? resolve(window.smartCaptcha) : reject(new Error('captcha')))
      s.onerror = reject
      document.head.appendChild(s)
    })
  }
  return loader
}

export async function getCaptchaToken(): Promise<string | undefined> {
  if (!KEY) return undefined
  const sc = await load()
  const el = document.createElement('div')
  document.body.appendChild(el)
  return new Promise((resolve) => {
    const id = sc.render(el, {
      sitekey: KEY,
      invisible: true,
      hideShield: true,
      callback: (token: string) => {
        resolve(token)
        setTimeout(() => el.remove(), 1000)
      },
    })
    sc.execute(id)
  })
}
