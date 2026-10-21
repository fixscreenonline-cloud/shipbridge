"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Chip, Input, addToast } from "@heroui/react";
import { formatMoney } from "@/lib/pricing";

type Props = {
  shippo: { connected: boolean; last4: string | null; mode: "test" | "live" | null };
  limits: { labels: number | null; spend: number | null };
  usage: { labels: number; spend: number };
  carriers: string[];
  labelFormat: string;
  hasSender: boolean;
};

function Card({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-ink/10 bg-content1 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ink/10 px-5 py-4">
        <div>
          <h2 className="display text-lg font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-steel">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

async function send(url: string, method: string, body?: object) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
  return json;
}

export function CustomerSettings({ shippo, limits, usage, carriers, labelFormat, hasSender }: Props) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [pw, setPw] = useState({ current: "", next: "", again: "" });
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>, success: string, after?: () => void) {
    setBusy(key);
    try {
      await fn();
      addToast({ title: success, color: "success" });
      after?.();
      router.refresh();
    } catch (e) {
      addToast({ title: (e as Error).message, color: "danger" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card
        title="Shippo account"
        subtitle="Labels are bought on your own Shippo account. Your key is stored encrypted and never shown again."
        action={
          shippo.connected ? (
            <Chip color={shippo.mode === "live" ? "success" : "warning"} variant="flat">
              {shippo.mode === "live" ? "Live" : "Test"} · ····{shippo.last4}
            </Chip>
          ) : (
            <Chip color="warning" variant="flat">
              Not connected
            </Chip>
          )
        }
      >
        {!shippo.connected && (
          <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-steel">
            <li>
              Sign in at{" "}
              <a href="https://portal.goshippo.com/api-config/api" target="_blank" rel="noopener" className="font-medium text-foreground underline">
                portal.goshippo.com → API Configuration
              </a>
              .
            </li>
            <li>Create a key: a <strong>test</strong> key (shippo_test_…) makes free sample labels; a <strong>live</strong> key (shippo_live_…) buys real labels.</li>
            <li>Paste it below. We check it with Shippo before saving.</li>
          </ol>
        )}
        {shippo.mode === "test" && (
          <p className="mb-4 rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-700">You&apos;re using a test key: labels are samples and can&apos;t be shipped.</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Shippo API key"
            placeholder={shippo.connected ? "Paste a new key to replace it" : "shippo_live_… or shippo_test_…"}
            variant="bordered"
            size="sm"
            className="max-w-md"
            autoComplete="off"
            spellCheck="false"
            value={token}
            onValueChange={(v) => setToken(v.trim())}
          />
          <Button
            color="primary"
            size="sm"
            className="font-semibold"
            isDisabled={!token}
            isLoading={busy === "key"}
            onPress={() => run("key", () => send("/api/me/shippo", "PUT", { token }), "Shippo connected", () => setToken(""))}
          >
            {shippo.connected ? "Replace key" : "Connect"}
          </Button>
          {shippo.connected && (
            <Button size="sm" variant="light" color="danger" isLoading={busy === "remove"} onPress={() => run("remove", () => send("/api/me/shippo", "DELETE"), "Shippo key removed")}>
              Remove
            </Button>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Password" subtitle="Changing it signs out your other devices.">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (pw.next !== pw.again) return addToast({ title: "New passwords don't match", color: "danger" });
              run("pw", () => send("/api/me/password", "POST", { current: pw.current, next: pw.next }), "Password changed", () => setPw({ current: "", next: "", again: "" }));
            }}
          >
            <Input label="Current password" type="password" variant="bordered" size="sm" autoComplete="current-password" value={pw.current} onValueChange={(v) => setPw((p) => ({ ...p, current: v }))} />
            <Input label="New password" type="password" variant="bordered" size="sm" autoComplete="new-password" description="8+ characters. Three random words works well." value={pw.next} onValueChange={(v) => setPw((p) => ({ ...p, next: v }))} />
            <Input
              label="Repeat new password"
              type="password"
              variant="bordered"
              size="sm"
              autoComplete="new-password"
              value={pw.again}
              isInvalid={pw.again.length > 0 && pw.again !== pw.next}
              errorMessage="Doesn't match"
              onValueChange={(v) => setPw((p) => ({ ...p, again: v }))}
            />
            <Button type="submit" size="sm" color="primary" className="font-semibold" isDisabled={!pw.current || pw.next.length < 8 || pw.next !== pw.again} isLoading={busy === "pw"}>
              Change password
            </Button>
          </form>
        </Card>

        <Card title="Your account" subtitle="Set by your provider. Ask them to change anything here.">
          <dl className="divide-y divide-ink/10 text-sm">
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-steel">This month</dt>
              <dd>
                {usage.labels} {usage.labels === 1 ? "label" : "labels"} · {formatMoney(usage.spend)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-steel">Monthly limit</dt>
              <dd>
                {limits.labels === null && limits.spend === null
                  ? "None"
                  : [limits.labels !== null && `${limits.labels} ${limits.labels === 1 ? "label" : "labels"}`, limits.spend !== null && formatMoney(limits.spend)].filter(Boolean).join(" · ")}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-steel">Carriers</dt>
              <dd>{carriers.length ? carriers.join(", ") : "All on your Shippo account"}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-steel">Label format</dt>
              <dd>{labelFormat.replace("_", " ")}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-steel">Business address</dt>
              <dd>{hasSender ? "Saved (offered when booking)" : "Not set"}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
