/* =========================================================================
   前端渲染：公开内容读取已发布 API；window.LAB 仅保留当前视觉基线和明确标注的演示交互。
   ========================================================================= */
(function () {
  "use strict";
  var LAB = window.LAB || {};
  var siteSettings = null;
  var homeDirectionTemplates = [];
  var originalHeroTitle = null;
  var originalCultureTitle = null;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // 将 @@@ 占位渲染为高亮提示，其余文本原样返回
  function ph(text) {
    if (text === undefined || text === null) return "";
    return String(text).replace(/@@@/g, '<span class="placeholder" title="待补充">@@@</span>');
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  // 文本先做 HTML 转义，再处理 @@@（@@@ 不含特殊字符，安全）
  function render(s) { return ph(esc(s)); }
  function publicLab() {
    var base = LAB.lab || {};
    return siteSettings ? Object.assign({}, base, siteSettings, { nameZh: siteSettings.name }) : base;
  }
  function orderFeatured(items, key) {
    var selected = siteSettings && siteSettings.featured && siteSettings.featured[key];
    if (!selected || !selected.length) return items;
    return selected.map(function (slug) { return items.find(function (item) { return item.slug === slug; }); }).filter(Boolean);
  }
  function loadSettings() {
    var locale = language();
    return fetch('/api/v1/settings?locale=' + locale).then(function (response) {
      if (!response.ok) throw new Error('Settings unavailable');
      return response.json();
    }).then(function (result) {
      if (locale !== language()) return;
      siteSettings = result ? result.data : null;
      var logo = $('.brand-logo');
      if (logo) {
        logo.src = siteSettings && siteSettings.logo ? siteSettings.logo.url : 'assets/images/scale-lab-logo.png';
        logo.alt = siteSettings && siteSettings.logo ? siteSettings.logo.alt : 'SCALE Lab 智能学习分析与评价实验室';
      }
      renderHome(); renderCulture(); renderFooter();
    }).catch(function () { if (locale === language()) { siteSettings = null; renderHome(); renderCulture(); renderFooter(); } });
  }

  function el(html) {
    var t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  /* ---------------- 首页：Hero / 方向 / 指标 / 画廊 / 新闻 ---------------- */
  function renderHome() {
    var lab = publicLab();
    var heroTitle = $('.hero h1');
    if (heroTitle && originalHeroTitle !== null) {
      heroTitle.innerHTML = siteSettings && siteSettings.heroTitleBefore && siteSettings.heroHighlight
        ? render(siteSettings.heroTitleBefore).replace(/\r?\n/g, '<br>') + '<span class="accent">' + render(siteSettings.heroHighlight) + '</span>' + render(siteSettings.heroTitleAfter || '')
        : originalHeroTitle;
    }
    if ($("#hero-lede")) $("#hero-lede").innerHTML = render(lab.intro || "");
    if ($("#hero-meta")) {
      $("#hero-meta").innerHTML =
        '<span><span class="dot"></span><b>' + render(lab.department) + '</b></span>' +
        '<span><span class="dot"></span>' + render(lab.university) + '</span>' +
        '<span><span class="dot"></span>办公地点：' + render(lab.location) + '</span>';
    }
    loadHomeDirections();
    renderStats($("#stats"));
    loadAlbums($("#gallery"), true);
    loadNews($("#news"));
  }

  function renderDirections(node, items, hideParticipants) {
    node.innerHTML = items.map(function (d) {
      var areas = (d.areas || []).map(function (area) {
        var items = (area.items || []).map(function (item) { return '<li>' + render(item) + '</li>'; }).join("");
        return '<section class="direction-area"><h4>' + render(area.title) + '</h4><ul>' + items + '</ul></section>';
      }).join("");
      return '' +
        '<article class="card dir-card direction-row' + (!d.summary && !areas ? ' name-only' : '') + '">' +
          '<div class="direction-summary">' +
          '<div class="num">THEME ' + render(String(d.themeNumber).padStart(2, '0')) + '</div>' +
            '<h3 class="declaration">' + render(d.title) + '</h3>' +
            (d.summary ? '<p>' + render(d.summary) + '</p>' : '') +
            (!hideParticipants && d.participants ? '<div class="direction-team">方向成员 · ' + render(d.participants) + '</div>' : '') +
          '</div>' +
          (areas ? '<div class="direction-areas">' + areas + '</div>' : '') +
        '</article>';
    }).join("");
  }
  function language() { return document.documentElement.lang === 'en' ? 'en' : 'zh'; }
  function getPublished(path, locale) {
    return fetch('/api/v1/' + path + '?locale=' + locale).then(function (response) {
      if (!response.ok) throw new Error('API unavailable');
      return response.json();
    }).then(function (result) { return result.data || []; });
  }
  function loadDirections(node) {
    if (!node) return;
    var locale = language();
    node.textContent = locale === 'en' ? 'Loading research directions…' : '正在加载研究方向…';
    getPublished('research-directions', locale).then(function (items) {
      if (locale !== language()) return;
      if (!items.length) { node.textContent = language() === 'en' ? 'No published research directions yet.' : '研究方向内容待发布。'; return; }
      renderDirections(node, items, true);
    }).catch(function () { if (locale === language()) node.textContent = locale === 'en' ? 'Research directions are temporarily unavailable.' : '研究方向暂时无法加载。'; });
  }
  function loadHomeDirections() {
    var grid = $('.home-direction-grid');
    if (!grid) return;
    var locale = language();
    var rotator = $('[data-research-rotator]');
    if (!homeDirectionTemplates.length) homeDirectionTemplates = $$('.home-direction-card', grid).map(function (card) { return card.cloneNode(true); });
    grid.textContent = locale === 'en' ? 'Loading research directions…' : '正在加载研究方向…';
    if (rotator) rotator.hidden = true;
    getPublished('research-directions', locale).then(function (items) {
      if (locale !== language()) return;
      if (!items.length) { grid.textContent = language() === 'en' ? 'No published research directions yet.' : '研究方向内容待发布。'; return; }
      items = orderFeatured(items, 'directionSlugs');
      grid.replaceChildren.apply(grid, items.map(function (d, index) {
        var card = (homeDirectionTemplates[index] || homeDirectionTemplates[0]).cloneNode(true);
        card.classList.toggle('name-only', !d.summary);
        $('h3', card).textContent = d.title;
        var summary = $('p', card);
        if (summary) { summary.textContent = d.summary || ''; summary.hidden = !d.summary; }
        return card;
      }));
      if (rotator && items.length === 3) {
        $$('.hero-note li button', rotator).forEach(function (button, index) {
          button.innerHTML = '<span>' + render(String(items[index].themeNumber).padStart(2, '0')) + '</span> ' + render(items[index].title);
        });
        rotator.hidden = false;
      }
    }).catch(function () { if (locale === language()) grid.textContent = locale === 'en' ? 'Research directions are temporarily unavailable.' : '研究方向暂时无法加载。'; });
  }

  function renderStats(node) {
    if (!node) return;
    var stats = siteSettings && siteSettings.stats || [];
    node.closest('section').style.display = stats.length ? '' : 'none';
    node.innerHTML = stats.map(function (s) {
      return '<div class="stat"><div class="n">' + render(s.value) + '<span class="u">' + render(s.unit) + '</span></div>' +
             '<div class="l">' + render(s.label) + '</div></div>';
    }).join("");
  }

  function renderGallery(node, items) {
    if (!node || !items) return;
    node.innerHTML = items.map(function (g) {
      return '<figure class="shot"><span>' + render(g.caption) + '</span></figure>';
    }).join("");
  }
  function loadAlbums(node, coversOnly) {
    if (!node) return;
    var locale = language();
    node.textContent = locale === 'en' ? 'Loading activity photos…' : '正在加载活动照片…';
    getPublished('activities', locale).then(function (albums) {
      if (locale !== language()) return;
      var photos = coversOnly ? albums.map(function (album) { return { album: album, image: album.cover }; }) :
        albums.flatMap(function (album) { return (album.images || []).map(function (image) { return { album: album, image: image }; }); });
      if (!photos.length) { node.textContent = locale === 'en' ? 'Activity photos are being reviewed.' : '活动照片正在核验，暂无已授权公开的图片。'; return; }
      node.innerHTML = photos.map(function (entry) {
        var caption = entry.album.title + (entry.image.caption ? ' · ' + entry.image.caption : '');
        return '<figure class="shot has-image"><img src="' + esc(entry.image.url) + '" alt="' + esc(entry.image.alt) + '" loading="lazy"><span>' + render(caption) + '</span></figure>';
      }).join('');
    }).catch(function () { if (locale === language()) node.textContent = locale === 'en' ? 'Activity photos are temporarily unavailable.' : '活动照片暂时无法加载。'; });
  }

  function renderNews(node, items) {
    node.innerHTML = items.map(function (n) {
      return '<div class="news-item">' +
        '<div class="date">' + render(String(n.happenedAt || '').slice(0, 10)) + '</div>' +
        '<div><h3>' + render(n.title) + '</h3><p>' + render(n.summary) + '</p></div>' +
      '</div>';
    }).join("");
  }
  function loadNews(node) {
    if (!node) return;
    var locale = document.documentElement.lang === 'en' ? 'en' : 'zh';
    node.textContent = locale === 'en' ? 'Loading news…' : '正在加载新闻…';
    fetch('/api/v1/news?locale=' + locale).then(function (response) {
      if (!response.ok) throw new Error('API unavailable');
      return response.json();
    }).then(function (result) {
      if (locale !== language()) return;
      if (!result.data || !result.data.length) {
        node.textContent = locale === 'en' ? 'No published news yet.' : '暂无已发布新闻。';
        return;
      }
      renderNews(node, orderFeatured(result.data, 'newsSlugs'));
    }).catch(function () {
      if (locale === language()) node.textContent = locale === 'en' ? 'News is temporarily unavailable.' : '新闻暂时无法加载，请稍后再试。';
    });
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
          (m.destination ? '<p class="bio">去向：' + render(m.destination) + '</p>' : '') +
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
    if (!root) return;
    var locale = language();
    root.textContent = locale === 'en' ? 'Loading team members…' : '正在加载团队成员…';
    getPublished('members', locale).then(function (items) {
      if (locale !== language()) return;
      if (!items.length) { root.textContent = language() === 'en' ? 'No authorized member profiles have been published yet.' : '成员资料正在核验，暂无已授权公开的档案。'; return; }
      root.innerHTML = [
        { key: 'advisor', title: '导师', sub: 'Advisor' },
        { key: 'researcher', title: '科研人员', sub: 'Researchers' },
        { key: 'student', title: '在读学生', sub: 'Current Students' },
        { key: 'alumni', title: '毕业校友', sub: 'Alumni' }
      ].map(function (group) {
        var members = items.filter(function (item) { return item.category === group.key; });
        if (!members.length) return '';
        var teachers = group.key === 'advisor' || group.key === 'researcher';
        return '<div class="group-title"><h3>' + group.title + '</h3><span class="count">' + group.sub + ' · ' + members.length + ' 人</span></div>' +
          '<div class="grid ' + (teachers ? 'researcher-grid' : 'grid-4') + '">' + members.map(function (member) {
            return teachers ? researcherFeature(member) : profileCard(member, true);
          }).join('') + '</div>';
      }).join('');
    }).catch(function () { if (locale === language()) root.textContent = locale === 'en' ? 'Team members are temporarily unavailable.' : '团队成员暂时无法加载。'; });
  }

  /* ---------------- 研究页：论文 / 项目 ---------------- */
  function renderResearch() {
    loadDirections($("#dir-grid"));
    loadPublications($("#pub-list"));
    loadProjects($("#project-grid"));
  }

  function renderPublications(node, items) {
    node.innerHTML = items.map(function (p) {
      var link = p.externalUrl || (p.doi ? 'https://doi.org/' + encodeURIComponent(p.doi) : '') || p.sourceUrl;
      var act = link ? '<div class="act"><a href="' + esc(link) + '" target="_blank" rel="noreferrer">' + (p.doi ? '查看 DOI' : '查看来源') + ' →</a></div>' : '';
      var badge = p.badge ? '<span class="badge">' + render(p.badge) + '</span>' : "";
      return '<div class="pub">' +
        '<div class="yr">' + render(p.year) + '<small>YEAR</small></div>' +
        '<div><p class="title">' + render(p.title) + '</p>' +
        '<p class="venue">' + render(p.authors) + ' · ' + render(p.venue) + ' · ' + render(({published:'已发表',accepted:'已接收',in_press:'出版中',preprint:'预印本'})[p.stage] || p.stage) + badge + '</p></div>' +
        act +
      '</div>';
    }).join("");
  }
  function loadPublications(node) {
    if (!node) return;
    var locale = language();
    node.textContent = locale === 'en' ? 'Loading publications…' : '正在加载论文…';
    getPublished('publications', locale).then(function (items) {
      if (locale !== language()) return;
      if (!items.length) { node.textContent = language() === 'en' ? 'No published publications yet.' : '论文内容待发布。'; return; }
      renderPublications(node, items);
    }).catch(function () { if (locale === language()) node.textContent = locale === 'en' ? 'Publications are temporarily unavailable.' : '论文暂时无法加载。'; });
  }

  function renderProjects(node, items) {
    node.innerHTML = items.map(function (p) {
      return '<div class="project">' +
        '<div class="project-head"><div class="lvl">' + render(p.title) + '</div>' +
          '<span class="project-status">' + render(({planned:'计划中',ongoing:'在研',completed:'已结题'})[p.projectStatus] || p.projectStatus) + '</span></div>' +
        '<div class="project-details">' +
          '<div><small>资助类别</small><strong>' + render(p.fundingType) + '</strong></div>' +
          '<div><small>承担角色</small><strong>' + render(p.role) + '</strong></div>' +
          '<div><small>周期</small><strong>' + render([p.startsOn,p.endsOn].filter(Boolean).join(' — ')) + '</strong></div>' +
          '<div><small>项目编号</small><code>' + render(p.grantCode) + '</code></div>' +
        '</div>' +
        (p.sourceUrl ? '<a class="project-source" href="' + esc(p.sourceUrl) + '" target="_blank" rel="noreferrer">查看来源 ↗</a>' : '') +
      '</div>';
    }).join("");
  }
  function loadProjects(node) {
    if (!node) return;
    var locale = language();
    node.textContent = locale === 'en' ? 'Loading projects…' : '正在加载项目…';
    getPublished('projects', locale).then(function (items) {
      if (locale !== language()) return;
      if (!items.length) { node.textContent = language() === 'en' ? 'No published projects yet.' : '项目内容待发布。'; return; }
      renderProjects(node, items);
    }).catch(function () { if (locale === language()) node.textContent = locale === 'en' ? 'Projects are temporarily unavailable.' : '项目暂时无法加载。'; });
  }

  /* ---------------- 文化页 ---------------- */
  function renderCulture() {
    var c = LAB.culture || {};
    var title = $('.hero h1');
    if (title && originalCultureTitle !== null) title.innerHTML = siteSettings && siteSettings.cultureTitle ? render(siteSettings.cultureTitle) : originalCultureTitle;
    if ($("#vision")) $("#vision").innerHTML = render(siteSettings && siteSettings.cultureVision || c.vision || "");
    var values = siteSettings && siteSettings.cultureValues && siteSettings.cultureValues.length ? siteSettings.cultureValues : c.values;
    if ($("#values") && values) {
      $("#values").innerHTML = values.map(function (v, index) {
        return '<div class="value"><div class="idx">VALUE ' + render(String(index + 1).padStart(2, '0')) + '</div>' +
               '<h3 class="declaration">' + render(v.title) + '</h3><p>' + render(v.text) + '</p></div>';
      }).join("");
    }
    loadAlbums($("#activity-gallery"), false);
  }

  /* ---------------- 全局页脚 ---------------- */
  function renderFooter() {
    var node = $("#site-footer");
    if (!node || !LAB.lab) return;
    var lab = publicLab();
    var kw = (lab.keywords || []).map(function (k) { return "<span>" + render(k) + "</span>"; }).join("");
    node.innerHTML = '' +
      '<div class="container">' +
        '<div class="top">' +
          '<div>' +
            '<div class="brand-f">' + render(lab.shortName || 'SCALE Lab') + '</div>' +
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
              (siteSettings && siteSettings.contactEmail ? '<li>邮箱：<a href="mailto:' + esc(siteSettings.contactEmail) + '">' + render(siteSettings.contactEmail) + '</a></li>' : '') +
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
    if ($('.home-directions')) originalHeroTitle = $('.hero h1')?.innerHTML || null;
    if ($('#values')) originalCultureTitle = $('.hero h1')?.innerHTML || null;
    renderHome();
    renderPeople();
    renderResearch();
    renderCulture();
    renderFooter();
    loadSettings();
    document.addEventListener('scale-lab-language-change', function () {
      siteSettings = null;
      loadSettings(); loadDirections($("#dir-grid")); loadPublications($("#pub-list")); loadProjects($("#project-grid")); renderPeople(); loadAlbums($("#gallery"), true); loadAlbums($("#activity-gallery"), false);
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
