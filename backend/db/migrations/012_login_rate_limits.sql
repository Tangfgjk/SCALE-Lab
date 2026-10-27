CREATE TABLE login_rate_limits (
  key_hash text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts > 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX login_rate_limits_expiry ON login_rate_limits(expires_at);
