# Incident submit bug

- [x] Inspect admin incident form component and submit flow
- [x] Inspect API route and server-side validation
- [x] Reproduce likely failure from code / local checks
- [x] Implement minimal safe fix
- [x] Run targeted validation (lint/build/test if available)
- [x] Commit changes and capture root cause + hash

## Review
- Root cause: the incident form posted the raw `datetime-local` string directly and always included `resolvedAt`, even for non-resolved incidents. That made the UI/API contract brittle and caused submit failures/misbehavior around the incident payload. Fixed by normalizing the date client-side to ISO and only sending `resolvedAt` when status is `resolved`.
- Validation: local dev server POST smoke against `/api/admin/ops` succeeded for both investigating and resolved incidents; full `next build` is still blocked by an unrelated existing type error in `src/app/api/picks/route.ts` missing required `sportsbook` field.
