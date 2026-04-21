# Security Improvement Plan

Last updated: April 14, 2026

## Purpose

This document tracks security and privacy improvements for Personal Finance
Tracker based on:

- Plaid production access questionnaire responses
- Plaid remediation items due October 15, 2026
- Known application and operational security gaps

## Current Baseline

The application currently includes the following security-relevant controls:

- Plaid access tokens are encrypted at rest before storage.
- A public Privacy Policy page exists at `/privacy`.
- A public Data Deletion & Retention Policy page exists at `/data-policy`.
- The Plaid connection flow includes an explicit user consent checkpoint before
  Link is launched.
- Disconnecting a Plaid institution removes local linked account and
  transaction data from this application database.
- A written Information Security Policy exists in
  `docs/information-security-policy.md`.

The largest remaining gaps are in operational controls rather than core app
logic: access reviews, MFA coverage, centralized identity, endpoint and
infrastructure scanning, patch SLAs, and broader at-rest encryption.

## Remediation Backlog

| Priority | Work Item | Source | Current State | Target Outcome |
| --- | --- | --- | --- | --- |
| P0 | Publish and maintain a production Privacy Policy | Plaid remediation / questionnaire Q9 | Implemented in app, but should be reviewed, published, and linked from the deployed environment | Public privacy policy is deployed and reviewed at least annually |
| P0 | Finalize and attest to a data deletion and retention policy | Plaid remediation / questionnaire Q11 | Public policy, operator procedure, Plaid disconnect deletion, and self-service workspace deletion are implemented; Supabase Auth user deletion requires `SUPABASE_SERVICE_ROLE_KEY` | Formal policy owner, review cadence, and operator procedure are documented |
| P0 | Enable consumer MFA before Plaid Link | Plaid remediation / questionnaire Q4 | Supabase TOTP setup exists in Settings and `/api/plaid/link-token` requires an `aal2` session | Consumer authentication and MFA gate the app before bank-linking workflows |
| P0 | Require MFA on internal systems storing or processing consumer data | Plaid remediation / questionnaire Q5 | Internal MFA checklist exists; provider settings still need evidence screenshots/exports | MFA is mandatory on Plaid, hosting, source control, email, secrets, and admin tools |
| P0 | Secure data in transit with TLS 1.2+ in production | Plaid remediation / questionnaire Q6 | Production deployment is served by Vercel HTTPS; retain deployment evidence | Production deployment enforces HTTPS/TLS 1.2+ with HSTS where appropriate |
| P0 | Expand data encryption practices for consumer data at rest | Plaid remediation / questionnaire Q7 | Plaid tokens are encrypted, but account and transaction data are not application-layer encrypted | Sensitive financial data is protected by encrypted-at-rest infrastructure and, where needed, stronger application-layer encryption |
| P0 | Implement vulnerability scanning | Plaid remediation / questionnaire Q8 | GitHub Actions audit workflow and Dependabot config are implemented; external DAST/device scans remain process items | Regular endpoint, dependency, and infrastructure scanning is operationalized |
| P0 | Define and enforce a vulnerability patch SLA | Plaid remediation | Documented in `docs/vulnerability-management-policy.md` | Severity-based remediation SLAs are documented and followed |
| P1 | Implement periodic access reviews and audits | Plaid remediation / questionnaire Q3 | Documented in `docs/access-review-checklist.md`; first review evidence still needs to be completed | Quarterly access review checklist and audit log are maintained |
| P1 | Create and maintain a defined access control policy | Plaid remediation / questionnaire Q3 | Documented in `docs/access-control-policy.md` | Separate documented access control policy covers least privilege, approvals, reviews, and revocation |
| P1 | Implement centralized identity and access management | Plaid remediation | Supabase Auth centralizes application user identity; internal systems remain provider-managed and documented in the IAM plan | Critical systems are managed through centralized identity with role-based assignment |
| P1 | Implement automated de-provisioning / modification of access | Plaid remediation | Documented offboarding procedure exists; full HR-system automation is not necessary at current beta scale | Offboarding and role-change workflows remove or reduce access promptly |
| P1 | Implement zero trust access architecture for production systems | Plaid remediation | Auth, workspaces, RLS, rate limits, MFA-before-Plaid, and zero-trust plan are in place | Access to production is brokered through identity-aware, least-privilege controls |
| P1 | Monitor end-of-life software and document EOL management | Plaid remediation | Documented in `docs/software-eol-inventory.md` | Software inventory includes runtime/framework versions and EOL review checkpoints |
| P1 | Operationalize the Information Security Policy | Plaid remediation / questionnaire Q2 | ISP now links supporting procedures and has an owner/review date | Named owner, annual review, and linked procedures exist for access, incident response, patching, and retention |
| P1 | Formalize consumer consent evidence | Questionnaire Q10 | Consent checkpoint exists in app, but no durable audit trail is retained | Consent language is reviewed and consent events are logged or otherwise provable |
| P2 | Improve production secrets management | Questionnaire follow-up | Environment variables are used locally; managed secret storage is not documented | Secrets are stored in a managed secret system with rotation procedures |
| P2 | Improve incident response documentation | Questionnaire follow-up | High-level incident language exists in the ISP | Short incident response runbook exists with credential rotation and notification steps |

