# Тулкит веб-разработчика: расширения VS Code, библиотеки, анимации и безопасность

> **Как пользоваться:** загрузи этот файл (вместе с `MASTER_PROMPT.md`, если он тоже нужен) в новый чат с Claude перед началом работы над сайтом. Claude будет использовать его как справочник: какие расширения VS Code порекомендовать, какие библиотеки ставить для UI/анимаций, и какие правила безопасности соблюдать на каждом этапе — от установки зависимостей до финальной проверки перед деплоем. Документ не нужно менять под конкретный проект — он универсальный.

---

## 1. Расширения VS Code

### 1.1 Базовый набор (обязательно)

| # | Расширение | ID для установки | Зачем нужно |
|---|---|---|---|
| 1 | **Prettier** | `esbenp.prettier-vscode` | Автоформатирование кода при сохранении (JS/TS/CSS/HTML/JSON/MD) |
| 2 | **ESLint** | `dbaeumer.vscode-eslint` | Поиск и автоисправление ошибок/антипаттернов в JS/TS |
| 3 | **Live Server** | `ritwickdey.LiveServer` | Локальный сервер с автообновлением для чистого HTML/CSS/JS (без сборщика) |
| 4 | **Auto Rename Tag** | `formulahendry.auto-rename-tag` | Синхронное переименование парных HTML/JSX-тегов |
| 5 | **Auto Close Tag** | `formulahendry.auto-close-tag` | Автозакрытие HTML/JSX-тегов |
| 6 | **HTML CSS Support** | `ecmel.vscode-html-css` | Автодополнение классов и id из CSS-файлов в HTML |
| 7 | **IntelliSense for CSS class names** | `Zignd.html-css-class-completion` | Подсказки имён классов из всех CSS/SCSS файлов проекта |
| 8 | **Path Intellisense** | `christian-kohler.path-intellisense` | Автодополнение путей при импортах и подключении файлов |
| 9 | **GitLens** | `eamodio.gitlens` | История изменений построчно (blame), сравнение веток, граф коммитов |
| 10 | **Tailwind CSS IntelliSense** | `bradlc.vscode-tailwindcss` | Автодополнение, подсветка и линтинг классов Tailwind |
| 11 | **Color Highlight** | `naumovs.color-highlight` | Подсветка HEX/RGB/HSL цветов прямо в коде |
| 12 | **Emmet** | встроен в VS Code | Быстрый ввод HTML/CSS аббревиатурами (`div.card>h2+p`) |
| 13 | **Thunder Client** | `rangav.vscode-thunder-client` | Тестирование REST/GraphQL API прямо в редакторе (аналог Postman) |
| 14 | **REST Client** | `humao.rest-client` | Тестирование API через `.http`-файлы, версионируемые в git |
| 15 | **Error Lens** | `usernamehw.errorlens` | Ошибки и warning'и ESLint/TS выводятся прямо в строке кода |
| 16 | **Markdown All in One** | `yzhang.markdown-all-in-one` | Оглавление, превью, горячие клавиши для Markdown |

### 1.2 Дополнительно рекомендуется (качество, скорость, безопасность)

| Расширение | ID | Зачем нужно |
|---|---|---|
| **EditorConfig for VS Code** | `EditorConfig.EditorConfig` | Единые отступы/кодировка между разработчиками и редакторами |
| **Code Spell Checker** | `streetsidesoftware.code-spell-checker` | Ловит опечатки в коде, комментариях, текстах интерфейса |
| **Pretty TypeScript Errors** | `yoavbls.pretty-ts-errors` | Ошибки TypeScript читаются человеком, а не портянкой generic-типов |
| **Import Cost** | `wix.vscode-import-cost` | Показывает вес импортируемых npm-пакетов прямо в коде (контроль бандла) |
| **npm Intellisense** | `christian-kohler.npm-intellisense` | Автодополнение имён пакетов при импорте |
| **Version Lens** | `pflannery.vscode-versionlens` | Показывает актуальные версии зависимостей прямо в `package.json` |
| **DotENV** | `mikestead.dotenv` | Подсветка синтаксиса `.env`-файлов |
| **SonarLint** | `SonarSource.sonarlint-vscode` | Статический анализ на уязвимости и code smells (security-linter) |
| **Todo Tree** | `Gruntfuggly.todo-tree` | Собирает все `TODO`/`FIXME` по проекту в одно дерево |
| **Better Comments** | `aaron-bond.better-comments` | Разноцветные комментарии (! предупреждение, ? вопрос, TODO и т.д.) |
| **indent-rainbow** | `oderwat.indent-rainbow` | Подсветка уровней вложенности отступов |
| **Material Icon Theme** | `PKief.material-icon-theme` | Иконки файлов/папок по типу — быстрее ориентироваться в структуре |
| **CSS Peek** | `pranaygp.vscode-css-peek` | Переход к определению CSS-класса прямо из HTML/JSX по клику |
| **Playwright Test for VSCode** | `ms-playwright.playwright` | Запуск и дебаг e2e-тестов Playwright прямо из редактора |
| **GitHub Pull Requests and Issues** | `GitHub.vscode-pull-request-github` | Ревью и управление PR/issues без выхода из VS Code |
| **Docker** | `ms-azuretools.vscode-docker` | Управление Dockerfile/образами, если проект контейнеризуется |
| **Trailing Spaces** | `shardulm94.trailing-spaces` | Подсветка и удаление висячих пробелов в конце строк |

