CREATE TABLE IF NOT EXISTS relationship_records (
  pair_key text PRIMARY KEY,
  relationship_id text NOT NULL,
  from_agent_id text NOT NULL,
  to_agent_id text NOT NULL,
  status text NOT NULL,
  CONSTRAINT relationship_records_status CHECK (status IN ('active', 'revoked')),
  CONSTRAINT relationship_records_pair CHECK (pair_key = from_agent_id || '>' || to_agent_id)
)
