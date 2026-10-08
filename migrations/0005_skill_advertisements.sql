CREATE TABLE IF NOT EXISTS skill_advertisement_records (
  pair_key text PRIMARY KEY,
  advertisement_id text NOT NULL,
  agent_id text NOT NULL,
  skill_version text NOT NULL,
  status text NOT NULL,
  CONSTRAINT skill_advertisement_records_status CHECK (status IN ('advertised', 'withdrawn')),
  CONSTRAINT skill_advertisement_records_pair CHECK (pair_key = agent_id || '>' || skill_version)
)
