# Access Control Policy

## Purpose

This policy defines how access to Glacier Finance Tracker systems and consumer financial data is requested, approved, reviewed, modified, and revoked.

## Scope

This policy applies to:

- The Glacier Finance Tracker production application and database.
- Plaid Dashboard and Plaid API credentials.
- Supabase, Vercel, GitHub, email, secrets, monitoring, and deployment tooling.
- Any laptop, workstation, or contractor device used to administer the application.

## Access Principles

- Least privilege: users receive only the access required for their role.
- Need to know: access to consumer financial data is limited to operationally necessary work.
- MFA required: critical systems must require multi-factor authentication where supported.
- No shared accounts: each operator must use an individually attributable account.
- Prompt revocation: access must be removed when no longer needed.
- Separation of duties: production secrets and deployment access should be limited to owners or explicitly approved operators.

## Access Requests and Approval

Access requests must document:

- Requester.
- System or data requested.
- Business reason.
- Requested role or permission level.
- Approver.
- Date granted.

For the current beta, approval can be recorded in the access review checklist or issue tracker. Access to Plaid, Supabase, Vercel, GitHub, and production secrets requires owner approval.

## Periodic Reviews

Access reviews must occur at least quarterly and after any personnel or contractor change. The reviewer must confirm that:

- Every active user still needs access.
- MFA is enabled for critical systems.
- Admin roles are limited to approved users.
- Stale, unused, or excessive permissions are removed.
- Review evidence is retained.

## Transfers and Offboarding

When a person changes role or stops supporting the application:

- Revoke or reduce GitHub, Vercel, Supabase, Plaid, email, and monitoring access on the same business day.
- Rotate shared secrets if exposure is possible.
- Review recent production activity if the change is involuntary or security-sensitive.
- Record the action in the access review checklist.

## Exceptions

Exceptions must be documented with the reason, compensating control, owner, and expiration date.

## Review Cadence

Owner: Colby Chang  
Review frequency: Quarterly, and after major hosting/authentication/security changes  
Last reviewed: 2026-04-21
