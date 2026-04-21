import { AppBrand } from "@/components/navigation/AppBrand";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-[calc(100vh-120px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
        <AppBrand className="mb-6" />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-neutral-900">Reset your password</h1>
          <p className="text-sm text-neutral-600">
            Enter your email and we&apos;ll send a secure link so you can choose a new password.
          </p>
        </div>
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
