import { Suspense } from "react";
import ProfilePage from "./ProfilePage";

export default function Page() {
  return (
    <Suspense fallback={<div className="chat-empty"><p>加载中…</p></div>}>
      <ProfilePage />
    </Suspense>
  );
}
