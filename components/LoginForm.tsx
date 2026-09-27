"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input } from "@heroui/react";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(json.error ?? "Could not sign in.");
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-10 max-w-sm space-y-5 rounded-md border-4 border-ink bg-content1 p-8">
      <h1 className="display text-2xl font-bold">Admin sign in</h1>
      {error && <Alert color="danger" title={error} />}
      <Input
        type="password"
        label="Password"
        variant="bordered"
        autoFocus
        isRequired
        value={password}
        onValueChange={setPassword}
      />
      <Button type="submit" color="primary" fullWidth isLoading={loading} className="font-semibold">
        Sign in
      </Button>
    </form>
  );
}
