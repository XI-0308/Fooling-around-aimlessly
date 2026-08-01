/** 首屏同步应用 localStorage 中的装饰配色，避免 PWA 冷启动与浏览器不一致 */
export default function ThemeBootstrapScript() {
  const script = `
(function () {
  try {
    var iosStandalone = navigator.standalone === true;
    var standalone = false;
    try {
      standalone = window.matchMedia("(display-mode: standalone)").matches
        || window.matchMedia("(display-mode: fullscreen)").matches
        || iosStandalone;
    } catch (e) {}
    if (standalone) document.documentElement.classList.add("standalone-mode");
    if (window.matchMedia && window.matchMedia("(display-mode: fullscreen)").matches) {
      document.documentElement.classList.add("fullscreen-mode");
    }

    var raw = localStorage.getItem("rp-agent-chat-theme-v2");
    if (!raw) return;
    var t = JSON.parse(raw);
    var root = document.documentElement;
    function hexToRgb(hex) {
      var h = String(hex || "").replace("#", "").trim();
      if (h.length !== 6) return null;
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
      };
    }
    function rgba(hex, a) {
      var c = hexToRgb(hex);
      if (!c) return hex;
      return "rgba(" + c.r + "," + c.g + "," + c.b + "," + a + ")";
    }
    function set(name, val) {
      if (val != null && val !== "") root.style.setProperty(name, String(val));
    }
    set("--app-bg", t.appBg);
    set("--app-surface", t.appSurface);
    set("--app-border", t.appBorder);
    set("--sidebar-bg", t.sidebarBg);
    set("--topbar-bg", t.topbarBg);
    set("--accent", t.accent);
    if (t.accent) {
      set("--accent-soft", rgba(t.accent, 0.18));
      set("--accent-12", rgba(t.accent, 0.12));
      set("--accent-18", rgba(t.accent, 0.18));
      set("--accent-25", rgba(t.accent, 0.25));
      set("--accent-35", rgba(t.accent, 0.35));
    }
    set("--app-text", t.systemText);
    set("--text", t.systemText);
    set("--chat-input-bg", t.inputBg);
    set("--chat-input-text", t.inputText);
    var uo = Number(t.userBubbleOpacity);
    if (!isFinite(uo)) uo = 100;
    var ao = Number(t.assistantBubbleOpacity);
    if (!isFinite(ao)) ao = 100;
    if (t.userBubble) set("--chat-user-bubble", rgba(t.userBubble, uo / 100));
    if (t.assistantBubble) set("--chat-assistant-bubble", rgba(t.assistantBubble, ao / 100));
    set("--chat-user-text", t.userText);
    set("--chat-assistant-text", t.assistantText);
    if (t.messageFontSize) set("--chat-message-font-size", t.messageFontSize + "px");
    if (t.nameFontSize) set("--chat-name-font-size", t.nameFontSize + "px");
    if (t.metaFontSize) set("--chat-meta-font-size", t.metaFontSize + "px");
    if (t.reasoningFontSize) set("--chat-reasoning-font-size", t.reasoningFontSize + "px");
    if (t.uiFontSize) set("--chat-ui-font-size", t.uiFontSize + "px");
    set("--btn-primary-bg", t.buttonPrimaryBg);
    set("--btn-primary-text", t.buttonPrimaryText);
    set("--btn-outline-border", t.buttonOutlineBorder);
    set("--btn-outline-text", t.buttonOutlineText);
    set("--btn-ghost-border", t.buttonGhostBorder);
    set("--btn-ghost-text", t.buttonGhostText);
    set("--brand-gradient-start", t.brandGradientStart || "#ddd6fe");
    set("--brand-gradient-mid", t.brandGradientMid || "#a78bfa");
    set("--brand-gradient-end", t.brandGradientEnd || "#7c3aed");
  } catch (e) {}
})();
`;
  return (
    <script
      id="encore-theme-bootstrap"
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
}
