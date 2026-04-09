export function PlaidSetupNotice() {
  const plaidEnv = process.env.PLAID_ENV ?? "sandbox";
  const redirectUri = process.env.PLAID_REDIRECT_URI;
  const needsHttpsRedirectNotice =
    plaidEnv === "production" &&
    (!redirectUri || !redirectUri.startsWith("https://"));

  if (!needsHttpsRedirectNotice) {
    return null;
  }

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      Some Plaid institutions, including Alliant Credit Union, use OAuth and
      will fail from localhost in production unless `PLAID_REDIRECT_URI` is a
      public `https://` URL that is also allowed in Plaid Dashboard.
    </div>
  );
}
