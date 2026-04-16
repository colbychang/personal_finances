import { eq, isNull } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../schema";

type DB = ReturnType<typeof drizzle>;

export interface WorkspaceMembership {
  workspaceId: number;
  workspaceName: string;
  workspaceSlug: string;
  authUserId: string;
  email: string;
  role: string;
}

function slugifyWorkspaceName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "glacier";
}

function titleCaseEmailLocalPart(email: string) {
  const localPart = email.split("@")[0] ?? "Glacier";

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildDefaultWorkspaceName(email: string) {
  const label = titleCaseEmailLocalPart(email);
  return `${label}'s Glacier`;
}

function ensureUniqueWorkspaceSlug(database: DB, baseName: string) {
  const baseSlug = slugifyWorkspaceName(baseName);
  let slug = baseSlug;
  let counter = 2;

  while (
    database
      .select({ id: schema.workspaces.id })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.slug, slug))
      .get()
  ) {
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }

  return slug;
}

export function getWorkspaceMembershipByAuthUserId(
  database: DB,
  authUserId: string,
): WorkspaceMembership | null {
  const row = database
    .select({
      workspaceId: schema.workspaceMembers.workspaceId,
      workspaceName: schema.workspaces.name,
      workspaceSlug: schema.workspaces.slug,
      authUserId: schema.workspaceMembers.authUserId,
      email: schema.workspaceMembers.email,
      role: schema.workspaceMembers.role,
    })
    .from(schema.workspaceMembers)
    .innerJoin(
      schema.workspaces,
      eq(schema.workspaceMembers.workspaceId, schema.workspaces.id),
    )
    .where(eq(schema.workspaceMembers.authUserId, authUserId))
    .get();

  return row ?? null;
}

export function ensurePersonalWorkspaceForAuthUser(
  database: DB,
  authUserId: string,
  email: string,
) {
  const existing = getWorkspaceMembershipByAuthUserId(database, authUserId);

  if (existing) {
    if (existing.email !== email) {
      database
        .update(schema.workspaceMembers)
        .set({ email })
        .where(eq(schema.workspaceMembers.authUserId, authUserId))
        .run();
    }

    return getWorkspaceMembershipByAuthUserId(database, authUserId)!;
  }

  const workspaceName = buildDefaultWorkspaceName(email);
  const slug = ensureUniqueWorkspaceSlug(database, workspaceName);

  const insertedWorkspace = database
    .insert(schema.workspaces)
    .values({
      name: workspaceName,
      slug,
    })
    .returning({
      id: schema.workspaces.id,
    })
    .get();

  database.insert(schema.workspaceMembers).values({
    workspaceId: insertedWorkspace.id,
    authUserId,
    email,
    role: "owner",
  }).run();

  return getWorkspaceMembershipByAuthUserId(database, authUserId)!;
}

export function claimUnownedFinanceDataForWorkspace(database: DB, workspaceId: number) {
  database
    .update(schema.institutions)
    .set({ workspaceId })
    .where(isNull(schema.institutions.workspaceId))
    .run();

  database
    .update(schema.accounts)
    .set({ workspaceId })
    .where(isNull(schema.accounts.workspaceId))
    .run();

  database
    .update(schema.transactions)
    .set({ workspaceId })
    .where(isNull(schema.transactions.workspaceId))
    .run();

  database
    .update(schema.budgets)
    .set({ workspaceId })
    .where(isNull(schema.budgets.workspaceId))
    .run();

  database
    .update(schema.budgetTemplates)
    .set({ workspaceId })
    .where(isNull(schema.budgetTemplates.workspaceId))
    .run();

  database
    .update(schema.snapshots)
    .set({ workspaceId })
    .where(isNull(schema.snapshots.workspaceId))
    .run();

  database
    .update(schema.connections)
    .set({ workspaceId })
    .where(isNull(schema.connections.workspaceId))
    .run();

  database
    .update(schema.merchantRules)
    .set({ workspaceId })
    .where(isNull(schema.merchantRules.workspaceId))
    .run();

  database
    .update(schema.accountLinks)
    .set({ workspaceId })
    .where(isNull(schema.accountLinks.workspaceId))
    .run();
}
