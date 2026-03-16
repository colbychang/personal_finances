import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center gap-3 mb-4">
        <Settings className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold text-neutral-900">Settings</h1>
      </div>
      <p className="text-neutral-500">
        Manage bank connections, merchant categorization rules, and app
        preferences.
      </p>
    </div>
  );
}
