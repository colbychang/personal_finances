/**
 * CSV parsing and import utilities.
 *
 * Handles parsing CSV text, validating column mappings,
 * and preparing transactions for import.
 */

export interface CSVParseResult {
  headers: string[];
  rows: string[][];
  errors: string[];
}

/**
 * Parse CSV text into headers and rows.
 * Handles quoted fields (with commas and newlines inside quotes).
 * Returns errors for malformed rows.
 */
export function parseCSV(text: string): CSVParseResult {
  const errors: string[] = [];

  if (!text || text.trim().length === 0) {
    return { headers: [], rows: [], errors: ["File is empty"] };
  }

  const lines = splitCSVLines(text.trim());

  if (lines.length === 0) {
    return { headers: [], rows: [], errors: ["File is empty"] };
  }

  const headers = parseCSVRow(lines[0]);
  if (headers.length === 0) {
    return { headers: [], rows: [], errors: ["No columns found in header row"] };
  }

  const rows: string[][] = [];
  const expectedColumns = headers.length;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") continue; // skip empty lines

    const row = parseCSVRow(line);
    if (row.length !== expectedColumns) {
      errors.push(
        `Row ${i + 1}: Expected ${expectedColumns} columns but found ${row.length} — skipped`
      );
      continue;
    }
    rows.push(row);
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push("No data rows found after header");
  }

  return { headers, rows, errors };
}

/**
 * Split CSV text into lines, respecting quoted fields that contain newlines.
 */
function splitCSVLines(text: string): string[] {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"') {
      if (inQuotes && i + 1 < text.length && text[i + 1] === '"') {
        // Escaped quote inside quoted field
        current += '""';
        i++;
      } else {
        inQuotes = !inQuotes;
        current += char;
      }
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && i + 1 < text.length && text[i + 1] === "\n") {
        i++; // skip \n after \r
      }
      lines.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines;
}

/**
 * Parse a single CSV row into an array of field values.
 * Handles quoted fields (strips surrounding quotes, unescapes doubled quotes).
 */
function parseCSVRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (!inQuotes) {
        inQuotes = true;
      } else if (i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = false;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current.trim());
  return fields;
}

// ─── Column Mapping ──────────────────────────────────────────────────

export interface ColumnMapping {
  date: number; // column index
  name: number; // column index
  amount: number; // column index
  category?: number; // optional column index
}

export interface MappedTransaction {
  date: string; // YYYY-MM-DD
  name: string;
  amount: number; // dollars (positive = expense, negative = income)
  category?: string;
  rowIndex: number; // original row index for error reporting
}

export interface MapResult {
  transactions: MappedTransaction[];
  errors: string[];
}

/**
 * Apply column mapping to parsed CSV rows and validate each transaction.
 * Returns valid transactions and errors for invalid rows.
 */
export function mapCSVRows(
  rows: string[][],
  headers: string[],
  mapping: ColumnMapping
): MapResult {
  const transactions: MappedTransaction[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 because row 1 is headers, and we're 1-based

    // Extract mapped values
    const rawDate = row[mapping.date]?.trim() ?? "";
    const rawName = row[mapping.name]?.trim() ?? "";
    const rawAmount = row[mapping.amount]?.trim() ?? "";
    const rawCategory = mapping.category !== undefined
      ? row[mapping.category]?.trim() ?? ""
      : "";

    // Validate date
    const parsedDate = parseDate(rawDate);
    if (!parsedDate) {
      errors.push(`Row ${rowNum}: Invalid date "${rawDate}"`);
      continue;
    }

    // Validate name
    if (!rawName) {
      errors.push(`Row ${rowNum}: Empty name/description`);
      continue;
    }

    // Validate amount
    const parsedAmount = parseAmount(rawAmount);
    if (parsedAmount === null) {
      errors.push(`Row ${rowNum}: Invalid amount "${rawAmount}"`);
      continue;
    }

    transactions.push({
      date: parsedDate,
      name: rawName,
      amount: parsedAmount,
      category: rawCategory || undefined,
      rowIndex: i,
    });
  }

  return { transactions, errors };
}

/**
 * Parse a date string in various formats to YYYY-MM-DD.
 * Supported: YYYY-MM-DD, MM/DD/YYYY, M/D/YYYY, MM-DD-YYYY
 */
function parseDate(value: string): string | null {
  if (!value) return null;

  // Try YYYY-MM-DD (ISO format)
  const isoMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return validateAndFormatDate(Number(year), Number(month), Number(day));
  }

  // Try MM/DD/YYYY or M/D/YYYY
  const usSlashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usSlashMatch) {
    const [, month, day, year] = usSlashMatch;
    return validateAndFormatDate(Number(year), Number(month), Number(day));
  }

  // Try MM-DD-YYYY
  const usDashMatch = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (usDashMatch) {
    const [, month, day, year] = usDashMatch;
    return validateAndFormatDate(Number(year), Number(month), Number(day));
  }

  return null;
}

function validateAndFormatDate(
  year: number,
  month: number,
  day: number
): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null; // Invalid date (e.g., Feb 30)
  }

  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * Parse an amount string, handling common formats:
 * "100", "100.50", "$100.50", "-$100.50", "($100.50)", "1,234.56"
 * Returns the numeric value (positive = expense, negative = income/credit).
 */
function parseAmount(value: string): number | null {
  if (!value) return null;

  let cleaned = value.trim();

  // Check for parenthetical negatives: ($100.50) → -100.50
  const isParenNeg = cleaned.startsWith("(") && cleaned.endsWith(")");
  if (isParenNeg) {
    cleaned = cleaned.slice(1, -1);
  }

  // Track explicit negative sign
  const isNegative = cleaned.startsWith("-");
  if (isNegative) {
    cleaned = cleaned.slice(1);
  }

  // Remove currency symbols and commas
  cleaned = cleaned.replace(/[$€£¥,]/g, "").trim();

  // After all cleaning, should be a valid number
  if (cleaned === "" || isNaN(Number(cleaned))) return null;

  const num = Number(cleaned);
  if (!isFinite(num)) return null;

  return (isParenNeg || isNegative) ? -num : num;
}

// ─── Duplicate Detection ──────────────────────────────────────────────

export interface ExistingTransaction {
  id: number;
  postedAt: string;
  name: string;
  amount: number; // cents
}

export interface DuplicateCheckResult {
  index: number; // index in the mapped transactions array
  existingId: number;
  existingName: string;
}

/**
 * Check mapped transactions against existing transactions for duplicates.
 * A duplicate matches: same date + same amount (within cents) + similar name.
 */
export function findDuplicates(
  mapped: MappedTransaction[],
  existing: ExistingTransaction[]
): DuplicateCheckResult[] {
  const duplicates: DuplicateCheckResult[] = [];

  for (let i = 0; i < mapped.length; i++) {
    const txn = mapped[i];
    const amountCents = Math.round(txn.amount * 100);

    for (const ex of existing) {
      if (
        ex.postedAt === txn.date &&
        ex.amount === amountCents &&
        isSimilarName(txn.name, ex.name)
      ) {
        duplicates.push({
          index: i,
          existingId: ex.id,
          existingName: ex.name,
        });
        break; // only flag one match per import row
      }
    }
  }

  return duplicates;
}

/**
 * Check if two transaction names are similar enough to be considered a match.
 * Uses case-insensitive comparison and checks if one contains the other.
 */
function isSimilarName(a: string, b: string): boolean {
  const normA = a.toLowerCase().trim();
  const normB = b.toLowerCase().trim();

  if (normA === normB) return true;
  if (normA.includes(normB) || normB.includes(normA)) return true;

  return false;
}
