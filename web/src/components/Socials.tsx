import { Send } from 'lucide-react'
import type { Content } from '../lib/types'

const VkIcon = () => (
  <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
    <path d="M12.8 17.5c-5.5 0-8.6-3.8-8.8-10h2.8c.1 4.6 2.1 6.5 3.7 6.9V7.5h2.6v3.9c1.6-.2 3.3-2 3.8-3.9h2.6c-.4 2.4-2.2 4.2-3.4 4.9 1.3.6 3.3 2.1 4.1 5.1h-2.9c-.6-1.9-2.1-3.4-4.2-3.6v3.6h-.3z" />
  </svg>
)
const MaxIcon = () => (
  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
    <path d="M5 18V7l7 7 7-7v11" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export function Socials({ contacts }: { contacts: Content['contacts'] }) {
  const items = [
    { href: contacts.telegram, label: 'Telegram', icon: <Send className="size-4" /> },
    { href: contacts.vk, label: 'ВКонтакте', icon: <VkIcon /> },
    { href: contacts.max, label: 'MAX', icon: <MaxIcon /> },
  ].filter((i) => i.href)
  return (
    <div className="flex gap-2">
      {items.map((i) => (
        <a
          key={i.label}
          href={i.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={i.label}
          className="grid size-10 place-items-center rounded-xl border border-line text-muted transition-colors hover:border-accent hover:text-accent"
        >
          {i.icon}
        </a>
      ))}
    </div>
  )
}