### 1.3 Быстрая установка одной командой

Через терминал (Bash/PowerShell) с установленным `code` CLI:

```bash
code --install-extension esbenp.prettier-vscode
code --install-extension dbaeumer.vscode-eslint
code --install-extension ritwickdey.LiveServer
code --install-extension formulahendry.auto-rename-tag
code --install-extension formulahendry.auto-close-tag
code --install-extension ecmel.vscode-html-css
code --install-extension Zignd.html-css-class-completion
code --install-extension christian-kohler.path-intellisense
code --install-extension eamodio.gitlens
code --install-extension bradlc.vscode-tailwindcss
code --install-extension naumovs.color-highlight
code --install-extension rangav.vscode-thunder-client
code --install-extension humao.rest-client
code --install-extension usernamehw.errorlens
code --install-extension yzhang.markdown-all-in-one
code --install-extension EditorConfig.EditorConfig
code --install-extension streetsidesoftware.code-spell-checker
code --install-extension yoavbls.pretty-ts-errors
code --install-extension wix.vscode-import-cost
code --install-extension christian-kohler.npm-intellisense
code --install-extension pflannery.vscode-versionlens
code --install-extension mikestead.dotenv
code --install-extension SonarSource.sonarlint-vscode
code --install-extension Gruntfuggly.todo-tree
code --install-extension PKief.material-icon-theme
code --install-extension pranaygp.vscode-css-peek
code --install-extension ms-playwright.playwright
```

### 1.4 Готовые конфиги для проекта

Кладём в корень проекта — VS Code сам предложит установить недостающие расширения и применит настройки.

**`.vscode/extensions.json`**
```json
{
  "recommendations": [
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ritwickdey.LiveServer",
    "formulahendry.auto-rename-tag",
    "formulahendry.auto-close-tag",
    "ecmel.vscode-html-css",
    "Zignd.html-css-class-completion",
    "christian-kohler.path-intellisense",
    "eamodio.gitlens",
    "bradlc.vscode-tailwindcss",
    "naumovs.color-highlight",
    "rangav.vscode-thunder-client",
    "humao.rest-client",
    "usernamehw.errorlens",
    "yzhang.markdown-all-in-one",
    "EditorConfig.EditorConfig",
    "streetsidesoftware.code-spell-checker",
    "yoavbls.pretty-ts-errors"
  ]
}
```

