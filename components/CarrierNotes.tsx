import { AlertIcon } from "./icons";
import type { CarrierNote } from "@/lib/requests";

/**
 * Why some carriers didn't quote, collected from price checks in the last 24 hours. Shippo asks every
 * carrier on the account, so carriers that can't serve US domestic parcels show up here; turning them
 * off in Shippo removes the noise and speeds up rating.
 */
export function CarrierNotes({ notes, totalChecks }: { notes: CarrierNote[]; totalChecks: number }) {
  return (
    <div className="space-y-5">
      {notes.length === 0 ? (
        <div className="rounded-xl border border-ink/10 bg-content1 p-8 text-center shadow-sm">
          <p className="display text-lg font-semibold">Nothing to report</p>
          <p className="mt-1 text-sm text-steel">
            {totalChecks
              ? "Every carrier on your Shippo account quoted in the last 24 hours."
              : "No price checks in the last 24 hours."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-ink/10 overflow-hidden rounded-xl border border-ink/10 bg-content1 shadow-sm">
          {notes.map((n) => (
            <li key={n.message} className="flex flex-wrap items-start gap-4 p-4 sm:p-5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-warning-50 text-warning-600">
                <AlertIcon className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{n.message}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(n.carriers.length ? n.carriers : ["Carrier not named by Shippo"]).map((c) => (
                    <span key={c} className="rounded-md bg-background px-2 py-0.5 text-xs text-steel">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-background px-2.5 py-1 text-xs font-medium tabular-nums text-steel">
                {n.checks} of {totalChecks} checks
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-xl border border-dashed border-ink/20 p-4 text-sm text-steel">
        <p className="font-medium text-foreground">Reduce these notes</p>
        <p className="mt-1">
          Shippo asks every carrier on your account. Turn off carriers you never use (for example international ones for US
          parcels) in{" "}
          <a href="https://apps.goshippo.com/settings/carriers" target="_blank" rel="noopener" className="font-medium text-foreground underline">
            Shippo → Settings → Carriers
          </a>
          ; rates will also load faster. &quot;Not approved&quot; carriers need approval from Shippo support.
        </p>
      </div>
    </div>
  );
}
