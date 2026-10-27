(function () {
  "use strict";
  var key = "scale-lab-intro-seen";
  var root = document.documentElement;
  var home = location.pathname === "/" || location.pathname === "/index.html";
  function seen() { return localStorage.getItem(key) !== null; }
  function mark() { localStorage.setItem(key, "1"); }
  try {
    if (seen()) return;
    if (!home || location.hash || document.hidden || performance.now() > 1500 || matchMedia("(prefers-reduced-motion: reduce)").matches || navigator.connection?.saveData || !navigator.locks?.request) {
      mark();
      return;
    }
  } catch (_) { return; } // No persistent storage: do not risk repeated playback.

  var finished = false, cleanup = null, startupTimer = null, releaseLock = null;
  var guardTimer = setTimeout(function () { finish("timeout", true); }, 6000);
  root.classList.add("intro-pending");
  root.dataset.campusIntroState = "loading";

  function finish(reason, immediate) {
    if (finished) return;
    finished = true;
    clearTimeout(guardTimer); clearTimeout(startupTimer);
    root.classList.remove("intro-pending");
    root.dataset.campusIntroState = reason;
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
    if (cleanup) cleanup(immediate);
    else if (releaseLock) releaseLock();
  }
  function onVisibility() { if (document.hidden) finish("hidden", true); }
  function onPageHide() { finish("pagehide", true); }
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);

  function show() {
    if (finished) return;
    var body = document.body, previousFocus = document.activeElement, previousOverflow = body.style.overflow;
    var en = localStorage.getItem("scale-lab-language") === "en";
    var overlay = document.createElement("section");
    overlay.className = "campus-intro";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", en ? "Welcome to SCALE Lab" : "欢迎来到SCALE Lab");
    overlay.innerHTML = '<button class="campus-intro-skip" type="button">' + (en ? 'Skip to home' : '跳过，进入首页') + '</button><div class="campus-intro-stage"><video width="1026" height="328" muted playsinline disablepictureinpicture aria-hidden="true"></video><p class="campus-intro-caption">SCALE Lab · ' + (en ? 'Central China Normal University' : '华中师范大学') + '</p></div>';
    var video = overlay.querySelector("video"), button = overlay.querySelector("button"), inertStates = new Map();
    function makeInert(node) {
      if (node instanceof HTMLElement && node !== overlay && !inertStates.has(node)) {
        inertStates.set(node, node.inert); node.inert = true;
      }
    }
    Array.from(body.children).forEach(makeInert);
    var observer = new MutationObserver(function (records) { records.forEach(function (record) { record.addedNodes.forEach(makeInert); }); });
    observer.observe(body, { childList: true });
    body.style.overflow = "hidden";
    function onKey(event) {
      if (event.key === "Escape") { event.preventDefault(); finish("skipped"); }
      if (event.key === "Tab") { event.preventDefault(); button.focus(); }
    }
    document.addEventListener("keydown", onKey, true);
    button.onclick = function () { finish("skipped"); };
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onplaying = function () {
      if (finished) return;
      clearTimeout(startupTimer);
      root.dataset.campusIntroState = "playing";
    };
    video.onended = function () { finish("ended"); };
    video.onerror = function () { finish("media-error", true); };

    cleanup = function (immediate) {
      video.onplaying = video.onended = video.onerror = null;
      video.pause();
      observer.disconnect();
      document.removeEventListener("keydown", onKey, true);
      function remove() {
        overlay.remove();
        video.removeAttribute("src"); video.load();
        body.style.overflow = previousOverflow;
        inertStates.forEach(function (value, node) { if (node.isConnected) node.inert = value; });
        var target = previousFocus && previousFocus !== body && previousFocus.isConnected ? previousFocus : document.querySelector("main");
        if (target) {
          var tabIndex = target.getAttribute("tabindex");
          if (tabIndex === null) target.setAttribute("tabindex", "-1");
          target.focus({ preventScroll: true });
          if (tabIndex === null) target.removeAttribute("tabindex");
        }
        if (releaseLock) releaseLock();
      }
      if (immediate) remove();
      else { overlay.classList.add("is-leaving"); setTimeout(remove, 280); }
    };
    body.append(overlay);
    button.focus({ preventScroll: true });
    startupTimer = setTimeout(function () { finish("slow-start", true); }, 1000);
    // Set src only after the persistent, cross-tab claim succeeds.
    video.src = "assets/media/campus-intro.mp4";
    var playing = video.play();
    if (playing?.catch) playing.catch(function () { finish("autoplay-blocked", true); });
  }

  navigator.locks.request("scale-lab-intro-once", { ifAvailable: true }, async function (lock) {
    if (!lock || finished) { finish("unavailable", true); return; }
    try {
      if (seen()) { finish("seen", true); return; }
      mark(); // Claim before download; skip, reload and failure all count as visited.
      if (document.readyState === "loading") await new Promise(function (resolve) { document.addEventListener("DOMContentLoaded", resolve, { once: true }); });
      if (finished) return;
      await new Promise(function (resolve) {
        releaseLock = resolve;
        try { show(); } catch (_) { finish("unavailable", true); }
      });
    } catch (_) { finish("unavailable", true); }
  }).catch(function () { finish("unavailable", true); });
})();
