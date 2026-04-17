import { headers } from "next/headers";
import { db } from "@/db/index";
import {
  ensurePersonalWorkspaceForAuthUser,
} from "@/db/queries/workspaces";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const AUTH_USER_ID_HEADER = "x-glacier-auth-user-id";
const AUTH_EMAIL_HEADER = "x-glacier-auth-email";

type AuthIdentity = {
  id: string;
  email: string | null;
};

async function getRequestAuthIdentity(): Promise<AuthIdentity | null> {
  const headerStore = await headers();
  const userId = headerStore.get(AUTH_USER_ID_HEADER);
  const email = headerStore.get(AUTH_EMAIL_HEADER);

  if (!userId) {
    return null;
  }

  return {
    id: userId,
    email,
  };
}

async function getSupabaseAuthIdentity(): Promise<AuthIdentity | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? null,
  };
}

export async function getCurrentAuthContext() {
  const user = (await getRequestAuthIdentity()) ?? (await getSupabaseAuthIdentity());

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

  return {
    user,
    workspace,
  };
}

export async function requireCurrentWorkspace() {
  const user = (await getRequestAuthIdentity()) ?? (await getSupabaseAuthIdentity());

  if (!user?.email) {
    throw new Error("Authentication required");
  }

  const workspace = await ensurePersonalWorkspaceForAuthUser(db, user.id, user.email);

  return {
    user,
    workspace,
  };
}
