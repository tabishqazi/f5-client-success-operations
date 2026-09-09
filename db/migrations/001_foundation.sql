CREATE SCHEMA f5;
REVOKE ALL ON SCHEMA f5 FROM PUBLIC;

CREATE TABLE f5.workspaces (
 id uuid PRIMARY KEY, policy_version text NOT NULL, seed_version text,
 seed_date date, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE f5.sessions (
 token_hash text PRIMARY KEY CHECK (length(token_hash)=64),
 workspace_id uuid NOT NULL REFERENCES f5.workspaces(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry_idx ON f5.sessions(expires_at);
CREATE TABLE f5.rate_limits (
 bucket text PRIMARY KEY, count integer NOT NULL CHECK(count>0), resets_at timestamptz NOT NULL
);

CREATE TABLE f5.operators (
 workspace_id uuid NOT NULL REFERENCES f5.workspaces(id) ON DELETE CASCADE,
 id uuid NOT NULL, name text NOT NULL, role text NOT NULL CHECK(role IN ('manager','senior')),
 PRIMARY KEY(workspace_id,id)
);
CREATE TABLE f5.clients (
 workspace_id uuid NOT NULL REFERENCES f5.workspaces(id) ON DELETE CASCADE,
 id uuid NOT NULL, name text NOT NULL, owner_id uuid NOT NULL, cadence_anchor date NOT NULL,
 PRIMARY KEY(workspace_id,id), FOREIGN KEY(workspace_id,owner_id) REFERENCES f5.operators(workspace_id,id)
);
CREATE TABLE f5.professionals (
 workspace_id uuid NOT NULL REFERENCES f5.workspaces(id) ON DELETE CASCADE,
 id uuid NOT NULL, name text NOT NULL, role text NOT NULL, location text NOT NULL,
 cadence_anchor date NOT NULL,
 PRIMARY KEY(workspace_id,id)
);
CREATE TABLE f5.contacts (
 workspace_id uuid NOT NULL REFERENCES f5.workspaces(id) ON DELETE CASCADE,
 id uuid NOT NULL, name text NOT NULL, side text NOT NULL CHECK(side IN ('client','professional','senior')),
 client_id uuid, professional_id uuid, operator_id uuid,
 email text NOT NULL, phone text, time_zone text NOT NULL,
 preferred_start time NOT NULL DEFAULT '09:00', preferred_end time NOT NULL DEFAULT '17:00',
 PRIMARY KEY(workspace_id,id),
 FOREIGN KEY(workspace_id,client_id) REFERENCES f5.clients(workspace_id,id),
 FOREIGN KEY(workspace_id,professional_id) REFERENCES f5.professionals(workspace_id,id),
 FOREIGN KEY(workspace_id,operator_id) REFERENCES f5.operators(workspace_id,id),
 CHECK ((side='client' AND client_id IS NOT NULL AND professional_id IS NULL AND operator_id IS NULL)
 OR (side='professional' AND professional_id IS NOT NULL AND client_id IS NULL AND operator_id IS NULL)
 OR (side='senior' AND operator_id IS NOT NULL AND client_id IS NULL AND professional_id IS NULL))
);
CREATE TABLE f5.placements (
 workspace_id uuid NOT NULL REFERENCES f5.workspaces(id) ON DELETE CASCADE,
 id uuid NOT NULL, client_id uuid NOT NULL, professional_id uuid NOT NULL, owner_id uuid NOT NULL,
 start_date date NOT NULL, trial_end date NOT NULL CHECK(trial_end>=start_date),
 trial_decision text NOT NULL DEFAULT 'pending' CHECK(trial_decision IN ('pending','continue','extend','end_placement')),
 status text NOT NULL CHECK(status IN ('scheduled','active','ended')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,id),
 FOREIGN KEY(workspace_id,client_id) REFERENCES f5.clients(workspace_id,id),
 FOREIGN KEY(workspace_id,professional_id) REFERENCES f5.professionals(workspace_id,id),
 FOREIGN KEY(workspace_id,owner_id) REFERENCES f5.operators(workspace_id,id),
 CHECK(status<>'ended' OR trial_decision='end_placement')
);
CREATE INDEX placements_list_idx ON f5.placements(workspace_id,status,start_date);
CREATE UNIQUE INDEX one_current_placement_per_professional ON f5.placements(workspace_id,professional_id) WHERE status<>'ended';

CREATE TABLE f5.issues (
 workspace_id uuid NOT NULL REFERENCES f5.workspaces(id) ON DELETE CASCADE,
 id uuid NOT NULL, placement_id uuid NOT NULL, reporter_contact_id uuid NOT NULL, owner_id uuid NOT NULL,
 category text NOT NULL CHECK(category IN ('performance','attendance','communication','client_relationship','professional_concern','other')),
 severity text NOT NULL CHECK(severity IN ('normal','high','critical')),
 description text NOT NULL, state text NOT NULL CHECK(state IN ('open','action_agreed','monitoring','reopened','verified_closed')),
 agreed_action text, verification_criteria text, target_at timestamptz, fix_reported_at timestamptz,
 fix_cycle integer NOT NULL DEFAULT 1 CHECK(fix_cycle>0), version integer NOT NULL DEFAULT 1,
 closed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,id),
 FOREIGN KEY(workspace_id,placement_id) REFERENCES f5.placements(workspace_id,id),
 FOREIGN KEY(workspace_id,reporter_contact_id) REFERENCES f5.contacts(workspace_id,id),
 FOREIGN KEY(workspace_id,owner_id) REFERENCES f5.operators(workspace_id,id),
 CHECK(state NOT IN ('action_agreed','monitoring','verified_closed') OR (agreed_action IS NOT NULL AND verification_criteria IS NOT NULL AND target_at IS NOT NULL)),
 CHECK(state NOT IN ('monitoring','verified_closed') OR fix_reported_at IS NOT NULL),
 CHECK(state<>'verified_closed' OR closed_at IS NOT NULL)
);
CREATE INDEX issues_state_idx ON f5.issues(workspace_id,state,target_at);

CREATE TABLE f5.obligations (
 workspace_id uuid NOT NULL REFERENCES f5.workspaces(id) ON DELETE CASCADE,
 id uuid NOT NULL, type text NOT NULL CHECK(type IN ('trial_review','client_feedback','client_monthly','professional_monthly','issue_triage','corrective_action','verification','senior_review')),
 placement_id uuid, client_id uuid, professional_id uuid, issue_id uuid,
 contact_id uuid NOT NULL, occurrence_key text NOT NULL, policy_version text NOT NULL,
 due_at timestamptz NOT NULL, next_contact_at timestamptz,
 state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','satisfied','superseded','canceled')),
 state_reason text, satisfied_at timestamptz,
 PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,type,occurrence_key),
 FOREIGN KEY(workspace_id,placement_id) REFERENCES f5.placements(workspace_id,id),
 FOREIGN KEY(workspace_id,client_id) REFERENCES f5.clients(workspace_id,id),
 FOREIGN KEY(workspace_id,professional_id) REFERENCES f5.professionals(workspace_id,id),
 FOREIGN KEY(workspace_id,issue_id) REFERENCES f5.issues(workspace_id,id),
 FOREIGN KEY(workspace_id,contact_id) REFERENCES f5.contacts(workspace_id,id),
 CHECK(placement_id IS NOT NULL OR client_id IS NOT NULL OR professional_id IS NOT NULL OR issue_id IS NOT NULL),
 CHECK(state<>'satisfied' OR satisfied_at IS NOT NULL)
);
CREATE INDEX obligations_due_idx ON f5.obligations(workspace_id,state,due_at);
CREATE TABLE f5.feedback_requests (
 workspace_id uuid NOT NULL REFERENCES f5.workspaces(id) ON DELETE CASCADE,
 id uuid NOT NULL, placement_id uuid NOT NULL, obligation_id uuid NOT NULL,
 first_requested_at timestamptz NOT NULL, response_deadline timestamptz NOT NULL,
 channel text NOT NULL CHECK(channel IN ('phone','email','meeting','other')),
 PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,obligation_id),
 FOREIGN KEY(workspace_id,placement_id) REFERENCES f5.placements(workspace_id,id),
 FOREIGN KEY(workspace_id,obligation_id) REFERENCES f5.obligations(workspace_id,id)
);
CREATE TABLE f5.feedback_responses (
 workspace_id uuid NOT NULL REFERENCES f5.workspaces(id) ON DELETE CASCADE,
 id uuid NOT NULL, placement_id uuid NOT NULL, contact_id uuid NOT NULL,
 assessment text NOT NULL CHECK(assessment IN ('satisfied','concerned','unsatisfied')),
 rating integer CHECK(rating BETWEEN 1 AND 5), notes text NOT NULL CHECK(length(trim(notes))>0),
 received_at timestamptz NOT NULL, channel text NOT NULL CHECK(channel IN ('phone','email','meeting','other')),
 PRIMARY KEY(workspace_id,id),
 FOREIGN KEY(workspace_id,placement_id) REFERENCES f5.placements(workspace_id,id),
 FOREIGN KEY(workspace_id,contact_id) REFERENCES f5.contacts(workspace_id,id)
);
CREATE INDEX feedback_latest_idx ON f5.feedback_responses(workspace_id,placement_id,received_at DESC);
CREATE TABLE f5.interactions (
 workspace_id uuid NOT NULL REFERENCES f5.workspaces(id) ON DELETE CASCADE,
 id uuid NOT NULL, placement_id uuid, contact_id uuid NOT NULL, actor_id uuid NOT NULL,
 direction text NOT NULL CHECK(direction IN ('inbound','outbound')),
 channel text NOT NULL CHECK(channel IN ('phone','email','meeting','other')),
 outcome text NOT NULL CHECK(outcome IN ('reached','no_answer','rescheduled')),
 notes text NOT NULL, occurred_at timestamptz NOT NULL,
 PRIMARY KEY(workspace_id,id),
 FOREIGN KEY(workspace_id,placement_id) REFERENCES f5.placements(workspace_id,id),
 FOREIGN KEY(workspace_id,contact_id) REFERENCES f5.contacts(workspace_id,id),
 FOREIGN KEY(workspace_id,actor_id) REFERENCES f5.operators(workspace_id,id)
);
CREATE TABLE f5.verifications (
 workspace_id uuid NOT NULL REFERENCES f5.workspaces(id) ON DELETE CASCADE,
 id uuid NOT NULL, issue_id uuid NOT NULL, fix_cycle integer NOT NULL, window_name text NOT NULL CHECK(window_name IN ('initial','sustained')),
 due_at timestamptz NOT NULL, result text CHECK(result IN ('pass','fail','inconclusive')),
 confirmer_id uuid, observed_at timestamptz, evidence text, canceled_reason text,
 PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,issue_id,fix_cycle,window_name),
 FOREIGN KEY(workspace_id,issue_id) REFERENCES f5.issues(workspace_id,id),
 FOREIGN KEY(workspace_id,confirmer_id) REFERENCES f5.contacts(workspace_id,id),
 CHECK(result IS NULL OR (confirmer_id IS NOT NULL AND observed_at IS NOT NULL AND length(trim(evidence))>0)),
 CHECK(result IS DISTINCT FROM 'pass' OR observed_at>=due_at)
);
CREATE TABLE f5.interaction_coverage (
 workspace_id uuid NOT NULL REFERENCES f5.workspaces(id) ON DELETE CASCADE,
 interaction_id uuid NOT NULL, obligation_id uuid NOT NULL, feedback_id uuid, verification_id uuid,
 PRIMARY KEY(workspace_id,interaction_id,obligation_id),
 FOREIGN KEY(workspace_id,interaction_id) REFERENCES f5.interactions(workspace_id,id),
 FOREIGN KEY(workspace_id,obligation_id) REFERENCES f5.obligations(workspace_id,id),
 FOREIGN KEY(workspace_id,feedback_id) REFERENCES f5.feedback_responses(workspace_id,id),
 FOREIGN KEY(workspace_id,verification_id) REFERENCES f5.verifications(workspace_id,id)
);
CREATE TABLE f5.escalations (
 workspace_id uuid NOT NULL REFERENCES f5.workspaces(id) ON DELETE CASCADE,
 id uuid NOT NULL, issue_id uuid NOT NULL, fix_cycle integer NOT NULL, owner_id uuid NOT NULL,
 reason text NOT NULL CHECK(reason IN ('retention_threat','failed_intervention','action_overdue','beyond_authority')),
 state text NOT NULL DEFAULT 'pending_acknowledgment' CHECK(state IN ('pending_acknowledgment','acknowledged','decision_recorded')),
 requested_decision text NOT NULL, evidence text NOT NULL, due_at timestamptz NOT NULL,
 PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,issue_id,fix_cycle,reason),
 FOREIGN KEY(workspace_id,issue_id) REFERENCES f5.issues(workspace_id,id),
 FOREIGN KEY(workspace_id,owner_id) REFERENCES f5.operators(workspace_id,id)
);
CREATE TABLE f5.activity (
 workspace_id uuid NOT NULL REFERENCES f5.workspaces(id) ON DELETE CASCADE,
 id uuid NOT NULL, placement_id uuid, actor_id uuid NOT NULL, type text NOT NULL,
 summary text NOT NULL, details jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,id),
 FOREIGN KEY(workspace_id,placement_id) REFERENCES f5.placements(workspace_id,id),
 FOREIGN KEY(workspace_id,actor_id) REFERENCES f5.operators(workspace_id,id)
);
CREATE INDEX activity_timeline_idx ON f5.activity(workspace_id,placement_id,occurred_at DESC);
CREATE TABLE f5.mutation_receipts (
 workspace_id uuid NOT NULL REFERENCES f5.workspaces(id) ON DELETE CASCADE,
 key uuid NOT NULL, request_hash text NOT NULL, result jsonb NOT NULL,
 PRIMARY KEY(workspace_id,key)
);

-- All operational rows enforce the transaction's resolved workspace, even when
-- a query accidentally omits its predicate. The app role must not own tables.
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['operators','clients','professionals','contacts','placements','issues','obligations','feedback_requests','feedback_responses','interactions','verifications','interaction_coverage','escalations','activity','mutation_receipts'] LOOP
  EXECUTE format('ALTER TABLE f5.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('ALTER TABLE f5.%I FORCE ROW LEVEL SECURITY',name);
  EXECUTE format('CREATE POLICY workspace_scope ON f5.%I USING (workspace_id = nullif(current_setting(''f5.workspace_id'',true),'''')::uuid) WITH CHECK (workspace_id = nullif(current_setting(''f5.workspace_id'',true),'''')::uuid)',name);
 END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA f5 FROM PUBLIC;
