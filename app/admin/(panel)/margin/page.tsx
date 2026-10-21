import { redirect } from "next/navigation";

/** Margin and drafts are per customer now: Admin → Users → a customer. */
export default function MovedPage() {
  redirect("/admin/users");
}
