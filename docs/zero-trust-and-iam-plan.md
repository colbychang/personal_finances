# Zero Trust and Centralized IAM Plan

Glacier Finance Tracker is a small beta application, so the zero-trust approach should be pragmatic: explicit identity, least privilege, MFA, continuous logging, and no implicit trust of networks or devices.

## Current Controls

- Users authenticate through Supabase before accessing private finance pages.
- Data is scoped to per-user workspaces.
- Database Row Level Security policies are enabled for workspace tables.
- API routes require an authenticated workspace for private data.
- Plaid Link is gated by explicit consent and Supabase MFA; the server-side link-token route requires an `aal2` session.
- Production is served over HTTPS through Vercel.
- Security-relevant events are logged in structured JSON.

## Target Controls

- Require MFA for users before Plaid Link is available.
- Require MFA for all internal critical systems.
- Use individually attributable accounts only.
- Limit production admin access to the owner or explicitly approved operators.
- Review access quarterly.
- Keep secrets in managed secret stores rather than local notes or source code.
- Alert on production errors and repeated suspicious activity.

## Centralized IAM Target

For the current beta, centralized identity is implemented for application users through Supabase Auth. Internal systems still rely on each provider's identity controls.

If the application grows beyond a small beta, move internal access toward a centralized identity provider or organization-level SSO for GitHub, Vercel, Supabase, Plaid, and monitoring tools where available.

Owner: Colby Chang  
Review frequency: Quarterly  
Last reviewed: 2026-04-21
