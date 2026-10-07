import { Component, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { RotateCw } from 'lucide-react'

/**
 * Перехватывает ошибки рендера, чтобы одна сломавшаяся страница не роняла весь сайт
 * в «чёрный экран». Показывает понятное сообщение и кнопки «Обновить» / «На главную».
 * resetKey (путь из App) сбрасывает ошибку при переходе на другую страницу —
 * при этом здоровое дерево не перемонтируется (нет мигания при обычной навигации).
 */
type Props = { children: ReactNode; resetKey?: string }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    // в консоль — чтобы было видно при диагностике
    console.error('Ошибка рендера страницы:', error)
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto grid min-h-[50vh] max-w-lg place-items-center px-4 py-10 text-center">
        <div className="card w-full p-8">
          <h1 className="font-display text-2xl uppercase tracking-wide">Что-то пошло не так</h1>
          <p className="mt-2 text-sm text-muted">
            Страница не открылась из-за ошибки. Попробуйте обновить — если повторится, сообщите нам.
          </p>
          {import.meta.env.DEV && (
            <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-surface-2 p-3 text-left text-xs text-rose-400">
              {this.state.error.message}
            </pre>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg"
            >
              <RotateCw className="size-4" /> Обновить
            </button>
            <Link
              to="/"
              onClick={() => this.setState({ error: null })}
              className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm text-muted hover:text-fg"
            >
              На главную
            </Link>
          </div>
        </div>
      </div>
    )
  }
}
