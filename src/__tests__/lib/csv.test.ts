import { describe, it, expect } from "vitest";
import {
  parseCSV,
  mapCSVRows,
  findDuplicates,
  type ColumnMapping,
  type ExistingTransaction,
  type MappedTransaction,
} from "@/lib/csv";

// ─── parseCSV ────────────────────────────────────────────────────────

describe("parseCSV", () => {
  it("parses a simple CSV with headers and rows", () => {
    const csv = `Date,Description,Amount\n2026-01-15,Grocery Store,45.99\n2026-01-16,Gas Station,35.00`;
    const result = parseCSV(csv);

    expect(result.headers).toEqual(["Date", "Description", "Amount"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual(["2026-01-15", "Grocery Store", "45.99"]);
    expect(result.rows[1]).toEqual(["2026-01-16", "Gas Station", "35.00"]);
    expect(result.errors).toHaveLength(0);
  });

  it("handles quoted fields with commas", () => {
    const csv = `Name,Amount,Note\n"Smith, John",100.00,"A note, with comma"`;
    const result = parseCSV(csv);

    expect(result.headers).toEqual(["Name", "Amount", "Note"]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual(["Smith, John", "100.00", "A note, with comma"]);
  });

  it("handles escaped quotes inside quoted fields", () => {
    const csv = `Name,Amount\n"He said ""hello""",50.00`;
    const result = parseCSV(csv);

    expect(result.rows[0][0]).toBe('He said "hello"');
  });

  it("skips empty lines", () => {
    const csv = `Date,Amount\n2026-01-01,10\n\n2026-01-02,20\n`;
    const result = parseCSV(csv);

    expect(result.rows).toHaveLength(2);
  });

  it("reports errors for rows with wrong column count", () => {
    const csv = `Date,Name,Amount\n2026-01-01,Store,10\n2026-01-02,Bad Row`;
    const result = parseCSV(csv);

    expect(result.rows).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Row 3");
    expect(result.errors[0]).toContain("Expected 3 columns but found 2");
  });

  it("returns error for empty input", () => {
    const result = parseCSV("");
    expect(result.headers).toHaveLength(0);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toContain("File is empty");
  });

  it("returns error for header-only CSV", () => {
    const result = parseCSV("Date,Name,Amount");
    expect(result.headers).toEqual(["Date", "Name", "Amount"]);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toContain("No data rows found after header");
  });

  it("handles Windows-style line endings (CRLF)", () => {
    const csv = "Date,Amount\r\n2026-01-01,10\r\n2026-01-02,20";
    const result = parseCSV(csv);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual(["2026-01-01", "10"]);
  });
});

// ─── mapCSVRows ──────────────────────────────────────────────────────

describe("mapCSVRows", () => {
  const headers = ["Date", "Description", "Amount", "Category"];
  const mapping: ColumnMapping = { date: 0, name: 1, amount: 2, category: 3 };

  it("maps rows to transactions correctly", () => {
    const rows = [
      ["2026-01-15", "Grocery Store", "45.99", "Groceries"],
      ["2026-01-16", "Gas Station", "35.00", ""],
    ];
    const result = mapCSVRows(rows, headers, mapping);

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toEqual({
      date: "2026-01-15",
      name: "Grocery Store",
      amount: 45.99,
      category: "Groceries",
      rowIndex: 0,
    });
    expect(result.transactions[1].category).toBeUndefined(); // empty category
  });

  it("parses US date format (MM/DD/YYYY)", () => {
    const rows = [["01/15/2026", "Store", "10.00", ""]];
    const result = mapCSVRows(rows, headers, mapping);

    expect(result.transactions[0].date).toBe("2026-01-15");
  });

  it("parses US dash date format (MM-DD-YYYY)", () => {
    const rows = [["01-15-2026", "Store", "10.00", ""]];
    const result = mapCSVRows(rows, headers, mapping);

    expect(result.transactions[0].date).toBe("2026-01-15");
  });

  it("parses amounts with dollar signs", () => {
    const rows = [["2026-01-15", "Store", "$1,234.56", ""]];
    const result = mapCSVRows(rows, headers, mapping);

    expect(result.transactions[0].amount).toBe(1234.56);
  });

  it("parses negative amounts (income/credits)", () => {
    const rows = [
      ["2026-01-15", "Refund", "-100.00", ""],
      ["2026-01-16", "Payment", "($50.00)", ""],
    ];
    const result = mapCSVRows(rows, headers, mapping);

    expect(result.transactions[0].amount).toBe(-100);
    expect(result.transactions[1].amount).toBe(-50);
  });

  it("reports error for invalid date", () => {
    const rows = [["not-a-date", "Store", "10.00", ""]];
    const result = mapCSVRows(rows, headers, mapping);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Invalid date");
  });

  it("reports error for empty name", () => {
    const rows = [["2026-01-15", "", "10.00", ""]];
    const result = mapCSVRows(rows, headers, mapping);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors[0]).toContain("Empty name/description");
  });

  it("reports error for invalid amount", () => {
    const rows = [["2026-01-15", "Store", "abc", ""]];
    const result = mapCSVRows(rows, headers, mapping);

    expect(result.transactions).toHaveLength(0);
    expect(result.errors[0]).toContain("Invalid amount");
  });

  it("works without category mapping", () => {
    const noCatMapping: ColumnMapping = { date: 0, name: 1, amount: 2 };
    const rows = [["2026-01-15", "Store", "10.00", "Ignored"]];
    const result = mapCSVRows(rows, headers, noCatMapping);

    expect(result.transactions[0].category).toBeUndefined();
  });

  it("skips invalid rows but keeps valid ones", () => {
    const rows = [
      ["2026-01-15", "Good Row", "10.00", ""],
      ["bad-date", "Bad Row", "10.00", ""],
      ["2026-01-16", "Also Good", "20.00", ""],
    ];
    const result = mapCSVRows(rows, headers, mapping);

    expect(result.transactions).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
  });
});

// ─── findDuplicates ──────────────────────────────────────────────────

describe("findDuplicates", () => {
  it("detects exact duplicates (same date, amount, name)", () => {
    const mapped: MappedTransaction[] = [
      { date: "2026-01-15", name: "Grocery Store", amount: 45.99, rowIndex: 0 },
    ];
    const existing: ExistingTransaction[] = [
      { id: 1, postedAt: "2026-01-15", name: "Grocery Store", amount: 4599 },
    ];

    const dupes = findDuplicates(mapped, existing);
    expect(dupes).toHaveLength(1);
    expect(dupes[0]).toEqual({
      index: 0,
      existingId: 1,
      existingName: "Grocery Store",
    });
  });

  it("detects duplicates with similar names (case insensitive)", () => {
    const mapped: MappedTransaction[] = [
      { date: "2026-01-15", name: "GROCERY STORE", amount: 45.99, rowIndex: 0 },
    ];
    const existing: ExistingTransaction[] = [
      { id: 1, postedAt: "2026-01-15", name: "Grocery Store", amount: 4599 },
    ];

    const dupes = findDuplicates(mapped, existing);
    expect(dupes).toHaveLength(1);
  });

  it("detects duplicates when name is a substring", () => {
    const mapped: MappedTransaction[] = [
      { date: "2026-01-15", name: "Grocery Store #123", amount: 45.99, rowIndex: 0 },
    ];
    const existing: ExistingTransaction[] = [
      { id: 1, postedAt: "2026-01-15", name: "Grocery Store", amount: 4599 },
    ];

    const dupes = findDuplicates(mapped, existing);
    expect(dupes).toHaveLength(1);
  });

  it("does not flag non-duplicates (different date)", () => {
    const mapped: MappedTransaction[] = [
      { date: "2026-01-16", name: "Grocery Store", amount: 45.99, rowIndex: 0 },
    ];
    const existing: ExistingTransaction[] = [
      { id: 1, postedAt: "2026-01-15", name: "Grocery Store", amount: 4599 },
    ];

    const dupes = findDuplicates(mapped, existing);
    expect(dupes).toHaveLength(0);
  });

  it("does not flag non-duplicates (different amount)", () => {
    const mapped: MappedTransaction[] = [
      { date: "2026-01-15", name: "Grocery Store", amount: 50.00, rowIndex: 0 },
    ];
    const existing: ExistingTransaction[] = [
      { id: 1, postedAt: "2026-01-15", name: "Grocery Store", amount: 4599 },
    ];

    const dupes = findDuplicates(mapped, existing);
    expect(dupes).toHaveLength(0);
  });

  it("does not flag non-duplicates (different name)", () => {
    const mapped: MappedTransaction[] = [
      { date: "2026-01-15", name: "Gas Station", amount: 45.99, rowIndex: 0 },
    ];
    const existing: ExistingTransaction[] = [
      { id: 1, postedAt: "2026-01-15", name: "Grocery Store", amount: 4599 },
    ];

    const dupes = findDuplicates(mapped, existing);
    expect(dupes).toHaveLength(0);
  });

  it("handles multiple duplicates correctly", () => {
    const mapped: MappedTransaction[] = [
      { date: "2026-01-15", name: "Grocery Store", amount: 45.99, rowIndex: 0 },
      { date: "2026-01-16", name: "Gas Station", amount: 35.00, rowIndex: 1 },
      { date: "2026-01-17", name: "Restaurant", amount: 25.00, rowIndex: 2 },
    ];
    const existing: ExistingTransaction[] = [
      { id: 1, postedAt: "2026-01-15", name: "Grocery Store", amount: 4599 },
      { id: 2, postedAt: "2026-01-17", name: "Restaurant", amount: 2500 },
    ];

    const dupes = findDuplicates(mapped, existing);
    expect(dupes).toHaveLength(2);
    expect(dupes.map((d) => d.index)).toEqual([0, 2]);
  });

  it("returns empty array when no existing transactions", () => {
    const mapped: MappedTransaction[] = [
      { date: "2026-01-15", name: "Store", amount: 10.00, rowIndex: 0 },
    ];

    const dupes = findDuplicates(mapped, []);
    expect(dupes).toHaveLength(0);
  });
});
