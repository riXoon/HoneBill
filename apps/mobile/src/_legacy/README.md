# _legacy

Backend, Stellar, storage and auth logic from before the frontend-only reset.
Nothing in the live app imports from here, and `tsconfig.json` excludes it.
Use it as a reference when wiring real logic back in.

- `entry.ts` is the old `index.ts` (Stellar SDK patch, polyfills, WalletConnect).
- `context/AuthContext.tsx` is the real provider (stored account, JWT, SEP-10 reauth).
  The live `src/context/AuthContext.tsx` is an in-memory mock with the same interface.
- `services/errorReporting.ts` is a copy; the live one stays in `src/services/`.
- Config read from `process.env` (`EXPO_PUBLIC_*`) lives in `constants/` and the services;
  see `apps/mobile/.env.example`.
- Folders keep their original relative layout, so internal imports still resolve.
