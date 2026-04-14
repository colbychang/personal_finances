import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Deletion & Retention Policy | Personal Finance Tracker",
  description: "Data Deletion and Retention Policy for Personal Finance Tracker",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-neutral-900 mb-3">{title}</h2>
      <div className="space-y-3 text-sm leading-6 text-neutral-700">
        {children}
      </div>
    </section>
  );
}

export default function DataPolicyPage() {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-neutral-900 mb-2">
          Data Deletion &amp; Retention Policy
        </h1>
        <p className="text-sm text-neutral-500">
          Last updated: April 14, 2026
        </p>
      </div>

      <Section title="Retention Approach">
        <p>
          Personal Finance Tracker retains connected account and transaction
          data while a Plaid connection remains active so the application can
          provide account views, budgeting, analytics, net worth, and related
          history.
        </p>
        <p>
          Plaid access tokens are retained only for as long as needed to keep a
          connected institution active in the application.
        </p>
      </Section>

      <Section title="Deletion Controls">
        <p>
          Users can disconnect a linked Plaid institution from the application
          settings. When a connection is disconnected, the application attempts
          to remove the Plaid Item and deletes the associated local connection
          record, linked accounts, imported transactions, transaction splits,
          and account snapshots stored by this app.
        </p>
        <p>
          Users can also delete manual accounts and their associated
          transactions directly within the application.
        </p>
      </Section>

      <Section title="Imported Data Scope">
        <p>
          The app stores only the information required to deliver its personal
          finance features, such as institution metadata, linked account
          details, balances, imported transactions, categories, budgets, and
          related user annotations.
        </p>
      </Section>

      <Section title="Review and Updates">
        <p>
          This policy should be reviewed whenever the application&apos;s data
          handling practices materially change and before new storage,
          analytics, or sharing workflows are introduced.
        </p>
        <p>
          If the deployed application is subject to specific legal retention
          requirements, those requirements should be reflected in the operator
          workflow and in future revisions of this policy.
        </p>
      </Section>

      <Section title="Current Limitations">
        <p>
          This policy documents the application&apos;s current deletion and
          retention behavior. It does not, by itself, guarantee compliance with
          every jurisdiction-specific privacy law without additional legal and
          operational review by the application operator.
        </p>
      </Section>
    </div>
  );
}
