import { db } from "@/db/index";
import {
  claimUnownedFinanceDataForWorkspace,
  ensurePersonalWorkspaceForAuthUser,
} from "@/db/queries/workspaces";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getCurrentAuthContext() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  if (!user.email) {
    return {
      user,
      workspace: null,
    };
  }

  const workspace = await ensurePersonalWorkspaceForAuthUser(db, user.id, user.email);
  await claimUnownedFinanceDataForWorkspace(db, workspace.workspaceId);

  return {
    user,
    workspace,
  };
}

export async function requireCurrentWorkspace() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    throw new Error("Authentication required");
  }

  const workspace = await ensurePersonalWorkspaceForAuthUser(db, user.id, user.email);
  await claimUnownedFinanceDataForWorkspace(db, workspace.workspaceId);

  return {
    user,
    workspace,
  };
}
