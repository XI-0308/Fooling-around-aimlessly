import { redirect } from "next/navigation";

export default async function CharacterEditRedirect({ params }: { params: Promise<{ id: string }> }) {
  await params;
  redirect("/profile");
}
