(function () {
  "use strict";
  function init() {
    if (document.getElementById("back-to-top")) return;
    var css = document.createElement("link"); css.rel = "stylesheet"; css.href = "/shared/back-to-top.css"; document.head.append(css);
    var button = document.createElement("button");
    button.id = "back-to-top"; button.type = "button"; button.hidden = true;
    function updateLabel() {
      var en = document.documentElement.lang === "en";
      button.setAttribute("aria-label", en ? "Back to top" : "回到顶部");
      button.title = en ? "Back to top" : "回到顶部";
      button.innerHTML = '<span aria-hidden="true">↑</span><small>' + (en ? 'TOP' : '顶部') + '</small>';
    }
    function update() { button.hidden = window.scrollY < 360; }
    button.onclick = function () { window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); };
    document.body.append(button); updateLabel(); update();
    window.addEventListener("scroll", update, { passive: true });
    document.addEventListener("scale-lab-language-change", updateLabel);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
