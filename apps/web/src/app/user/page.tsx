import { redirect } from "next/navigation";

export default function UserRedirect() {
  redirect("/profile?tab=people");
}
