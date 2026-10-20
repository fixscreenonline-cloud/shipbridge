import NextLink from "next/link";
import { LoginScreen } from "@/components/LoginScreen";
import { safeNextPath } from "@/lib/safe-redirect";

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <LoginScreen
      next={safeNextPath(next)} // only same-site admin paths (see lib/safe-redirect.ts)
      endpoint="/api/admin/login"
      title="Admin sign in"
      subtitle="Manage margin, shipments, drafts and security."
      footnote={
        <>
          Here to book a label?{" "}
          <NextLink href="/" className="font-medium text-white underline">
            Use the booking sign-in
          </NextLink>
        </>
      }
    />
  );
}
