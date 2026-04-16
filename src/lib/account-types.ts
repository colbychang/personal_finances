export const INVESTMENT_LIKE_ACCOUNT_TYPES = [
  "investment",
  "retirement",
] as const;

export function excludesTransactionsForAccountType(type: string) {
  return INVESTMENT_LIKE_ACCOUNT_TYPES.includes(
    type as (typeof INVESTMENT_LIKE_ACCOUNT_TYPES)[number]
  );
}
