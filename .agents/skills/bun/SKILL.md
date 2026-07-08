---
name: Bun
description: Use when building and running JavaScript/TypeScript applications, managing dependencies, bundling code, testing, or creating HTTP servers. Bun is a fast all-in-one JavaScript runtime, package manager, bundler, and test runner that replaces Node.js, npm, and other tools.
metadata:
    mintlify-proj: bun
    version: "1.0"
---

# Bun Skill

## Product summary

Bun is a fast, all-in-one JavaScript runtime and toolkit written in Rust. It replaces Node.js for running code, npm/yarn/pnpm for package management, esbuild for bundling, and Jest for testing. Key files: `bunfig.toml` (configuration), `package.json` (dependencies and scripts), `bun.lock` (lockfile). Primary CLI commands: `bun run`, `bun install`, `bun build`, `bun test`. Bun uses the JavaScriptCore engine (faster than V8) and transpiles TypeScript/JSX on the fly. Primary docs: https://bun.com/docs

## When to use

- **Running code**: Execute JavaScript/TypeScript files with `bun run` or `bun <file>` — 4x faster startup than Node.js
- **Managing dependencies**: Use `bun install`, `bun add`, `bun remove` instead of npm/yarn/pnpm — 25x faster installations
- **Bundling**: Use `bun build` to bundle JavaScript/TypeScript for browsers or servers
- **Testing**: Run tests with `bun test` — Jest-compatible API with built-in support for TypeScript, snapshots, mocks, and watch mode
- **Building HTTP servers**: Use `Bun.serve()` to create fast HTTP servers with built-in routing
- **Package scripts**: Execute `package.json` scripts with `bun run <script>` — 28x faster than npm run
- **Monorepos**: Use `bun install --filter` to manage workspaces and run scripts across packages

## Quick reference

### Essential CLI commands

| Command | Purpose |
|---------|---------|
| `bun run <file>` | Execute a JavaScript/TypeScript file |
| `bun run <script>` | Run a package.json script |
| `bun install` | Install all dependencies |
| `bun add <package>` | Add a dependency |
| `bun remove <package>` | Remove a dependency |
| `bun build <entry> --outdir <dir>` | Bundle code for production |
| `bun test` | Run tests matching `*.test.ts` or `*.spec.ts` patterns |
| `bun init` | Initialize a new Bun project |

### Configuration file: bunfig.toml

Place in project root alongside `package.json`. Optional but useful for Bun-specific settings.

```toml
[install]
linker = "hoisted"  # or "isolated" for monorepos
optional = true
dev = true

[test]
coverage = false
timeout = 5000

[run]
shell = "system"  # or "bun" on Windows
```

### File type support

Bun transpiles on the fly:
- `.js`, `.jsx`, `.ts`, `.tsx` — TypeScript/JSX with no config
- `.json`, `.toml`, `.yaml` — Parsed and inlined at build time
- `.html`, `.css` — Bundled as assets
- `.wasm`, `.node` — Supported natively

### Environment variables

Bun loads `.env` files automatically in this order:
1. `.env`
2. `.env.production` / `.env.development` / `.env.test` (based on NODE_ENV)
3. `.env.local`

Access via `process.env`, `Bun.env`, or `import.meta.env`.

## Decision guidance

| Scenario | Use | Why |
|----------|-----|-----|
| Running a single script | `bun run file.ts` | Faster startup, no config needed |
| Running package scripts | `bun run <script>` | 28x faster than npm run |
| Installing dependencies | `bun install` | 25x faster, creates `bun.lock` |
| Bundling for browser | `bun build --target browser` | Optimizes for browser export conditions |
| Bundling for server | `bun build --target bun` | Adds `// @bun` pragma, optimizes for Bun runtime |
| Testing with Jest API | `bun test` | Built-in, no setup needed |
| Building HTTP server | `Bun.serve()` | Native, no Express/Hono needed for simple cases |
| Monorepo management | `bun install --filter` | Installs dependencies for specific packages |
| Production install | `bun install --production` | Skips devDependencies |
| Frozen lockfile (CI) | `bun ci` | Equivalent to `bun install --frozen-lockfile` |

## Workflow

