# Personal Agent Network

Personal Agent Network (PAN) explores secure communication between personal AI agents controlled by different people. Its MVP will prove that one agent can return a useful result derived from private context while the receiving person gets only the explicitly authorized disclosure.

The bounded MVP is accepted through External AI Integration. Later work stays inside those decisions unless a new Reserved Product Decision is opened.

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

## Current status

Issues #6 through #14 are Done for their accepted bounded slices. The Human Product Owner accepted Authenticated Messaging on 2026-10-09 and the ADR-0008 external-AI availability slice on 2026-10-09. `src/main.ts` prints foundation status and does not listen.

`answerAvailabilityQuestion` returns the authorized public availability object to the local caller. Any model sentence is untrusted display text and does not replace that object. The provider still receives only that public object. No new Reserved Product Decision is open.
