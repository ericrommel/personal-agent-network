# Personal Agent Network

Personal Agent Network (PAN) explores secure communication between personal AI agents controlled by different people. Its MVP will prove that one agent can return a useful result derived from private context while the receiving person gets only the explicitly authorized disclosure.

The engineering foundation and first functional module, **Identity Model**, are approved and merged. **Privacy-Preserving Discovery** is the active preparation module under [Issue #6](https://github.com/ericrommel/personal-agent-network/issues/6); functional Discovery implementation is not yet authorized.

## Repository map

- `docs/product-overview.md` — product vision and boundaries.
- `docs/product/` — MVP scope, requirements, and acceptance criteria.
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

Never work directly on `main`. Use a focused branch and Pull Request, reference requirement and acceptance-criteria IDs, record consequential decisions in ADRs, and stop at Product Owner gates. See [AGENTS.md](AGENTS.md) and [the development process](docs/engineering/development-process.md).

## Current module

**Privacy-Preserving Discovery** has a preparation package at `Ready for PO`. Functional implementation requires explicit Human Product Owner approval on [Issue #6](https://github.com/ericrommel/personal-agent-network/issues/6).
