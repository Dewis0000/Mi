import { Suspense, lazy, useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { Spinner } from './components/ui'
import Home from './pages/Home'
import { NotFound, PersonalData, Privacy, Rules } from './pages/Legal'

const Auth = lazy(() => import('./pages/Auth'))
const Booking = lazy(() => import('./pages/Booking'))
const Profile = lazy(() => import('./pages/Profile'))
const QuestPage = lazy(() => import('./pages/QuestPage'))
const PaymentMock = lazy(() => import('./pages/PaymentMock'))
const LiveOwner = lazy(() => import('./pages/Live').then((m) => ({ default: m.LiveOwner })))
const WatchInvite = lazy(() => import('./pages/Live').then((m) => ({ default: m.WatchInvite })))

/** Прокрутка: к якорю (#quests) или наверх при смене страницы */
function ScrollManager() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      let tries = 0
      const tick = () => {
        const el = document.getElementById(decodeURIComponent(hash.slice(1)))
        if (el) el.scrollIntoView({ behavior: 'smooth' })
        else if (tries++ < 20) setTimeout(tick, 100)
      }
      tick()
    } else {
      window.scrollTo({ top: 0 })
    }
  }, [pathname, hash])
  return null
}

const Fallback = () => (
  <div className="grid min-h-[60vh] place-items-center">
    <Spinner />
  </div>
)

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only z-[300] rounded-lg bg-accent px-4 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Перейти к содержимому
      </a>
      <ScrollManager />
      <Header />
      <main id="main" className="flex-1">
        <Suspense fallback={<Fallback />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/quests/:slug" element={<QuestPage />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/book/:slug" element={<Booking />} />
            <Route path="/profile/:tab?" element={<Profile />} />
            <Route path="/live/:id" element={<LiveOwner />} />
            <Route path="/watch/:token" element={<WatchInvite />} />
            <Route path="/payment/mock" element={<PaymentMock />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/personal-data" element={<PersonalData />} />
            <Route path="/rules" element={<Rules />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </div>
  )
}
