"use client";

import { useState, useCallback, useRef } from "react";
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  X,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";

// ─── Types ──────────────────────────────────────────────────────────

interface AccountOption {
  id: number;
  name: string;
  type: string;
}

interface ColumnMapping {
  date: number | null;
  name: number | null;
  amount: number | null;
  category: number | null;
}

interface PreviewTransaction {
  date: string;
  name: string;
  amount: number;
  category: string | null;
  isDuplicate: boolean;
  duplicateOf: string | null;
}

interface ImportResult {
  imported: number;
  duplicatesSkipped: number;
  parseErrors: string[];
  mapErrors: string[];
}

type Step = "upload" | "mapping" | "preview" | "result";

// ─── Component ──────────────────────────────────────────────────────

export function ImportClient({ accounts }: { accounts: AccountOption[] }) {
  const { showToast } = useToast();

  // Step management
  const [step, setStep] = useState<Step>("upload");

  // Upload state
  const [csvText, setCsvText] = useState<string>("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreviewRows, setCsvPreviewRows] = useState<string[][]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [fileError, setFileError] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Account selection
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [accountError, setAccountError] = useState<string>("");

  // Column mapping
  const [mapping, setMapping] = useState<ColumnMapping>({
    date: null,
    name: null,
    amount: null,
    category: null,
  });
  const [mappingError, setMappingError] = useState<string>("");

  // Preview state
  const [previewTransactions, setPreviewTransactions] = useState<PreviewTransaction[]>([]);
  const [previewErrors, setPreviewErrors] = useState<string[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  // ── File Upload ────────────────────────────────────────────────────

  const handleFileSelect = useCallback((file: File) => {
    setFileError("");

    // Validate file type
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      setFileError("Please upload a CSV file (.csv)");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setFileError("File is too large (max 10MB)");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;

      if (!text || text.trim().length === 0) {
        setFileError("File is empty");
        return;
      }

      // Quick parse to get headers and preview
      const lines = text.trim().split(/\r?\n/);
      if (lines.length < 2) {
        setFileError("CSV must have at least a header row and one data row");
        return;
      }

      const headers = parseSimpleRow(lines[0]);
      const previewRows = lines.slice(1, 6).map(parseSimpleRow); // Show first 5 rows

      setCsvText(text);
      setCsvHeaders(headers);
      setCsvPreviewRows(previewRows);
      setFileName(file.name);
      setFileError("");

      // Reset mapping when a new file is uploaded
      setMapping({ date: null, name: null, amount: null, category: null });
    };

    reader.onerror = () => {
      setFileError("Failed to read file");
    };

    reader.readAsText(file);
  }, []);

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  // ── Step Navigation ────────────────────────────────────────────────

  const canProceedToMapping = csvText.length > 0 && selectedAccountId !== null;

  const canProceedToPreview =
    mapping.date !== null &&
    mapping.name !== null &&
    mapping.amount !== null;

  function goToMapping() {
    if (!selectedAccountId) {
      setAccountError("Please select an account");
      return;
    }
    if (!csvText) {
      setFileError("Please upload a CSV file");
      return;
    }
    setAccountError("");
    setStep("mapping");
  }

  async function goToPreview() {
    if (!canProceedToPreview) {
      setMappingError("Please map all required fields (Date, Name, Amount)");
      return;
    }
    setMappingError("");
    setIsLoadingPreview(true);

    try {
      const res = await fetch("/api/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvText,
          accountId: selectedAccountId,
          mapping: {
            date: mapping.date,
            name: mapping.name,
            amount: mapping.amount,
            category: mapping.category !== null ? mapping.category : undefined,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(data.errors?.csvText || "Failed to parse CSV", "error");
        setIsLoadingPreview(false);
        return;
      }

      setPreviewTransactions(data.transactions);
      setPreviewErrors([
        ...(data.parseErrors || []),
        ...(data.mapErrors || []),
      ]);
      setStep("preview");
    } catch {
      showToast("Failed to preview import", "error");
    } finally {
      setIsLoadingPreview(false);
    }
  }

  async function doImport() {
    setIsImporting(true);

    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvText,
          accountId: selectedAccountId,
          mapping: {
            date: mapping.date,
            name: mapping.name,
            amount: mapping.amount,
            category: mapping.category !== null ? mapping.category : undefined,
          },
          skipDuplicates,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || "Failed to import transactions", "error");
        setIsImporting(false);
        return;
      }

      setImportResult(data);
      setStep("result");
      showToast(
        `Successfully imported ${data.imported} transaction${data.imported !== 1 ? "s" : ""}`,
        "success"
      );
    } catch {
      showToast("Failed to import transactions", "error");
    } finally {
      setIsImporting(false);
    }
  }

  function startOver() {
    setCsvText("");
    setCsvHeaders([]);
    setCsvPreviewRows([]);
    setFileName("");
    setFileError("");
    setSelectedAccountId(null);
    setAccountError("");
    setMapping({ date: null, name: null, amount: null, category: null });
    setMappingError("");
    setPreviewTransactions([]);
    setPreviewErrors([]);
    setImportResult(null);
    setSkipDuplicates(true);
    setStep("upload");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  // ── Step Indicators ────────────────────────────────────────────────

  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "mapping", label: "Map Columns" },
    { key: "preview", label: "Preview" },
    { key: "result", label: "Import" },
  ];

  const stepIndex = steps.findIndex((s) => s.key === step);

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div>
      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-8">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium",
                i < stepIndex
                  ? "bg-primary text-white"
                  : i === stepIndex
                    ? "bg-primary text-white"
                    : "bg-neutral-200 text-neutral-500"
              )}
            >
              {i < stepIndex ? "✓" : i + 1}
            </div>
            <span
              className={cn(
                "text-sm font-medium hidden sm:inline",
                i <= stepIndex ? "text-neutral-900" : "text-neutral-400"
              )}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "w-8 h-0.5",
                  i < stepIndex ? "bg-primary" : "bg-neutral-200"
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      {step === "upload" && (
        <UploadStep
          fileName={fileName}
          fileError={fileError}
          csvHeaders={csvHeaders}
          csvPreviewRows={csvPreviewRows}
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          accountError={accountError}
          fileInputRef={fileInputRef}
          onFileDrop={handleFileDrop}
          onFileInput={handleFileInput}
          onAccountChange={setSelectedAccountId}
          onRemoveFile={() => {
            setCsvText("");
            setCsvHeaders([]);
            setCsvPreviewRows([]);
            setFileName("");
            setFileError("");
            setMapping({ date: null, name: null, amount: null, category: null });
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
          onNext={goToMapping}
          canProceed={canProceedToMapping}
        />
      )}

      {step === "mapping" && (
        <MappingStep
          headers={csvHeaders}
          previewRows={csvPreviewRows}
          mapping={mapping}
          mappingError={mappingError}
          isLoading={isLoadingPreview}
          onMappingChange={setMapping}
          onBack={() => setStep("upload")}
          onNext={goToPreview}
          canProceed={canProceedToPreview}
        />
      )}

      {step === "preview" && (
        <PreviewStep
          transactions={previewTransactions}
          errors={previewErrors}
          skipDuplicates={skipDuplicates}
          isImporting={isImporting}
          onSkipDuplicatesChange={setSkipDuplicates}
          onBack={() => setStep("mapping")}
          onImport={doImport}
        />
      )}

      {step === "result" && importResult && (
        <ResultStep result={importResult} onStartOver={startOver} />
      )}
    </div>
  );
}

