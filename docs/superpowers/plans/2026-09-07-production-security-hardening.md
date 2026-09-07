# RPG para Balcões Production Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove temporary/legacy attack surfaces and add regression-tested production hardening without changing current Google/Supabase Balcões authentication.

**Architecture:** Preserve the current Google/Supabase management flow and Balcões operational authorization. Delete disconnected legacy routes instead of trying to patch two authentication architectures. Make inventory authorization fail closed. Add framework-native security headers and CI regression checks.

**Tech Stack:** Next.js 16.2.4, React 19.2.4, Supabase Auth/Postgres, Vercel, Node test runner with tsx.

**Spec:** `docs/superpowers/specs/2026-09-07-production-security-hardening-design.md`

---

### Task 1: Establish RED security regression tests

- [ ] Update `tests/accounts/publicHome.test.ts` so temporary access is forbidden.
- [ ] Update `tests/accounts/temporaryMagicLink.test.ts` so test magic-link artifacts are forbidden.
- [ ] Add `tests/accounts/productionSecurityHardening.test.ts` covering legacy attack-surface removal, personal-email leakage, Google auth preservation, fail-closed inventory authorization and global headers.
- [ ] Run Accounts CI and record expected RED failures against the current implementation.

### Task 2: Remove temporary and legacy attack surfaces

- [ ] Delete `components/accounts/TestGoogleLoginButton.tsx` and its render from `/home`.
- [ ] Delete the temporary magic-link route and callback.
- [ ] Delete disconnected legacy UI: `/cadastro`, `/app`, `/u`, `/t` and legacy MP callback.
- [ ] Delete corresponding legacy APIs: user setup/balance, pay, pix-send, virtual-card, terminal bind/heartbeat and legacy invoice emit.
- [ ] Delete `lib/rate-limit.ts` once no production route imports it.
- [ ] Simplify `proxy.ts` to session refresh only; remove redirects into deleted legacy pages.

### Task 3: Make inventory authorization fail closed

- [ ] Remove `BALCAO_ACCOUNTS_ENFORCED` bypass from `app/inventory-v1/page.tsx`.
- [ ] Remove the bypass from `app/api/inventory/state/route.ts`.
- [ ] Update existing operational-shell tests to require unconditional authorization.

### Task 4: Add browser security headers

- [ ] Add framework-native global headers to `next.config.ts`.
- [ ] Preserve camera permission for barcode scanning and avoid a speculative CSP that would break Google GIS.

### Task 5: CI and dependency/security verification

- [ ] Make the Accounts workflow run on the security branch and execute actual repository tests plus production build.
- [ ] Run the complete test suite.
- [ ] Run production build.
- [ ] Review dependency audit output and fix only applicable production vulnerabilities without blind major-version upgrades.

### Task 6: Final review and integration decision

- [ ] Compare branch to `master` and confirm only intended surfaces changed.
- [ ] Verify GitHub Actions is green on the final commit.
- [ ] Create/review PR only after GREEN.
- [ ] Keep production untouched until integration is explicitly chosen.
