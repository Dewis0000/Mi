import { useRef } from 'react'
import clsx from 'clsx'

/** Ввод 6-значного кода по одной цифре, с поддержкой вставки */
export function CodeInput({ value, onChange, error, disabled }: { value: string; onChange: (v: string) => void; error?: boolean; disabled?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = value.padEnd(6, ' ').slice(0, 6).split('')

  // цифры хранятся подряд: ввод в позицию i заменяет цифру, удаление — сдвигает остальные
  const set = (i: number, d: string | null) => {
    const arr = value.split('')
    if (d === null) arr.splice(i, 1)
    else arr[Math.min(i, arr.length)] = d
    onChange(arr.join('').slice(0, 6))
  }

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="Код подтверждения">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          disabled={disabled}
          aria-label={`Цифра ${i + 1}`}
          value={d.trim()}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '')
            if (!v) return
            // вставка/автозаполнение всего кода — раскладываем по ячейкам
            if (v.length > 1) {
              onChange(v.slice(0, 6))
              refs.current[Math.min(v.length, 5)]?.focus()
              return
            }
            set(i, v)
            refs.current[Math.min(i, value.length) + 1]?.focus()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') {
              e.preventDefault()
              if (d.trim()) set(i, null)
              else if (i > 0) {
                set(i - 1, null)
                refs.current[i - 1]?.focus()
              }
            }
            if (e.key === 'ArrowLeft') refs.current[i - 1]?.focus()
            if (e.key === 'ArrowRight') refs.current[i + 1]?.focus()
          }}
          onPaste={(e) => {
            e.preventDefault()
            const v = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
            onChange(v)
            refs.current[Math.min(v.length, 5)]?.focus()
          }}
          className={clsx(
            'input h-14 w-full max-w-14 px-0 text-center font-display text-2xl',
            error && 'border-rose-500 focus:border-rose-500',
          )}
        />
      ))}
    </div>
  )
}
