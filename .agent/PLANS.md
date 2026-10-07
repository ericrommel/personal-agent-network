# ExecPlans

Substantial modules and cross-cutting changes require a self-contained, living ExecPlan. Store active plans under `.agent/plans/<module>.md`. A new contributor must be able to continue from the plan and repository alone.

Plans do not authorize product scope. Create them after requirements are identified and keep them current as discoveries change the approach.

## Required format

```markdown
# <Module or change>

Status: Draft | In Preparation | Ready for Review | In Development | Code Review | Testing | Engineering Accepted | Complete
Owner roles:
Last updated:

## Objective
## Scope and non-goals
## Requirements and acceptance criteria
## Context and affected components
## Decisions and ADRs
## Security and privacy considerations
## Implementation sequence
## Developer tests
## QE and acceptance verification
## Validation commands
## Risks, assumptions, and open questions
## Progress
- [ ] Timestamped milestone
## Discoveries and decision log
## Handoff and completion evidence
```

Record exact commands and observed results. Update progress, surprises, decisions, and deviations while work proceeds. Do not record Human Product Owner ratification that has not occurred. `Engineering Accepted` and `Complete` may be recorded under delegated authority. Reserved Product Decisions stay open until the Human Product Owner decides them.