### 1. Initialize a project
```bash
bun init my-app
cd my-app
```
Choose template: Blank, React, or Library. Creates `package.json`, `tsconfig.json`, `bunfig.toml`.

### 2. Install dependencies
```bash
bun install
bun add react zod
bun add -d @types/node typescript
```
Creates `bun.lock` (commit to version control). Use `--filter` in monorepos.

### 3. Write code
- Create `.ts` or `.tsx` files — Bun transpiles automatically
- Use `import` for ES modules, `require` for CommonJS
- Import JSON/TOML/YAML files directly — parsed at build time
- Use `Bun.serve()` for HTTP servers, `Bun.file()` for file I/O

### 4. Run code
```bash
bun run src/index.ts
bun --watch src/index.ts  # Watch mode
bun run dev  # Run package.json script
```

### 5. Bundle for production
```bash
bun build src/index.ts --outdir dist
bun build src/index.ts --outdir dist --minify  # Minify
bun build src/index.ts --outfile app --compile  # Standalone executable
```

### 6. Test
```bash
bun test
bun test --watch
bun test --coverage
```
Tests auto-discover `*.test.ts`, `*.spec.ts` files. Use `import { test, expect } from "bun:test"`.

### 7. Configure (optional)
Create `bunfig.toml` for Bun-specific settings. Most projects work without it.

## Common gotchas

- **Bun flags before command**: Use `bun --watch run dev`, not `bun run dev --watch`. Flags after the command are passed to the script.
- **TypeScript errors on Bun global**: Install `@types/bun` and add `"lib": ["ESNext"]` to `tsconfig.json` compilerOptions.
- **Auto-install disabled in CI**: Set `install.auto = "disable"` in `bunfig.toml` or use `bun ci` instead of `bun install` for reproducible builds.
- **Lifecycle scripts not executed**: Bun doesn't run `postinstall` scripts for security. Add packages to `trustedDependencies` in `package.json` to allow them.
- **Node.js shebang in scripts**: Use `bun run --bun <script>` to run Node.js-shebang CLIs with Bun instead of Node.js.
- **Lockfile format changed**: Bun v1.2+ uses text `bun.lock` by default (not binary `bun.lockb`). Upgrade with `bun install --save-text-lockfile --frozen-lockfile --lockfile-only`.
- **Phantom dependencies in hoisted mode**: Use `linker = "isolated"` in `bunfig.toml` for monorepos to prevent importing undeclared packages.
- **Environment variables not loaded**: Ensure `.env` files exist and `env = true` in `bunfig.toml` (default). Disable with `env = false` in production.
- **Test discovery fails**: Ensure test files match patterns: `*.test.ts`, `*_test.ts`, `*.spec.ts`, `*_spec.ts`.
- **Bundle size larger than expected**: Use `--minify`, `--external` for dependencies, or `--packages external` to exclude all node_modules.

## Verification checklist

Before submitting work with Bun:

- [ ] Run `bun install` to verify dependencies resolve without errors
- [ ] Run `bun run <script>` to verify package.json scripts execute
- [ ] Run `bun test` to verify all tests pass
- [ ] Run `bun build` to verify bundling succeeds without errors
- [ ] Check `bun.lock` is committed to version control (for reproducible installs)
- [ ] Verify `bunfig.toml` settings match project requirements (linker strategy, test config, etc.)
- [ ] Test with `bun --watch` to verify watch mode works for development
- [ ] Verify TypeScript/JSX transpiles without errors (check for missing type definitions)
- [ ] For HTTP servers: test routes with `curl` or browser to verify responses
- [ ] For monorepos: verify `--filter` works for installing and running scripts in specific packages

## Resources

- **Comprehensive navigation**: https://bun.com/docs/llms.txt — Complete page-by-page listing for agent navigation
- **Runtime API**: https://bun.com/docs/runtime/index — Execute files, run scripts, environment variables
- **Package Manager**: https://bun.com/docs/pm/cli/install — Install, add, remove, manage dependencies
- **Bundler**: https://bun.com/docs/bundler/index — Bundle code, configure output, optimize for production

---

> For additional documentation and navigation, see: https://bun.com/docs/llms.txt