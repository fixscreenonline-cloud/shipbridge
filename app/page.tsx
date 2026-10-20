import NextLink from "next/link";
import { LoginScreen } from "@/components/LoginScreen";
import { ShipmentForm } from "@/components/ShipmentForm";
import { roleOf, sessionFromCookies } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Home screen. Signed out: the booking sign-in. Signed in (booking login or admin): get rates and book.
 * The site is private, so nothing here works without signing in (the APIs check the session too).
 */
export default async function Home() {
  const session = await sessionFromCookies();

  if (!session) {
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

  const isAdmin = roleOf(session) === "admin";
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6">
      <ShipmentForm showRecent={isAdmin} scanEnabled={!!process.env.ANTHROPIC_API_KEY} />
    </div>
  );
}
