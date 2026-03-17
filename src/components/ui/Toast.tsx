"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { X, AlertCircle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────

type ToastVariant = "error" | "success";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

// ─── Context ────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

// ─── Provider ───────────────────────────────────────────────────────────

const TOAST_DURATION = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(0);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "error") => {
      const id = nextIdRef.current++;
      setToasts((prev) => [...prev, { id, message, variant }]);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, TOAST_DURATION);
    },
    []
  );

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast Container */}
      {toasts.length > 0 && (
        <div
          className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-sm px-4"
          aria-live="polite"
          aria-atomic="true"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={cn(
                "flex items-center gap-2 px-4 py-3 rounded-[var(--radius-card)] shadow-lg text-sm font-medium toast-animate-in",
                toast.variant === "error"
                  ? "bg-red-600 text-white"
                  : "bg-green-600 text-white"
              )}
              role="alert"
            >
              {toast.variant === "error" ? (
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
              ) : (
                <CheckCircle className="h-4 w-4 flex-shrink-0" />
              )}
              <span className="flex-1">{toast.message}</span>
              <button
                onClick={() => dismiss(toast.id)}
                className="p-2 rounded hover:bg-white/20 transition-colors flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
