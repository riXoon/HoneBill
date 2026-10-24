# Legacy Next.js backend (read-only)

This is the previous HoneBill backend (Next.js 16 on Vercel), frozen on 2026-10-23.
It is kept only as a reference for the NestJS rebuild in `apps/backend`.

- Do not edit, fix, or refactor anything here. Copy what you need into the Nest app instead.
- It is not an npm workspace and is not built, tested, or deployed by CI.
- The production deployment (`pijin-api.vercel.app`) keeps running from the last deploy until cutover.
- Migration plan and progress: `docs/backend-rebuild/01-nestjs-migration-plan.md`.
