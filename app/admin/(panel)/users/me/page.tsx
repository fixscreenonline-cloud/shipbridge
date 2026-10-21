import { redirect } from "next/navigation";

/** The admin doesn't book labels, so there's no "own bookings" page. */
export default function MovedPage() {
  redirect("/admin/users");
}
