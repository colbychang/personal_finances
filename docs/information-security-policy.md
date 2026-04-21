# Information Security Policy

Last updated: April 14, 2026

## Purpose

This policy defines the baseline information security expectations for
Personal Finance Tracker, including the handling of financial account data
retrieved through Plaid.

## Scope

This policy applies to the application codebase, deployed infrastructure,
developer workstations used to access production systems, and third-party
services used to operate the application.

## Data Classification

- Plaid access tokens and API credentials are confidential.
- Imported financial account and transaction data is sensitive.
- Application analytics, logs, and operational metadata should be treated as
  sensitive when they may reveal user account details or internal system state.

## Access Control

- Access to production systems and secrets should be limited to authorized
  operators with a business need.
- Shared credentials should be avoided.
- Access should be revoked promptly when no longer needed.
- Critical service accounts should use multi-factor authentication when the
  provider supports it.

## Secrets Management

- Secrets must not be committed to source control.
- Production credentials must be stored in environment variables or a managed
  secrets solution.
- Plaid access tokens stored by the application should remain encrypted at
  rest.

## Encryption

- Production traffic must be served over HTTPS with TLS 1.2 or higher.
- Sensitive credentials received from Plaid must be encrypted before storage.
- Storage providers should enable encryption at rest where supported.

## Secure Development

- Code changes should be reviewed before release when practical.
- Dependencies should be kept reasonably up to date.
- New features that affect data collection, storage, or sharing should be
  reviewed for privacy and security impact before release.

## Logging and Monitoring

- Operational errors should be logged sufficiently to investigate failures.
- Logs should avoid unnecessary inclusion of raw secrets.
- Security-relevant failures, such as failed Plaid syncs or token errors,
  should be visible to the operator.

## Vulnerability Management

- Security patches for the operating system, runtime, dependencies, and
  hosting environment should be applied in a reasonable timeframe.
- Vulnerabilities discovered through scans, advisories, or provider alerts
  should be triaged and remediated based on severity.

## Data Retention and Deletion

- Sensitive financial data should only be retained as long as needed for the
  app's intended functionality.
- User-triggered deletion flows should remove local Plaid connection data and
  associated imported records from the application database.
- Retention expectations should be documented in a public-facing policy when
  the app is offered to end users.

## Incident Response

- Security incidents involving Plaid credentials or consumer financial data
  should be investigated promptly.
- Exposed credentials should be rotated immediately.
- Affected users and service providers should be notified when required by law
  or contract.

## Review

- This policy should be reviewed whenever the application's risk profile
  changes materially and at least annually if the app remains in active
  production use.

Owner: Colby Chang  
Last reviewed: 2026-04-21  
Related procedures:

- `docs/access-control-policy.md`
- `docs/access-review-checklist.md`
- `docs/data-retention-deletion-procedure.md`
- `docs/internal-mfa-checklist.md`
- `docs/software-eol-inventory.md`
- `docs/vulnerability-management-policy.md`
- `docs/zero-trust-and-iam-plan.md`
