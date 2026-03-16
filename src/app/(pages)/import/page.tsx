import { Upload } from "lucide-react";

export default function ImportPage() {
  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center gap-3 mb-4">
        <Upload className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold text-neutral-900">Import</h1>
      </div>
      <p className="text-neutral-500">
        Import transactions from CSV files. Map columns, preview data, and
        detect duplicates before importing.
      </p>
    </div>
  );
}
