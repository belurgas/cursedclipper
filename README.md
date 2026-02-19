<p align="center">
  <img width="3785" height="789" alt="Cursed Clipper" src="https://github.com/user-attachments/assets/49d72804-9993-49ff-866b-071025fa6be8" />
</p>

<h1 align="center">Cursed Clipper</h1>

<p align="center">
  AI-powered desktop video editing for short-form content.<br/>
  Built with <b>React + Tauri v2 + Rust</b> for Windows and macOS.
</p>

<p align="center">
  <img alt="Tauri v2" src="https://img.shields.io/badge/Tauri-v2-1c1f27?style=flat-square&labelColor=0b0d12&color=aeb7c6" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-1c1f27?style=flat-square&labelColor=0b0d12&color=aeb7c6" />
  <img alt="TypeScript 5" src="https://img.shields.io/badge/TypeScript-5.x-1c1f27?style=flat-square&labelColor=0b0d12&color=aeb7c6" />
  <img alt="Rust" src="https://img.shields.io/badge/Rust-stable-1c1f27?style=flat-square&labelColor=0b0d12&color=aeb7c6" />
  <img alt="License MIT" src="https://img.shields.io/badge/License-MIT-1c1f27?style=flat-square&labelColor=0b0d12&color=aeb7c6" />
</p>

## Overview
<img width="4096" height="2731" alt="Group 25" src="https://github.com/user-attachments/assets/7da9d7a2-c610-4d49-8648-25e9cc588ec8" />

Cursed Clipper is a creator-focused workflow for turning long videos into high-performing short clips:

- transcript-aware timeline editing
- AI suggestions (hooks, insights, content ideas)
- per-clip export profiles for Shorts/Reels/TikTok/Telegram
- subtitle and thumbnail tooling
- desktop-native performance via Tauri + Rust

## Tech Stack

- Frontend: React 19, TypeScript, Vite, Tailwind CSS
- Desktop backend: Tauri v2, Rust, SQLite
- Media tooling: `ffmpeg`, `ffprobe`, `yt-dlp`

## Quick Start

```bash
npm install
npm run dev
```

Run desktop mode:

```bash
npm run tauri:dev
```

Production build:

```bash
npm run build
npm run tauri:build
```

## Project Structure

```text
src/
  app/          # app shell and chrome
  features/     # dashboard and workspace modules
  shared/       # i18n, UI primitives, tauri bridge

src-tauri/
  src/backend/  # projects/workspace state (SQLite)
  src/tooling/  # yt-dlp, ffmpeg, import/export pipelines
  src/lib.rs    # tauri setup and command registration
```

## Localization

- Default UI language: English
- Supported languages: English, Russian
- Locale files:
  - `src/shared/i18n/locales/en/common.json`
  - `src/shared/i18n/locales/ru/common.json`

## Open Source Workflow

- Development branch: `dev`
- Stable branch: `main`
- Desktop CI builds run on pushes to `main` only
- CI workflow: `.github/workflows/tauri-cross-platform.yml`

Useful docs:

- `CONTRIBUTING.md`
- `docs/release-checklist.md`
- `docs/branch-protection.md`

## Legal

- Code license: `LICENSE` (MIT)
- Brand/trademark policy: `TRADEMARK_POLICY.md`