// ─── Step 1: Upload ─────────────────────────────────────────────────

function UploadStep({
  fileName,
  fileError,
  csvHeaders,
  csvPreviewRows,
  accounts,
  selectedAccountId,
  accountError,
  fileInputRef,
  onFileDrop,
  onFileInput,
  onAccountChange,
  onRemoveFile,
  onNext,
  canProceed,
}: {
  fileName: string;
  fileError: string;
  csvHeaders: string[];
  csvPreviewRows: string[][];
  accounts: AccountOption[];
  selectedAccountId: number | null;
  accountError: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileDrop: (e: React.DragEvent) => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAccountChange: (id: number | null) => void;
  onRemoveFile: () => void;
  onNext: () => void;
  canProceed: boolean;
}) {
  return (
    <div className="space-y-6">
      {/* Account Selector */}
      <div>
        <label
          htmlFor="account-select"
          className="block text-sm font-medium text-neutral-700 mb-1.5"
        >
          Account <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-neutral-500 mb-2">
          Select which account these transactions belong to.
        </p>
        {accounts.length === 0 ? (
          <p className="text-sm text-neutral-500 italic">
            No accounts found. Please create an account first.
          </p>
        ) : (
          <select
            id="account-select"
            value={selectedAccountId ?? ""}
            onChange={(e) =>
              onAccountChange(e.target.value ? Number(e.target.value) : null)
            }
            className={cn(
              "w-full px-3 py-2.5 rounded-[var(--radius-button)] border bg-white text-sm min-h-[44px]",
              accountError
                ? "border-red-400 focus:ring-red-400"
                : "border-neutral-300 focus:ring-primary"
            )}
          >
            <option value="">Select an account...</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.type})
              </option>
            ))}
          </select>
        )}
        {accountError && (
          <p className="text-xs text-red-600 mt-1">{accountError}</p>
        )}
      </div>

      {/* File Upload Area */}
      {!fileName ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onFileDrop}
          className={cn(
            "border-2 border-dashed rounded-[var(--radius-card)] p-8 text-center transition-colors",
            fileError
              ? "border-red-400 bg-red-50"
              : "border-neutral-300 hover:border-primary hover:bg-primary/5"
          )}
        >
          <Upload className="h-10 w-10 text-neutral-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-neutral-700 mb-1">
            Drag and drop your CSV file here
          </p>
          <p className="text-xs text-neutral-500 mb-4">or</p>
          <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-[var(--radius-button)] hover:bg-primary-dark transition-colors cursor-pointer min-h-[44px]">
            <FileSpreadsheet className="h-4 w-4" />
            Choose CSV File
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onFileInput}
              className="sr-only"
            />
          </label>
          {fileError && (
            <p className="text-sm text-red-600 mt-3 flex items-center justify-center gap-1.5">
              <AlertCircle className="h-4 w-4" />
              {fileError}
            </p>
          )}
        </div>
      ) : (
        <div className="border rounded-[var(--radius-card)] bg-neutral-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-neutral-900">
                {fileName}
              </span>
              <span className="text-xs text-neutral-500">
                ({csvHeaders.length} columns, {csvPreviewRows.length}+ rows)
              </span>
            </div>
            <button
              onClick={onRemoveFile}
              className="p-1.5 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* CSV Preview Table */}
          {csvHeaders.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    {csvHeaders.map((h, i) => (
                      <th
                        key={i}
                        className="text-left px-2 py-1.5 bg-neutral-200 text-neutral-700 font-medium border-b border-neutral-300"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvPreviewRows.slice(0, 3).map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className="px-2 py-1 text-neutral-600 border-b border-neutral-200 max-w-[150px] truncate"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {csvPreviewRows.length > 3 && (
                <p className="text-xs text-neutral-400 mt-1 px-2">
                  ...and {csvPreviewRows.length - 3}+ more rows
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Next Button */}
      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={!canProceed}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-[var(--radius-button)] text-sm font-medium min-h-[44px] transition-colors",
            canProceed
              ? "bg-primary text-white hover:bg-primary-dark"
              : "bg-neutral-200 text-neutral-400 cursor-not-allowed"
          )}
        >
          Next: Map Columns
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: Column Mapping ─────────────────────────────────────────

interface MappingField {
  key: keyof ColumnMapping;
  label: string;
  required: boolean;
}

const MAPPING_FIELDS: MappingField[] = [
  { key: "date", label: "Date", required: true },
  { key: "name", label: "Name / Description", required: true },
  { key: "amount", label: "Amount", required: true },
  { key: "category", label: "Category", required: false },
];

function MappingStep({
  headers,
  previewRows,
  mapping,
  mappingError,
  isLoading,
  onMappingChange,
  onBack,
  onNext,
  canProceed,
}: {
  headers: string[];
  previewRows: string[][];
  mapping: ColumnMapping;
  mappingError: string;
  isLoading: boolean;
  onMappingChange: (m: ColumnMapping) => void;
  onBack: () => void;
  onNext: () => void;
  canProceed: boolean;
}) {
  function handleMappingSelect(field: keyof ColumnMapping, value: string) {
    const idx = value === "" ? null : Number(value);
    onMappingChange({ ...mapping, [field]: idx });
  }

  // Get sample values for each column
  function getSampleValues(colIndex: number): string {
    return previewRows
      .slice(0, 3)
      .map((row) => row[colIndex] ?? "")
      .filter(Boolean)
      .join(", ");
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-[var(--radius-card)] p-4">
        <p className="text-sm text-blue-800">
          Map your CSV columns to the transaction fields below. Date, Name, and
          Amount are required.
        </p>
      </div>

      {mappingError && (
        <div className="bg-red-50 border border-red-200 rounded-[var(--radius-card)] p-3 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700">{mappingError}</p>
        </div>
      )}

      <div className="space-y-4">
        {MAPPING_FIELDS.map((field) => (
          <div
            key={field.key}
            className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
          >
            <label
              htmlFor={`map-${field.key}`}
              className="text-sm font-medium text-neutral-700 w-40 flex-shrink-0"
            >
              {field.label}
              {field.required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <div className="flex-1">
              <select
                id={`map-${field.key}`}
                value={mapping[field.key] ?? ""}
                onChange={(e) => handleMappingSelect(field.key, e.target.value)}
                className={cn(
                  "w-full px-3 py-2.5 rounded-[var(--radius-button)] border bg-white text-sm min-h-[44px]",
                  field.required && mapping[field.key] === null
                    ? "border-neutral-300"
                    : mapping[field.key] !== null
                      ? "border-primary ring-1 ring-primary/20"
                      : "border-neutral-300"
                )}
              >
                <option value="">
                  {field.required ? "Select column..." : "None (optional)"}
                </option>
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h} — e.g. {getSampleValues(i) || "(empty)"}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      {/* Mapping Preview Table */}
      {canProceed && previewRows.length > 0 && (
        <div className="border rounded-[var(--radius-card)] overflow-hidden">
          <div className="bg-neutral-100 px-3 py-2 border-b">
            <p className="text-xs font-medium text-neutral-600">
              Preview with current mapping
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-neutral-50">
                  <th className="text-left px-3 py-2 font-medium text-neutral-700">
                    Date
                  </th>
                  <th className="text-left px-3 py-2 font-medium text-neutral-700">
                    Name
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-neutral-700">
                    Amount
                  </th>
                  {mapping.category !== null && (
                    <th className="text-left px-3 py-2 font-medium text-neutral-700">
                      Category
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {previewRows.slice(0, 3).map((row, ri) => (
                  <tr key={ri} className="border-t border-neutral-100">
                    <td className="px-3 py-1.5 text-neutral-600">
                      {mapping.date !== null ? row[mapping.date] : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-neutral-600">
                      {mapping.name !== null ? row[mapping.name] : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-neutral-600 text-right">
                      {mapping.amount !== null ? row[mapping.amount] : "—"}
                    </td>
                    {mapping.category !== null && (
                      <td className="px-3 py-1.5 text-neutral-600">
                        {row[mapping.category] || "—"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-button)] text-sm font-medium text-neutral-700 hover:bg-neutral-100 transition-colors min-h-[44px]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed || isLoading}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-[var(--radius-button)] text-sm font-medium min-h-[44px] transition-colors",
            canProceed && !isLoading
              ? "bg-primary text-white hover:bg-primary-dark"
              : "bg-neutral-200 text-neutral-400 cursor-not-allowed"
          )}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading Preview...
            </>
          ) : (
            <>
              Next: Preview
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Preview ────────────────────────────────────────────────

function PreviewStep({
  transactions,
  errors,
  skipDuplicates,
  isImporting,
  onSkipDuplicatesChange,
  onBack,
  onImport,
}: {
  transactions: PreviewTransaction[];
  errors: string[];
  skipDuplicates: boolean;
  isImporting: boolean;
  onSkipDuplicatesChange: (v: boolean) => void;
  onBack: () => void;
  onImport: () => void;
}) {
  const duplicateCount = transactions.filter((t) => t.isDuplicate).length;
  const newCount = transactions.length - duplicateCount;
  const toImport = skipDuplicates ? newCount : transactions.length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border rounded-[var(--radius-card)] p-4 text-center">
          <p className="text-2xl font-bold text-neutral-900">
            {transactions.length}
          </p>
          <p className="text-xs text-neutral-500">Total Parsed</p>
        </div>
        <div className="bg-white border rounded-[var(--radius-card)] p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{newCount}</p>
          <p className="text-xs text-neutral-500">New Transactions</p>
        </div>
        <div className="bg-white border rounded-[var(--radius-card)] p-4 text-center">
          <p
            className={cn(
              "text-2xl font-bold",
              duplicateCount > 0 ? "text-amber-600" : "text-neutral-400"
            )}
          >
            {duplicateCount}
          </p>
          <p className="text-xs text-neutral-500">Potential Duplicates</p>
        </div>
      </div>

      {/* Duplicate Toggle */}
      {duplicateCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-[var(--radius-card)] p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 mb-2">
                {duplicateCount} potential duplicate{duplicateCount !== 1 ? "s" : ""} detected
              </p>
              <p className="text-xs text-amber-700 mb-3">
                These transactions match existing ones with the same date,
                amount, and similar name.
              </p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => onSkipDuplicatesChange(e.target.checked)}
                  className="rounded border-amber-400 text-primary focus:ring-primary h-4 w-4"
                />
                <span className="text-sm text-amber-800">
                  Skip duplicates (import only {newCount} new transaction{newCount !== 1 ? "s" : ""})
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Parse / Map Errors */}
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-[var(--radius-card)] p-4">
          <div className="flex items-start gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-medium text-red-800">
              {errors.length} warning{errors.length !== 1 ? "s" : ""}
            </p>
          </div>
          <ul className="text-xs text-red-700 space-y-0.5 ml-6">
            {errors.slice(0, 10).map((err, i) => (
              <li key={i}>{err}</li>
            ))}
            {errors.length > 10 && (
              <li className="text-red-500">
                ...and {errors.length - 10} more warnings
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Transaction Preview Table */}
      <div className="border rounded-[var(--radius-card)] overflow-hidden">
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0">
              <tr className="bg-neutral-100">
                <th className="text-left px-3 py-2 font-medium text-neutral-700 text-xs">
                  Status
                </th>
                <th className="text-left px-3 py-2 font-medium text-neutral-700 text-xs">
                  Date
                </th>
                <th className="text-left px-3 py-2 font-medium text-neutral-700 text-xs">
                  Name
                </th>
                <th className="text-right px-3 py-2 font-medium text-neutral-700 text-xs">
                  Amount
                </th>
                <th className="text-left px-3 py-2 font-medium text-neutral-700 text-xs">
                  Category
                </th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((txn, i) => (
                <tr
                  key={i}
                  className={cn(
                    "border-t border-neutral-100",
                    txn.isDuplicate && skipDuplicates
                      ? "opacity-50 bg-neutral-50"
                      : txn.isDuplicate
                        ? "bg-amber-50/50"
                        : ""
                  )}
                >
                  <td className="px-3 py-2 text-xs">
                    {txn.isDuplicate ? (
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        <AlertTriangle className="h-3 w-3" />
                        {skipDuplicates ? "Skip" : "Duplicate"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-green-700">
                        <CheckCircle className="h-3 w-3" />
                        New
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-neutral-600 text-xs whitespace-nowrap">
                    {txn.date}
                  </td>
                  <td className="px-3 py-2 text-neutral-900 text-xs max-w-[200px] truncate">
                    {txn.name}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-xs text-right whitespace-nowrap currency",
                      txn.amount < 0 ? "text-green-700" : "text-red-700"
                    )}
                  >
                    {txn.amount < 0 ? "+" : "-"}$
                    {Math.abs(txn.amount).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-neutral-600 text-xs">
                    {txn.category || "—"}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-8 text-center text-neutral-400 text-sm"
                  >
                    No transactions to preview
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          disabled={isImporting}
          className="flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-button)] text-sm font-medium text-neutral-700 hover:bg-neutral-100 transition-colors min-h-[44px]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button
          onClick={onImport}
          disabled={isImporting || toImport === 0}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-[var(--radius-button)] text-sm font-medium min-h-[44px] transition-colors",
            !isImporting && toImport > 0
              ? "bg-primary text-white hover:bg-primary-dark"
              : "bg-neutral-200 text-neutral-400 cursor-not-allowed"
          )}
        >
          {isImporting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Import {toImport} Transaction{toImport !== 1 ? "s" : ""}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Step 4: Result ─────────────────────────────────────────────────

function ResultStep({
  result,
  onStartOver,
}: {
  result: ImportResult;
  onStartOver: () => void;
}) {
  return (
    <div className="text-center space-y-6">
      <div className="flex justify-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-neutral-900 mb-2">
          Import Complete
        </h2>
        <p className="text-neutral-500">
          Your transactions have been imported successfully.
        </p>
      </div>

      <div className="inline-flex flex-col sm:flex-row gap-3 sm:gap-8 bg-neutral-50 border rounded-[var(--radius-card)] px-6 py-4">
        <div>
          <p className="text-2xl font-bold text-green-600">{result.imported}</p>
          <p className="text-xs text-neutral-500">Imported</p>
        </div>
        {result.duplicatesSkipped > 0 && (
          <div>
            <p className="text-2xl font-bold text-amber-600">
              {result.duplicatesSkipped}
            </p>
            <p className="text-xs text-neutral-500">Duplicates Skipped</p>
          </div>
        )}
      </div>

      {(result.parseErrors.length > 0 || result.mapErrors.length > 0) && (
        <div className="text-left bg-amber-50 border border-amber-200 rounded-[var(--radius-card)] p-4 max-w-md mx-auto">
          <p className="text-sm font-medium text-amber-800 mb-1">Warnings</p>
          <ul className="text-xs text-amber-700 space-y-0.5">
            {[...result.parseErrors, ...result.mapErrors]
              .slice(0, 5)
              .map((err, i) => (
                <li key={i}>{err}</li>
              ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={onStartOver}
          className="px-5 py-2.5 rounded-[var(--radius-button)] text-sm font-medium border border-neutral-300 text-neutral-700 hover:bg-neutral-100 transition-colors min-h-[44px]"
        >
          Import Another File
        </button>
        <a
          href="/transactions"
          className="px-5 py-2.5 rounded-[var(--radius-button)] text-sm font-medium bg-primary text-white hover:bg-primary-dark transition-colors min-h-[44px] inline-flex items-center justify-center"
        >
          View Transactions
        </a>
      </div>
    </div>
  );
}

// ─── Helper ─────────────────────────────────────────────────────────

/**
 * Simple CSV row parser for preview (client-side).
 * Handles basic quoted fields.
 */
function parseSimpleRow(line: string): string[] {
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
