# HoneBill

![Status: in development](https://img.shields.io/badge/status-in_development-orange)

> HoneBill is in early development. The product description, branding and mobile UI are being redefined, so everything here may change.

## Repository layout

| Path | What it is |
|---|---|
| `apps/mobile` | Expo / React Native app (Expo SDK 57, React Native 0.86) |
| `apps/backend` | Next.js backend with Prisma |
| `contracts` | Soroban smart contract (Rust) |
| `packages/pijin_core` | Shared TypeScript code |
| `docs` | Project notes, including the UI rebuild plan in `docs/ui-rebuild` |

## Getting started

Requires Node 20.19.4 or newer.

```bash
npm ci                     # install all workspaces
```

**Mobile**

```bash
cp apps/mobile/.env.example apps/mobile/.env
cd apps/mobile
npx expo start -c
```

**Backend**

```bash
cp apps/backend/.env.example apps/backend/.env
npm run dev --workspace=backend
```

## Status

- The mobile UI is being rebuilt from scratch. The previous UI is preserved at the git tag `legacy-ui-v1`.
- Some internal names (storage keys, package id, hosts) still use an earlier project name. See `docs/ui-rebuild/02-clean-slate.md`.

## License

MIT. See [LICENSE](LICENSE).
