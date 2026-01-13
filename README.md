# Courseware Frontend – Vite + Tailwind CSS + Alpine.js + HTMX

This project is a minimal starter for building your courseware frontend with a modern toolchain:

- Vite (dev server & bundler)
- Tailwind CSS (utility-first styling, local build)
- Alpine.js (lightweight reactivity)
- HTMX (server-driven enhancements; already installed, not yet used in the demo)

## Requirements

- Node.js (>= 18 recommended)
- npm
- just (optional, for task automation)

## Setup

```bash
# 1) Install dependencies
just install
# or
npm install

# 2) Start dev server
just dev
# or
npm run dev

# Vite will run on http://localhost:5173
```

## Scripts

Using npm:

- npm run dev – start dev server
- npm run build – build for production (output in dist/)
- npm run preview – preview built assets

Using just:

- just or just dev – dev server
- just install – npm install
- just build – production build
- just preview – preview build
- just clean – remove node_modules and dist

## Files

- index.html
  Root page, lists demo courses using Alpine (demoCourseList).
- course.html
  Simple course view using Alpine (demoCourseView). Replace demo data with your real API calls.
- src/main.js
  Imports Tailwind CSS, wires Alpine and htmx, defines demo Alpine components.
- src/styles.css
  Tailwind directives and a small body tweak.
- tailwind.config.cjs / postcss.config.cjs
  Tailwind + PostCSS config.
- Justfile
  Task shortcuts for install/dev/build/preview/clean.

## Next Steps

1. Replace demo Alpine components (demoCourseList, demoCourseView) in src/main.js with components
   that call your PHP backend (fetch('/courses'), fetch('/courses/:id'), etc.).
2. Add additional pages or HTMX-based partials for quizzes, progress, etc.
3. Integrate this Vite-generated dist/ output into your PHP hosting, or serve it standalone and point it
   at your existing API endpoints.

