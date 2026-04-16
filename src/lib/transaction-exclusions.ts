interface TransactionExclusionInput {
  name: string;
  merchant?: string | null;
  amount: number;
  category?: string | null;
}

const PASSIVE_INCOME_PATTERNS = [
  /\binterest\b/i,
  /\bdividend\b/i,
  /paid_interest/i,
  /annual percentage yield earned/i,
] as const;

const ACTIVE_INCOME_PATTERNS = [
  /\bpaycheck\b/i,
  /\bpayroll\b/i,
  /\bsalary\b/i,
  /\bdirect deposit\b/i,
  /\bfoundation robot\b/i,
] as const;

export function shouldExcludePassiveIncomeTransaction(
  transaction: TransactionExclusionInput
) {
  const normalizedCategory = transaction.category?.trim().toLowerCase() ?? "";
  if (normalizedCategory === "income") {
    return true;
  }

  if (transaction.amount >= 0) {
    return false;
  }

  const searchableText = `${transaction.name} ${transaction.merchant ?? ""}`;
  return (
    PASSIVE_INCOME_PATTERNS.some((pattern) => pattern.test(searchableText)) ||
    ACTIVE_INCOME_PATTERNS.some((pattern) => pattern.test(searchableText))
  );
}
