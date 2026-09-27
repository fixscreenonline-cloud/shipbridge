import NextLink from "next/link";

// No nav links: customers only need the shipment page. Admin is reached directly at /admin.
export function Header() {
  return (
    <header className="border-b-4 border-ink bg-ink text-white">
      <div className="mx-auto flex max-w-6xl items-center px-4 py-4 sm:px-6">
        <NextLink href="/" className="display text-xl font-bold outline-none focus-visible:ring-2 focus-visible:ring-hivis">
          ShipBridge
        </NextLink>
      </div>
    </header>
  );
}
