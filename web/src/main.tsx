import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import App from './App'
import { UiProvider } from './components/ui'
import { ApiError } from './lib/api'
import { DEMO } from './lib/env'
import { AuthProvider } from './lib/auth'
import { ThemeProvider } from './lib/theme'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
})

/** В демо-сборке адрес страницы не меняется: роутинг в памяти, стартовый раздел — из #якоря */
function DemoRouter({ children }: { children: React.ReactNode }) {
  const anchor = location.hash.replace(/^#/, '')
  const start = ['admin', 'profile'].includes(anchor) ? `/${anchor}` : '/'
  return <MemoryRouter initialEntries={[start]}>{children}</MemoryRouter>
}
const Router = DEMO ? DemoRouter : BrowserRouter

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <Router>
          <ThemeProvider>
            <AuthProvider>
              <UiProvider>
                <App />
              </UiProvider>
            </AuthProvider>
          </ThemeProvider>
        </Router>
      </QueryClientProvider>
    </MotionConfig>
  </StrictMode>,
)
