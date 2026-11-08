ALTER TABLE "login_attempts" ADD COLUMN IF NOT EXISTS "last_failed_at" timestamptz NOT NULL DEFAULT now();
