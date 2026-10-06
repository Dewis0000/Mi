export type Messenger = 'TELEGRAM' | 'VK' | 'MAX'
export type BookingStatus = 'NEW' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'

export type User = {
  id: string
  phone: string
  phoneVerified: boolean
  name: string | null
  birthDate: string | null
  email: string | null
  points: number
  messenger: Messenger
  linked: { telegram: boolean; vk: boolean; max: boolean }
  notify: { bookings: boolean; reminders: boolean; promo: boolean }
  hasPassword: boolean
  isStaff: boolean
  permissions: string[]
  roleName?: string
  createdAt: string
}

export type Quest = {
  id: string
  slug: string
  title: string
  shortDescription: string
  description: string
  photoUrl: string
  fearLevel: number
  minPlayers: number
  maxPlayers: number
  durationMin: number
  minAge: number
  basePrice: number
  peakExtra: number
  tags: string[]
}

export type Schedule = { id?: string; weekday: number; timeFrom: string; timeTo: string; breakMin: number }
export type AdminQuest = Quest & { roomNumber: number; isActive: boolean; sortOrder: number; schedules: Schedule[] }

export type Slot = { start: string; end: string; price: number; available: boolean; doubleAvailable: boolean }

export type Booking = {
  id: string
  questId: string
  userId: string
  startAt: string
  endAt: string
  playersCount: number
  ages: number[]
  status: BookingStatus
  source: 'WEB' | 'ADMIN' | 'PHONE' | 'WALK_IN'
  basePrice: number
  discountPercent: number
  discountAmount: number
  promoCode: string | null
  finalPrice: number
  prepaid: number
  comment: string | null
  adminNote: string | null
  isDoubleSession: boolean
  linkedBookingId: string | null
  linkedBooking?: { id: string; startAt: string; endAt: string } | null
  passed: boolean | null
  timeSpentMin: number | null
  createdAt: string
  quest: { id: string; slug?: string; title: string; photoUrl?: string; durationMin: number; roomNumber?: number; fearLevel?: number }
  user?: { id: string; name: string | null; phone: string; points?: number; blocked?: boolean }
  canChange?: boolean
  isLive?: boolean
}

export type Quote = {
  basePrice: number
  loyaltyPercent: number
  promo: { code: string; isCertificate: boolean; percent: number | null; amount: number | null } | null
  discountPercent: number
  discountAmount: number
  finalPrice: number
  prepay: number
}

export type Tier = { from: number; percent: number }

export type Content = {
  site: { name: string; tagline: string; heroTitle: string; heroText: string; aboutText: string }
  contacts: {
    address: string
    addressNote: string
    lat: number
    lon: number
    phone: string
    email: string
    hours: string
    mapUrl?: string
    telegram: string
    vk: string
    max: string
  }
  booking: { prepayMode: 'none' | 'prepay'; prepayPercent: number; cancelHours: number; holdMinutes: number }
  loyalty: { pointsPerVisit: number; tiers: Tier[]; burnAfterMonths: number; burnPercentPerMonth: number }
  recordings: { price: number; linkDays: number }
}

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number }
