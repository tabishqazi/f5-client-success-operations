# F5 Client Success AI Working Contract

This file records how the project owner and AI collaborator worked together. Detailed internal plans and evidence remain local and are not part of the public source repository.

## Working pattern

1. Convert the product request into explicit workflows and observable success criteria.
2. Record business assumptions before implementation so the interface, scheduler, and tests use one policy.
3. Build one vertical workflow at a time, including persistence, failure behavior, and responsive presentation.
4. Keep operational facts distinct. An attempted contact is not feedback, a reported fix is not recovery, and escalation is not completion.
5. Verify each workflow at the domain, database, API, and browser layers where its risk warrants that coverage.
6. Record what was implemented, what passed locally, what passed when hosted, and what remains unverified.
7. Review the final product from the manager's perspective: the first screen must provide the next decision quickly, and every action must leave trustworthy history.

## Engineering boundaries

- `src/domain` contains deterministic policy, validation, scheduling, priority, and date rules.
- `src/server` owns authorization, database access, transactions, and mutations.
- Client components do not import server modules.
- Business defaults live in `src/domain/policy.ts` and generate the Rules page.
- Temporal handles calendar arithmetic. Browser time is not business authority.
- Every read and write validates the resolved workspace and related records.
- Transactions, occurrence uniqueness, optimistic versions, and idempotency receipts protect concurrent and retried work.
- Fictional data and server-only secrets are used throughout.

## Product invariants

- Every obligation occurrence is preserved.
- Contact grouping is a presentation choice and never permission to discard work.
- Only explicitly covered obligations are satisfied.
- No-answer attempts preserve the feedback clock and open work.
- Client and professional monthly obligations remain independent.
- A reported fix creates initial and sustained observation windows.
- Verified closure requires both current-cycle checks with evidence.
- Failed recovery and recurrence preserve history and begin a fresh cycle.
- Retention risk, failed intervention, overdue action, and beyond-authority cases create senior review automatically.
- Senior acknowledgment and decision never close the underlying issue.
- Errors never appear as empty or successful states.
- Application secrets never use a public environment-variable prefix.

## Verification standard

Run lint, strict typechecking, unit tests, real-database integration tests, responsive browser workflows, and the production build. Use a dedicated test database for destructive fixtures. Check phone widths of 360 px and 390 px, tablet, and desktop. Treat local and hosted verification as separate claims.

## AI use

The project owner chose Codex as the implementation collaborator. Codex helped translate the operating request into rules, implement the application, run tests, inspect responsive behavior, document evidence, and prepare deployment. Core product decisions are deterministic and the running application does not depend on a language-model API.
