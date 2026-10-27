<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/banner-dark.png">
  <source media="(prefers-color-scheme: light)" srcset=".github/assets/banner-light.png">
  <img alt="MDHero" src=".github/assets/banner-light.png" width="100%">
</picture>
<br>
A beautiful, native Markdown viewer and lightweight editor for macOS, Windows and Linux. ~8MB. Free. Open source.
<br><br>

[![GitHub Stars](https://img.shields.io/github/stars/vaibhav-kakde-in/mdhero?style=flat-square)](https://github.com/vaibhav-kakde-in/mdhero/stargazers)
[![Downloads](https://img.shields.io/github/downloads/vaibhav-kakde-in/mdhero/total?style=flat-square)](https://github.com/vaibhav-kakde-in/mdhero/releases/latest)
[![License](https://img.shields.io/github/license/vaibhav-kakde-in/mdhero?style=flat-square)](LICENSE)
![macOS](https://img.shields.io/badge/macOS-supported-blue?style=flat-square&logo=apple)
![Windows](https://img.shields.io/badge/Windows-supported-blue?style=flat-square&logo=windows)
![Linux](https://img.shields.io/badge/Linux-supported-blue?style=flat-square&logo=linux)
[![Built with Tauri](https://img.shields.io/badge/Built_with-Tauri-FFC131?style=flat-square&logo=tauri)](https://tauri.app)

[Download](https://github.com/vaibhav-kakde-in/mdhero/releases/latest) · [Website](https://mdhero.app) · [Discussions](https://github.com/vaibhav-kakde-in/mdhero/discussions)

</div>

> [!NOTE]
> **This is a Windows-focused fork of [MDHero](https://github.com/vaibhav-kakde-in/mdhero).**
> MDHero is created and maintained by [Vaibhav Kakde](https://github.com/vaibhav-kakde-in). All credit for the app goes to them and to the upstream contributors; this fork only adds to their work. For the official app, releases, website and support, use the [upstream project](https://github.com/vaibhav-kakde-in/mdhero).

## About this fork

**Windows first.** This fork is developed, built and tested on Windows. The macOS and Linux code from upstream is kept as it is, but it isn't tested here — for those platforms, use the [upstream releases](https://github.com/vaibhav-kakde-in/mdhero/releases/latest).

**What this fork adds:**

| Change | Status |
|---|---|
| **Document templates** — Report, Letter and Memo layouts for the preview and PDF export, chosen with `template:` in frontmatter, from the toolbar, or in Settings; user templates with imported CSS treated as untrusted | Proposed upstream in [#191](https://github.com/vaibhav-kakde-in/mdhero/pull/191) |
| **pnpm 11+ support** — the DOMPurify version pin moved to `pnpm-workspace.yaml`, since newer pnpm no longer reads it from `package.json` | Proposed upstream in [#191](https://github.com/vaibhav-kakde-in/mdhero/pull/191) |
| **Renderer cleanup and LF line endings** — one shared markdown-it setup, and `.gitattributes` so the test suite passes on Windows checkouts | Proposed upstream in [#191](https://github.com/vaibhav-kakde-in/mdhero/pull/191) |
| **Callouts and footnotes** — GitHub-style `> [!NOTE]` / `[!TIP]` / `[!IMPORTANT]` / `[!WARNING]` / `[!CAUTION]` boxes, and `[^1]` footnotes, in the reader view and in templates | On [`feature/callouts-footnotes`](https://github.com/good360-smoulec/mdhero/tree/feature/callouts-footnotes); not yet proposed upstream (it builds on #191) |
| **Page view, headers and footers** — a toolbar toggle shows a templated document as separate pages (Paged.js); Export PDF prints those same pages; templates add running headers and footers with CSS `@page` margin boxes, and the built-ins number their pages | On [`feature/paged-preview`](https://github.com/good360-smoulec/mdhero/tree/feature/paged-preview); not yet proposed upstream (it builds on the callouts branch) |
| **What changed, and document statistics** — when an open file changes on disk, the changed paragraphs are highlighted, with arrows in the status bar to step through them (can be turned off in Settings); the status bar opens a panel with length, reading time, readability, most used words and an explained AI-token estimate | On [`feature/changes-and-stats`](https://github.com/good360-smoulec/mdhero/tree/feature/changes-and-stats); not yet proposed upstream (it builds on the page view branch) |
| **Collapsible sections** — fold a section from the chevron beside its heading or in the outline, in the reader view and in page view; the outline's 1–4 buttons show headings down to a level, and search, links and the outline open whatever section they lead into | On [`feature/collapsible-sections`](https://github.com/good360-smoulec/mdhero/tree/feature/collapsible-sections); not yet proposed upstream (it builds on the changes-and-stats branch) |
| **Accent color** — Settings › Appearance picks the interface color from nine presets or any custom color; tabs, buttons, the outline and dialogs follow it, while documents keep their own colors. Teal stays the default | On [`feature/accent-color`](https://github.com/good360-smoulec/mdhero/tree/feature/accent-color); not yet proposed upstream (it builds on the collapsible-sections branch) |

The aim is to send everything back upstream. This fork's `main` branch is kept identical to upstream; the fork's own changes live on the `windows` branch (the default branch here).

**Installing this fork:** there are no prebuilt releases yet. Build it on Windows with `pnpm install` then `pnpm tauri build`; the installer is written to `src-tauri\target\release\bundle\nsis\`. The installer isn't code-signed, so Windows SmartScreen may ask you to confirm. The app's update check looks at upstream's releases, so installing an update it offers replaces this build with the official version.

**Issues:** problems that also happen in the official app belong in [upstream's issues](https://github.com/vaibhav-kakde-in/mdhero/issues). Please don't report problems with this fork's own features there; comment on the pull request linked above instead.

The rest of this README is upstream's, unchanged.

---

<table>
<tr>
<td><img src=".github/assets/hero-light.png" alt="MDHero Light Mode"></td>
<td><img src=".github/assets/hero-dark.png" alt="MDHero Dark Mode"></td>
</tr>
<tr>
<td align="center"><em>Light mode</em></td>
<td align="center"><em>Dark mode</em></td>
</tr>
</table>

Open local `.md` files, paste AI-generated markdown, or fetch from any public URL — and read or edit it the way it was meant to be.

---

## Why MDHero

Markdown is where developers, writers, and AI live today — READMEs, Claude Code plans, LLM chat exports, notes, documentation. But opening a `.md` file in a code editor gives you ugly monospace text. Opening a web-based viewer means uploading your files. GitHub renders it beautifully but only if the file is in a repo.

**MDHero is a native app for everything in between.** Your files stay local. Rendering is instant. Edit in place when you need to. Works offline. Looks like it belongs on your machine.

---

## Features

### Reading
- **Beautiful rendering** — Apple-inspired typography, light & dark themes
- **Syntax highlighting** — 25+ languages via highlight.js
- **Math & diagrams** — KaTeX for equations, Mermaid for flowcharts
- **Reader controls** — adjust font, size, line height, width
- **Zen mode** — distraction-free full-screen reading
- **Print/Export to PDF** — File › Print or Cmd/Ctrl+P opens the native print dialog (print to paper or to PDF), with clean print styles

### Editing (v0.2.0)
- **Lightweight in-app editor** — `Cmd+E` flips any local file into edit mode
- **Markdown highlighting** — headings, emphasis, links, lists, quotes and code are colored as you type, in light and dark (Settings › Editor to turn it off)
- **Save with `Cmd+S`** — writes back to disk; the file watcher knows it was you and skips the reload
- **Stays where you were** — source-line scroll sync keeps your position across viewer ↔ raw ↔ edit
- **Dirty indicator** — `•` in the tab title and toolbar when you have unsaved changes
- **Per-tab edit state** — switch tabs and back; your edits are right where you left them

### Navigation
- **Multiple tabs** — open many files, drag to reorder, Cmd+1–9 to switch
- **Tabs on the side** — move the tabs into a resizable panel on the left, with a file's folder under its name when another open file has the same name
- **Table of Contents** — auto-generated sidebar with active heading tracking
- **Search (Cmd+F)** — with match highlighting
- **Vim keys** — j/k/gg/G/d/u/[/] for keyboard-first navigation
- **Image lightbox** — click to zoom, arrow keys for next/prev

### Opening Files
- **Local files** — drag-drop, Cmd+O, "Open With" from Finder
- **Pinned folders** — quick access to markdown in your favorite directories
- **Claude Code Plans** — auto-discovers `~/.claude/plans/`
- **Open URL** — fetch from GitHub, Gist, GitLab, Bitbucket, or any public URL
- **Paste mode (Cmd+Shift+V)** — render LLM output instantly, auto-unescapes `\n`
- **Recent files** — pick up where you left off, with reading progress per file

### Live
- **File watching** — edit in VS Code, see updates instantly in MDHero
- **Auto-reload** — survives atomic saves (VS Code, vim, etc.)

### Sharing
- **Copy as Rich Text** — paste directly into Google Docs, Notion
- **Copy as Markdown** — raw source
- **Print / Export PDF** — File › Print, Cmd/Ctrl+P, or the toolbar button; print-friendly output

---

## Screenshots

### Syntax Highlighting

25+ languages with automatic detection, copy button, and clean typography.

<img src=".github/assets/syntax-highlighting.png" alt="Syntax Highlighting" width="800">

### Math Rendering (KaTeX)

Render LaTeX equations instantly — from inline math to full block equations and matrices.

<img src=".github/assets/math-katex.png" alt="KaTeX Math Rendering" width="800">

### Mermaid Diagrams

Flowcharts, sequence diagrams, class diagrams, and more — rendered natively.

<img src=".github/assets/mermaid-flowchart.png" alt="Mermaid Diagrams" width="800">

### Zen Mode

Distraction-free full-screen reading. Just you and the document.

<img src=".github/assets/mermaid-zen.png" alt="Zen Mode" width="800">

---

## Install

**macOS** (Apple Silicon): Download `.dmg` from [Releases →](https://github.com/vaibhav-kakde-in/mdhero/releases/latest)

**Windows** (x64 or ARM64): Download `.msi` or `-setup.exe` from [Releases →](https://github.com/vaibhav-kakde-in/mdhero/releases/latest) — pick the `x64` or `arm64` file for your machine

**Linux** (x64 or arm64): Download `.deb` (Debian/Ubuntu), `.rpm` (Fedora/openSUSE) or `.AppImage` (any distro) from [Releases →](https://github.com/vaibhav-kakde-in/mdhero/releases/latest) — `amd64`/`x86_64` or `arm64`/`aarch64`

Or build from source (see below).

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+O` | Browse files |
| `Cmd+Shift+V` | Paste markdown |
| `Cmd+T` | New tab (home) |
| `Cmd+W` | Close tab (confirms if unsaved edits) |
| `Cmd+1..9` | Switch to tab N |
| `Cmd+F` | Find in document |
| `Cmd+E` | Toggle edit mode |
| `Cmd+S` | Save edits to disk |
| `Cmd+U` | Toggle raw markdown view |
| `Cmd+Shift+F` | Zen mode |
| `Cmd+=` / `Cmd+-` | Zoom in / out |
| `Ctrl` + mouse wheel | Zoom in / out (`Ctrl` on every platform) |
| `Cmd+0` | Reset zoom |
| `j` / `k` | Scroll down / up |
| `gg` / `G` | Jump to top / bottom |
| `[` / `]` | Previous / next heading |
| `/` | Open search |

Cmd → Ctrl on Windows/Linux.

---

## Development

```bash
pnpm install
pnpm tauri dev          # Run dev with hot reload
pnpm tauri build        # Production build (outputs DMG/MSI)
pnpm check              # TypeScript check
```

**Requirements:** Node 22+, Rust stable, pnpm 10+.

Port 1420 is used for dev. Kill stale processes with `lsof -ti:1420 | xargs kill -9`.

### Stack

- [Tauri v2](https://tauri.app) — Rust backend, ~11MB binary
- [SvelteKit](https://kit.svelte.dev) — frontend with Svelte 5 runes
- [markdown-it](https://github.com/markdown-it/markdown-it) — rendering pipeline
- [highlight.js](https://highlightjs.org) — syntax highlighting
- [KaTeX](https://katex.org) — math rendering
- [Mermaid](https://mermaid.js.org) — diagram rendering
- [Tailwind CSS v4](https://tailwindcss.com) — styling

---

## Privacy

MDHero runs entirely on your machine.

- **No telemetry.** No analytics. No tracking.
- **No account required.** Use it anonymously.
- **Your files never leave your computer.** Rendering happens locally.
- **Network access** is limited to: asking GitHub whether there is a newer release (once per 24h, sending nothing about you; you can turn this off in Settings) and fetching URLs you explicitly paste into the Open URL feature. See [SECURITY.md](SECURITY.md#scope) for exactly what each request contains.

---

## Roadmap

**Coming next:**
- Quick Switcher (Cmd+P fuzzy finder)
- Folder watch (auto-refresh pinned folder contents)
- Export to self-contained HTML
- Presentation mode
- Compare / diff view

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, guidelines, and how to propose changes.

---

## License

MIT © Vaibhav Kakde
