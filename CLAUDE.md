# F5 Client Success Operations AI Working Guide

Use this file as the operating contract for an AI coding collaborator. Understand the business workflow before changing code, make one coherent change at a time, and prove the result in the environment where it must work.

## Start with the business outcome

The product exists to answer one question quickly: who needs a call today, and why?

Judge every feature from the operations manager's perspective. The first screen must identify the contact, the affected relationship, the reason for action, the priority, the original deadline, the contact's local date and time, and the recommended next step. Do not add elements that look useful but have no working behavior.

Before implementing a change:

1. Inspect the existing workflow, domain rules, data model, and relevant tests.
2. Translate the request into observable user behavior.
3. Identify the operational facts that must be preserved.
4. Resolve routine implementation choices from the existing architecture.
5. Ask for clarification only when a product decision would materially change the result.

## Work in reviewable stages

Break substantial work into phases with clear acceptance criteria. Complete the requested phase and present it for review before moving to the next one.

Expect hands-on feedback after each stage. Investigate observations from manual use, including small wording and navigation details. A workflow is not finished if the manager must search for context, calculate information manually, or guess what a label means.

When feedback reveals a broader workflow gap, solve the underlying problem rather than patching only the visible symptom. For example:

- Make summary totals filter the queue if they appear interactive.
- Use past tense when a trial date has passed.
- Keep client history accessible at the relationship level, not only through placements.
- Convert supported follow-up language into a reviewable structured-date suggestion.
- Open the issue referenced by a placement instead of showing an unfiltered issue list.
- Display a complete local date and time when a weekday alone is ambiguous.

## Preserve the operating model

Keep scheduling, priority, health, escalation, and issue closure deterministic and explainable. Business defaults belong in the shared policy source, and the Rules page must reflect those same defaults.

Maintain these distinctions:

- A contact attempt is not received feedback.
- Feedback for one placement does not cover another placement automatically.
- Client and professional monthly check-ins are separate obligations.
- Grouping several obligations into one contact card must not discard any occurrence.
- A reported fix is not verified recovery.
- An escalation is not issue completion.
- A senior decision does not close the underlying issue.

Every issue must retain its recovery history. Reporting a fix starts initial and sustained observation windows. Close an issue only after both current-cycle checks pass with evidence. A failed check or recurrence must preserve the previous cycle and create fresh recovery work.

Create senior review from recorded facts, including retention risk, a matter beyond manager authority, failed recovery, recurrence, or an overdue corrective action. Keep the manager responsible until senior ownership is acknowledged.

Use server time as the business authority and Temporal for calendar arithmetic. Do not approximate business days with elapsed hours or rely on the browser clock.

## Follow the technical boundaries

Keep framework-independent rules in the domain layer. Keep database access, authorization, reconciliation, transactions, and mutations on the server. Client components must not import server modules.

Validate the resolved workspace and all related record identifiers on every read and write. Use database transactions for linked operational changes. Protect retries and concurrent actions with stable occurrence identities, idempotency receipts, unique constraints, and optimistic versions.

Keep secrets on the server. Use fictional contact information and reserved domains. Do not publish private plans, supplied source documents, temporary credentials, verification logs, or unrelated project files.

Do not simulate security with a client-side password. The current application uses isolated, server-issued workspace sessions. Organization authentication should be connected to the company's identity provider and role policy when those requirements are defined.

## Verify behavior at the right layer

Choose tests based on the risk of the change:

- Use unit tests for priority, scheduling, date interpretation, health, and lifecycle rules.
- Use PostgreSQL integration tests for transactions, persistence, workspace isolation, idempotency, and concurrency.
- Use browser tests for complete workflows, navigation, retained form input, loading states, empty states, errors, and responsive interaction.
- Check desktop, tablet, 390 px phone, and 360 px phone layouts.
- Run lint, strict TypeScript checking, the relevant automated suites, and the production build.
- Verify the hosted application separately from local behavior.

Never describe an unavailable test as passed. Do not treat a successful unit test as proof of a database or browser workflow. Record what was implemented, what passed locally, what passed when hosted, and any remaining limitation.

## Definition of done

A change is finished when the requested behavior works through the real application path, survives reload where persistence matters, preserves existing obligations and history, handles empty and failure states honestly, remains usable on a phone, and passes the checks appropriate to its risk.

The public product must remain focused on operational work. Keep implementation phases, internal rule identifiers, test controls, and planning language out of the interface. Documentation should explain decisions and boundaries without claiming functionality that has not been verified.

This project was implemented with Codex as the AI coding collaborator. Keep all descriptions of AI use accurate.
