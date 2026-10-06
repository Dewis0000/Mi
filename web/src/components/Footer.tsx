import { Link } from 'react-router-dom'
import { Mail, MapPin, Phone, Clock } from 'lucide-react'
import { useContent } from '../lib/hooks'
import { NAV } from './Header'
import { Logo } from './Logo'
import { Socials } from './Socials'

export function Footer() {
  const { data } = useContent()
  const c = data?.contacts
  return (
    <footer id="contacts" className="relative border-t border-line bg-surface">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-4">
          <Logo name={data?.site.name} />
          <p className="max-w-xs text-sm text-muted">{data?.site.tagline ?? 'Хоррор-квесты в реальности'}. Только для тех, кто не боится темноты.</p>
          {c && <Socials contacts={c} />}
        </div>
        <div>
          <h3 className="mb-4 font-display text-sm uppercase tracking-[0.2em] text-muted">Навигация</h3>
          <ul className="space-y-2.5 text-sm">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link className="hover:text-accent" to={n.href}>
                  {n.label}
                </Link>
              </li>
            ))}
            <li>
              <Link className="hover:text-accent" to="/profile">
                Личный кабинет
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="mb-4 font-display text-sm uppercase tracking-[0.2em] text-muted">Контакты</h3>
          {c && (
            <ul className="space-y-3 text-sm">
              <li className="flex gap-3">
                <Phone className="mt-0.5 size-4 shrink-0 text-accent" />
                <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="hover:text-accent">
                  {c.phone}
                </a>
              </li>
              {c.email && (
                <li className="flex gap-3">
                  <Mail className="mt-0.5 size-4 shrink-0 text-accent" />
                  <a href={`mailto:${c.email}`} className="hover:text-accent">
                    {c.email}
                  </a>
                </li>
              )}
              <li className="flex gap-3">
                <MapPin className="mt-0.5 size-4 shrink-0 text-accent" />
                {c.mapUrl ? (
                  <a href={c.mapUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                    {c.address}
                  </a>
                ) : (
                  c.address
                )}
              </li>
              <li className="flex gap-3">
                <Clock className="mt-0.5 size-4 shrink-0 text-accent" />
                {c.hours}
              </li>
            </ul>
          )}
        </div>
        <div>
          <h3 className="mb-4 font-display text-sm uppercase tracking-[0.2em] text-muted">Документы</h3>
          <ul className="space-y-2.5 text-sm">
            <li>
              <Link className="hover:text-accent" to="/privacy">
                Политика конфиденциальности
              </Link>
            </li>
            <li>
              <Link className="hover:text-accent" to="/personal-data">
                Согласие на обработку персональных данных
              </Link>
            </li>
            <li>
              <Link className="hover:text-accent" to="/rules">
                Правила посещения
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-muted sm:flex-row sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} {data?.site.name ?? 'Neru-Квест'}. Все права защищены.</span>
          <span>Квесты содержат сцены, способные напугать. Беременным и людям с заболеваниями сердца участие не рекомендуется.</span>
        </div>
      </div>
    </footer>
  )
}
