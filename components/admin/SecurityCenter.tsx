"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NextLink from "next/link";
import { Button, Chip, Input, addToast } from "@heroui/react";
import { CheckIcon, AlertIcon } from "../icons";

type Session = { id: string; createdAt: string; expiresAt: string; userAgent: string; current: boolean; role: "admin" | "user"; username: string };
type Lockout = { kind: "device" | "network"; lockedUntil: string; level: number };
type Check = { label: string; ok: boolean; detail: string };

/** "Mozilla/5.0 (iPad; CPU OS 17_0 …) … Safari" -> "Safari on iPad" */
function deviceName(ua: string) {
  if (!ua) return "Unknown device";
  const os = /iPad/.test(ua) ? "iPad" : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) && !/Chromium/.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${browser} on ${os}`;
}

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

async function post(body: object) {
  const res = await fetch("/api/admin/security", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
  return json;
}

export function SecurityCenter({
  twoFactorOn,
  twoFactorSince,
  resetFlag,
  sessions,
  lockouts,
  checks,
  adminUsername,
}: {
  adminUsername: string;
  twoFactorOn: boolean;
  twoFactorSince: string | null;
  resetFlag: boolean;
  sessions: Session[];
  lockouts: Lockout[];
  checks: Check[];
}) {
  const router = useRouter();
  const [setup, setSetup] = useState<{ qrSvg: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false); // dates use the viewer's time zone
  useEffect(() => setMounted(true), []);
  const when = (iso: string) => (mounted ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "");

  async function run(key: string, body: object, success: string, after?: () => void) {
    setBusy(key);
    try {
      const json = await post(body);
      addToast({ title: success, color: "success" });
      after?.();
      router.refresh();
      return json;
    } catch (e) {
      addToast({ title: (e as Error).message, color: "danger" });
    } finally {
      setBusy(null);
    }
  }

  async function start2fa() {
    setBusy("start");
    try {
      setSetup(await post({ action: "2fa-start" }));
      setCode("");
    } catch (e) {
      addToast({ title: (e as Error).message, color: "danger" });
    } finally {
      setBusy(null);
    }
  }

  const passed = checks.filter((c) => c.ok).length;

  return (
    <div className="space-y-6">
      <Card title="Security checklist" subtitle={`${passed} of ${checks.length} in place`}>
        <ul className="grid gap-3 sm:grid-cols-2">
          {checks.map((c) => (
            <li key={c.label} className="flex items-start gap-3 rounded-lg bg-background p-3">
              <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${c.ok ? "bg-success text-white" : "bg-warning-100 text-warning-700"}`}>
                {c.ok ? <CheckIcon className="size-3.5" /> : <AlertIcon className="size-3.5" />}
              </span>
              <span>
                <span className="block text-sm font-medium">{c.label}</span>
                <span className="block text-xs text-steel">{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Sign-ins" subtitle="Who can sign in, and where.">
        <ul className="space-y-2 text-sm">
          <li>
            <strong>Admin</strong> (here, /admin/login): username <strong>{adminUsername}</strong> with ADMIN_PASSWORD from the
            environment, plus two-factor when on.
          </li>
          <li>
            <strong>Customers</strong> (home screen): each has their own login, settings and Shippo key.{" "}
            <NextLink href="/admin/users" className="font-medium underline">
              Manage in Users
            </NextLink>
          </li>
        </ul>
      </Card>

      <Card
        title="Two-factor sign-in"
        subtitle="After your password, also ask for a 6-digit code from an authenticator app on your phone."
        action={
          twoFactorOn ? (
            <Chip color="success" variant="flat">On{mounted && twoFactorSince ? ` since ${new Date(twoFactorSince).toLocaleDateString()}` : ""}</Chip>
          ) : (
            <Chip color="warning" variant="flat">Off</Chip>
          )
        }
      >
        {resetFlag && (
          <p className="mb-4 rounded-lg bg-warning-50 p-3 text-sm text-warning-700">
            ADMIN_2FA_RESET is set, so sign-in skips the code. Set up 2FA again if needed, then remove ADMIN_2FA_RESET.
          </p>
        )}

        {!twoFactorOn && !setup && (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-prose text-sm text-steel">
              Works with Google Authenticator, Microsoft Authenticator, Authy, 1Password and similar apps. Even if someone learns your
              password, they can&apos;t sign in without your phone.
            </p>
            <Button color="primary" className="font-semibold" isLoading={busy === "start"} onPress={start2fa}>
              Set up two-factor
            </Button>
          </div>
        )}

        {!twoFactorOn && setup && (
          <div className="grid gap-6 md:grid-cols-[220px_1fr]">
            <div
              className="mx-auto w-[220px] rounded-lg border border-ink/10 bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
              aria-label="QR code for your authenticator app"
              dangerouslySetInnerHTML={{ __html: setup.qrSvg }}
            />
            <ol className="space-y-4 text-sm">
              <li>
                <strong>1. Scan the code</strong> with your authenticator app (Add account → Scan QR code).
                <span className="mt-1 block text-steel">
                  Can&apos;t scan? Enter this key instead: <code className="rounded bg-background px-1.5 py-0.5 font-mono text-foreground">{setup.secret}</code>
                </span>
              </li>
              <li>
                <strong>2. Enter the 6-digit code</strong> the app shows for ShipBridge.
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Input
                    aria-label="6-digit code"
                    variant="bordered"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    className="w-36"
                    classNames={{ input: "font-mono tracking-[0.3em]" }}
                    value={code}
                    onValueChange={(v) => setCode(v.replace(/\D/g, ""))}
                  />
                  <Button
                    color="primary"
                    className="font-semibold"
                    isDisabled={code.length !== 6}
                    isLoading={busy === "confirm"}
                    onPress={() => run("confirm", { action: "2fa-confirm", code }, "Two-factor sign-in is on", () => setSetup(null))}
                  >
                    Turn on
                  </Button>
                  <Button variant="light" onPress={() => setSetup(null)}>
                    Cancel
                  </Button>
                </div>
              </li>
              <li className="text-steel">Turning it on signs out every other session, so they must sign in again with a code.</li>
            </ol>
          </div>
        )}

        {twoFactorOn && (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <p className="max-w-prose text-sm text-steel">
              Sign-in asks for a code from your authenticator app. Lost your phone? Set <code className="font-mono">ADMIN_2FA_RESET=true</code> in
              the environment, sign in, and set it up again.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Current 6-digit code"
                size="sm"
                variant="bordered"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="Code to turn off"
                className="w-40"
                value={code}
                onValueChange={(v) => setCode(v.replace(/\D/g, ""))}
              />
              <Button
                size="sm"
                color="danger"
                variant="flat"
                isDisabled={code.length !== 6}
                isLoading={busy === "disable"}
                onPress={() => run("disable", { action: "2fa-disable", code }, "Two-factor sign-in is off", () => setCode(""))}
              >
                Turn off
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card
        title="Signed-in sessions"
        subtitle="Each session lasts 1 hour. Signing one out ends it immediately."
        action={
          sessions.length > 1 && (
            <Button size="sm" variant="bordered" isLoading={busy === "others"} onPress={() => run("others", { action: "sign-out-others" }, "Other sessions signed out")}>
              Sign out everywhere else
            </Button>
          )
        }
      >
        <ul className="divide-y divide-ink/10">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  {deviceName(s.userAgent)}
                  <Chip size="sm" variant="flat" color={s.role === "admin" ? "primary" : "default"} className="h-5">
                    {s.role === "admin" ? "Admin" : "Customer"} · {s.username}
                  </Chip>
                  {s.current && (
                    <Chip size="sm" color="success" variant="flat" className="h-5">
                      This device
                    </Chip>
                  )}
                </div>
                <p className="text-xs text-steel">
                  Signed in {when(s.createdAt)} · ends {when(s.expiresAt)}
                </p>
              </div>
              {!s.current && (
                <Button size="sm" variant="light" color="danger" isLoading={busy === s.id} onPress={() => run(s.id, { action: "sign-out-session", id: s.id }, "Session signed out")}>
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="Sign-in lockouts"
        subtitle="3 wrong passwords or codes lock a device and its network for 1 hour, doubling each time up to 24 hours."
        action={
          lockouts.length > 0 && (
            <Button size="sm" variant="bordered" isLoading={busy === "clear"} onPress={() => run("clear", { action: "clear-lockouts" }, "Lockouts cleared")}>
              Clear all lockouts
            </Button>
          )
        }
      >
        {lockouts.length === 0 ? (
          <p className="text-sm text-steel">Nothing is locked right now.</p>
        ) : (
          <ul className="space-y-2">
            {lockouts.map((l, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background px-3 py-2 text-sm">
                <span>
                  A {l.kind === "device" ? "browser" : "network (IP address)"} · lockout #{l.level}
                </span>
                <span className="text-steel">until {when(l.lockedUntil)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
