"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f1117",
          color: "#e8eaed",
          fontFamily: "system-ui, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: 360, width: "100%", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>WE-E</h1>
          <p style={{ opacity: 0.85, marginBottom: "1rem" }}>
            {error.message || "页面出了点问题"}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              width: "100%",
              padding: "0.65rem 1rem",
              borderRadius: 8,
              border: "1px solid #a78bfa",
              background: "transparent",
              color: "#c4b5fd",
              fontSize: "1rem",
            }}
          >
            重试
          </button>
        </div>
      </body>
    </html>
  );
}
