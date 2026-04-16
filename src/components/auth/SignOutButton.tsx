"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="inline-flex items-center gap-1.5 text-neutral-500 hover:text-neutral-700 transition-colors"
    >
      <LogOut className="h-4 w-4" />
      <span>Sign Out</span>
    </button>
  );
}
