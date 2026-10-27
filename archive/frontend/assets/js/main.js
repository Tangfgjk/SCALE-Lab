/* =========================================================================
   前端渲染：从 window.LAB（data.js）读取内容并填充页面。
   所有未给出的字段在数据中以 "@@@" 占位，这里统一高亮显示。
   ========================================================================= */
(function () {
  "use strict";
  var LAB = window.LAB || {};
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // 将 @@@ 占位渲染为高亮提示，其余文本原样返回
  function ph(text) {
    if (text === undefined || text === null) return "";
    return String(text).replace(/@@@/g, '<span class="placeholder" title="待补充">@@@</span>');
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  // 文本先做 HTML 转义，再处理 @@@（@@@ 不含特殊字符，安全）
  function render(s) { return ph(esc(s)); }

  function el(html) {
    var t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  /* ---------------- 首页：Hero / 方向 / 指标 / 画廊 / 新闻 ---------------- */
  function renderHome() {
    var lab = LAB.lab || {};
    if ($("#hero-lede")) $("#hero-lede").innerHTML = render(lab.intro || "");
    if ($("#hero-meta")) {
      $("#hero-meta").innerHTML =
        '<span><span class="dot"></span><b>' + render(lab.department) + '</b></span>' +
        '<span><span class="dot"></span>' + render(lab.university) + '</span>' +
        '<span><span class="dot"></span>办公地点：' + render(lab.location) + '</span>';
    }
    renderDirections($("#dir-grid"));
    renderStats($("#stats"));
    renderGallery($("#gallery"), (LAB.gallery || []));
    renderNews($("#news"));
  }

  function renderDirections(node, hideParticipants) {
    if (!node || !LAB.directions) return;
    node.innerHTML = LAB.directions.map(function (d) {
      var areas = (d.areas || []).map(function (area) {
        var items = (area.items || []).map(function (item) { return '<li>' + render(item) + '</li>'; }).join("");
        return '<section class="direction-area"><h4>' + render(area.title) + '</h4><ul>' + items + '</ul></section>';
      }).join("");
      return '' +
        '<article class="card dir-card direction-row">' +
          '<div class="direction-summary">' +
            '<div class="num">THEME ' + render(d.num) + '</div>' +
            '<h3 class="declaration">' + render(d.titleZh) + '</h3>' +
            '<p>' + render(d.summary) + '</p>' +
            (!hideParticipants && d.participants ? '<div class="direction-team">方向成员 · ' + render(d.participants) + '</div>' : '') +
          '</div>' +
          '<div class="direction-areas">' + areas + '</div>' +
        '</article>';
    }).join("");
  }

  function renderStats(node) {
    if (!node || !LAB.stats) return;
    node.innerHTML = LAB.stats.map(function (s) {
      return '<div class="stat"><div class="n">' + render(s.n) + '<span class="u">' + render(s.u) + '</span></div>' +
             '<div class="l">' + render(s.l) + '</div></div>';
    }).join("");
  }

  function renderGallery(node, items) {
    if (!node || !items) return;
    node.innerHTML = items.map(function (g) {
      return '<figure class="shot"><span>' + render(g.caption) + '</span></figure>';
    }).join("");
  }

  function renderNews(node) {
    if (!node || !LAB.news) return;
    node.innerHTML = LAB.news.map(function (n) {
      return '<div class="news-item">' +
        '<div class="date">' + render(n.date || n.year) + '</div>' +
        '<div><h3>' + render(n.title) + '</h3><p>' + render(n.text) + '</p></div>' +
      '</div>';
    }).join("");
  }

  /* ---------------- 成员页 ---------------- */
  function profileCard(m, hidePhoto) {
    var tags = (m.tags || []).map(function (t) { return '<span class="tag">' + render(t) + '</span>'; }).join("");
    var links = m.links || {};
    var linkHtml = "";
    if (links.orcid && links.orcid !== "@@@") linkHtml += '<a href="' + esc(links.orcid) + '">ORCID</a>';
    if (links.github && links.github !== "@@@") linkHtml += '<a href="' + esc(links.github) + '">GitHub</a>';
    if (links.email && links.email !== "@@@") linkHtml += '<a href="mailto:' + esc(links.email) + '">Email</a>';
    if (m.homepage && m.homepage !== "@@@") linkHtml += '<a href="' + esc(m.homepage) + '">主页</a>';
    var photo = (m.photo && m.photo !== "@@@")
      ? '<img src="' + esc(m.photo) + '" alt="' + esc(m.nameZh) + ' 照片" />'
      : '<div class="ph-ico">📷</div><div style="font-size:12px;margin-top:6px;">@@@ 照片</div>';
    return '' +
      '<article class="profile' + (hidePhoto ? ' no-photo' : '') + '">' +
        (hidePhoto ? '' : '<div class="photo">' + photo + '</div>') +
        '<div class="body">' +
          '<div class="role">' + render(m.role) + '</div>' +
          '<h3>' + render(m.nameZh) + (m.nameEn && m.nameEn !== "@@@" ? ' <span style="font-size:13px;color:var(--ink-soft);font-weight:400;">' + render(m.nameEn) + '</span>' : '') + '</h3>' +
          (m.bio && m.bio !== "@@@" ? '<p class="bio">' + render(m.bio) + '</p>' : '') +
          (tags ? '<div class="tags">' + tags + '</div>' : '') +
          (linkHtml ? '<div class="links">' + linkHtml + '</div>' : '') +
        '</div>' +
      '</article>';
  }

  function researcherFeature(m) {
    var honors = (m.honors || []).map(function (item) {
      return '<span class="advisor-honor">' + render(item) + '</span>';
    }).join("");
    var homepage = m.homepage && m.homepage !== "@@@"
      ? '<a href="' + esc(m.homepage) + '" target="_blank" rel="noreferrer">教师个人主页</a>' : "";
    var initials = m.nameZh ? m.nameZh.charAt(0) : "研";
    var portrait = m.photo && m.photo !== "@@@"
      ? '<img src="' + esc(m.photo) + '" alt="' + esc(m.nameZh) + '照片" />'
      : '<div class="portrait-placeholder" role="img" aria-label="' + esc(m.nameZh) + '个人照片待补充"><span>' + render(initials) + '</span><small>个人照片待补充</small></div>';
    return '<article class="advisor-feature researcher-feature">' +
      '<div class="researcher-avatar">' + portrait + '</div>' +
      '<div class="advisor-content">' +
        '<p class="advisor-role">' + render(m.role) + '</p>' +
        '<h2>' + render(m.nameZh) + (m.nameEn ? ' <span>' + render(m.nameEn) + '</span>' : '') + '</h2>' +
        '<p class="advisor-bio">' + render(m.bio) + '</p>' +
        (honors ? '<div class="advisor-honors">' + honors + '</div>' : '') +
        (m.tags && m.tags.length ? '<div class="researcher-tags">' + m.tags.map(function (tag) {
          return '<span class="advisor-honor">' + render(tag) + '</span>';
        }).join("") + '</div>' : '') +
        '<div class="advisor-facts"><span>华中师范大学人工智能教育学部</span>' +
          (m.location ? '<span>办公地点：' + render(m.location) + '</span>' : '') + homepage +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function renderPeople() {
    var root = $("#people-root");
    if (!root || !LAB.members) return;
    var html = "";

    var advisors = LAB.members.advisor || [];
    if (advisors.length) {
      html += '<div class="group-title"><h3>导师</h3><span class="count">Advisor · ' + advisors.length + ' 人</span></div>';
      var advisor = advisors[0];
      var pi = (LAB.lab && LAB.lab.pi) || {};
      var honors = (pi.honors || []).map(function (item) { return '<span class="advisor-honor">' + render(item) + '</span>'; }).join("");
      var homepage = 'https://faculty.ccnu.edu.cn/wangzhifeng/zh_CN/index.htm';
      html += '<article class="advisor-feature">' +
        '<div class="advisor-image"><img src="' + esc(advisor.photo || 'assets/images/scale-lab-logo.png') + '" alt="王志锋教授照片" /></div>' +
        '<div class="advisor-content">' +
          '<p class="advisor-role">Advisor · 教授 / 博士生导师 / 硕士生导师</p>' +
          '<h2>王志锋 <span>Zhifeng Wang</span></h2>' +
          '<p class="advisor-bio">' + render(pi.bio || advisor.bio || "") + '</p>' +
          '<div class="advisor-honors">' + honors + '</div>' +
          '<div class="advisor-facts"><span>华中师范大学人工智能教育学部</span><span>办公地点：南湖综合楼 N7018</span><a href="' + homepage + '" target="_blank" rel="noreferrer">教师个人主页</a></div>' +
        '</div>' +
      '</article>';
    }

    var researchers = LAB.members.researcher || [];
    if (researchers.length) {
      html += '<div class="group-title"><h3>科研人员</h3><span class="count">Researchers · ' + researchers.length + ' 人</span></div>';
      html += '<div class="grid researcher-grid">' + researchers.map(researcherFeature).join("") + '</div>';
    }

    [
      { key: "student", title: "在读学生", sub: "Current Students" },
      { key: "alumni", title: "毕业校友", sub: "Alumni" }
    ].forEach(function (g) {
      var list = LAB.members[g.key] || [];
      if (!list.length) return;
      html += '<div class="group-title"><h3>' + g.title + '</h3>' +
              '<span class="count">' + g.sub + '</span></div>';
      html += '<div class="grid grid-4">' + list.map(function (m) { return profileCard(m, true); }).join("") + '</div>';
    });
    root.innerHTML = html;

  }

  /* ---------------- 研究页：论文 / 项目 ---------------- */
  function renderResearch() {
    renderDirections($("#dir-grid"), true);
    renderPublications($("#pub-list"));
    renderProjects($("#project-grid"));
  }

  function renderPublications(node) {
    if (!node || !LAB.publications) return;
    node.innerHTML = LAB.publications.map(function (p) {
      var act = (p.url && p.url !== "@@@")
        ? '<div class="act"><a href="' + esc(p.url) + '">PDF / DOI →</a></div>' : "";
      var badge = p.badge ? '<span class="badge">' + render(p.badge) + '</span>' : "";
      return '<div class="pub">' +
        '<div class="yr">' + render(p.year) + '<small>YEAR</small></div>' +
        '<div><p class="title">' + render(p.title) + '</p>' +
        '<p class="venue">' + render(p.authors) + ' · ' + render(p.venue) + badge + '</p></div>' +
        act +
      '</div>';
    }).join("");
  }

  function renderProjects(node) {
    if (!node || !LAB.projects) return;
    node.innerHTML = LAB.projects.map(function (p) {
      return '<div class="project">' +
        '<div class="project-head"><div class="lvl">' + render(p.level) + '</div>' +
          '<span class="project-status">' + render(p.status) + '</span></div>' +
        '<div class="project-details">' +
          '<div><small>负责人</small><strong>' + render(p.role) + '</strong></div>' +
          '<div><small>周期</small><strong>' + render(p.period) + '</strong></div>' +
          '<div><small>项目编号</small><code>' + render(p.grant) + '</code></div>' +
        '</div>' +
      '</div>';
    }).join("");
  }

  /* ---------------- 文化页 ---------------- */
  function renderCulture() {
    var c = LAB.culture || {};
    if ($("#vision")) $("#vision").innerHTML = render((LAB.lab && LAB.lab.tagline) || c.vision || "");
    if ($("#values") && c.values) {
      $("#values").innerHTML = c.values.map(function (v) {
        return '<div class="value"><div class="idx">VALUE ' + render(v.idx) + '</div>' +
               '<h3 class="declaration">' + render(v.title) + '</h3><p>' + render(v.text) + '</p></div>';
      }).join("");
    }
    renderGallery($("#activity-gallery"), (c.activities || []).map(function (a) { return { caption: a.title }; }));
  }

  /* ---------------- 全局页脚 ---------------- */
  function renderFooter() {
    var node = $("#site-footer");
    if (!node || !LAB.lab) return;
    var lab = LAB.lab;
    var kw = (lab.keywords || []).map(function (k) { return "<span>" + render(k) + "</span>"; }).join("");
    node.innerHTML = '' +
      '<div class="container">' +
        '<div class="top">' +
          '<div>' +
            '<div class="brand-f">SCALE Lab</div>' +
            '<p class="footer-intro">' + render(lab.intro || "") + '</p>' +
            '<div class="keywords">' + kw + '</div>' +
          '</div>' +
          '<div>' +
            '<h4>导航</h4><ul>' +
              '<li><a href="index.html">首页</a></li>' +
              '<li><a href="people.html">团队成员</a></li>' +
              '<li><a href="research.html">研究成果</a></li>' +
              '<li><a href="culture.html">实验室文化</a></li>' +
            '</ul>' +
          '</div>' +
          '<div>' +
            '<h4>联系</h4><ul>' +
              '<li>单位：' + render(lab.department) + '，' + render(lab.university) + '</li>' +
              '<li>地址：' + render(lab.location) + '</li>' +
              '<li>邮箱：<a href="mailto:zfwang@ccnu.edu.cn">zfwang@ccnu.edu.cn</a> · <a href="mailto:404717268@qq.com">404717268@qq.com</a></li>' +
            '</ul>' +
          '</div>' +
        '</div>' +
        '<div class="bottom">' +
          '<span>© ' + new Date().getFullYear() + ' ' + render(lab.nameZh) + ' · ' + render(lab.university) + '</span>' +
        '</div>' +
      '</div>';
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    renderHome();
    renderPeople();
    renderResearch();
    renderCulture();
    renderFooter();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
