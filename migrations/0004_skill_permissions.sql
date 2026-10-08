CREATE TABLE IF NOT EXISTS skill_permission_records (
  pair_key text PRIMARY KEY,
  permission_id text NOT NULL,
  from_agent_id text NOT NULL,
  to_agent_id text NOT NULL,
  skill_version text NOT NULL,
  purpose text NOT NULL,
  scope text NOT NULL,
  effect text NOT NULL,
  status text NOT NULL,
  CONSTRAINT skill_permission_records_effect CHECK (effect IN ('ALLOW', 'ASK', 'DENY')),
  CONSTRAINT skill_permission_records_status CHECK (status IN ('active', 'revoked')),
  CONSTRAINT skill_permission_records_pair CHECK (pair_key = from_agent_id || '>' || to_agent_id)
)
