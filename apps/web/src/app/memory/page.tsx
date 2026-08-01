import { Suspense } from "react";
import MemoryPageClient from "./MemoryPageClient";

export default function MemoryPage() {
  return (
    <Suspense
      fallback={
        <div className="chat-empty">
          <p>加载中…</p>
        </div>
      }
    >
      <MemoryPageClient />
    </Suspense>
  );
}
