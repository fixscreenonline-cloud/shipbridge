import { redirect } from "next/navigation";

/** Booking is for customer accounts only; the admin manages them. */
export default function MovedPage() {
  redirect("/admin");
}
