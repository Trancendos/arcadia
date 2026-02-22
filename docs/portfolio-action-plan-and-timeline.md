# Portfolio Security, Dependency, and Modularization Action Plan

Generated from `reports/repo-governance-audit.json` on 2026-02-22.

## 1) Current Portfolio Baseline (Evidence)

- Repositories assessed: **95**
- Governance completion baseline: **23.5%**
- Likely skeleton/placeholder repos: **38**
- Missing `SECURITY.md`: **86**
- Missing Dependabot: **76**
- Missing `CODEOWNERS`: **78**
- Missing CI workflow: **54**
- Missing security/CVE workflow: **86**
- Missing LICENSE: **56**

## 2) What Was Implemented in This Repository (`arcadia`)

### Security + Dependency Controls
- Added CVE + compliance workflow:
  - `.github/workflows/security-cve-and-compliance.yml`
- Added PR dependency gate:
  - `.github/workflows/dependency-review.yml`
- Added CodeQL static analysis:
  - `.github/workflows/codeql.yml`
- Added portfolio audit automation:
  - `.github/workflows/repo-governance-audit.yml`
- Added Dependabot policy:
  - `.github/dependabot.yml`
- Added security response policy:
  - `SECURITY.md`
- Added owner assignment:
  - `.github/CODEOWNERS`

### N-0/N-1 and CVE Automation
- Added N-0/N-1 checker:
  - `scripts/check-n-minus-one.mjs`
- Added org-wide governance scanner:
  - `scripts/repo-governance-audit.mjs`
- Added npm scripts:
  - `audit:cve`, `audit:deps`, `check:n-1`, `audit:repos`

### Functional/Build Stability
- Resolved installation blocker from hard workspace dependency on `@trancendos/shared-core`:
  - converted to optional peer dependency
  - added `.npmrc` (`auto-install-peers=false`)
- Added baseline tests:
  - `src/index.test.ts`
- Added `vitest.config.ts` and build cleanup hardening.

## 3) Requirements by Repository Tier

## Tier A - Business-Critical Core (must be first)
Examples: `shared-core`, `central-plexus`, `infrastructure`, `arcadia`, `trancendos-ecosystem`

Required controls:
1. `SECURITY.md`
2. `CODEOWNERS`
3. Dependabot (`npm`/`github-actions` as relevant)
4. CI workflow with tests
5. Security workflow (CVE + SAST)
6. N-0/N-1 dependency policy enforcement in CI
7. Release/versioning policy and SBOM generation (next increment)

## Tier B - Product/Domain Services (the-* and *-ai service repos)
Required controls:
1. Security baseline template from Tier A
2. Contract-first integration (OpenAPI/async schemas/events)
3. Shared-core consumption via versioned package (not `workspace:*`)
4. Drift check against service template monthly

## Tier C - Sandboxes, demos, forks, archival candidates
Required controls:
1. `SECURITY.md` + LICENSE (minimum)
2. Archival flag if inactive/non-production
3. Exemption registry if intentionally not production-hardened

## 4) Gap Review Against Action Plan (Completion Check)

Status at portfolio level:
- **Not complete**: baseline controls are missing in majority of repos.
- Highest-risk group: multiple `the-*` and `*-ai` repos at **0% completion**.

Status in this repo (`arcadia`):
- **Complete for baseline controls** in this branch (pending merge to default branch).

## 5) Merge vs Separate Recommendation

## Keep Separate (modular boundaries should remain)
- `shared-core`: shared contracts/types/utilities
- `infrastructure`: IaC/deployment only
- `central-plexus`/integration hub: orchestration and routing
- user-facing apps (e.g., `arcadia`) as independent deployables

## Candidate Consolidation (to reduce governance overhead)
- The **38 likely skeleton repos** should be evaluated for consolidation:
  - Option 1: merge related low-code repos into a monorepo per domain family.
  - Option 2: keep repos separate but generate from a single template and enforce centrally.
- `the-*` family (16 repos) and `*-ai` family (21 repos) are strong candidates for:
  - shared template standardization immediately,
  - selective merge where repositories have near-identical scaffolding and low unique logic.

## Separation Gaps to Fix
- Repos that still assume local workspace coupling (like prior `workspace:*`) must switch to:
  - published internal package versions, or
  - git/tag-based immutable dependency references.

## 6) What Is Missing From Where

1. **Security policy coverage** missing in most repos (`SECURITY.md`).
2. **Automated update posture** missing in 76 repos (Dependabot absent).
3. **Ownership and approvals** unclear in 78 repos (`CODEOWNERS` absent).
4. **CVE/security pipelines** absent in 86 repos.
5. **License clarity** missing in 56 repos.
6. **Architecture contracts** are not consistently documented between shared/core/integration repos.

## 7) Grand Timeline

## Phase 0 (Week 0-1): Immediate Risk Reduction
- Apply a reusable security template to all Tier A repos.
- Enable Dependabot + dependency review + CodeQL + CVE scan on Tier A.
- Enforce N-0/N-1 policy for Tier A runtime dependencies.

Exit criteria:
- Tier A at >= 85% governance completion.

## Phase 1 (Week 2-4): Portfolio Baseline Rollout
- Roll out template automation to Tier B (`the-*`, `*-ai`).
- Add mandatory `SECURITY.md`, `CODEOWNERS`, LICENSE, CI+security workflows.
- Define integration contracts and versioning for shared-core consumption.

Exit criteria:
- Portfolio baseline >= 60%.
- 100% of active repos have security and dependency automation.

## Phase 2 (Week 5-8): Modularization Correction
- Decide merge/separate per service using usage/activity/ownership metrics.
- Merge low-value skeleton repos or archive them.
- Keep high-value modules separate with strict API/event contracts.

Exit criteria:
- Skeleton repo count reduced materially (target: < 15 active placeholders).

## Phase 3 (Week 9-12): Continuous Governance
- Weekly org audit workflow artifact review.
- Monthly dependency posture review (N-0/N-1 exception board).
- Quarterly architecture review for merge/separate decisions.

Exit criteria:
- Portfolio baseline >= 85%.
- No critical CVEs open beyond SLA.

## 8) Operating Cadence (Proactive Management)

- Weekly:
  - review Dependabot and security scan outcomes
  - triage CVEs by SLA
- Monthly:
  - run and review org governance audit report
  - resolve N-0/N-1 exceptions
- Quarterly:
  - modular architecture fitness review (merge/separate decisions, integration drift)
