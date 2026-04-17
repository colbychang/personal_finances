import { Settings, Tag, Landmark, BookOpen } from "lucide-react";
import { db } from "@/db/index";
import { getAllCategories } from "@/db/queries/categories";
import { CategoriesManager } from "@/components/categories/CategoriesManager";
import { ConnectionsList } from "@/components/plaid/ConnectionsList";
import { PlaidSetupNotice } from "@/components/plaid/PlaidSetupNotice";
import { MerchantRulesManager } from "@/components/merchant-rules/MerchantRulesManager";
import { PublicProfileNotice } from "@/components/public/PublicProfileNotice";
import { requireCurrentWorkspace } from "@/lib/auth/current-workspace";
import { isPublicProfileMode } from "@/lib/deployment";

export default async function SettingsPage() {
  if (isPublicProfileMode()) {
    return <PublicProfileNotice />;
  }

  await requireCurrentWorkspace();
  const categories = await getAllCategories(db);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold text-neutral-900">Settings</h1>
      </div>

      {/* Bank Connections Section */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Landmark className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-neutral-900">
            Bank Connections
          </h2>
        </div>
        <PlaidSetupNotice />
        <ConnectionsList />
      </section>

      {/* Merchant Rules Section */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-neutral-900">
            Merchant Rules
          </h2>
        </div>
        <p className="text-sm text-neutral-500 mb-4">
          Merchant rules automatically categorize transactions from known
          merchants. Rules are created when you manually change a
          transaction&apos;s category.
        </p>
        <MerchantRulesManager />
      </section>

      {/* Categories Section */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Tag className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-neutral-900">Categories</h2>
        </div>
        <p className="text-sm text-neutral-500 mb-4">
          Manage spending categories used for transactions, budgets, and filters.
          Predefined categories cannot be deleted.
        </p>
        <CategoriesManager initialCategories={categories} />
      </section>
    </div>
  );
}
