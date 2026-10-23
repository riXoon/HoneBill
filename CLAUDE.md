# HoneBill

## `apps/mobile/src/_legacy` is off-limits unless the user says so

`_legacy` holds the old backend/Stellar/storage/auth logic, kept only as reference for when logic is wired back in after the frontend is built.

- Do not edit, move, rename, delete, format, or refactor anything in `_legacy`, and do not import from it in live code. It is excluded from `tsconfig.json` on purpose.
- Do not "fix" its type errors, stale names, or `process.env` usage, and do not include it in sweeping changes (renames, find-and-replace, lint fixes, dependency cleanups).
- Reading it is fine when the user asks for a reference to it. Otherwise don't look in it for solutions to frontend work; build the frontend against mock data.
- Only when the user explicitly says to use or change `_legacy` (e.g. "use _legacy as reference", "restore the auth logic"), do so, and limit it to what they asked. Copy what's needed into live code rather than importing across the boundary, unless they say to move a folder back.
