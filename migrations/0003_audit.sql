CREATE TABLE IF NOT EXISTS audit_records (
  audit_id text PRIMARY KEY,
  recorded_at text NOT NULL,
  category text NOT NULL,
  request_id text NOT NULL,
  outcome text NOT NULL,
  CONSTRAINT audit_records_category CHECK (
    category IN ('decision', 'approval', 'disclosure', 'revocation')
  ),
  CONSTRAINT audit_records_outcome CHECK (
    outcome IN ('allow', 'ask', 'deny', 'released', 'invalidated', 'unavailable')
  )
)
