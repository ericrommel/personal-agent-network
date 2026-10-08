CREATE TABLE IF NOT EXISTS approval_records (
  approval_id text PRIMARY KEY,
  request_id text NOT NULL,
  from_agent_id text NOT NULL,
  to_agent_id text NOT NULL,
  skill_version text NOT NULL,
  purpose text NOT NULL,
  scope text NOT NULL,
  start_at text NOT NULL,
  end_at text NOT NULL,
  policy_version text NOT NULL,
  status text NOT NULL,
  expires_at text NOT NULL,
  CONSTRAINT approval_records_request UNIQUE (request_id),
  CONSTRAINT approval_records_status CHECK (
    status IN ('pending', 'approved', 'rejected', 'expired', 'released', 'invalidated')
  )
)
