"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type MfaFactor = {
  id: string;
  friendly_name?: string | null;
  status?: string;
};

const MFA_FRIENDLY_NAME = "Glacier authenticator";

export function MfaSettingsCard() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [verifiedFactors, setVerifiedFactors] = useState<MfaFactor[]>([]);
  const [pendingFactors, setPendingFactors] = useState<MfaFactor[]>([]);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshFactors = useCallback(async () => {
    const { data, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) {
      throw listError;
    }

    const totpFactors = (data?.totp ?? []) as MfaFactor[];
    setVerifiedFactors(totpFactors.filter((factor) => factor.status === "verified"));
    setPendingFactors(totpFactors.filter((factor) => factor.status !== "verified"));
  }, [supabase.auth.mfa]);

  const clearPendingFactors = useCallback(
    async (factors: MfaFactor[] = pendingFactors) => {
      for (const factor of factors) {
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({
          factorId: factor.id,
        });

        if (unenrollError) {
          throw unenrollError;
        }
      }
    },
    [pendingFactors, supabase.auth.mfa],
  );

  useEffect(() => {
    let isMounted = true;

    refreshFactors()
      .catch((loadError) => {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load MFA status.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [refreshFactors]);

  async function startEnrollment() {
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) {
        throw listError;
      }

      const staleFactors = ((factors?.totp ?? []) as MfaFactor[]).filter(
        (factor) => factor.status !== "verified",
      );

      if (staleFactors.length > 0) {
        await clearPendingFactors(staleFactors);
      }

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: MFA_FRIENDLY_NAME,
        issuer: "Glacier Finance Tracker",
      });

      if (enrollError) {
        throw enrollError;
      }

      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setMessage("Scan the QR code with your authenticator app, then enter the 6-digit code.");
    } catch (enrollError) {
      setError(enrollError instanceof Error ? enrollError.message : "Failed to start MFA setup.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function resetPendingEnrollment() {
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      await clearPendingFactors();
      setFactorId(null);
      setQrCode(null);
      setSecret(null);
      setCode("");
      await refreshFactors();
      setMessage("The unfinished MFA setup was reset. You can start setup again.");
    } catch (resetError) {
      setError(
        resetError instanceof Error ? resetError.message : "Failed to reset unfinished MFA setup.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId) return;

    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError) {
        throw challengeError;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) {
        throw verifyError;
      }

      setCode("");
      setFactorId(null);
      setQrCode(null);
      setSecret(null);
      await refreshFactors();
      setMessage("MFA is enabled. Bank connections now require this second factor.");
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Failed to verify MFA code.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-5 rounded-[var(--radius-card)] border border-neutral-200 bg-white p-4 md:p-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <h3 className="font-semibold text-neutral-900">Multi-Factor Authentication</h3>
          <p className="mt-1 text-sm text-neutral-500">
            Set up an authenticator app before connecting banks through Plaid.
          </p>
        </div>
      </div>

      {message ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <p className="mt-4 text-sm text-neutral-500">Checking MFA status...</p>
      ) : verifiedFactors.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          MFA is enabled with {verifiedFactors.length} verified authenticator factor
          {verifiedFactors.length === 1 ? "" : "s"}.
        </div>
      ) : (
        <>
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            MFA is not enabled yet. Plaid Link will stay blocked until setup is complete.
          </div>
          {pendingFactors.length > 0 ? (
            <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
              <p>
                There is an unfinished authenticator setup for this account. Starting setup again
                will reset the unfinished factor and show a fresh QR code.
              </p>
              <button
                type="button"
                onClick={resetPendingEnrollment}
                disabled={isSubmitting}
                className="mt-3 rounded-xl border border-sky-300 bg-white px-3 py-2 text-xs font-semibold text-sky-900 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Resetting..." : "Reset Unfinished Setup"}
              </button>
            </div>
          ) : null}
        </>
      )}

      {verifiedFactors.length === 0 && !factorId ? (
        <button
          type="button"
          onClick={startEnrollment}
          disabled={isSubmitting}
          className="mt-4 rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-800 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Starting setup..." : "Set Up Authenticator App"}
        </button>
      ) : null}

      {factorId ? (
        <form onSubmit={verifyEnrollment} className="mt-4 space-y-4">
          {qrCode ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 md:flex-row md:items-center">
              {/* Supabase returns the QR code as a data URL, so Next image optimization is not useful here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrCode}
                alt="Authenticator app QR code"
                className="h-40 w-40 rounded-xl bg-white p-2"
              />
              <div className="text-sm text-neutral-600">
                <p>Scan this QR code with your authenticator app.</p>
                {secret ? (
                  <p className="mt-2 break-all font-mono text-xs text-neutral-500">
                    Manual setup key: {secret}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          <label className="block space-y-2">
            <span className="text-sm font-medium text-neutral-700">6-digit code</span>
            <input
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-neutral-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </label>
          <button
            type="submit"
            disabled={isSubmitting || code.length !== 6}
            className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Verifying..." : "Verify and Enable MFA"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
