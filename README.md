<p align="center">
  <img width="3785" height="789" alt="ClipForge Studio" src="https://github.com/user-attachments/assets/49d72804-9993-49ff-866b-071025fa6be8" />
</p>

<h1 align="center">ClipForge Studio</h1>
<p align="center">
  Премиальный AI-клиппер для Windows/macOS на <b>React + Tauri v2</b> с профессиональным workflow:
  расшифровка → клипы → аналитика → обложки → экспорт.
</p>

<p align="center">
  <img alt="Tauri v2" src="https://img.shields.io/badge/Tauri-v2-1c1f27?style=flat-square&labelColor=0b0d12&color=aeb7c6" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-1c1f27?style=flat-square&labelColor=0b0d12&color=aeb7c6" />
  <img alt="TypeScript 5" src="https://img.shields.io/badge/TypeScript-5.x-1c1f27?style=flat-square&labelColor=0b0d12&color=aeb7c6" />
  <img alt="Rust" src="https://img.shields.io/badge/Rust-stable-1c1f27?style=flat-square&labelColor=0b0d12&color=aeb7c6" />
  <img alt="License" src="https://img.shields.io/badge/Status-Private-1c1f27?style=flat-square&labelColor=0b0d12&color=aeb7c6" />
</p>

---

## Что уже реализовано

| Модуль | Что внутри |
| --- | --- |
| Рабочее пространство | Видео-плеер, semantic transcript blocks, таймлайн, клиппинг по тексту и диапазону |
| AI пайплайн | Моковая расшифровка, хуки, виральный скоринг, контент-план, сегментация серии |
| Экспорт | Пер-клип метаданные, выбор платформ, обложки, batch-export через Rust + FFmpeg |
| Интеграция YouTube | `yt-dlp` probe + download, подхват метаданных видео/канала |
| Состояние проекта | Сохранение workspace state, resume state, черновиков экспорта |
| Desktop UX | Кастомный chrome, уведомления, фоновые задачи, русская локализация |

---

## Технологический стек

### Frontend
- React 19 + TypeScript
- Vite
- Tailwind CSS 4
- shadcn/ui
- Framer Motion
- React Bits (background/motion effects)

### Desktop / Backend
- Tauri v2
- Rust
- SQLite (`rusqlite`)
- `ffmpeg` / `ffprobe`
- `yt-dlp`

---

## Архитектура (high-level)

```text
src/
  app/                    # shell, chrome, глобальная композиция
  features/
    dashboard/            # проекты, новости, аккаунт, настройки
    workspace/            # режимы: editor/clips/export/insights/thumbnails
  shared/
    tauri/                # typed bridge invoke/listen
    ui/                   # toasts, общие ui-обертки

src-tauri/
  src/
    backend.rs            # projects/workspace state/resume state (SQLite)
    tooling.rs            # ytdlp/ffmpeg/install/probe/export commands
    lib.rs                # tauri builder + register commands
  icons/                  # icon set, сгенерированный из cc_logo
```

---

## Быстрый старт

### 1) Установка зависимостей

```bash
npm install
```

### 2) Веб-режим (UI)

```bash
npm run dev
```

### 3) Desktop-режим (Tauri)

```bash
npm run tauri:dev
```

### 4) Production build

```bash
npm run build
npm run tauri:build
```

---

## Runtime tools

Приложение поддерживает три режима работы утилит:

- `managed` — приложение само ставит и обновляет `yt-dlp` / `ffmpeg`
- `custom path` — явный путь к вашим бинарникам
- `system` — использует системные бинарники (если найдены)

Рекомендуемый режим по умолчанию: `managed`.

---

## Экспорт клипов

Экспорт работает через Rust-команду `export_clips_batch`:

1. Для каждого клипа выбираются платформы (TikTok / Shorts / Reels / Telegram).
2. Проставляются title/description/tags.
3. Для каждой платформы задается обложка (генерация или custom).
4. Backend рендерит MP4 через FFmpeg и сохраняет `export-manifest.json`.

---

## Качество кода

- Строгая типизация в frontend и backend bridge
- Минимизация состояния в UI + сохранение сессий
- GPU-friendly motion (`transform`, `opacity`)
- Валидация путей и входных параметров в Rust-командах

---

## Команды разработки

```bash
npm run dev        # Vite dev server
npm run lint       # ESLint
npm run build      # TypeScript + Vite build
npm run preview    # Vite preview
npm run tauri:dev  # Desktop dev
npm run tauri:build
```

---

## Брендинг

- Логотип приложения: `cc_logo`
- App icons (`ico`, `icns`, `png` размеры) сгенерированы из `src-tauri/icons/cc_logo.png`
- Web favicon: `public/cc_logo.svg`, `public/cc_logo.png`