## Detailed Work Items

### 1. Privacy, Consent, and Retention

- Review the privacy policy text with legal/business requirements before
  relying on it for production attestation.
- Add policy links to any externally hosted landing page or auth entrypoint, in
  addition to the in-app footer.
- Define a policy owner and a recurring review date for the privacy policy and
  data retention policy.
- Add a documented deletion request procedure, including how an operator would
  verify and execute deletion outside the self-service disconnect flow if
  needed.
- Add lightweight consent-event logging for Plaid consent acceptance, or define
  a manual evidence process if formal logging is not yet available.

### 2. Consumer Authentication and MFA

- Add consumer accounts and sign-in before users can reach pages that expose
  connected financial data.
- Require MFA before surfacing Plaid Link in production.
- Ensure each user can only access their own accounts, transactions, budgets,
  and snapshots.
- Add session management and logout behavior suitable for a finance app.

### 3. Internal Access Controls

- Create a dedicated access control policy that covers:
  approvals, least privilege, privileged access, review cadence, emergency
  access, and revocation timing.
- Inventory all systems with access to consumer data:
  Plaid Dashboard, hosting provider, source control, email, secrets manager,
  logging, database access, analytics, and support tools.
- Require MFA on every critical system.
- Establish a quarterly access review process and retain evidence of completion.
- Define an offboarding checklist and role-change checklist.

### 4. Encryption and Secure Transport

- Deploy production behind HTTPS/TLS 1.2+ only.
- Document the production hosting controls that provide encryption in transit.
- Ensure storage encryption is enabled at the database, disk, or hosting layer.
- Evaluate whether transaction and account data need application-layer
  encryption beyond infrastructure-level encryption.
- Remove plaintext secrets from local files before any public release or shared
  environment snapshot.

### 5. Vulnerability Management and Patching

- Add dependency scanning to CI.
- Add endpoint or workstation vulnerability scanning for operator laptops.
- Add infrastructure or container/image scanning for production assets once
  hosting is selected.
- Define severity-based remediation SLAs, for example:
  Critical within 7 days, High within 14 days, Medium within 30 days.
- Track exceptions when a vulnerability cannot be patched immediately.

### 6. Software Lifecycle and EOL Management

- Maintain an inventory of critical technologies:
  Node.js, Next.js, React, SQLite, Plaid SDK, OpenAI SDK, hosting runtime, and
  any OS/container base image.
- Review vendor EOL dates at least quarterly.
- Update policies to require upgrades before EOL deadlines.
- Record approved temporary exceptions and mitigation steps.

### 7. Architecture and Production Hardening

- Define the target production architecture, including hosting, database,
  backup, logging, and secrets management.
- Decide how production admin access will work under least privilege.
- Move toward identity-aware access rather than broad shared access to hosts or
  dashboards.
- Document backup, restore, and disaster recovery expectations for consumer
  data.

## Suggested Milestones

### By April 30, 2026

- Finalize and review Privacy Policy
- Finalize and review Data Deletion & Retention Policy
- Create dedicated Access Control Policy
- Define patch SLA document
- Inventory critical systems and confirm MFA status

### By May 31, 2026

- Choose production hosting model with HTTPS/TLS 1.2+ guarantees
- Implement dependency scanning
- Create quarterly access review checklist
- Create offboarding / de-provisioning checklist
- Create software inventory and EOL tracking sheet

### By July 31, 2026

- Implement consumer authentication
- Implement consumer MFA ahead of Plaid Link
- Enforce per-user data isolation
- Move secrets into managed secret storage for production

### By October 15, 2026

- Complete attestation-ready evidence for each Plaid remediation item
- Confirm MFA on all critical internal systems
- Complete first periodic access review
- Complete first vulnerability scan and patch cycle against the defined SLA
- Confirm production deployment uses HTTPS/TLS 1.2+ and encrypted-at-rest
  storage controls

## Evidence to Maintain

- Published `/privacy` page content and deployment URL
- Published `/data-policy` page content and deployment URL
- Screenshot or documentation of the in-app Plaid consent prompt
- MFA screenshots or settings exports for critical systems
- Access review checklist and completion records
- Vulnerability scan results and remediation records
- Patch SLA document and issue tracker evidence
- Software inventory with EOL review dates
- Access control policy and offboarding checklist