**`.vscode/settings.json`**
```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "emmet.includeLanguages": {
    "javascript": "javascriptreact",
    "typescript": "typescriptreact"
  },
  "emmet.triggerExpansionOnTab": true,
  "tailwindCSS.experimental.classRegex": [
    ["cva\\(([^)]*)\\)", "[\"'`]([^\"'`]*).*?[\"'`]"],
    ["cx\\(([^)]*)\\)", "(?:'|\"|`)([^']*)(?:'|\"|`)"],
    ["clsx\\(([^)]*)\\)", "(?:'|\"|`)([^']*)(?:'|\"|`)"]
  ],
  "files.associations": {
    "*.css": "tailwindcss"
  },
  "editor.quickSuggestions": {
    "strings": true
  },
  "cSpell.language": "en,ru"
}
```

---

## 2. Технологический стек для красивых сайтов

### 2.1 Фреймворк и база
- **Next.js** (App Router, TypeScript) — многостраничные сайты, SSR/SSG, встроенный бэкенд.
- **Vite + React + TypeScript** — простые лендинги/SPA без бэкенда.
- **Astro** — контентные/маркетинговые сайты с минимумом JS на клиенте.
- Менеджер пакетов: **pnpm** (быстрее и экономнее по месту) или npm.

### 2.2 Стилизация
- **Tailwind CSS** — основа стилизации.
- `tailwind-merge`, `class-variance-authority` (cva), `clsx` — вариативные и составные классы.
- `tailwindcss-animate` — keyframe-анимации через utility-классы.
- **shadcn/ui** — готовые доступные компоненты (Button, Dialog, Tabs, Sheet, Toast, Accordion и т.д.), устанавливаются командой `npx shadcn@latest add <component>`.
- **Radix UI** — низкоуровневые доступные примитивы (основа shadcn/ui).
- Ориентиры по визуальным паттернам (hero-секции, bento-grid, spotlight-карточки, marquee): каталоги **Aceternity UI**, **Magic UI**, **21st.dev**, **HeroUI (ex-NextUI)** — паттерны переиспользуем идейно, код пишем свой.

### 2.3 Анимации и визуальные эффекты
- **Framer Motion** (`motion`/`framer-motion`) — переходы страниц, появление элементов, hover/tap, drag, layout-анимации.
- **GSAP** + `ScrollTrigger` — сложные scroll-driven анимации, таймлайны.
- **AOS (Animate On Scroll)** — лёгкие анимации появления блоков при скролле без больших зависимостей.
- **Lenis** (или Locomotive Scroll) — плавный инерционный скролл ("smooth scroll").
- **Lottie** (`lottie-react`) — векторные анимации, экспортированные из After Effects.
- **tsParticles** / `react-tsparticles` — анимированные фоны (частицы, сетки, звёзды).
- **Three.js** + **React Three Fiber** (`@react-three/fiber`) + `@react-three/drei` — 3D-сцены, интерактивные 3D-объекты, WebGL-фоны.
- `@formkit/auto-animate` — автоматические плавные анимации при добавлении/удалении DOM-элементов без ручной разметки.

### 2.4 Иконки, шрифты, изображения
- **lucide-react**, **Heroicons**, **Phosphor Icons**, **Tabler Icons** — наборы SVG-иконок.
- Шрифты через `next/font` (Google Fonts, без внешних запросов в рантайме) или **Fontsource**.
- **sharp** — оптимизация изображений на сборке/сервере.
- Плейсхолдеры: Unsplash Source, сгенерированные SVG-иллюстрации, `undraw.co`-стиль иллюстраций.

### 2.5 Формы, данные, состояние
- **React Hook Form** + **Zod** — все формы и их валидация (клиент + сервер одной схемой).
- **TanStack Query** (React Query) — загрузка и кэш серверных данных.
- **Zustand** / **Jotai** — простой клиентский стейт (корзина, UI-состояние, темы).

### 2.6 Бэкенд, база данных, авторизация
- Next.js Route Handlers / Server Actions — API-слой без отдельного сервера.
- **Prisma** + PostgreSQL/SQLite, либо **Supabase** — готовая БД + авторизация + storage.
- **Auth.js (NextAuth)**, **Clerk** или **Lucia** — авторизация; пароли хешировать только через `bcrypt`/`argon2`, никогда не писать свою криптографию.
- **Stripe** — платежи и подписки.
- **Resend** или **Nodemailer** — письма с форм обратной связи.

### 2.7 Контент и SEO
- **MDX** (`next-mdx-remote`, Contentlayer) — блог/документация как код.
- `next-seo`, `next-sitemap` — метатеги, `sitemap.xml`, `robots.txt`.
- `@vercel/og` — динамическая генерация Open Graph-картинок.

### 2.8 Качество кода и тесты
- TypeScript strict-mode.
- ESLint + Prettier с базовым конфигом (`eslint-config-next` / `@typescript-eslint`).
- **Vitest** + **Testing Library** — unit/компонентные тесты.
- **Playwright** — e2e-тесты в реальном браузере.

---

## 3. Безопасность: библиотеки и чеклист

Цель — чтобы сгенерированный сайт был безопасен по умолчанию, а не "починен после инцидента".

### 3.1 Зависимости и цепочка поставок
- Перед добавлением пакета проверять: активно ли поддерживается, сколько загрузок, нет ли открытых CVE.
- `npm audit` / `pnpm audit` — регулярно, обязательно перед релизом.
- **Dependabot** или **Renovate** — автоматические PR на обновление зависимостей.
- Коммитить lock-файл (`package-lock.json` / `pnpm-lock.yaml`) — воспроизводимые сборки.
- **gitleaks** / **GitHub secret scanning** — проверка, что в историю коммитов не утекли ключи/токены.

### 3.2 Секреты и конфигурация
- Все ключи и токены — только в `.env`, файл обязательно в `.gitignore`.
- В репозитории — только `.env.example` с именами переменных без значений.
- Валидация переменных окружения на старте приложения через Zod (например `@t3-oss/env-nextjs`), чтобы сайт не запускался с "тихо пустым" секретом.

### 3.3 Валидация и санитизация данных
- Любые пользовательские данные валидировать на сервере через **Zod** — даже если уже провалидированы на клиенте.
- Никогда не доверять `id`/`role`/ценам, пришедшим с клиента — пересчитывать и проверять на сервере.
- **DOMPurify** — санитизация HTML перед рендером, если контент когда-либо приходит от пользователя (комментарии, WYSIWYG, MDX из внешних источников).
- Для MDX/Markdown — `rehype-sanitize`.

### 3.4 HTTP-заголовки и транспорт
- Настроить заголовки безопасности (через `next.config.js` `headers()` или `helmet` для Express):
  - `Content-Security-Policy`
  - `Strict-Transport-Security`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY` (или `frame-ancestors` в CSP)
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` — отключить неиспользуемые API устройства (камера, геолокация и т.д.)
- Только HTTPS, включая редирект с HTTP и HSTS.

### 3.5 Аутентификация и доступ
- Использовать проверенные библиотеки (Auth.js/Clerk/Lucia), не писать свою сессионную логику с нуля.
- Cookies сессий — `HttpOnly`, `Secure`, `SameSite=Lax`/`Strict`.
- CSRF-защита — либо встроенная в auth-библиотеку, либо явные CSRF-токены для form POST вне API с cookie-сессиями.
- Rate limiting на чувствительных эндпоинтах (логин, формы, API) — `@upstash/ratelimit` или `express-rate-limit`.

### 3.6 База данных
- Доступ к БД только через ORM (**Prisma**) с параметризованными запросами — никогда не собирать SQL конкатенацией строк.
- Принцип наименьших привилегий для DB-пользователя приложения.
- Регулярные бэкапы, если есть пользовательские данные.

### 3.7 CI/CD и мониторинг
- В CI: `npm audit`, линт, тесты, типчек — обязательные шаги перед мержем.
- **CodeQL** (GitHub) — статический анализ на уязвимости в PR.
- Логировать ошибки (Sentry или аналог) без утечки PII/секретов в логи.

---

## 4. Быстрый старт нового проекта

```bash
# Next.js + TypeScript + Tailwind
npx create-next-app@latest my-site --typescript --tailwind --eslint --app

