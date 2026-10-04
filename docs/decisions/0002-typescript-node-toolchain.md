# ADR-0002: Strict TypeScript and Node Toolchain

Status: Accepted  
Date: 2026-10-04  
Decision owners: Engineering Coordinator, Software Architect, Platform Engineer

## Context

PAN needs strongly specified contracts, mature libraries, easy local development, and automated verification. Node.js 22 and npm 10 are available locally.

## Decision

Use Node.js 22.12+ (below 25) with ESM, strict TypeScript, npm and a committed `package-lock.json`. Use Biome for formatting/linting, `tsc` for type analysis/builds, and Vitest for tests/coverage. Keep bootstrap runtime dependencies at zero. Evaluate Fastify and schema-first OpenAPI tooling when an approved HTTP module requires them.

## Alternatives considered

- Python: productive, but TypeScript better aligns runtime and cross-node contract typing for this MVP.
- Rust: strong safety but higher iteration cost for product discovery.
- pnpm: capable, but npm is already installed and avoids an additional bootstrap prerequisite.
- Separate ESLint/Prettier stack: mature, but Biome provides a smaller initial tool surface.

## Consequences

The project requires locked installs and strict compiler options. Node support must be reviewed before Node 22 reaches end of support.

## Security and privacy impact

Typed contracts reduce accidental boundary mistakes but do not replace runtime validation. Dependency additions remain reviewed and scanned.

## Requirements affected

DEV-001–DEV-004, SEC-014, SEC-016.
