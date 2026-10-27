/* Lightweight motion for the visual preview. No content or storage mutation. */
(function () {
  "use strict";

  function init() {

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var header = document.querySelector(".site-header");
  var root = document.documentElement;

  function updateScroll() {
    var max = Math.max(1, root.scrollHeight - window.innerHeight);
    root.style.setProperty("--page-progress", Math.min(100, Math.max(0, window.scrollY / max * 100)) + "%");
    if (header) header.classList.toggle("is-scrolled", window.scrollY > 30);
  }
  updateScroll();
  window.addEventListener("scroll", updateScroll, { passive: true });
  window.addEventListener("resize", updateScroll, { passive: true });

  if (!reduceMotion.matches && "IntersectionObserver" in window) {
    var items = Array.prototype.slice.call(document.querySelectorAll(
      "section.block .block-head, .home-direction-card, .stat, .direction-row, .advisor-feature, .profile, .project, .pub, .news-item, .gallery .shot, .value, .join-panel"
    ));
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: "0px 0px 30px 0px" });
    items.forEach(function (item, index) {
      item.style.setProperty("--reveal-delay", (index % 4) * 55 + "ms");
      item.classList.add("reveal");
      observer.observe(item);
    });
    requestAnimationFrame(function () { root.classList.add("motion-ready"); });
  }

  var rotator = document.querySelector("[data-research-rotator]");
  if (rotator) {
    var themes = Array.prototype.slice.call(rotator.querySelectorAll("[data-theme-index]"));
    var counter = rotator.querySelector("[data-theme-counter]");
    var toggle = rotator.querySelector("[data-theme-toggle]");
    var current = 0;
    var userPaused = reduceMotion.matches;
    var hovered = false;
    var focused = false;

    function showTheme(index) {
      current = (index + themes.length) % themes.length;
      rotator.dataset.theme = String(current);
      themes.forEach(function (button, i) {
        if (i === current) button.setAttribute("aria-current", "true");
        else button.removeAttribute("aria-current");
      });
      if (counter) counter.textContent = String(current + 1).padStart(2, "0") + " / " + String(themes.length).padStart(2, "0");
    }

    function updateToggle() {
      if (!toggle) return;
      toggle.textContent = userPaused ? "▶" : "Ⅱ";
      var english = document.documentElement.lang === "en";
      var label = userPaused
        ? (english ? "Resume research rotation" : "继续自动切换研究方向")
        : (english ? "Pause research rotation" : "暂停自动切换研究方向");
      toggle.setAttribute("aria-label", label);
      toggle.title = label;
      toggle.setAttribute("aria-pressed", userPaused ? "true" : "false");
    }

    themes.forEach(function (button, index) {
      button.addEventListener("click", function () { showTheme(index); });
    });
    if (toggle) toggle.addEventListener("click", function () {
      userPaused = !userPaused;
      updateToggle();
    });
    document.querySelectorAll("[data-language-toggle]").forEach(function (button) {
      button.addEventListener("click", function () { window.setTimeout(updateToggle, 0); });
    });
    rotator.addEventListener("mouseenter", function () { hovered = true; });
    rotator.addEventListener("mouseleave", function () { hovered = false; });
    rotator.addEventListener("focusin", function () { focused = true; });
    rotator.addEventListener("focusout", function () {
      requestAnimationFrame(function () { focused = rotator.contains(document.activeElement); });
    });
    if (!reduceMotion.matches) window.setInterval(function () {
      if (!userPaused && !hovered && !focused && !document.hidden) showTheme(current + 1);
    }, 4800);
    showTheme(0);
    updateToggle();
  }

  var gallery = document.querySelector("#gallery");
  var previous = document.querySelector("[data-gallery-prev]");
  var next = document.querySelector("[data-gallery-next]");
  if (gallery && previous && next) {
    function updateGalleryButtons() {
      previous.disabled = gallery.scrollLeft < 4;
      next.disabled = gallery.scrollLeft >= gallery.scrollWidth - gallery.clientWidth - 4;
    }
    function moveGallery(direction) {
      var card = gallery.querySelector(".shot");
      if (!card) return;
      var gap = parseFloat(getComputedStyle(gallery).gap) || 0;
      gallery.scrollBy({ left: direction * (card.getBoundingClientRect().width + gap), behavior: reduceMotion.matches ? "instant" : "smooth" });
    }
    previous.addEventListener("click", function () { moveGallery(-1); });
    next.addEventListener("click", function () { moveGallery(1); });
    gallery.addEventListener("scroll", updateGalleryButtons, { passive: true });
    window.addEventListener("resize", updateGalleryButtons, { passive: true });
    updateGalleryButtons();
  }
  }

  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
