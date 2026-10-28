-- Email OTP support on otp_codes.
--
-- The table was built for phone OTP: `phone` is NOT NULL and there is no
-- column for an email address. A password-reset code is addressed to an email,
-- so two things have to change.
--
-- Idempotent, so it is safe to run on a fresh database or an existing one, and
-- safe to run twice. Run it with:
--   psql "$DATABASE_URL" -f src/db/migrations/001_email_otp.sql
--
-- `src/db/schema.sql` is left alone deliberately: it uses CREATE TABLE IF NOT
-- EXISTS throughout, so editing the table definition there would silently do
-- nothing to a database that already has the table. Changes to existing tables
-- belong in a migration, not in the create script.

-- Where a password-reset code was sent.
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS email TEXT;

-- An email OTP has no phone number. The column stays for phone OTP, which
-- supplies it; it simply can no longer be required of every row.
ALTER TABLE otp_codes ALTER COLUMN phone DROP NOT NULL;

-- Matches the lookup the reset flow performs: newest unconsumed code for this
-- address and purpose.
CREATE INDEX IF NOT EXISTS idx_otp_email_purpose ON otp_codes (email, purpose);

-- A row must identify its destination one way or the other. Without this a bug
-- could write a code addressed to nobody, which would then never match a lookup
-- and would be invisible in the table.
DO $$ BEGIN
  ALTER TABLE otp_codes
    ADD CONSTRAINT otp_codes_destination_present
    CHECK (phone IS NOT NULL OR email IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
