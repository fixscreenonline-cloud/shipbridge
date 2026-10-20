"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input } from "@heroui/react";
import { safeNextPath } from "@/lib/safe-redirect";

function remaining(ms: number) {
  const totalMin = Math.ceil(ms / 60000);
  if (totalMin < 60) return `${totalMin} minute${totalMin === 1 ? "" : "s"}`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h} hour${h === 1 ? "" : "s"}${m ? ` ${m} min` : ""}`;
}

type Props = {
  next: string;
  /** "/api/login" for the booking login, "/api/admin/login" for admin. */
  endpoint?: string;
  title?: string;
  subtitle?: string;
};

export function LoginForm({
  next,
  endpoint = "/api/admin/login",
  title = "Admin sign in",
  subtitle = "Sign in to manage ShipBridge.",
}: Props) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  // After a correct password, accounts with two-factor sign-in ask for a code.
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);

  const locked = lockedUntil !== null && lockedUntil > now;

  // Tick while locked so the countdown stays current, and unlock the form when time is up.
  useEffect(() => {
    if (lockedUntil === null) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= lockedUntil) {
        setLockedUntil(null);
        setError(null);
      }
    }, 15000);
    return () => clearInterval(t);
  }, [lockedUntil]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (locked) return;
    setLoading(true);
    setError(null);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(needsCode ? { username, password, code } : { username, password }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (json.code === "locked" && json.lockedUntil) {
      setNow(Date.now());
      setLockedUntil(Date.parse(json.lockedUntil));
      setPassword("");
      setCode("");
      setNeedsCode(false);
      return;
    }
    if (res.ok && json.step === "code") {
      setNeedsCode(true);
      return;
    }
    if (!res.ok) {
      setCode("");
      return setError(json.error ?? "Could not sign in.");
    }
    router.replace(safeNextPath(next)); // checked again here, in case this form is reused elsewhere
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="w-full space-y-5 rounded-2xl bg-content1 p-7 text-foreground shadow-2xl ring-1 ring-black/5 sm:p-8">
      <div>
        <h1 className="display text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-steel">{subtitle}</p>
      </div>
      {locked ? (
        <Alert
          color="danger"
          title="Too many failed attempts"
          description={`This device is locked. Try again in ${remaining(lockedUntil! - now)} (at ${new Date(lockedUntil!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}).`}
        />
      ) : (
        error && <Alert color="danger" title={error} />
      )}
      {!needsCode ? (
        <div className="space-y-3">
          <Input
            label="Username"
            variant="bordered"
            autoFocus
            isRequired
            autoComplete="username"
            autoCapitalize="none"
            spellCheck="false"
            maxLength={64}
            isDisabled={locked}
            value={username}
            onValueChange={setUsername}
          />
          <Input
            type="password"
            label="Password"
            variant="bordered"
            isRequired
            autoComplete="current-password"
            maxLength={256}
            isDisabled={locked}
            value={password}
            onValueChange={setPassword}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-steel">Enter the 6-digit code from your authenticator app.</p>
          <Input
            label="Code"
            variant="bordered"
            autoFocus
            isRequired
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            classNames={{ input: "font-mono text-lg tracking-[0.4em]" }}
            isDisabled={locked}
            value={code}
            onValueChange={(v) => setCode(v.replace(/\D/g, ""))}
          />
        </div>
      )}
      <Button
        type="submit"
        color="primary"
        fullWidth
        isLoading={loading}
        isDisabled={locked || (needsCode && code.length !== 6)}
        className="font-semibold"
      >
        {needsCode ? "Verify and sign in" : "Sign in"}
      </Button>
      {needsCode && (
        <button
          type="button"
          className="mx-auto block text-xs text-steel underline"
          onClick={() => {
            setNeedsCode(false);
            setCode("");
            setError(null);
          }}
        >
          Use a different password
        </button>
      )}
      <p className="text-center text-xs text-steel">Sessions end after 1 hour. 3 wrong passwords or codes lock this device.</p>
    </form>
  );
}
