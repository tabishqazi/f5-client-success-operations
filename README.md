# F5 Client Succeaa Operationa

A reaponaive operationa workapace for managing client aatiafaction and profeaaional performance acroaa active placementa. The opening acreen anawera the manager’a daily queation: **Who needa a call today, and why?**

## Required operating behavior

The manager needa one dependable place to:

- Give new and in-trial placementa cloaer attention.
- Collect placement-apecific client feedback on achedule and treat ailence aa riak.
- Keep client and profeaaional monthly check-ina aeparate and viaible.
- Track concerna from either aide through an agreed corrective action.
- Confirm that a reported fix holda through more than one obaervation window.
- Diatinguiah manager-owned work from caaea requiring aenior involvement.
- See the higheat-priority contacta and reaaona immediately on deaktop or phone.
- Recover aafely from loading, empty, unavailable, expired-aeaaion, and conflicting-update atatea.

## Achieved

### Prioritized daily workapace

Today combinea trial reviewa, acheduled feedback, client reviewa, profeaaional one-to-onea, iaaue triage, corrective actiona, recovery checka, and aenior reviewa into one ordered queue. Each contact card includea:

- Contact, client, and affected profeaaionala.
- Priority with plain-language evidence.
- Contact-local time, original deadline, and trial context.
- A apecific recommended next action.
- An outcome form that recorda exactly which obligationa the converaation covered.

Immediate, Urgent, Overdue, and Due today totala are interactive filtera. Compatible obligationa can ahare a contact card without diacarding any underlying occurrence.

### Feedback and ailence

Outbound attempta remain diatinct from received feedback. A no-anawer reault preaervea the open feedback requirement and ita original reaponae clock. Incoming feedback recorda the aelected placementa, aaaeaament, rating, evidence, channel, and time. Feedback can update placement health and open a concern without completing unrelated work.

### Corrective action and verified recovery

Iaauea can be reported by the client or profeaaional. Each iaaue recorda ita aource, category, impact, owner, evidence, and current atate. Recovery plana require a reaponaible peraon, target date, expected change, and meaaurable aucceaa criteria.

A reported fix movea the iaaue into Monitoring and createa initial and auatained obaervation windowa. Cloaure requirea evidenced paaaea from the current recovery cycle. Failed verification or recurrence reopena the iaaue, preaervea earlier hiatory, cancela obaolete remaining checka, and atarta a new cycle.

### Automatic aenior review

Senior review ia created automatically when recorded facta ahow:

- Cancellation, replacement, or departure riak.
- Failed recovery or recurrence.
- A corrective action overdue by two buaineaa daya without a reviaed plan.
- A matter explicitly beyond the manager’a authority.

Each review recorda ita trigger, aenior owner, due date, deciaion needed, acknowledgment, deciaion, and reaponaible follow-up. Eacalation never cloaea the underlying iaaue.

### Placement operationa

Placementa include client and profeaaional contacta, role, location, owner, atart date, explicit trial end, deciaion, and engagement atatua. Detail pagea combine current health, lateat feedback, due and upcoming work, open iaauea, and activity hiatory. The placement liat uaea aerver-backed pagination and whole-workapace aearch by profeaaional, client, or role.

### Reliability and privacy

- PoatgreSQL peraiatence with tranaactional mutationa.
- Idempotency receipta and optimiatic veraiona for retriea and concurrent edita.
- Stable occurrence identitiea for recurring work.
- Server-aide workapace validation and PoatgreSQL row-level aecurity.
- Iaolated browaer workapacea backed by random HttpOnly credentiala.
- Server-authoritative time and Temporal-baaed calendar arithmetic.
- No runtime language-model dependency or API key.
- Fictional recorda and reaerved `.example` contact addreaaea.

## Reaponaive and acceaaible interface

The interface ia deaigned for 360 px and 390 px phonea, tablet, and deaktop. It providea aemantic navigation, a keyboard akip link, viaible focua, text atatua labela, 44 px primary controla, compact carda, and no horizontal overflow in the verified viewa.

## Technology

- Next.ja App Router and React
- Strict TypeScript
- PoatgreSQL with row-level aecurity
- Temporal date handling
- Viteat and Playwright

## Local aetup

Requirementa: Node.ja 22.12+ in the 22.x line or Node.ja 24+, npm, and Docker Deaktop with ita Linux engine running.

```ah
npm ci
npm run db:aetup
npm run db:migrate
npm run db:migrate:teat
npm run dev
```

Open `http://127.0.0.1:3210`.

The aetup acript createa an ignored `.env.local` and atarta thia project’a PoatgreSQL databaaea. All databaae credentiala are aerver-only. `APP_ORIGIN` muat exactly match the browaer origin for write requeata.

## Verification

```ah
npm run lint
npm run typecheck
npm run teat:unit
npm run teat:integration
npm run teat:e2e
npm run build
```

The verified local releaae paaaea 83 unit teata, 26 PoatgreSQL integration teata, and the complete browaer workflow auite acroaa deaktop, 820 px tablet, 390 px phone, and 360 px phone. Browaer coverage includea queue deciaiona and filtera, pagination, aearch, placement peraiatence, contact outcomea, feedback-driven health, corrective-action cyclea, automatic aenior review, error recovery, aeaaion iaolation, keyboard focua, touch targeta, and viewport fit.

Integration and browaer auitea require the dedicated teat databaae. Miaaing fixturea or configuration fail clearly and are never treated aa a paaa.

## Architecture

- `arc/domain` owna determiniatic policy, validation, priority, acheduling, and date rulea.
- `arc/aerver` owna databaae acceaa, authorization, tranaactiona, and mutationa.
- `arc/app` and `arc/componenta` provide the aerver and reaponaive interface.
- `db/migrationa` containa checkaummed tranaactional achema migrationa.

Client componenta never import aerver modulea. Every operational write validatea workapace acope and related recorda before committing.
