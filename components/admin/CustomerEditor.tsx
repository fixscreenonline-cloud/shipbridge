"use client";

import { useMemo, useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { Button, Chip, Input, Select, SelectItem, Switch, addToast } from "@heroui/react";
import { AddressFields, emptyAddress } from "../AddressFields";
import { applyMargin, formatMoney, round2 } from "@/lib/pricing";
import { DraftsList } from "./DraftsList";
import type { Address, CustomerSettings, CustomerView, Draft, ShipmentRecord } from "@/lib/types";

const CARRIERS = ["USPS", "UPS", "FedEx", "DHL Express", "OnTrac", "LSO"];
const LABEL_TYPES = [
  { key: "PDF_4x6", label: "4×6 PDF (label printer)" },
  { key: "PDF_4x8", label: "4×8 PDF" },
  { key: "PDF", label: "Letter 8.5×11 PDF" },
  { key: "PDF_A4", label: "A4 PDF" },
  { key: "PDF_A6", label: "A6 PDF" },
  { key: "PNG", label: "PNG image" },
  { key: "ZPLII", label: "ZPL (thermal printers)" },
];

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

const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

export function CustomerEditor({
  customer,
  usage,
  recent,
  drafts,
}: {
  customer: CustomerView;
  usage: { labels: number; spend: number; fees: number };
  recent: ShipmentRecord[];
  drafts: Draft[];
}) {
  const router = useRouter();
  const s0 = customer.settings;
  const [profile, setProfile] = useState({ name: customer.name, company: customer.company, email: customer.email });
  const [active, setActive] = useState(customer.active);
  const [fee, setFee] = useState({ percent: String(s0.feePercent), flat: String(s0.feeFlat) });
  const [sender, setSender] = useState<Address | null>(s0.defaultSender);
  const [limits, setLimits] = useState({
    labels: s0.monthlyLabelLimit === null ? "" : String(s0.monthlyLabelLimit),
    spend: s0.monthlySpendLimit === null ? "" : String(s0.monthlySpendLimit),
  });
  const [carriers, setCarriers] = useState<string[]>(s0.allowedCarriers);
  const [labelType, setLabelType] = useState(s0.labelFileType);
  const [scan, setScan] = useState(s0.scanEnabled);
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const settings: CustomerSettings = useMemo(
    () => ({
      feePercent: Number(fee.percent) || 0,
      feeFlat: Number(fee.flat) || 0,
      defaultSender: sender && sender.street ? sender : null,
      monthlyLabelLimit: numOrNull(limits.labels),
      monthlySpendLimit: numOrNull(limits.spend),
      allowedCarriers: carriers,
      labelFileType: labelType,
      scanEnabled: scan,
    }),
    [fee, sender, limits, carriers, labelType, scan],
  );
  const dirty =
    JSON.stringify({ ...profile, active, settings }) !==
    JSON.stringify({ name: customer.name, company: customer.company, email: customer.email, active: customer.active, settings: { ...s0, defaultSender: s0.defaultSender && s0.defaultSender.street ? s0.defaultSender : null } });

  async function call(method: "PATCH" | "POST", body: object, key: string, success: string) {
    setBusy(key);
    const res = await fetch(`/api/admin/users/${customer.id}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      addToast({ title: json.error ?? "Couldn't save.", color: "danger" });
      return false;
    }
    addToast({ title: success, color: "success" });
    router.refresh();
    return true;
  }

  const save = () => call("PATCH", { ...profile, active, settings }, "save", "Customer saved");
  const example = 10;
  const examplePrice = applyMargin(example, { percent: settings.feePercent, flatFee: settings.feeFlat });

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-ink/10 bg-content1 p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <span className="grid size-12 place-items-center rounded-full bg-ink text-lg font-bold text-hivis">
            {(customer.company || customer.name || customer.username).charAt(0).toUpperCase()}
          </span>
          <div>
            <p className="display text-xl font-semibold">{customer.company || customer.name || customer.username}</p>
            <p className="text-sm text-steel">
              Signs in as <strong>@{customer.username}</strong> on the home screen
            </p>
          </div>
        </div>
        <Switch isSelected={active} onValueChange={setActive} color="success">
          {active ? "Account on" : "Account off"}
        </Switch>
      </div>
      {!active && customer.active && (
        <p className="rounded-lg bg-warning-50 px-4 py-3 text-sm text-warning-700">Saving will sign them out and block sign-in until you switch the account back on.</p>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Account" subtitle="Who they are, and their login.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Username"
              variant="flat"
              size="sm"
              className="sm:col-span-2"
              value={customer.username}
              isReadOnly
              startContent={<span className="text-sm text-steel">@</span>}
              description="Permanent. Can't be changed after the account is created."
            />
            <Input label="Business name" variant="bordered" size="sm" value={profile.company} onValueChange={(v) => setProfile((p) => ({ ...p, company: v }))} />
            <Input label="Contact name" variant="bordered" size="sm" value={profile.name} onValueChange={(v) => setProfile((p) => ({ ...p, name: v }))} />
            <Input label="Email" type="email" variant="bordered" size="sm" className="sm:col-span-2" value={profile.email} onValueChange={(v) => setProfile((p) => ({ ...p, email: v }))} />
          </div>
          <div className="mt-5 border-t border-ink/10 pt-4">
            <p className="text-sm font-medium">Reset password</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input
                aria-label="New password"
                placeholder="New password (8+ characters)"
                variant="bordered"
                size="sm"
                className="max-w-xs"
                autoComplete="off"
                value={newPassword}
                onValueChange={setNewPassword}
              />
              <Button
                size="sm"
                variant="bordered"
                isDisabled={newPassword.length < 8}
                isLoading={busy === "pw"}
                onPress={async () => {
                  if (await call("POST", { action: "reset-password", password: newPassword }, "pw", "Password reset. They've been signed out.")) setNewPassword("");
                }}
              >
                Set password
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Your fee" subtitle="Added to their Shippo price on every label. This is what you invoice them.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Fee"
              type="number"
              min={0}
              max={500}
              step="0.1"
              variant="bordered"
              size="sm"
              endContent={<span className="text-sm text-steel">%</span>}
              value={fee.percent}
              onValueChange={(v) => setFee((f) => ({ ...f, percent: v }))}
            />
            <Input
              label="Flat fee per label"
              type="number"
              min={0}
              max={100}
              step="0.01"
              variant="bordered"
              size="sm"
              startContent={<span className="text-sm text-steel">$</span>}
              value={fee.flat}
              onValueChange={(v) => setFee((f) => ({ ...f, flat: v }))}
            />
          </div>
          <p className="mt-4 rounded-lg bg-background px-4 py-3 text-sm">
            A {formatMoney(example)} Shippo label shows as <strong>{formatMoney(examplePrice)}</strong>; your fee is{" "}
            <strong className="text-success">{formatMoney(round2(examplePrice - example))}</strong>.
          </p>
        </Card>
      </div>

      <Card
        title="Default sender"
        subtitle="Their business address. Offered as one tap on the booking form; they can still change it per shipment."
        action={
          sender ? (
            <Button size="sm" variant="light" color="danger" onPress={() => setSender(null)}>
              Remove
            </Button>
          ) : (
            <Button size="sm" variant="bordered" onPress={() => setSender(emptyAddress())}>
              Add address
            </Button>
          )
        }
      >
        {sender ? <AddressFields value={sender} onChange={setSender} /> : <p className="text-sm text-steel">No default sender.</p>}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Monthly limits" subtitle="Leave blank for no limit. Resets on the 1st of each month.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Max labels" type="number" min={0} step="1" variant="bordered" size="sm" placeholder="No limit" value={limits.labels} onValueChange={(v) => setLimits((l) => ({ ...l, labels: v }))} />
            <Input
              label="Max spend"
              type="number"
              min={0}
              step="1"
              variant="bordered"
              size="sm"
              placeholder="No limit"
              startContent={<span className="text-sm text-steel">$</span>}
              value={limits.spend}
              onValueChange={(v) => setLimits((l) => ({ ...l, spend: v }))}
            />
          </div>
          <p className="mt-4 text-sm text-steel">
            This month: <strong className="text-foreground">{usage.labels}</strong> {usage.labels === 1 ? "label" : "labels"}, spend <strong className="text-foreground">{formatMoney(usage.spend)}</strong>, your
            fees <strong className="text-success">{formatMoney(usage.fees)}</strong>.
          </p>
        </Card>

        <Card title="Features" subtitle="What they can use.">
          <p className="text-sm font-medium">Carriers</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CARRIERS.map((c) => {
              const on = carriers.includes(c);
              return (
                <Chip
                  key={c}
                  as="button"
                  variant={on ? "solid" : "bordered"}
                  color={on ? "primary" : "default"}
                  className="cursor-pointer"
                  onClick={() => setCarriers((list) => (on ? list.filter((x) => x !== c) : [...list, c]))}
                >
                  {c}
                </Chip>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-steel">{carriers.length ? `Only ${carriers.join(", ")}.` : "None selected = every carrier on their Shippo account."}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Select
              label="Label format"
              variant="bordered"
              size="sm"
              disallowEmptySelection
              selectedKeys={[labelType]}
              onSelectionChange={(k) => setLabelType(String(Array.from(k)[0]))}
            >
              {LABEL_TYPES.map((t) => (
                <SelectItem key={t.key}>{t.label}</SelectItem>
              ))}
            </Select>
            <Switch isSelected={scan} onValueChange={setScan}>
              Photo / paste scanning
            </Switch>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          title="Shippo connection"
          subtitle="They add their own key in Settings. You only see the last 4 characters."
          action={
            customer.shippo.connected && (
              <Button
                size="sm"
                variant="light"
                color="danger"
                isLoading={busy === "key"}
                onPress={() => call("POST", { action: "remove-shippo-key" }, "key", "Shippo key removed")}
              >
                Remove key
              </Button>
            )
          }
        >
          {customer.shippo.connected ? (
            <p className="text-sm">
              Connected · <strong>{customer.shippo.mode === "live" ? "Live" : "Test"}</strong> key ending <span className="font-mono">····{customer.shippo.last4}</span>
              {customer.shippo.mode === "test" && <span className="ml-2 text-warning-700">(test labels are samples)</span>}
            </p>
          ) : (
            <p className="text-sm text-warning-700">Not connected yet. They can't get rates until they add their Shippo API key in Settings.</p>
          )}
        </Card>

        <Card title="Latest bookings" action={recent.length > 0 && <NextLink href={`/admin/shipments?customer=${encodeURIComponent(customer.id)}`} className="text-sm font-medium text-steel hover:text-foreground">View all</NextLink>}>
          {recent.length === 0 ? (
            <p className="text-sm text-steel">No labels yet.</p>
          ) : (
            <ul className="divide-y divide-ink/10 text-sm">
              {recent.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                  <NextLink href={`/admin/shipments?open=${encodeURIComponent(s.id)}`} className="min-w-0 truncate hover:underline">
                    {s.serviceName} → {s.recipient}
                  </NextLink>
                  <span className="shrink-0 tabular-nums text-steel">
                    {formatMoney(s.charged, s.currency)} · <span className="text-success">+{formatMoney(s.profit, s.currency)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <section>
        <h2 className="display mb-1 text-lg font-semibold">Drafts · last 24 h</h2>
        <p className="mb-4 text-sm text-steel">Their price checks that weren&apos;t booked yet. They delete themselves after 24 hours.</p>
        <DraftsList drafts={drafts} />
      </section>

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-content1/95 px-4 py-3 shadow-lg backdrop-blur" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}>
          <div className="mx-auto flex max-w-7xl items-center justify-end gap-3">
            <span className="text-sm text-steel">Unsaved changes</span>
            <Button variant="light" onPress={() => window.location.reload()}>
              Discard
            </Button>
            <Button color="primary" className="font-semibold" isLoading={busy === "save"} onPress={save}>
              Save changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
