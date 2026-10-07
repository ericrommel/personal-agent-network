# Personal Agent Network

Personal Agent Network (PAN) explores secure communication between personal AI agents controlled by different people. Its MVP will prove that one agent can return a useful result derived from private context while the receiving person gets only the explicitly authorized disclosure.

The engineering foundation, **Identity Model**, **Privacy-Preserving Discovery**, and the approved **Relationships** slice are engineering-accepted. Later modules proceed in parallel when their hard dependencies allow it.

## Repository map

- `docs/product-overview.md` — product vision and boundaries.
- `docs/product/` — MVP scope, requirements, acceptance criteria, and the [Product Review Queue](docs/product/review-queue.md).
- `docs/engineering/` — architecture and delivery process.
- `docs/security/` — security principles and threat model.
- `docs/decisions/` — Architecture Decision Records (ADRs).
- `.agent/PLANS.md` — format for implementation plans.
- `src/` and `tests/` — the verified foundation and accepted Identity Model implementation with developer tests.

## Local development

Prerequisites: Node.js 22.12+ (below 25) and npm 10+.

```bash
npm ci
npm run verify
npm run build
npm start
```

`verify` checks formatting, linting, types, and tests. Use fake or synthetic data only. Copy `.env.example` only if a future approved module introduces configuration; never commit `.env` or credentials.

## Contribution workflow

Never work directly on `main`. Use a focused branch and Pull Request, reference requirement and acceptance-criteria IDs, and record consequential decisions in ADRs. Human Product Owner checkpoints are asynchronous. Continue unless the work is unsafe or a Reserved Product Decision. See [AGENTS.md](AGENTS.md), [the development process](docs/engineering/development-process.md), and [the Product Review Queue](docs/product/review-queue.md).

## Current module

**Privacy-Preserving Discovery** is `Done` on [Issue #6](https://github.com/ericrommel/personal-agent-network/issues/6). The Human Product Owner accepted it on 2026-10-06, and PR #19 is merged. Its scope is limited to pre-seeded, caller-specific resolution of canonicalized ASCII email addresses to opaque caller-scoped references, with uniform negative responses, layered process-local abuse budgets, and fail-closed event acknowledgement.

**Relationships** is `Done` for the approved slice on [Issue #7](https://github.com/ericrommel/personal-agent-network/issues/7). Engineering accepted it under delegated authority in PR #46. Human Product Owner ratification of that completion is still pending. The slice is pre-seeded, directed, node-local, and process-local. It does not include invitation, remote mutation, skill permission, or restart-safe revocation.

**Skills and Policy** is `In Preparation` on [Issue #8](https://github.com/ericrommel/personal-agent-network/issues/8). Authenticated Messaging, Context Boundary, Approval Lifecycle, Audit, and the Two-Node MVP are also in preparation. External AI remains post-core-MVP. Open reserved decisions are listed in the Product Review Queue and block only their own workstreams.
