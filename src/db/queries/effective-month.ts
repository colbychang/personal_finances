import { sql } from "drizzle-orm";
import * as schema from "../schema";

export const effectiveTransactionMonth = sql<string>`
  coalesce(${schema.transactions.overrideMonth}, substr(${schema.transactions.postedAt}, 1, 7))
`;

