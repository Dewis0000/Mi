import { useEffect, useState } from 'react'
import clsx from 'clsx'

/**
 * Ручной ввод даты в формате ДД.ММ.ГГГГ (без календаря).
 * value/onChange работают в ISO-формате YYYY-MM-DD (пусто, пока дата неполная/некорректная).
 */
const toDisplay = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ''
}

export function DateInput({ id, value, onChange, className }: { id?: string; value: string; onChange: (iso: string) => void; className?: string }) {
  const [text, setText] = useState(() => toDisplay(value))

  // подхватываем внешнее значение (например, загрузку профиля), не мешая ручному вводу
  useEffect(() => {
    const d = toDisplay(value)
    setText((cur) => (cur.replace(/\D/g, '') === d.replace(/\D/g, '') ? cur : d))
  }, [value])

  const handle = (raw: string) => {
    const g = raw.replace(/\D/g, '').slice(0, 8) // ддммгггг
    let out = g
    if (g.length > 4) out = `${g.slice(0, 2)}.${g.slice(2, 4)}.${g.slice(4)}`
    else if (g.length > 2) out = `${g.slice(0, 2)}.${g.slice(2)}`
    setText(out)

    if (g.length === 8) {
      const dd = +g.slice(0, 2)
      const mm = +g.slice(2, 4)
      const yy = +g.slice(4)
      const iso = `${g.slice(4)}-${g.slice(2, 4)}-${g.slice(0, 2)}`
      const dt = new Date(iso + 'T00:00:00')
      const real = dt.getUTCFullYear() === yy && dt.getUTCMonth() + 1 === mm && dt.getUTCDate() === dd
      onChange(real && yy >= 1900 && dt <= new Date() ? iso : '')
    } else {
      onChange('')
    }
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="bday"
      placeholder="ДД.ММ.ГГГГ"
      maxLength={10}
      className={clsx('input', className)}
      value={text}
      onChange={(e) => handle(e.target.value)}
    />
  )
}
