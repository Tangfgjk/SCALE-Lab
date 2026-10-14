/* 静态界面文案的语言切换。内容条目由各语言的已发布 API 提供。 */
(function () {
  "use strict";
  var translations = {
    "学校官网": "University Website", "首页": "Home", "团队成员": "People", "研究成果": "Research", "实验室文化": "Lab Culture", "菜单": "Menu",
    "华中师范大学": "Central China Normal University", "人工智能教育学部": "Faculty of Artificial Intelligence in Education",
    "智能学习分析与评价实验室": "Intelligent Learning Analytics and Assessment Lab",
    "以智能技术理解学习，": "Understanding Learning Through Intelligent Technology, ", "让课堂可被": "making classrooms ",
    "测量、解释、优化": "measurable, explainable, and improvable", "查看研究方向": "Explore Research Directions",
    "认识团队": "Meet the Team", "了解更多": "Learn More", "实验室研究概览": "Research Overview",
    "从学习数据到课堂现场，": "From learning data to real classrooms,", "持续探索更可信的教育智能。": "we pursue more trustworthy AI for education.",
    "浏览研究全貌": "Explore All Research", "研究方向": "Research Directions", "最新动态": "Latest News",
    "新闻动态": "Lab News", "返回最新动态": "Back to Latest News",
    "实验室现场": "Lab in Action", "研究方向内容待发布。": "Research directions await publication.",
    "活动照片正在核验，暂无已授权公开的图片。": "Activity photos are under review; no cleared images have been published.",
    "暂无已发布新闻。": "No news has been published yet.", "更多内容后续通过内容后台发布。": "More updates will be published through the content system.",
    "← 左右滑动查看更多（移动端单卡接近满宽）": "← Swipe to explore more",
    "教育数据挖掘": "Educational Data Mining", "多模态课堂分析": "Multimodal Classroom Analytics",
    "教育人工智能理论与实证": "Theory and Evidence in AI for Education",
    "从导师到在读学生与毕业校友，认识参与研究与成长的团队成员。": "Meet the advisor, current students, and alumni who make up the team.",
    "遇见这支团队": "Meet the Team", "严谨，也有温度。": "Rigorous research, with warmth.",
    "导师": "Advisor", "科研人员": "Researchers", "在读学生": "Current Students", "毕业校友": "Alumni",
    "成员资料正在核验，暂无已授权公开的档案。": "Member profiles are under review; none have been cleared for publication.",
    "我们研究的内容": "What We Study", "科研项目": "Research Projects", "代表性论文": "Selected Publications",
    "论文内容待发布。": "Publications await publication.", "项目内容待发布。": "Projects await publication.",
    "精选代表性条目；可通过来源链接核对详情，DOI 待补充。": "Selected publications link to their source records; DOI links will be added later.",
    "从信号到认知，": "From Signals to Cognition, ", "从课堂到": "from Classrooms to ", "可解释的系统": "Explainable Systems",
    "课堂行为识别 · 演示": "Classroom Behavior Recognition · Demo",
    "选择分析指标": "Select an Analysis Metric", "专注度": "Attention", "举手行为": "Hand Raising", "互动讨论": "Interaction",
    "以下为脱敏演示数据，仅用于展示交互形态；真实系统须作为独立受控平台建设，不与公开官网共用数据域。": "The anonymized sample data demonstrates this interface only. A real system would run as a separate, controlled platform.",
    "我们看重什么": "Our Values", "课外活动影像": "Life in the Lab", "加入我们": "Join Us",
    "严谨求知": "Rigorous Inquiry", "跨界协作": "Interdisciplinary Collaboration", "以人为本": "Human-Centered Research", "开放成长": "Openness and Growth",
    "以可复现、可解释的方法对待每一个研究问题，欢迎对假设的质疑与对证据的坚持。": "We approach research questions with reproducible, explainable methods and a commitment to evidence.",
    "教育、计算机、心理与艺术在此交汇；我们重视不同背景带来的视角，也重视把复杂问题讲清楚的能力。": "Education, computing, psychology, and the arts meet here. We value diverse perspectives and clear explanations.",
    "技术服务于学与教。所有智能系统的终点，是让师生更从容、更有获得感。": "Technology should serve learning and teaching, helping students and educators thrive.",
    "鼓励早期试错与公开分享，支持成员参加学术会议、联合培养与国际交流。": "We encourage experimentation, open sharing, conference participation, and international exchange.",
    "让每一次学习都被温柔地理解，让每一位成员都能在严谨与自由中成长。": "We strive to understand learning with care and help every member grow through rigorous, open inquiry.",
    "SCALE Lab（智能学习分析与评价实验室）由王志锋教授负责，聚焦教育数据挖掘、多模态课堂分析，以及教育人工智能理论与实证研究。": "Led by Professor Zhifeng Wang, SCALE Lab studies educational data mining, multimodal classroom analytics, and AI in education.",
    "以智能学习分析与评价，理解真实学习情境中的行为、认知与反馈。": "We use intelligent learning analytics and assessment to understand behavior, cognition, and feedback in authentic learning settings.",
    "导航": "Navigation", "联系": "Contact", "单位：": "Affiliation: ", "地址：": "Address: ", "邮箱：": "Email: ",
    "南湖综合楼 N7018": "Nanhu Complex, Room N7018", "办公地点：": "Office: ",
    "暂停自动切换研究方向": "Pause research rotation", "继续自动切换研究方向": "Resume research rotation",
    "相册切换": "Gallery controls", "上一张相册内容": "Previous gallery item", "下一张相册内容": "Next gallery item", "。": "."
  };
  var entries = Object.keys(translations).sort(function (a, b) { return b.length - a.length; });
  var originalTitle = document.title;
  var textNodes = [], attributes = [];
  function convert(value) {
    var result = value.replace(/\s+/g, " ");
    entries.forEach(function (zh) { result = result.split(zh).join(translations[zh]); });
    return result;
  }
  function remember() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), node;
    while ((node = walker.nextNode())) textNodes.push({ node: node, original: node.nodeValue });
    document.querySelectorAll("[aria-label], [title], [alt]").forEach(function (el) {
      ["aria-label", "title", "alt"].forEach(function (name) { if (el.hasAttribute(name)) attributes.push({ el: el, name: name, original: el.getAttribute(name) }); });
    });
  }
  function setLanguage(lang) {
    textNodes.forEach(function (item) { item.node.nodeValue = lang === "en" ? convert(item.original) : item.original; });
    attributes.forEach(function (item) { item.el.setAttribute(item.name, lang === "en" ? convert(item.original) : item.original); });
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
    document.title = lang === "en" ? convert(originalTitle) : originalTitle;
    document.querySelectorAll("[data-language-toggle]").forEach(function (button) {
      button.textContent = lang === "en" ? "中文" : "En";
      button.setAttribute("aria-label", lang === "en" ? "切换到中文" : "Switch to English");
      button.title = lang === "en" ? "切换到中文" : "Switch to English";
    });
    try { localStorage.setItem("scale-lab-language", lang); } catch (error) { /* storage may be disabled */ }
    document.dispatchEvent(new CustomEvent("scale-lab-language-change", { detail: { language: lang } }));
  }
  function init() {
    remember();
    document.querySelectorAll("[data-language-toggle]").forEach(function (button) {
      button.addEventListener("click", function () { setLanguage(document.documentElement.lang === "en" ? "zh" : "en"); });
    });
    var saved = "zh";
    try { saved = localStorage.getItem("scale-lab-language") || "zh"; } catch (error) { /* keep Chinese default */ }
    setLanguage(saved);
    var dynamicObserver = new MutationObserver(function (records) {
      records.forEach(function (record) { Array.prototype.forEach.call(record.addedNodes, function (added) {
        function translateText(node) { var item = { node: node, original: node.nodeValue }; textNodes.push(item); if (document.documentElement.lang === "en") node.nodeValue = convert(item.original); }
        if (added.nodeType === Node.TEXT_NODE) translateText(added);
        else if (added.nodeType === Node.ELEMENT_NODE) { var walker = document.createTreeWalker(added, NodeFilter.SHOW_TEXT), node; while ((node = walker.nextNode())) translateText(node); }
      }); });
    });
    dynamicObserver.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
