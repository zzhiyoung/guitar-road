<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Launcher maintenance rule (launch-guitar-practice.bat)

The project ships a one-click Windows launcher: `launch-guitar-practice.bat` (manually created desktop shortcut, icon `assets/icon.ico`).

If you change ANY of the following, you MUST update the launcher accordingly and re-test it end to end:

1. `package.json` script names/behavior for `build` or `start`
2. Server port (launcher hardcodes 3000 in the `netstat` check and browser URL)
3. Build output marker (launcher checks `.next\BUILD_ID` to decide whether to build)
4. Node.js version requirements

Re-test checklist after any such change: (a) fresh state without `.next/BUILD_ID`, (b) already-built state, (c) `rebuild` argument. All three must end with http://localhost:3000 serving the app. Use an isolated copy and temporary data; preserve the user's existing build and practice records. Details live in docs/LAUNCHER.md.

# Public repository maintenance

- Keep README.md focused on current behavior. Use docs/README.md as the documentation index; label specifications and proposals as plans rather than completed features.
- Never commit local databases, uploaded scores/PDFs, environment secrets, assistant state, or screenshots of personal practice data. Historical docs/design/ files remain local.
- Keep license notices for every vendored alphaTab script, font and soundfont. Upgrade the npm package and public/alphatab/ together; see THIRD_PARTY_NOTICES.md.
- Before publication, review the exact staged paths and run typecheck and a production build. Do not use destructive demo resets against real practice data.
