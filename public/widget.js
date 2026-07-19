/*
 * ویجت چت آرکان — اسنیپت قابل‌جاسازی
 * نصب در هر سایت:
 *   <script src="https://arkan-website-chatbot.vercel.app/widget.js" async></script>
 * یک حباب شناور می‌سازد که گفتگو را داخل یک iframe امن باز می‌کند.
 */
(function () {
  "use strict";
  var current = document.currentScript;
  var BASE = (function () {
    try {
      return new URL(current.src).origin;
    } catch (e) {
      return "https://arkan-website-chatbot.vercel.app";
    }
  })();

  if (window.__arkanWidgetLoaded) return;
  window.__arkanWidgetLoaded = true;

  fetch(BASE + "/api/widget-config")
    .then(function (r) {
      return r.json();
    })
    .then(function (cfg) {
      if (cfg && cfg.enabled === false) return;
      init(cfg || {});
    })
    .catch(function () {
      init({});
    });

  function init(cfg) {
    var color = cfg.primary_color || "#143A32";
    var bone = "#F7F3EC";
    var side = cfg.position === "right" ? "right" : "left";
    var launcherText = cfg.launcher_text || "گفت‌وگو با مشاور";
    var isOpen = false;

    var root = document.createElement("div");
    root.setAttribute("dir", "rtl");
    root.style.cssText =
      "position:fixed;bottom:20px;" + side + ":20px;z-index:2147483000;" +
      "display:flex;flex-direction:column;align-items:" + (side === "left" ? "flex-start" : "flex-end") + ";" +
      "font-family:Tahoma,Arial,sans-serif;";

    var iframe = document.createElement("iframe");
    iframe.src = BASE + "/widget";
    iframe.title = "دستیار آرکان";
    iframe.style.cssText =
      "border:0;width:380px;height:600px;max-width:calc(100vw - 40px);" +
      "max-height:calc(100vh - 120px);border-radius:16px;background:" + bone + ";" +
      "box-shadow:0 12px 48px rgba(20,58,50,0.22);margin-bottom:12px;display:none;";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", launcherText);
    btn.style.cssText =
      "display:inline-flex;align-items:center;gap:8px;border:0;cursor:pointer;" +
      "background:" + color + ";color:" + bone + ";border-radius:999px;" +
      "padding:13px 18px;font-size:14px;font-weight:700;line-height:1;" +
      "box-shadow:0 6px 22px rgba(20,58,50,0.28);transition:transform .15s ease;";
    btn.onmouseenter = function () { btn.style.transform = "translateY(-2px)"; };
    btn.onmouseleave = function () { btn.style.transform = "none"; };

    function render() {
      if (isOpen) {
        btn.innerHTML = closeSvg();
        btn.style.padding = "13px";
        btn.style.borderRadius = "50%";
      } else {
        btn.innerHTML = chatSvg() + "<span>" + escapeHtml(launcherText) + "</span>";
        btn.style.padding = "13px 18px";
        btn.style.borderRadius = "999px";
      }
    }

    // حالت جاری iframe: "chat" | "voice" (src اولیه /widget است)
    var mode = "chat";
    function show(open) {
      isOpen = open;
      iframe.style.display = open ? "block" : "none";
      render();
    }
    function ensureMode(m) {
      if (mode !== m) {
        iframe.src = BASE + "/widget" + (m === "voice" ? "?voice=1" : "");
        mode = m;
      }
    }

    btn.addEventListener("click", function () {
      if (isOpen && mode === "chat") show(false);
      else { ensureMode("chat"); show(true); }
    });

    // دکمه‌ی گفتگوی صوتی (میکروفون) — همیشه پیدا، کنار حباب چت
    var micBtn = document.createElement("button");
    micBtn.type = "button";
    micBtn.setAttribute("aria-label", "گفتگوی صوتی با دستیار");
    micBtn.style.cssText =
      "display:inline-flex;align-items:center;justify-content:center;border:0;cursor:pointer;" +
      "width:48px;height:48px;background:" + bone + ";color:" + color + ";border-radius:50%;" +
      "box-shadow:0 6px 22px rgba(20,58,50,0.28);border:2px solid " + color + ";transition:transform .15s ease;";
    micBtn.innerHTML = micSvg();
    micBtn.onmouseenter = function () { micBtn.style.transform = "translateY(-2px)"; };
    micBtn.onmouseleave = function () { micBtn.style.transform = "none"; };
    micBtn.addEventListener("click", function () {
      if (isOpen && mode === "voice") show(false);
      else { ensureMode("voice"); show(true); }
    });

    // ردیف دکمه‌ها (میکروفون + حباب چت)
    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;align-items:center;gap:10px;";
    bar.appendChild(micBtn);
    bar.appendChild(btn);

    render();
    root.appendChild(iframe);
    root.appendChild(bar);
    document.body.appendChild(root);
  }

  function micSvg() {
    return (
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>'
    );
  }

  function chatSvg() {
    return (
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1H9l-5 4V6a1 1 0 011-1z"/></svg>'
    );
  }
  function closeSvg() {
    return (
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M6 6l12 12M18 6L6 18"/></svg>'
    );
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
})();
