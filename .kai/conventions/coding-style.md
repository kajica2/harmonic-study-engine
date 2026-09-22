# Coding Style

Auto-detected 2026-09-22 from `.prettierrc`, `.editorconfig`, `tsconfig.json`, `AGENTS.md`.

- Prettier: `semi: true`, `singleQuote: false`, `tabWidth: 2`, `trailingComma: all`, `printWidth: 80`, `arrowParens: always`, `endOfLine: lf`
- EditorConfig: `indent_style=space`, `indent_size=2`, `trim_trailing_whitespace=true`, `insert_final_newline=true` (MD exempt from trim)
- TypeScript: `strict: true`, `target ES2022`, `module ESNext`, `jsx: react-jsx`, `moduleResolution: bundler`, `noEmit: true`
- Lint = `tsc --noEmit` only — there is NO eslint
- `@/*` alias resolves to repo ROOT (`.`), not `src/` — rarely used, prefer relative imports
- `console.log/info/debug` banned in `src/` (`tests/no-debug-logs.test.ts`). Only `console.warn/error` allowed.
