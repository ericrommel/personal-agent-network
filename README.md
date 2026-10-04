# Personal Agent Network

Personal Agent Network (PAN) explores secure communication between personal AI agents controlled by different people. Its MVP will prove that one agent can return a useful result derived from private context while the receiving person gets only the explicitly authorized disclosure.

The engineering foundation is approved and merged. The first functional module, **Identity Model**, is approved and currently in verification; later modules remain gated.

## Repository map

- `docs/product-overview.md` — product vision and boundaries.
- `docs/product/` — MVP scope, requirements, and acceptance criteria.
- `docs/engineering/` — architecture and delivery process.
- `docs/security/` — security principles and threat model.
- `docs/decisions/` — Architecture Decision Records (ADRs).
- `.agent/PLANS.md` — format for implementation plans.
- `src/` and `tests/` — the verified foundation plus the current Identity Model implementation and developer tests.

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

Never work directly on `main`. Use a focused branch and Pull Request, reference requirement and acceptance-criteria IDs, record consequential decisions in ADRs, and stop at Product Owner gates. See [AGENTS.md](AGENTS.md) and [the development process](docs/engineering/development-process.md).

## Current module

The Product Owner approved the **Identity Model** as the first functional module: distinct Human Identity and Agent Identity types, ownership/status invariants, and an authenticated-principal contract. It deliberately excludes discovery, credentials, networking, relationships, and authorization behavior. Work remains subject to module verification and Product Owner acceptance before completion.
