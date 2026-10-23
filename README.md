# HoneBill

![Status: in development](https://img.shields.io/badge/status-in_development-orange)

> HoneBill is in early development. The product description, branding and mobile UI are being redefined, so everything here may change.

## Repository layout

| Path | What it is |
|---|---|
| `apps/mobile` | Expo / React Native app (Expo SDK 57, React Native 0.86). Frontend-only for now, no backend calls. |
| `apps/backend` | NestJS backend, not scaffolded yet. See `docs/backend-rebuild`. |
| `apps/_legacy/backend` | Previous Next.js backend. Read-only reference for the NestJS rebuild. |
| `contracts` | Soroban smart contract (Rust) |
| `packages/pijin_core` | Shared TypeScript code (generated contract client) |
| `docs` | Project notes and rebuild plans |

### File structure

```
HoneBill/
├── apps/
│   ├── mobile/                        # Expo / React Native app (npm workspace)
│   │   ├── App.tsx                    # navigation root, no backend wiring
│   │   ├── index.ts                   # entry point
│   │   ├── app.json, eas.json         # Expo / EAS config
│   │   ├── metro.config.js, babel.config.js
│   │   ├── assets/
│   │   ├── scripts/
│   │   └── src/
│   │       ├── components/            # shared UI (ErrorBoundary)
│   │       ├── context/               # AuthContext (in-memory mock)
│   │       ├── screens/               # app screens (v2 UI goes here)
│   │       ├── services/              # errorReporting only
│   │       └── _legacy/               # READ-ONLY: old mobile logic, reference only
│   │           ├── constants/  context/  db/  features/
│   │           ├── hooks/  services/  types/  utils/
│   │           ├── entry.ts           # old index.ts (polyfills, Stellar patch, WalletConnect)
│   │           └── README.md
│   │
│   ├── backend/                       # NestJS backend, created in Phase 1 of the rebuild
│   │
│   └── _legacy/
│       └── backend/                   # READ-ONLY: old Next.js backend, reference only
│           ├── app/                   # API routes (app/api/*) and web pages
│           ├── lib/                   # business logic and tests
│           ├── prisma/                # schema + migrations (to be copied into Nest)
│           ├── scripts/
│           └── LEGACY.md
│
├── contracts/                         # Soroban smart contract (Rust)
│   └── src/                           # lib.rs, test.rs
│
├── packages/
│   └── pijin_core/                    # shared TypeScript contract client (npm workspace)
│
├── docs/
│   ├── ui-rebuild/                    # mobile UI rebuild plans (01–04)
│   ├── backend-rebuild/
│   │   └── 01-nestjs-migration-plan.md   # NestJS migration plan and progress tracker
│   └── *.md                           # other notes
│
├── .github/workflows/                 # backend-ci, mobile-ci, contracts-ci, discord-pr
├── CLAUDE.md                          # rules for AI assistants (incl. the _legacy rule)
└── package.json                       # npm workspaces: apps/mobile, packages/*
```

### About the `_legacy` folders

Both `_legacy` folders hold old code kept **only as a reference**:

- `apps/mobile/src/_legacy`: the old mobile logic (API client, storage, Stellar, auth). Use it when wiring real logic back into the new UI.
- `apps/_legacy/backend`: the old Next.js backend. Use it when porting each endpoint to NestJS.

Rules for both:

- Don't edit, fix, refactor or delete anything inside them.
- Don't import from them. Copy what you need into the live code instead.
- They are not built, type-checked or tested. `apps/mobile/src/_legacy` is excluded from `tsconfig.json`, and `apps/_legacy/backend` is not an npm workspace.

## Getting started

Requires Node 22 (the version CI uses).

```bash
npm ci                     # install all workspaces
```

**Mobile**

The app is frontend-only for now, so it needs no `.env`.

```bash
cd apps/mobile
npx expo start -c
```

**Backend**

The NestJS backend is being rebuilt in `apps/backend`. Progress and setup steps are tracked in [docs/backend-rebuild/01-nestjs-migration-plan.md](docs/backend-rebuild/01-nestjs-migration-plan.md). The old Next.js app in `apps/_legacy/backend` is not part of the workspace and is not meant to be run.

## Status

- **Mobile:** the UI is being rebuilt from scratch, without any backend connection. The previous UI is preserved at the git tag `legacy-ui-v1`.
- **Backend:** being rebuilt from Next.js to NestJS. See the migration plan for which endpoints are done.
- **Naming:** the app identity is now HoneBill. Remaining old names are the current API hosts (`pijin-api.vercel.app`) and the `packages/pijin_core` package.

## License

MIT. See [LICENSE](LICENSE).
