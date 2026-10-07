import { Suspense, lazy, useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
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

// админ-панель грузится отдельным чанком (доступ — только у пользователя с ролью, см. middleware)
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const Dashboard = lazy(() => import('./pages/admin/Dashboard'))
const AdminBookings = lazy(() => import('./pages/admin/Bookings'))
const AdminUsers = lazy(() => import('./pages/admin/Users'))
const AdminRoles = lazy(() => import('./pages/admin/Users').then((m) => ({ default: m.Roles })))
const AdminLogs = lazy(() => import('./pages/admin/Users').then((m) => ({ default: m.Logs })))
const AdminQuests = lazy(() => import('./pages/admin/Quests'))
const AdminRecordings = lazy(() => import('./pages/admin/Media').then((m) => ({ default: m.Recordings })))
const AdminPayments = lazy(() => import('./pages/admin/Media').then((m) => ({ default: m.Payments })))
const AdminReports = lazy(() => import('./pages/admin/Reports'))
const AdminPromo = lazy(() => import('./pages/admin/Content').then((m) => ({ default: m.PromoCodes })))
const AdminSettings = lazy(() => import('./pages/admin/Content').then((m) => ({ default: m.SettingsPage })))

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
  const { pathname } = useLocation()
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only z-[300] rounded-lg bg-accent px-4 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Перейти к содержимому
      </a>
      <ScrollManager />
      <Header />
      <main id="main" className="flex-1">
        {/* resetKey по пути: ошибка одной страницы не блокирует переход на другие */}
        <ErrorBoundary resetKey={pathname}>
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
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="bookings" element={<AdminBookings />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="quests" element={<AdminQuests />} />
              <Route path="recordings" element={<AdminRecordings />} />
              <Route path="reports" element={<AdminReports />} />
              <Route path="payments" element={<AdminPayments />} />
              <Route path="promo" element={<AdminPromo />} />
              <Route path="settings" element={<AdminSettings />} />
              <Route path="roles" element={<AdminRoles />} />
              <Route path="logs" element={<AdminLogs />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  )
}
