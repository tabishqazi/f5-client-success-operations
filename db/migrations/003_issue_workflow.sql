ALTER TABLE f5.issues
 ADD COLUMN action_owner text,
 ADD COLUMN fix_evidence text,
 ADD COLUMN closure_evidence text;

UPDATE f5.issues i
SET action_owner=o.name
FROM f5.operators o
WHERE o.workspace_id=i.workspace_id AND o.id=i.owner_id AND i.agreed_action IS NOT NULL;

CREATE TABLE f5.issue_actions (
 workspace_id uuid NOT NULL REFERENCES f5.workspaces(id) ON DELETE CASCADE,
 id uuid NOT NULL,
 issue_id uuid NOT NULL,
 fix_cycle integer NOT NULL CHECK(fix_cycle>0),
 action_owner text NOT NULL CHECK(length(trim(action_owner))>0),
 agreed_action text NOT NULL CHECK(length(trim(agreed_action))>0),
 verification_criteria text NOT NULL CHECK(length(trim(verification_criteria))>0),
 target_at timestamptz NOT NULL,
 fix_reported_at timestamptz,
 fix_evidence text,
 PRIMARY KEY(workspace_id,id),
 UNIQUE(workspace_id,issue_id,fix_cycle),
 FOREIGN KEY(workspace_id,issue_id) REFERENCES f5.issues(workspace_id,id),
 CHECK(fix_reported_at IS NULL OR (fix_evidence IS NOT NULL AND length(trim(fix_evidence))>0))
);

INSERT INTO f5.issue_actions(workspace_id,id,issue_id,fix_cycle,action_owner,agreed_action,verification_criteria,target_at,fix_reported_at,fix_evidence)
SELECT i.workspace_id,gen_random_uuid(),i.id,i.fix_cycle,i.action_owner,i.agreed_action,i.verification_criteria,i.target_at,i.fix_reported_at,
 CASE WHEN i.fix_reported_at IS NOT NULL THEN 'Historical fix report recorded before action-cycle history was enabled.' END
FROM f5.issues i
WHERE i.agreed_action IS NOT NULL;

UPDATE f5.issues
SET fix_evidence='Historical fix report recorded before action-cycle history was enabled.'
WHERE fix_reported_at IS NOT NULL;

CREATE TABLE f5.verification_attempts (
 workspace_id uuid NOT NULL REFERENCES f5.workspaces(id) ON DELETE CASCADE,
 id uuid NOT NULL,
 verification_id uuid NOT NULL,
 result text NOT NULL CHECK(result IN ('pass','fail','inconclusive')),
 confirmer_id uuid NOT NULL,
 observed_at timestamptz NOT NULL,
 evidence text NOT NULL CHECK(length(trim(evidence))>0),
 PRIMARY KEY(workspace_id,id),
 FOREIGN KEY(workspace_id,verification_id) REFERENCES f5.verifications(workspace_id,id),
 FOREIGN KEY(workspace_id,confirmer_id) REFERENCES f5.contacts(workspace_id,id)
);
CREATE INDEX verification_attempts_history_idx ON f5.verification_attempts(workspace_id,verification_id,observed_at);

ALTER TABLE f5.escalations
 ADD COLUMN acknowledged_at timestamptz,
 ADD COLUMN acknowledged_by uuid,
 ADD COLUMN decision text,
 ADD COLUMN decided_at timestamptz,
 ADD COLUMN follow_up_owner text,
 ADD COLUMN follow_up_action text,
 ADD COLUMN version integer NOT NULL DEFAULT 1,
 ADD FOREIGN KEY(workspace_id,acknowledged_by) REFERENCES f5.operators(workspace_id,id),
 ADD CHECK(state='pending_acknowledgment' OR (acknowledged_at IS NOT NULL AND acknowledged_by IS NOT NULL)),
 ADD CHECK(state<>'decision_recorded' OR (decision IS NOT NULL AND length(trim(decision))>0 AND decided_at IS NOT NULL AND follow_up_owner IS NOT NULL AND length(trim(follow_up_owner))>0 AND follow_up_action IS NOT NULL AND length(trim(follow_up_action))>0));

ALTER TABLE f5.issue_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE f5.issue_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_scope ON f5.issue_actions
 USING (workspace_id = nullif(current_setting('f5.workspace_id',true),'')::uuid)
 WITH CHECK (workspace_id = nullif(current_setting('f5.workspace_id',true),'')::uuid);

ALTER TABLE f5.verification_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE f5.verification_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_scope ON f5.verification_attempts
 USING (workspace_id = nullif(current_setting('f5.workspace_id',true),'')::uuid)
 WITH CHECK (workspace_id = nullif(current_setting('f5.workspace_id',true),'')::uuid);

REVOKE ALL ON f5.issue_actions,f5.verification_attempts FROM PUBLIC;
