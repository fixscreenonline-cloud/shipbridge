import NextLink from "next/link";
import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/LoginScreen";
import { ShipmentForm } from "@/components/ShipmentForm";
import { getDraft, getShipment } from "@/lib/db";
import { bookingRequest } from "@/lib/requests";
import { actorFromCookies } from "@/lib/session";
import { ownerOf, type ShipmentRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Home screen. Signed out: the sign-in screen. Signed in as a customer: get rates and book.
 * The admin doesn't book labels, so they go to the dashboard.
 * `?booking=<id>` (Ship again) and `?draft=<id>` refill the form, only from the signed-in owner's own records.
 */
export default async function Home({ searchParams }: { searchParams: Promise<{ booking?: string; draft?: string }> }) {
  const actor = await actorFromCookies();

  if (!actor) {
    return (
      <LoginScreen
        next="/"
        endpoint="/api/login"
        title="Sign in"
        subtitle="Sign in to compare rates and book labels."
        footnote={
          <>
            Private area.{" "}
            <NextLink href="/admin/login" className="font-medium text-white underline">
              Admin sign in
            </NextLink>
          </>
        }
      />
    );
  }

  if (actor.role === "admin") redirect("/admin");

  const { booking, draft } = await searchParams;
  let initial: ShipmentRequest | null = null;
  let from: string | undefined;
  if (booking) {
    const s = await getShipment(booking);
    if (s && ownerOf(s) === actor.ownerId) {
      initial = bookingRequest(s);
      from = "past order";
    }
  } else if (draft) {
    const d = await getDraft(draft);
    if (d && ownerOf(d) === actor.ownerId) {
      initial = { from: d.from, to: d.to, package: d.package, shipDate: d.shipDate };
      from = "draft";
    }
  }

  const user = actor.user;
  const needsKey = !!user && !user.shippo.tokenEnc;
  const scanEnabled = !!process.env.ANTHROPIC_API_KEY && (!user || user.settings.scanEnabled);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6">
      {needsKey && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning-200 bg-warning-50 px-5 py-4">
          <div>
            <p className="font-semibold text-warning-800">Connect your Shippo account to get rates</p>
            <p className="text-sm text-warning-700">Labels are bought on your own Shippo account. Add your API key once in Settings.</p>
          </div>
          <NextLink href="/settings" className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/90">
            Open Settings
          </NextLink>
        </div>
      )}
      <ShipmentForm
        key={booking ?? draft ?? "new"}
        initialRequest={initial}
        prefilledFrom={from}
        scanEnabled={scanEnabled}
        businessSender={user?.settings.defaultSender ?? null}
        storageScope={actor.ownerId}
      />
    </div>
  );
}
