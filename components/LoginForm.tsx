"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input } from "@heroui/react";

function remaining(ms: number) {
  const totalMin = Math.ceil(ms / 60000);
  if (totalMin < 60) return `${totalMin} minute${totalMin === 1 ? "" : "s"}`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h} hour${h === 1 ? "" : "s"}${m ? ` ${m} min` : ""}`;
}

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
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
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (json.code === "locked" && json.lockedUntil) {
      setNow(Date.now());
      setLockedUntil(Date.parse(json.lockedUntil));
      setPassword("");
      return;
    }
    if (!res.ok) return setError(json.error ?? "Could not sign in.");
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-10 max-w-sm space-y-5 rounded-md border-4 border-ink bg-content1 p-8">
      <h1 className="display text-2xl font-bold">Admin sign in</h1>
      {locked ? (
        <Alert
          color="danger"
          title="Too many failed attempts"
          description={`This device is locked. Try again in ${remaining(lockedUntil! - now)} (at ${new Date(lockedUntil!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}).`}
        />
      ) : (
        error && <Alert color="danger" title={error} />
      )}
      <Input
        type="password"
        label="Password"
        variant="bordered"
        autoFocus
        isRequired
        isDisabled={locked}
        value={password}
        onValueChange={setPassword}
      />
      <Button type="submit" color="primary" fullWidth isLoading={loading} isDisabled={locked} className="font-semibold">
        Sign in
      </Button>
      <p className="text-center text-xs text-steel">Sessions end after 1 hour. 3 wrong passwords lock this device.</p>
    </form>
  );
}
