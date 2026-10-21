import { redirect } from "next/navigation";
import { CustomerSettings } from "@/components/CustomerSettings";
import { usageThisMonth } from "@/lib/customers";
import { actorFromCookies } from "@/lib/session";

export const dynamic = "force-dynamic";

/** A customer's own settings: Shippo key, password, and a read-only view of what the admin set. */
export default async function SettingsPage() {
  const actor = await actorFromCookies();
  if (!actor) redirect("/");
  if (!actor.user) redirect("/admin/security"); // the admin's settings live in the admin area
  const u = actor.user;
  const usage = await usageThisMonth(u.id);
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-8 sm:px-6">
      <div className="mb-6">
        <h1 className="display text-3xl font-bold sm:text-4xl">Settings</h1>
        <p className="mt-2 text-steel">
          Signed in as <strong>@{u.username}</strong>
          {u.company ? ` · ${u.company}` : ""}
        </p>
      </div>
      <CustomerSettings
        shippo={{ connected: !!u.shippo.tokenEnc, last4: u.shippo.last4, mode: u.shippo.mode }}
        limits={{ labels: u.settings.monthlyLabelLimit, spend: u.settings.monthlySpendLimit }}
        usage={{ labels: usage.labels, spend: usage.spend }}
        carriers={u.settings.allowedCarriers}
        labelFormat={u.settings.labelFileType}
        hasSender={!!u.settings.defaultSender}
      />
    </div>
  );
}
