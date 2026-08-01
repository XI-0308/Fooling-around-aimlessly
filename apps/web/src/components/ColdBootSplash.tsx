/** 桌面图标 / PWA 冷启动可见占位：JS 挂起时也不会只剩纯黑 */
export default function ColdBootSplash() {
  const html = `
(function () {
  if (window.__efColdBootInstalled) return;
  window.__efColdBootInstalled = true;
  var root = document.createElement("div");
  root.id = "ef-cold-boot";
  root.setAttribute("role", "status");
  root.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483000",
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "justify-content:center",
    "gap:12px",
    "padding:24px",
    "box-sizing:border-box",
    "background:#0f1117",
    "color:#f3f4f6",
    "font-family:system-ui,-apple-system,Segoe UI,sans-serif",
    "text-align:center"
  ].join(";");
  root.innerHTML = [
    '<div style="font-size:1.35rem;font-weight:700;letter-spacing:0.02em">WE-E</div>',
    '<div id="ef-cold-boot-msg" style="font-size:0.95rem;opacity:0.9">正在打开…</div>'
  ].join("");
  document.documentElement.appendChild(root);

  var cleared = false;
  window.__efClearColdBoot = function () {
    if (cleared) return;
    cleared = true;
    var el = document.getElementById("ef-cold-boot");
    if (el) el.remove();
  };

  setTimeout(function () {
    if (cleared) return;
    var msg = document.getElementById("ef-cold-boot-msg");
    if (msg) msg.textContent = "打开有点慢，可能是网络或缓存";
    if (document.getElementById("ef-cold-boot-retry")) return;
    var btn = document.createElement("button");
    btn.id = "ef-cold-boot-retry";
    btn.type = "button";
    btn.textContent = "点此重试";
    btn.style.cssText = [
      "margin-top:4px",
      "padding:10px 18px",
      "border-radius:10px",
      "border:1px solid #a78bfa",
      "background:transparent",
      "color:#c4b5fd",
      "font-size:1rem",
      "cursor:pointer"
    ].join(";");
    btn.onclick = function () { location.reload(); };
    root.appendChild(btn);
  }, 7000);
})();
`;
  return <script id="encore-cold-boot" dangerouslySetInnerHTML={{ __html: html }} />;
}
