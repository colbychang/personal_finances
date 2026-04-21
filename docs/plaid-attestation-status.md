# Plaid Attestation Status

Last updated: 2026-04-21

| Plaid Item | Current Status | Evidence | Remaining Work |
| --- | --- | --- | --- |
| Data deletion and retention policy | Implemented pending operational review | `/data-policy`, `docs/data-retention-deletion-procedure.md`, disconnect flow, Settings account deletion | Configure `SUPABASE_SERVICE_ROLE_KEY` in Vercel to delete Supabase Auth users as part of self-service deletion |
| Periodic access reviews and audits | Documented | `docs/access-review-checklist.md` | Complete first review and retain evidence |
| Privacy policy | Complete pending review | `/privacy` | Owner/legal review and annual review evidence |
| Consumer MFA before Plaid Link | Implemented pending Supabase MFA setting verification | Settings TOTP setup; `/api/plaid/link-token` requires `aal2`; Plaid button requires MFA challenge | Verify Supabase Auth MFA is enabled in the Supabase dashboard |
| Internal MFA | Process item | `docs/internal-mfa-checklist.md` | Enable/verify MFA on GitHub, Vercel, Supabase, Plaid, email |
| Encrypt all Plaid API consumer data at rest | Partial | Plaid tokens are app-encrypted; provider storage encryption | Decide whether app-layer encryption is needed for account/transaction fields |
| EOL software monitoring | Documented | `docs/software-eol-inventory.md` | Complete first quarterly review |
| Information Security Policy | Documented | `docs/information-security-policy.md` | Record owner approval and review cadence evidence |
| TLS 1.2+ in transit | Complete for production | Vercel HTTPS deployment | Retain Vercel/domain screenshot or `curl` evidence |
| Zero trust access architecture | Partial/documented | RLS, auth, rate limits, `docs/zero-trust-and-iam-plan.md` | MFA before Plaid Link; internal MFA/access evidence |
| Centralized IAM | Partial/documented | Supabase Auth for app users | Consider org SSO if team grows |
| Vulnerability scans | Implemented for dependencies; external assets pending | `.github/workflows/security-audit.yml`, `.github/dependabot.yml` | Enable GitHub Dependabot/security alerts and add any desired external DAST/device scanning |
| Patch SLA | Documented | `docs/vulnerability-management-policy.md` | Follow SLA and retain remediation evidence |
| Automated de-provisioning | Documented process | `docs/access-control-policy.md` | Execute checklist on personnel changes; automate if team grows |
| Access control policy | Complete pending review | `docs/access-control-policy.md` | Owner approval and quarterly review evidence |
