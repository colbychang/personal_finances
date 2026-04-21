# Internal MFA Checklist

Use this checklist to confirm that internal systems used to operate Glacier Finance Tracker require multi-factor authentication.

| System | MFA Status | Evidence |
| --- | --- | --- |
| GitHub account and repository organization | To verify | Screenshot of GitHub password/authentication settings or organization security settings |
| Vercel account/team | To verify | Screenshot of Vercel account/team security settings |
| Supabase account/project | To verify | Screenshot of Supabase account security settings |
| Plaid Dashboard | To verify | Screenshot/export of Plaid team security settings |
| Primary email account | To verify | Screenshot of email account MFA/security settings |
| Password manager/secrets storage | To verify | Screenshot or note confirming MFA/device unlock |
| Operator laptop | To verify | Screenshot/note confirming OS login, disk encryption, and auto-lock |

## Requirements

- MFA must be enabled for every critical system that supports it.
- Recovery factors should be stored securely.
- Shared accounts must not be used for administration.
- If a platform does not support MFA on the current plan, document the limitation and compensating controls.

## Review Cadence

Review this checklist quarterly and after adding any new system that can access production data or secrets.

Owner: Colby Chang  
Last reviewed: 2026-04-21
