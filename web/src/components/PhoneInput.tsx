import { forwardRef } from 'react'
import { maskPhone } from '../lib/format'

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  value: string
  onChange: (v: string) => void
}

/** Поле телефона с маской +7 (___) ___-__-__ */
export const PhoneInput = forwardRef<HTMLInputElement, Props>(function PhoneInput({ value, onChange, ...rest }, ref) {
  return (
    <input
      ref={ref}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder="+7 (___) ___-__-__"
      className="input text-lg tracking-wide"
      value={value}
      onFocus={() => !value && onChange('+7 (')}
      onChange={(e) => {
        const raw = e.target.value
        // при стирании скобки/дефиса не «залипаем» на маске
        onChange(raw.replace(/\D/g, '').length <= 1 ? '' : maskPhone(raw))
      }}
      {...rest}
    />
  )
})
