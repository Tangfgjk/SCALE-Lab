/* =========================================================================
   研究页 · BehaviorDemo：切换“专注度 / 举手行为 / 互动讨论”三个指标。
   所有数值均为演示数据（脱敏），见 LAB.demo。
   ========================================================================= */
(function () {
  "use strict";
  var LAB = window.LAB || {};
  var demo = (LAB.demo) || { metrics: [], note: "演示数据。" };
  var node = document.getElementById("demo");
  if (!node || !demo.metrics.length) return;

  var metrics = demo.metrics;
  var current = metrics[0];

  function ring(pct) {
    return '' +
      '<div class="ring" style="--p:' + pct + ';">' +
        '<div><b>' + pct + '</b><small>%</small></div>' +
      '</div>';
  }

  function switches() {
    return '<div class="switches" role="group" aria-label="选择分析指标">' +
      metrics.map(function (m) {
        var pressed = m.id === current.id ? "true" : "false";
        return '<button type="button" data-id="' + m.id + '" aria-pressed="' + pressed + '">' +
          '<span>' + m.name + '</span><span class="v">' + m.value + '%</span></button>';
      }).join("") +
      '</div>';
  }

  function render() {
    node.innerHTML = '' +
      '<div class="stage">' +
        '<div class="gridbg"></div>' +
        '<div class="readout">' +
          '<div class="metric-name declaration">' + current.name + '</div>' +
          ring(current.value) +
          '<p style="color:rgba(255,255,255,.72);font-size:14px;max-width:24em;">' + current.desc + '</p>' +
        '</div>' +
        '<div class="signal-line"></div>' +
      '</div>' +
      '<div class="panel">' +
        switches() +
        '<p class="explain">指标切换仅改变右上环形图与说明，用于演示“方向—系统—证据”的呈现方式。' +
          '实际部署中，该模块应来自独立受控研究平台，不与公开官网共用数据域。</p>' +
        '<p class="note">⚠ ' + demo.note + '</p>' +
      '</div>';

    Array.prototype.forEach.call(node.querySelectorAll(".switches button"), function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        current = metrics.filter(function (m) { return m.id === id; })[0] || current;
        render();
      });
    });
  }

  render();
})();
