# F5 Client Success Operations

A responsive operations workspace for managing client satisfaction and professional performance across active placements. The opening screen answers the manager's daily question: **Who needs a call today, and why?**

**Live application:** [f5-client-success-operations.vercel.app](https://f5-client-success-operations.vercel.app)

## What the application does

The application converts placement dates, contact schedules, client feedback, open issues, corrective actions, verification windows, and senior reviews into one prioritized daily queue. The manager does not need to reconstruct the day from inboxes or remember which follow-up should happen next.

The core workflow is:

1. The scheduling engine creates each required contact or review as a separate obligation.
2. The decision engine evaluates current facts and assigns an explainable priority.
3. The queue groups compatible obligations into practical calls without losing any underlying work.
4. The manager records the result and selects exactly which obligations were covered.
5. Feedback updates placement health and may create a new issue.
6. Issues remain open through corrective action and two recovery checks.
7. The escalation engine creates senior review automatically when recorded facts cross a defined threshold.
8. Every change is stored in a single database transaction with an activity history.

## The morning workspace

Today is the default screen. It shows the highest-priority contact first, together with:

- The person to contact and whether they represent the client, professional, or senior team.
- The client and every affected professional.
- The priority and plain-language evidence behind it.
- The original deadline and any scheduled next-contact date.
- Trial context where it affects the decision.
- The contact's local time and time zone.
- A recommended next action.
- An outcome form containing the exact obligations that the conversation can cover.

Immediate, Urgent, Overdue, and Due today totals are working filters. Selecting a total shows the matching cards and provides a clear way to return to the complete queue. Today and Upcoming are separate views, so future work does not distract from the current day.

The queue is ordered by priority, then by the oldest original deadline. A stable contact identifier resolves the final tie. This gives the same facts the same order on every refresh.

## Scheduling engine

The application maintains a rolling 45-day schedule. Opening the queue reconciles the required occurrences with the database. Each occurrence receives a stable identity, so refreshes, retries, and simultaneous requests cannot create duplicate work.

### Trial attention

- Every placement records an explicit start date and contractual trial end date.
- Trial review is due three business days before the recorded trial end.
- If the trial is shorter than that lead time, review is due on the start date.
- Passing the trial date does not imply approval. The manager must record Continue, Extend, or End placement.
- An extension requires a new explicit trial end date.
- Ending a placement stops future routine obligations while preserving issue and activity history.

### Scheduled client feedback

- During the first 90 calendar days, placement-specific feedback is due on days 3, 7, 14, 28, 42, 56, 70, and 84 after the start date.
- After early care, feedback follows monthly placement anniversaries.
- Each placement has its own feedback requirement, even when several professionals share one client contact.
- Missed occurrences remain due until covered. Completing a late occurrence does not move future anniversaries.

### Routine monthly contact

- Each active client relationship receives a monthly review.
- Each professional receives an independent monthly one-to-one.
- Monthly dates remain anchored to the original relationship date.
- For shorter months, the occurrence falls on that month's final calendar day.
- Client contact never completes the professional's obligation, and professional contact never completes the client's obligation.

### Issue-related work

The scheduler also creates issue triage, corrective-action, recovery-verification, and senior-review obligations. These remain connected to the placement and issue that produced them.

## Decision and prioritization engine

The decision engine is deterministic. It reads stored facts and returns a priority, explanation, original deadline, and next action. It does not call a language model and does not depend on hidden prompts.

| Priority | Meaning | Typical triggers |
|---|---|---|
| Immediate | Act now | Cancellation, replacement, or departure risk; a critical service issue; a matter beyond manager authority |
| Urgent | Protect the relationship today | Trial decision risk; five business days of client silence; failed recovery; recurrence; a corrective action two business days overdue; ordinary work five business days overdue |
| Follow up | Complete overdue or due recovery work | A missed feedback request, expired response window, overdue monthly contact, corrective action, or verification due today |
| Routine | Complete scheduled work | Feedback, trial review, or monthly contact due today without a higher-risk fact |

Priority can only move upward as risk facts accumulate. For example, an overdue feedback request begins as Follow up, becomes Urgent after five business days of silence, and can also become Urgent when it threatens an undecided trial.

The explanation is generated from the triggering facts. Cards therefore show why an item is urgent rather than presenting an unexplained score.

## Contact grouping without lost work

Several obligations may belong to the same person. The queue groups work only when the contact and contact-time bucket match. The resulting card keeps every obligation, placement, professional, reason, and deadline.

The manager explicitly selects what a conversation covered. Unselected obligations remain open. This makes grouping a display convenience rather than a shortcut that silently removes required work.

Contact-time buckets use the contact's IANA time zone:

- Now for weekdays from 9:00 a.m. through 4:59 p.m. local time.
- Later for a weekday before 9:00 a.m. local time.
- Upcoming outside those hours or on weekends.

## Contact outcome engine

The manager records direction, channel, outcome, notes, selected obligations, and any placement-specific feedback.

### No answer

- A no-answer result is allowed only for outbound contact.
- It records the attempt but does not complete the selected work.
- For feedback outreach, the first outbound request starts the response clock.
- Later reminders preserve the first-request timestamp and do not restart the clock.

### Rescheduled

- Rescheduling requires a reason.
- The new date must be in the future and no more than five business days away.
- The original deadline remains unchanged and visible.
- Immediate and Urgent work cannot be hidden by rescheduling.

### Follow-up date assistant

When eligible contact notes contain a supported date phrase, the interface offers a structured follow-up date. Supported language includes weekday names, today, tomorrow, next business day, relative calendar or business days, and explicit month-and-day dates. A bare weekday means its nearest future occurrence, while `next` followed by a weekday means that day in the following Monday-to-Sunday week. For example, from Wednesday, September 9, 2026, `Monday` resolves to September 14 and `next Thursday` resolves to September 17.

Resolution is deterministic and uses the server-provided Eastern operating date. It does not depend on the browser clock or a runtime language-model call. The manager must select the suggestion before it changes the outcome to Rescheduled or fills the next-contact date. The interface then shows a visible confirmation, while the server still validates the selected obligation and five-business-day limit. Saving preserves the exact notes, original deadline, and confirmed structured date. Immediate and Urgent work remains in Today even when a later contact date is recorded.

### Reached

- Only selected obligations are completed.
- A selected client-feedback obligation requires feedback for its specific placement.
- A shared client call can save separate feedback for several professionals.
- The interaction, coverage, feedback, resulting issues, obligation updates, and activity entries commit together.

## Feedback and placement health

Feedback records the placement, client contact, satisfaction classification, optional 1-to-5 rating, notes, channel, and received time.

The health engine derives a visible status from current evidence:

| Health | Decision |
|---|---|
| At risk | The latest client assessment is Unsatisfied, or a critical issue is unresolved |
| Needs attention | The client is Concerned, the latest rating is 3, an issue remains active, or feedback is overdue |
| Unknown | Current client feedback has not been recorded |
| Healthy | Current feedback is positive and no active concern remains |

A Concerned or Unsatisfied assessment, or a rating of 3 or below, creates an issue for triage. An Unsatisfied rating of 1 creates a high-severity issue. Positive feedback can support recovery evidence, but it cannot close an issue by itself.

## Issue and recovery engine

An issue records the reporting side, category, severity, description, placement, manager owner, current state, and recovery cycle.

The lifecycle is:

```text
Open or Reopened
    -> Action agreed
    -> Monitoring
    -> Initial verification passed
    -> Sustained verification passed
    -> Verified closed
```

### Triage and corrective action

- A critical issue is due for triage immediately.
- Other issues are due within one business day.
- Moving to Action agreed requires an accountable person, the agreed action, a target date, and measurable verification criteria.
- Reporting a fix requires evidence. It moves the issue to Monitoring rather than closing it.

### Recovery verification

- The initial observation window is three business days after the reported fix.
- The sustained observation window is ten business days after the reported fix.
- Passing a check before its window opens is rejected.
- The sustained check cannot pass until the initial check has passed.
- Final confirmation must come from the same side that reported the issue.
- An inconclusive check keeps the obligation open and schedules another contact for one business day later.
- A failed check cancels obsolete checks, preserves the complete cycle, reopens the issue, and requires a new recovery plan.
- A recurrence after verified closure also reopens the issue in a new cycle.

Closure occurs only after both current-cycle checks pass with evidence. Earlier cycles remain in history.

## Automatic escalation engine

Escalation is driven by recorded facts. A manager does not need to remember to press an escalation button.

Senior review is created when any of these conditions is true:

1. **Retention threat:** the client requests cancellation or replacement, or the professional indicates departure risk.
2. **Beyond authority:** the issue is explicitly marked as requiring a senior-led response.
3. **Failed intervention:** a recovery check fails or a verified issue recurs.
4. **Action overdue:** the agreed corrective action is at least two business days overdue without a revised plan.

Retention threats and beyond-authority cases are Immediate and due at once. Failed interventions and overdue actions are Urgent and due by the next business day.

Each escalation is unique to its issue, recovery cycle, and reason. The record contains:

- The trigger and supporting evidence.
- The assigned senior owner.
- The decision being requested.
- The due date.
- Acknowledgment time and owner.
- The senior decision.
- The follow-up owner and action.

The senior owner must acknowledge the review before recording a decision. Recording that decision completes the senior-review obligation, but it never closes the underlying issue. The issue continues through its own recovery lifecycle.

## Calendar and time engine

- Server time is the business authority.
- The operating calendar uses `America/New_York`.
- Routine obligations are due at 5:00 p.m. Eastern time.
- Saturday and Sunday deadlines move to Monday.
- Public holidays are currently treated as working days.
- Calendar-day schedules and business-day deadlines use separate calculations.
- Monthly anniversaries always use the original anchor rather than a previously shortened month.
- Ambiguous or nonexistent local times during daylight-saving transitions are rejected instead of silently shifted.
- Contact cards show the contact's local time while preserving the Eastern operating deadline.

## Placement operations

The Placements area supports creation, editing, detail views, and activity history. A placement contains the client, client contact, professional, role, location, owner, start date, explicit trial end, trial decision, and engagement status.

The list uses server-side pagination with nine records per page. Search runs across the complete workspace by client, professional, or role before pagination is applied. Shared client-contact changes propagate consistently to every placement for that client.

## Client operations

The Clients area provides a relationship-level view across every placement connected to a company. The paginated directory can be searched by company, client contact, professional, or role. Each client card shows active placements, open issues, open follow-ups, the last recorded contact, and the highest current attention state derived from placement health.

The client detail page brings together:

- client contact information and relationship ownership;
- active, scheduled, and ended placements without merging their evidence;
- the highest current placement risk with a plain-language explanation;
- open client obligations and their original deadlines;
- the complete client contact history, including monthly interactions that are not attached to one placement;
- placement-specific feedback;
- active and closed issues;
- senior-review status and direct links into a focused issue workflow.

Today cards, placement details, and issue cards link back to the relevant client relationship. This keeps a completed interaction discoverable after its obligation leaves the daily queue.

## Product boundaries

Authentication and administration are intentional boundaries for this release. The application uses isolated, secure, server-issued workspace sessions so the operating workflows are immediately accessible. In an organization rollout, those sessions would connect to the company's identity provider and role model. Account provisioning, role administration, record deletion, and bulk operations depend on company-specific access, retention, and audit policies. They have deliberately not been represented by a fixed client-side password that would not provide real access control.

## Persistence, concurrency, and isolation

PostgreSQL is the system of record. Operational changes use database transactions so related writes either succeed together or leave no partial state.

- Random idempotency keys protect retried submissions from duplication.
- A request hash prevents the same key from being reused for different data.
- Optimistic record versions reject stale edits and concurrent workflow transitions.
- Unique occurrence keys protect recurring schedules from duplicate generation.
- Composite foreign keys keep related records inside the same workspace.
- PostgreSQL row-level security provides a second scope boundary beneath application checks.
- Every operational read and write resolves and validates the current workspace.

On first visit, the server creates an isolated workspace with realistic fictional placement scenarios. The browser receives a random 256-bit credential in an HttpOnly, SameSite=Strict cookie. Only a SHA-256 hash of that credential is stored. Sessions expire after seven calendar days, and a separate browser profile receives a separate workspace.

All contact addresses use the reserved `.example` domain. Database credentials remain server-side and never use a public environment-variable prefix.

## Loading, empty, and error behavior

The interface distinguishes:

- Initial loading from an empty workspace.
- An all-clear day from a workspace with no placements.
- First-load failure from a failed background refresh.
- An expired session from a general service error.
- A stale version conflict from an invalid form.
- A failed save from a successful outcome.

Forms retain entered values after recoverable failures. The interface never reports an error as an empty or successful state.

## Responsive and accessible interface

The interface is designed for 360 px and 390 px phones, an 820 px tablet, and desktop. It provides semantic navigation, a keyboard skip link, visible focus, text status labels, 44 px primary controls, compact cards, and no horizontal overflow in verified views.

## Technology

- Next.js App Router and React
- Strict TypeScript
- PostgreSQL with row-level security
- Temporal date handling
- Vitest and Playwright

## Local setup

Requirements: Node.js 22.12+ in the 22.x line or Node.js 24+, npm, and Docker Desktop with its Linux engine running.

```sh
npm ci
npm run db:setup
npm run db:migrate
npm run db:migrate:test
npm run dev
```

Open `http://127.0.0.1:3210`.

The setup script creates an ignored `.env.local` and starts the project's PostgreSQL databases. `APP_ORIGIN` must exactly match the browser origin for write requests.

## Verification

```sh
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
```

The verified local release passes 94 unit tests, 29 PostgreSQL integration tests, and 80 browser workflow cases across desktop, tablet, 390 px phone, and 360 px phone. Coverage includes queue decisions and filters, client and placement pagination and search, complete client history, placement persistence, confirmed follow-up dates, contact outcomes, feedback-driven health, corrective-action cycles, automatic senior review, error recovery, session isolation, keyboard focus, touch targets, and viewport fit.

Integration and browser suites require the dedicated test database. Missing fixtures or configuration fail clearly and are never treated as a pass.

## Code structure

- `src/domain` owns deterministic policy, validation, priority, scheduling, health, issue-lifecycle, and date rules.
- `src/server` owns database access, workspace authorization, reconciliation, transactions, and mutations.
- `src/app` and `src/components` provide the server routes and responsive interface.
- `db/migrations` contains transactional schema migrations with verified checksums.

Client components never import server modules. This keeps business decisions independently testable and keeps credentials and database access on the server.
