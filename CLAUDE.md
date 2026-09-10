# How I Worked on F5 Client Success Operations

I used Codex as my AI implementation collaborator throughout this project. I treated AI as a working partner that could inspect the codebase, propose technical approaches, implement approved work, run verification, and help diagnose problems. I remained responsible for the product direction, the operational decisions, and whether each result was good enough to move forward.

## Starting with the operating problem

I began by translating the business request into the decisions an operations manager needs to make every day. The central question was simple: who needs a call today, and why? From there, I separated the underlying responsibilities into scheduled client feedback, client and professional check-ins, trial decisions, issue recovery, verification, and senior involvement.

I maintained a detailed implementation plan privately so I could control scope and avoid building disconnected features. I asked Codex to implement the product one phase at a time. After each phase, I opened the application, reviewed the behavior, and decided whether it was ready for the next stage. This kept the work grounded in the manager's actual experience rather than in a feature checklist.

I also made an early architectural decision to keep the operational rules deterministic. Priority, scheduling, escalation, health, and issue closure are derived from recorded facts and explicit policy. The running product does not need a language model to decide whether work is urgent or whether an issue is closed.

## Reviewing the product through real workflows

My review process was hands-on. I used the application as though I were responsible for the client relationships and looked for moments where the interface forced me to remember context or search for information.

For example, I removed internal planning language from the product because it did not help an operations manager make a decision. I asked for the Immediate, Urgent, Overdue, and Due today totals to become working filters instead of decorative statistics. I corrected past trial dates from "Trial ends" to "Trial ended on" because the original wording could misrepresent the current situation.

When I recorded a client conversation, I could find it through a placement but not through a complete client relationship view. That exposed a gap in the original product shape. I expanded the application with a searchable Clients workspace that brings together contacts, placements, open work, feedback, issues, senior reviews, and interaction history without merging evidence from different placements.

I also noticed that notes such as "the client will connect with us on Monday" still required the manager to calculate and enter a date manually. I asked for a follow-up date assistant that interprets supported date language using the server's operating date, presents the result for confirmation, and stores it as structured data. The suggestion never changes the record until the manager confirms it.

Small navigation and language details received the same attention. A Manage issue link originally opened the complete issue list, leaving the manager to find the issue again. I changed the expected behavior so it opens only the referenced issue and provides a clear path back to all issues. Contact cards originally showed only a weekday and time. I asked for the full local weekday, date, year, and time so labels such as "Wednesday" could not be misunderstood.

I considered adding a predefined client-side login to make the interface look more complete. I decided against it because it would add an extra step without providing real access control. The current release uses secure, server-issued workspace sessions and keeps its operational review immediate. Organization authentication should eventually connect to the company's identity provider and role policy rather than simulate security in the browser.

## How responsibilities were divided

I controlled the product goal, scope, sequencing, business judgment, manual review, and acceptance decisions. I decided when a phase could begin, challenged behavior that did not make operational sense, and identified additions that improved the complete workflow.

Codex explored the existing code before changing it, implemented the approved behavior, ran automated checks, inspected responsive layouts, investigated failures, and helped provision and verify the hosted database and deployment. When an implementation or workflow failed, I expected the underlying cause to be corrected and tested rather than hidden by documentation.

## Verification and evidence

I treated implementation and verification as separate claims. Domain tests checked business rules and calendar behavior. PostgreSQL integration tests checked transactions, workspace isolation, idempotency, concurrency, and persistence. Browser tests exercised visible workflows, loading and error states, and responsive behavior. The production build and hosted application were checked separately from the local environment.

I manually reviewed the interface at desktop, tablet, and phone widths, including the compact Today queue and detailed issue workflows. Hosted checks confirmed the public queue, client history, recorded outcomes, focused issue navigation, complete contact-local timestamps, and persisted database state.

I kept detailed plans, working evidence, temporary credentials, and deployment material private. The public repository contains the application, its product documentation, and this account of how I worked. I recorded completion only after the relevant behavior passed in the environment where I claimed it worked.
