import { eq, isNull } from "drizzle-orm";
import type { AppDatabase } from "@/db/index";
import * as schema from "../schema";

type DB = AppDatabase;

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

async function ensureUniqueWorkspaceSlug(database: DB, baseName: string) {
  const baseSlug = slugifyWorkspaceName(baseName);
  let slug = baseSlug;
  let counter = 2;

  while (
    (
      await database
      .select({ id: schema.workspaces.id })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.slug, slug))
      .limit(1)
    )[0]
  ) {
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }

  return slug;
}

export function getWorkspaceMembershipByAuthUserId(
  database: DB,
  authUserId: string,
): Promise<WorkspaceMembership | null> {
  return database
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
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

export async function ensurePersonalWorkspaceForAuthUser(
  database: DB,
  authUserId: string,
  email: string,
) {
  const existing = await getWorkspaceMembershipByAuthUserId(database, authUserId);

  if (existing) {
    if (existing.email !== email) {
      await database
        .update(schema.workspaceMembers)
        .set({ email })
        .where(eq(schema.workspaceMembers.authUserId, authUserId));
    }

    return (await getWorkspaceMembershipByAuthUserId(database, authUserId))!;
  }

  const workspaceName = buildDefaultWorkspaceName(email);
  const slug = await ensureUniqueWorkspaceSlug(database, workspaceName);

  const [insertedWorkspace] = await database
    .insert(schema.workspaces)
    .values({
      name: workspaceName,
      slug,
    })
    .returning({
      id: schema.workspaces.id,
    });

  await database.insert(schema.workspaceMembers).values({
    workspaceId: insertedWorkspace.id,
    authUserId,
    email,
    role: "owner",
  });

  return (await getWorkspaceMembershipByAuthUserId(database, authUserId))!;
}

export async function claimUnownedFinanceDataForWorkspace(database: DB, workspaceId: number) {
  await database
    .update(schema.institutions)
    .set({ workspaceId })
    .where(isNull(schema.institutions.workspaceId));

  await database
    .update(schema.accounts)
    .set({ workspaceId })
    .where(isNull(schema.accounts.workspaceId));

  await database
    .update(schema.transactions)
    .set({ workspaceId })
    .where(isNull(schema.transactions.workspaceId));

  await database
    .update(schema.budgets)
    .set({ workspaceId })
    .where(isNull(schema.budgets.workspaceId));

  await database
    .update(schema.budgetTemplates)
    .set({ workspaceId })
    .where(isNull(schema.budgetTemplates.workspaceId));

  await database
    .update(schema.snapshots)
    .set({ workspaceId })
    .where(isNull(schema.snapshots.workspaceId));

  await database
    .update(schema.connections)
    .set({ workspaceId })
    .where(isNull(schema.connections.workspaceId));

  await database
    .update(schema.merchantRules)
    .set({ workspaceId })
    .where(isNull(schema.merchantRules.workspaceId));

  await database
    .update(schema.accountLinks)
    .set({ workspaceId })
    .where(isNull(schema.accountLinks.workspaceId));
}
