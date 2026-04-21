# Quarterly Access Review Checklist

Use this checklist at least quarterly and after any user, contractor, or role change. Keep completed copies as audit evidence.

## Review Metadata

- Review date:
- Reviewer:
- Systems reviewed:
- Notes:

## Critical Systems

| System | Expected Access | MFA Required | Review Action |
| --- | --- | --- | --- |
| GitHub repository | Owner/maintainer only | Yes | Confirm active collaborators and remove stale access |
| Vercel project | Owner/approved deployers only | Yes | Confirm project/team access and deployment permissions |
| Supabase project | Owner/approved admins only | Yes | Confirm project roles, database access, and service keys |
| Plaid Dashboard | Owner/approved admins only | Yes | Confirm app/admin users and environment permissions |
| Email/domain account | Owner only or approved admins | Yes | Confirm recovery channels and MFA |
| Monitoring/alerts | Owner/approved admins only | Yes | Confirm alert destinations and notification recipients |
| Local operator laptop | Current operator only | Device auth | Confirm OS/browser/runtime updates are current |

## Review Steps

- Export or screenshot current user lists for critical systems where practical.
- Confirm each active user still needs their role.
- Remove or reduce access for stale, transferred, or excessive permissions.
- Confirm MFA is enabled for all users on critical systems.
- Confirm no shared accounts are used for administration.
- Confirm secrets are stored in Vercel/Supabase/Plaid/GitHub secret stores rather than local notes or source code.
- Confirm any temporary access has an expiration date.
- Record exceptions and follow-up actions.

## Evidence To Retain

- Completed checklist.
- Screenshots or exports of user/member lists.
- Screenshots showing MFA/security settings where available.
- Links to tickets, commits, or notes for access changes.

## Sign-Off

- Reviewer:
- Completed date:
- Follow-up owner:
- Follow-up due date:
