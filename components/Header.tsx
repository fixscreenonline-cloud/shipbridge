import NextLink from "next/link";
import { ProfileMenu } from "./ProfileMenu";
import { actorFromCookies } from "@/lib/session";

// The site is private: signed-out visitors only see a sign-in screen. Signed in, the profile button
// (top right) shows who you are and holds My orders, Settings and sign-out.
export async function Header() {
  const actor = await actorFromCookies().catch(() => null);
  return (
    <header className="border-b-4 border-ink bg-ink text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
        <NextLink href="/" className="display text-xl font-bold outline-none focus-visible:ring-2 focus-visible:ring-hivis">
          ShipBridge
        </NextLink>
        {actor && <ProfileMenu username={actor.user?.company || actor.username} isAdmin={actor.role === "admin"} />}
      </div>
    </header>
  );
}
