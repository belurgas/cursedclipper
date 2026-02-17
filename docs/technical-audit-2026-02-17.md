# Technical Audit - 2026-02-17

## Executive summary
Текущий стек уже близок к рабочему production-пилоту, но были критичные узкие места по производительности persistence-слоя и UX local-import сценария. Основные блокирующие проблемы устранены в этом проходе; ниже список фиксированных и оставшихся рисков.

## Fixed in this iteration

### A-001 (High): Repeated DB bootstrap on every command call
- Location: `src-tauri/src/backend.rs:425`
- Problem: каждый вызов `open_database` заново прогонял schema/migration/seed, что давало лишние блокировки I/O и провоцировало подвисания UI.
- Fix:
  - Введена одноразовая bootstrap-инициализация через `OnceLock<Mutex<bool>>`.
  - Выделена отдельная `initialize_database`.
  - В `open_database` оставлены только connection-level `PRAGMA`.
- Related refs:
  - `src-tauri/src/backend.rs:12`
  - `src-tauri/src/backend.rs:375`
  - `src-tauri/src/backend.rs:425`

### A-002 (Medium): Heavy validation cost while saving workspace state
- Location: `src-tauri/src/backend.rs:1272`
- Problem: перед каждой записью состояния выполнялся полный JSON parse большого payload.
- Fix: удалена лишняя full-parse в `save_project_workspace_state`; сохранён size guard.
- Related ref:
  - `src-tauri/src/backend.rs:1272`

### A-003 (High UX/functional): Local project source not persisted robustly in desktop flow
- Location: `src/features/dashboard/create-project-dialog.tsx`
- Problem: local source строился через blob URL, что ненадёжно для долгосрочного desktop workflow.
- Fix:
  - Добавлен нативный выбор локального файла через Tauri command `pick_local_video_file`.
  - В local desktop flow проект получает `importedMediaPath` (filesystem path), а не только blob URL.
  - Оставлен web fallback через `<input type="file">`.
- Related refs:
  - `src-tauri/src/tooling.rs:1603`
  - `src-tauri/src/lib.rs:41`
  - `src/shared/tauri/backend.ts:466`
  - `src/features/dashboard/create-project-dialog.tsx:34`
  - `src/features/dashboard/create-project-dialog.tsx:140`
  - `src/features/dashboard/create-project-dialog.tsx:495`

### A-004 (Medium performance): Redundant session persistence writes
- Location: `src/features/workspace/workspace-view.tsx`
- Problem: повторные сохранения одинаковых snapshot'ов добавляли лишний IPC/DB шум.
- Fix: добавлены snapshot guards для workspace/resume persistence.
- Related refs:
  - `src/features/workspace/workspace-view.tsx:66`
  - `src/features/workspace/workspace-view.tsx:243`
  - `src/features/workspace/workspace-view.tsx:266`

### A-005 (Low UX): Project cards shadow clipping on dashboard
- Location: `src/features/dashboard/project-card.tsx`, `src/features/dashboard/dashboard-view.tsx`
- Fix:
  - Убрана агрессивная hover-тень у карточек.
  - Разрешён `overflow-x-visible` в основном скролл-контейнере dashboard.
- Related refs:
  - `src/features/dashboard/project-card.tsx:48`
  - `src/features/dashboard/dashboard-view.tsx:120`

### A-006 (Low UX): Format ranking robustness for YouTube quality list
- Location: `src/features/dashboard/create-project-dialog.tsx`
- Fix: `resolutionHeight` теперь корректно учитывает форматы вида `1080p`, не только `1920x1080`.
- Related refs:
  - `src/features/dashboard/create-project-dialog.tsx:76`

## Security review highlights

### S-001 (Medium): CSP disabled in Tauri config
- Location: `src-tauri/tauri.conf.json`
- Status: open
- Note: `app.security.csp = null`. Это допустимо для dev velocity, но для production лучше задать строгий CSP-профиль под финальный набор ресурсов.

### S-002 (Medium): Very broad asset protocol scope
- Location: `src-tauri/tauri.conf.json`
- Status: open
- Note: scope включает широкие пути (`$HOME/**`, `$USERPROFILE/**` и др.). Это повышает blast radius при XSS/renderer compromise.

### S-003 (Low): Browser fallback stores state in localStorage
- Location: `src/shared/tauri/backend.ts:491`
- Status: accepted for web fallback
- Note: для desktop runtime реальная persistence идёт в Rust/SQLite.

## Performance/architecture review highlights

### P-001 (Open): Large single frontend bundle
- Symptom: build warning `>500 kB`.
- Impact: slower cold start, выше нагрузка на memory.
- Recommendation: lazy-load heavy workspace modes (`insights`, `thumbnails`) and settings views.

### P-002 (Open): No automated e2e regression suite
- Impact: high risk of regressions in timeline/transcript sync.
- Recommendation: добавить Playwright smoke flows:
  - create project (local/youtube)
  - open workspace + switch modes
  - transcript select -> timeline reflect
  - create clip -> clip playback bounded

## Next sprint (recommended)
1. Harden security baseline: production CSP + narrowed asset scope strategy.
2. Add lazy loading for non-core modes and settings.
3. Add Playwright critical path tests for editor/timeline/transcript.
4. Add cancellation/abort control for long YouTube downloads in UI.