cd my-site

# UI-компоненты
npx shadcn@latest init
npx shadcn@latest add button card dialog input tabs accordion navigation-menu sheet toast

# Анимации
pnpm add framer-motion gsap tailwindcss-animate

# Формы и валидация
pnpm add react-hook-form zod @hookform/resolvers

# Данные/состояние
pnpm add @tanstack/react-query zustand

# Тесты
pnpm add -D vitest @testing-library/react @testing-library/jest-dom playwright
```

---

## 5. Финальный чеклист перед сдачей сайта

- [ ] `npm run build` проходит без ошибок и warning'ов
- [ ] ESLint/TypeScript — 0 ошибок
- [ ] Адаптивность проверена на 375 / 768 / 1024 / 1440px, без горизонтального скролла
- [ ] Светлая и тёмная тема работают корректно
- [ ] Анимации плавные, не мешают чтению и не ломают доступность (учтён `prefers-reduced-motion`)
- [ ] Lighthouse: Performance/Accessibility/Best Practices/SEO — все зелёные
- [ ] `npm audit` — нет критичных уязвимостей
- [ ] Секреты не в репозитории, `.env.example` актуален
- [ ] Заголовки безопасности настроены (CSP, HSTS, X-Frame-Options и т.д.)
- [ ] Формы валидируются и на клиенте, и на сервере
- [ ] SEO: метатеги, Open Graph, `sitemap.xml`, `robots.txt` на месте
- [ ] README описывает установку, запуск, сборку, деплой и переменные окружения
