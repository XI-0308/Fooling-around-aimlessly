"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        background: "#0f1117",
        color: "#f3f4f6",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 360, width: "100%" }}>
        <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>WE-E</h1>
        <p style={{ opacity: 0.9, marginBottom: "1rem", lineHeight: 1.45 }}>
          {error.message || "页面加载出错了"}
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            width: "100%",
            padding: "0.7rem 1rem",
            borderRadius: 10,
            border: "1px solid #a78bfa",
            background: "transparent",
            color: "#c4b5fd",
            fontSize: "1rem",
          }}
        >
          重试
        </button>
      </div>
    </div>
  );
}
