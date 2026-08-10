# RAZ AI Coaching Platform Privacy and Security Audit

Status: pre-launch hardening

This audit covers the current `main` implementation reviewed on 2026-08-10.

## Launch blockers

### 1. Personal code is the authentication credential
The client token is a 128-bit random value and is used to load the full intake and program, rebuild, adjust, and change language. Treat it exactly like a password.

Required before launch:

- Never include personal codes in analytics, logs, screenshots, support tickets, or marketing assets.
- Validate token format server-side as exactly 32 lowercase/uppercase hexadecimal characters before any lookup or mutation.
- Do not expose the token in URLs that third-party analytics can record where avoidable.
- Add a user-facing warning that anyone with the code can access the saved coaching data.

Recommended later:

- Replace capability-token access with account authentication or a hashed recovery/access secret if the product grows.

### 2. Supabase database must not be directly readable by browser roles
`storage.js` prefers the backend-only `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS. That is acceptable only when the key stays server-side and anon/authenticated roles cannot access the tables directly.

Action included in this branch:

- `supabase_privacy_hardening.sql` enables RLS on `clients`, `history`, `usage`, and `jobs`.
- It revokes direct table privileges from `anon` and `authenticated`.

### 3. No user deletion flow exists
The product stores intake data, injury information, current numbers, generated programs, adjustment requests, and job data. There is currently no application method that lets a client delete their stored data.

Required before launch:

- Add `deleteClientData(token)` to both storage backends.
- Add a protected API endpoint that deletes the client row plus related `history`, `usage`, and `jobs` rows.
- Add a visible "Delete my data" control with a destructive-action confirmation.
- Return a generic success response and clear the token from the browser state.

### 4. Sensitive data is retained indefinitely
`history` stores full intake/program copies and adjustment requests. `jobs` stores generated programs and errors. There is no retention cleanup.

Action included in this branch:

- `supabase_privacy_hardening.sql` includes `purge_expired_operational_data()`.
- Proposed retention: jobs 7 days, history 180 days, usage 90 days.
- Current client intake/program remains until deletion because lifetime access depends on it.

Before production, either schedule this function with Supabase `pg_cron` or invoke equivalent cleanup from the application.

### 5. Privacy notice and consent are missing from the intake flow
The intake explicitly asks about injuries and therefore can collect sensitive health information.

Required before launch:

- Publish a privacy policy that identifies the operator, contact method, categories of data collected, purposes, processors, cross-border processing, retention, access/correction/deletion process, complaints process, and security approach.
- Place a concise collection notice beside the intake submit action.
- Require an affirmative checkbox for processing injury/health information before submission.
- Do not rely on a generic "not medical advice" disclaimer as a substitute for privacy consent.

### 6. API hardening
The existing global API limiter is 20 requests per minute per IP and the product separately applies daily build/adjust quotas by client token.

Required before launch:

- Add a stricter limiter specifically to generation endpoints because token-based daily limits can be bypassed by creating fresh tokens.
- Return `Cache-Control: no-store` for all `/api/*` responses.
- Add security headers: `X-Content-Type-Options: nosniff`, restrictive `Referrer-Policy`, `X-Frame-Options: DENY` or CSP `frame-ancestors 'none'`, and a restrictive `Permissions-Policy`.
- Add a CSP compatible with the current static UI.
- Remove detailed provider/model/cache/storage information from the public health endpoint in production.

## Important but not immediate blockers

### Logging
Current server logs mainly contain operational errors and QA warnings. Keep it that way.

Rules:

- Never log full intake JSON, personal codes, adjustment text, or generated programs.
- Do not pass personal codes to third-party analytics.
- Ensure production error reporting redacts request bodies and authorization/access tokens.

### AI providers and cross-border processing
The application sends intake information to configured AI providers to generate and adjust programs. This must be disclosed in the privacy policy and the operator should confirm the applicable provider data-use and retention settings for the production account.

### Input size and content limits
The server limits JSON bodies to 256 KB, which is useful. Add field-level maximum lengths to reduce abuse and accidental oversharing.

### Output safety wording
The program should distinguish training modification guidance from diagnosis or treatment. For pain/injury inputs, it should encourage appropriate medical assessment when symptoms are severe, worsening, unexplained, neurological, traumatic, or otherwise outside normal training-management scope.

## Secret handling review

Positive findings:

- API keys are read from environment variables.
- `.env`, `.env.local`, `*.key`, SQLite databases, and logs are gitignored.
- No hard-coded live API key was found in the reviewed code search.

Remaining operational checks outside the repository:

- Verify Render environment variables are marked secret and not echoed in build logs.
- Rotate any key that has ever been pasted into chat, an issue, commit, screenshot, or public deployment configuration.
- Confirm the Supabase service role key is present only on the server and never in frontend JavaScript.
- Review Supabase project API logs for unexpected anon access after applying the RLS migration.

## Release gate

Do not call Workstream 1 complete until all of the following are true:

1. RLS migration applied and verified.
2. Direct anon/authenticated table access is denied.
3. User deletion endpoint and UI exist and are tested.
4. Privacy policy and intake collection notice are live.
5. Health-data consent is captured before build.
6. API responses use no-store and security headers.
7. Generation endpoints have a dedicated abuse limiter.
8. Production health endpoint does not disclose unnecessary infrastructure details.
9. Retention cleanup is scheduled.
10. A clean checkout-to-delete-data test has been completed with a fresh test user.
