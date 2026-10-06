import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CreditCard, ShieldCheck } from 'lucide-react'
import { Button, ErrorBox, Skeleton } from '../components/ui'
import { api, errorMessage } from '../lib/api'
import { rub } from '../lib/format'
import { useSeo } from '../lib/hooks'
import { useRequireAuth } from '../lib/useRequireAuth'

/** Тестовая платёжная страница (PAYMENT_PROVIDER=mock). В продакшене — редирект в ЮKassa. */
export default function PaymentMock() {
  useSeo('Оплата — Neru-Квест')
  useRequireAuth()
  const [params] = useSearchParams()
  const id = params.get('id') ?? ''
  const back = params.get('back')?.startsWith('/') ? params.get('back')! : '/profile'
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const payment = useQuery({ queryKey: ['payment', id], queryFn: () => api<{ amount: number; status: string; purpose: string }>(`/payments/${id}`) })

  async function pay() {
    setLoading(true)
    try {
      await api(`/payments/${id}/mock-confirm`, { method: 'POST' })
      navigate(`${back}?payment=${id}`, { replace: true })
    } catch (e) {
      setError(errorMessage(e))
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-16">
      <div className="card w-full p-8">
        <div className="mb-6 flex items-center gap-3">
          <CreditCard className="size-8 text-accent" />
          <div>
            <h1 className="font-display text-2xl uppercase">Оплата</h1>
            <p className="text-xs text-muted">Тестовый режим — деньги не списываются</p>
          </div>
        </div>
        {payment.isLoading && <Skeleton className="h-20" />}
        {payment.error && <ErrorBox error={payment.error} />}
        {payment.data && (
          <>
            <p className="text-sm text-muted">{payment.data.purpose === 'RECORDING' ? 'Видеозапись прохождения' : 'Предоплата за квест'}</p>
            <p className="mb-6 font-display text-5xl">{rub(payment.data.amount)}</p>
            {payment.data.status === 'SUCCEEDED' ? (
              <Button className="w-full" onClick={() => navigate(back)}>Уже оплачено — вернуться</Button>
            ) : (
              <Button className="w-full" size="lg" loading={loading} onClick={pay}>Оплатить</Button>
            )}
          </>
        )}
        {error && <p className="mt-3 text-sm text-rose-500">{error}</p>}
        <p className="mt-6 flex items-center gap-2 text-xs text-muted">
          <ShieldCheck className="size-4" /> В рабочем режиме оплата проходит на защищённой странице ЮKassa
        </p>
      </div>
    </div>
  )
}
