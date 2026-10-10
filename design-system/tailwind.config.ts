// StreOps Design System v1.0 — Tailwind CSS 3.4
// Все значения берутся из CSS-переменных (tokens.css), поэтому тема
// и пользовательские --user-* переключаются в рантайме без пересборки.
import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

const v = (name: string) => `var(--${name})`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    screens: {
      sm: '640px',   // планшет
      lg: '1024px',  // ноутбук
      xl: '1280px',  // десктоп
      '2xl': '1536px', // широкий
    },
    container: {
      center: true,
      padding: { DEFAULT: '16px', sm: '24px', lg: '32px', xl: '40px', '2xl': '48px' },
    },
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      n: Object.fromEntries(
        Array.from({ length: 14 }, (_, i) => [i, v(`n-${i}`)]),
      ),
      bg: {
        void: v('bg-void'),
        page: v('bg-page'),
        surface: v('bg-surface'),
        raised: v('bg-raised'),
        overlay: v('bg-overlay'),
      },
      state: {
        hover: v('state-hover'),
        active: v('state-active'),
        selected: v('state-selected'),
      },
      line: {
        subtle: v('border-subtle'),
        DEFAULT: v('border-default'),
        strong: v('border-strong'),
      },
      fg: {
        DEFAULT: v('text-primary'),
        secondary: v('text-secondary'),
        muted: v('text-muted'),
        disabled: v('text-disabled'),
        'on-inverse': v('text-on-inverse'),
      },
      inverse: {
        DEFAULT: v('fill-inverse'),
        hover: v('fill-inverse-hover'),
        active: v('fill-inverse-active'),
      },
      live: {
        DEFAULT: v('live'),
        hover: v('live-hover'),
        text: v('live-text'),
        border: v('live-border'),
        on: v('live-on'),
      },
      focus: v('focus-color'),
    },
    fontFamily: {
      sans: [v('font-sans')],
      mono: [v('font-mono')],
    },
    fontSize: {
      'display-2xl': ['72px', { lineHeight: '76px', letterSpacing: '-0.035em', fontWeight: '500' }],
      'display-xl': ['52px', { lineHeight: '56px', letterSpacing: '-0.03em', fontWeight: '500' }],
      h1: ['32px', { lineHeight: '38px', letterSpacing: '-0.02em', fontWeight: '600' }],
      h2: ['24px', { lineHeight: '30px', letterSpacing: '-0.015em', fontWeight: '600' }],
      h3: ['20px', { lineHeight: '26px', letterSpacing: '-0.01em', fontWeight: '600' }],
      'body-l': ['17px', { lineHeight: '26px', letterSpacing: '-0.005em' }],
      body: ['15px', { lineHeight: '22px' }],
      'body-s': ['13px', { lineHeight: '18px', letterSpacing: '0.005em' }],
      caption: ['12px', { lineHeight: '16px', letterSpacing: '0.01em', fontWeight: '500' }],
      overline: ['11px', { lineHeight: '14px', letterSpacing: '0.08em', fontWeight: '600' }],
      'mono-display': ['40px', { lineHeight: '44px', letterSpacing: '-0.02em', fontWeight: '500' }],
      'mono-l': ['24px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '500' }],
      'mono-m': ['15px', { lineHeight: '22px' }],
      'mono-s': ['13px', { lineHeight: '18px' }],
      'mono-xs': ['11px', { lineHeight: '14px', letterSpacing: '0.02em', fontWeight: '500' }],
    },
    fontWeight: { normal: '400', medium: '500', semibold: '600', bold: '700' },
    spacing: {
      0: '0px', px: '1px', 0.5: '2px', 1: '4px', 2: '8px', 3: '12px', 4: '16px',
      5: '20px', 6: '24px', 8: '32px', 10: '40px', 12: '48px', 16: '64px',
      20: '80px', 24: '96px', 32: '128px',
      header: v('header-h'),
      sidebar: v('sidebar-w'),
      'sidebar-collapsed': v('sidebar-w-collapsed'),
      chat: v('chat-w'),
      drawer: v('drawer-w'),
    },
    maxWidth: {
      prose: '680px', form: '880px', page: '1280px', wide: '1440px', full: '100%', none: 'none',
    },
    borderRadius: {
      none: v('radius-0'), xs: v('radius-xs'), sm: v('radius-sm'), DEFAULT: v('radius-md'),
      md: v('radius-md'), lg: v('radius-lg'), xl: v('radius-xl'), full: v('radius-full'),
    },
    borderWidth: { 0: '0px', DEFAULT: v('border-w-1'), 2: v('border-w-2') },
    boxShadow: {
      none: 'none', 1: v('shadow-1'), 2: v('shadow-2'), 3: v('shadow-3'), 4: v('shadow-4'),
      focus: v('focus-ring'),
    },
    zIndex: {
      decor: v('z-decor'), base: v('z-base'), raised: v('z-raised'), sticky: v('z-sticky'),
      header: v('z-header'), dropdown: v('z-dropdown'), drawer: v('z-drawer'),
      modal: v('z-modal'), toast: v('z-toast'), tooltip: v('z-tooltip'), skiplink: v('z-skiplink'),
    },
    transitionDuration: {
      0: v('dur-instant'), fast: v('dur-fast'), quick: v('dur-quick'), base: v('dur-base'),
      moderate: v('dur-moderate'), slow: v('dur-slow'), deliberate: v('dur-deliberate'),
      DEFAULT: v('dur-quick'),
    },
    transitionTimingFunction: {
      DEFAULT: v('ease-standard'), standard: v('ease-standard'),
      enter: v('ease-enter'), exit: v('ease-exit'), linear: 'linear',
    },
    backdropBlur: {
      none: '0', ambient: v('glass-ambient-blur'), raised: v('glass-raised-blur'),
      overlay: v('glass-overlay-blur'),
    },
    extend: {
      keyframes: {
        shimmer: { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(100%)' } },
        'live-pulse': {
          '0%': { transform: 'scale(1)', opacity: '0.35' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
      },
      animation: {
        shimmer: 'shimmer var(--dur-shimmer) linear infinite',
        'live-pulse': 'live-pulse var(--dur-pulse) var(--ease-exit) infinite',
      },
    },
  },
  plugins: [
    plugin(({ addComponents, addUtilities }) => {
      const glass = (level: 'ambient' | 'raised' | 'overlay') => ({
        backgroundColor: v(`glass-${level}-bg`),
        backdropFilter: `blur(${v(`glass-${level}-blur`)})`,
        WebkitBackdropFilter: `blur(${v(`glass-${level}-blur`)})`,
        border: `1px solid ${v(`glass-${level}-border`)}`,
        boxShadow:
          level === 'ambient'
            ? v('glass-ambient-highlight')
            : `${v(`glass-${level}-highlight`)}, ${v(level === 'raised' ? 'shadow-2' : 'shadow-4')}`,
      });
      addComponents({
        '.glass-ambient': glass('ambient'),
        '.glass-raised': glass('raised'),
        '.glass-overlay': glass('overlay'),
        '.status-success': { border: v('status-success-border'), background: v('status-success-bg') },
        '.status-warning': { border: v('status-warning-border'), background: v('status-warning-bg') },
        '.status-error': { border: v('status-error-border'), background: v('status-error-bg') },
        '.status-info': { border: v('status-info-border'), background: v('status-info-bg') },
      });
      addUtilities({
        '.num': { fontFamily: v('font-mono'), fontVariantNumeric: 'tabular-nums' },
        '.focus-ring': { '&:focus-visible': { outline: 'none', boxShadow: v('focus-ring') } },
        '.hit-44': { position: 'relative', '&::after': { content: '""', position: 'absolute', inset: '-6px' } },
      });
    }),
  ],
} satisfies Config;
