import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Personal Finance Tracker",
  description: "Privacy Policy for Personal Finance Tracker",
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

export default function PrivacyPolicyPage() {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-neutral-900 mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-neutral-500">
          Last updated: April 14, 2026
        </p>
      </div>

      <Section title="Overview">
        <p>
          This Privacy Policy describes how Personal Finance Tracker collects,
          uses, stores, and deletes information when you choose to connect
          financial accounts or otherwise use the application.
        </p>
      </Section>

      <Section title="Information We Collect">
        <p>
          When you connect an account through Plaid, the application may
          receive account identifiers, institution details, balances, selected
          account metadata, and transaction history that you authorize through
          Plaid Link.
        </p>
        <p>
          The application may also store information you enter directly, such
          as manual accounts, notes, budgets, categories, and merchant rules.
        </p>
      </Section>

      <Section title="How We Use Information">
        <p>
          We use connected financial data to display accounts, balances,
          transactions, budgeting insights, analytics, and related personal
          finance features within the application.
        </p>
        <p>
          Plaid access tokens are stored separately from the user-facing data
          and are used only to maintain the bank connection and import updates.
        </p>
      </Section>

      <Section title="Storage and Security">
        <p>
          Plaid access tokens are encrypted at rest before being stored by the
          application. Other Plaid-derived account and transaction data is
          stored in the application database so the app can function.
        </p>
        <p>
          Production transport security depends on the deployment environment.
          When deployed for production use, the application should be served
          over HTTPS with TLS 1.2 or better.
        </p>
      </Section>

      <Section title="Sharing">
        <p>
          The application is designed to use Plaid to retrieve the data that
          you authorize. Outside of Plaid and the infrastructure used to run
          the application, the app does not intentionally share your connected
          financial data with third parties for advertising.
        </p>
      </Section>

      <Section title="Your Choices">
        <p>
          You can choose which accounts to connect through Plaid Link. You can
          also disconnect a linked institution from the application settings.
        </p>
        <p>
          Disconnecting a Plaid institution removes the local connection record
          and deletes the associated linked accounts and imported transactions
          from this application database.
        </p>
      </Section>

      <Section title="Data Retention">
        <p>
          Connected data is retained while the connection remains active so the
          app can provide budgeting, analytics, and transaction history
          features. Additional details are available in the Data Deletion &
          Retention Policy.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Privacy questions should be directed to the operator or support
          contact associated with the deployed application.
        </p>
      </Section>
    </div>
  );
}
