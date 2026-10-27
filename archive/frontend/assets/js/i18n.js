/* SCALE Lab bilingual toggle: page text and language choice persist across pages. */
(function () {
  "use strict";
  var translations = {
    "首页": "Home", "团队成员": "People", "研究成果": "Research", "实验室文化": "Lab Culture",
    "菜单": "Menu", "遇见这支团队": "Meet the Team", "严谨，也有温度。": "Rigorous research, with warmth.",
    "我们看重什么": "Our Values", "课外活动影像": "Life in the Lab", "加入我们": "Join Us",
    "我们研究的内容": "What We Study", "教育数据挖掘": "Educational Data Mining", "多模态课堂分析": "Multimodal Classroom Analytics",
    "教育人工智能理论与实证": "Theory and Evidence in AI for Education", "实验室现场": "Lab in Action", "最新动态": "Latest News",
    "以智能技术理解学习，": "Understanding Learning Through Intelligent Technology, ", "让课堂可被": "making classrooms ", "测量、解释、优化": "measurable, explainable, and improvable",
    "以公平、可信、可解释计算为支撑，开展教育数据挖掘研究。": "We advance educational data mining through fair, trustworthy, and explainable computing.",
    "结合智能感知与多模态大模型，理解课堂中的学习过程并支持教学评价。": "We combine intelligent sensing and multimodal foundation models to understand learning and support teaching assessment.",
    "围绕教育基础理论与实证研究，发展智能教育理论、测量评价方法与研究证据。": "We develop AI-in-education theory, assessment methods, and empirical evidence.",
    "学生建模": "Learner Modeling", "资源建模": "Resource Modeling", "个性化学习": "Personalized Learning",
    "学习状态感知": "Learning-State Sensing", "教学质量评价": "Teaching Quality Assessment", "形成性评价": "Formative Assessment",
    "认知诊断": "Cognitive Diagnosis", "知识追踪": "Knowledge Tracing", "学习分析": "Learning Analytics", "跨模态分析": "Cross-modal Analysis", "知识图谱": "Knowledge Graphs", "自适应学习": "Adaptive Learning", "智能推荐": "Intelligent Recommendation", "学习路径规划": "Learning Path Planning", "自动解题": "Automated Problem Solving", "智能体": "AI Agents", "行为": "Behavior", "情感": "Affect", "认知": "Cognition", "语言": "Language", "姿态": "Posture", "交互": "Interaction", "追踪": "Tracking", "全景": "Holistic View", "证据": "Evidence",
    "发表论文（SCI/SSCI 60+，CSSCI 10，EI 40+）": "160+ publications (60+ SCI/SSCI, 10 CSSCI, 40+ EI)", "主持国家自然科学基金": "National Natural Science Foundation projects led", "第一发明人授权发明专利": "invention patents as first inventor", "出版学术著作": "academic books published",
    "教师个人主页": "Faculty Homepage", "导师": "Advisor", "科研人员": "Researchers", "在读学生": "Current Students", "毕业校友": "Alumni", "讲师（高校）": "Lecturer", "博士": "Ph.D.", "教授": "Professor", "博士生导师": "Ph.D. Supervisor", "硕士生导师": "Master's Supervisor", "办公地点：": "Office: ", "华中师范大学人工智能教育学部": "Faculty of Artificial Intelligence in Education, CCNU", "华中师范大学": "Central China Normal University", "人工智能教育学部": "Faculty of Artificial Intelligence in Education",
    "教育知识图谱": "Educational Knowledge Graphs", "生成式人工智能": "Generative AI", "计算机视觉": "Computer Vision", "数据集压缩": "Dataset Compression", "AI 安全": "AI Safety", "医学图像分析": "Medical Image Analysis", "教育智能体": "AI Agents for Education", "复杂网络分析": "Complex Network Analysis", "多智能体系统": "Multi-agent Systems",
    "计算机技术": "Computer Technology", "数字媒体技术": "Digital Media Technology", "人工智能": "Artificial Intelligence", "软件工程": "Software Engineering", "在读博士生": "Ph.D. Student", "在读硕士生": "Master's Student", "校外保研": "recommended from another university", "本校保研": "recommended from CCNU", "专业第一保研": "top-ranked recommendation",
    "科研项目": "Research Projects", "代表性论文": "Selected Publications", "研究方向": "Research Directions", "课堂行为识别 · 演示": "Classroom Behavior Recognition · Demo", "智慧课堂行为理解系统（示意）": "Smart Classroom Behavior Understanding (Illustration)", "架构图与系统指标为占位，正式版提供可交互架构图与真实指标。": "Architecture and metrics are placeholders; an interactive diagram and verified metrics will be added.", "切换分析指标，环形图与解释文案同步变化。所有数值均为演示数据。": "Switch metrics to update the chart and explanation. All values are illustrative.", "精选代表性条目；完整列表与 DOI / 链接待补充。": "Selected publications; full bibliography and DOI links to follow.", "负责人": "Lead", "周期": "Period", "项目编号": "Grant No.", "主持": "Principal Investigator", "在研": "Ongoing", "结题": "Completed", "国家自然科学基金面上项目": "NSFC General Program", "国家自然科学基金": "National Natural Science Foundation of China", "湖北省自然科学基金": "Hubei Natural Science Foundation", "国家科技支撑计划（子课题）": "National Science and Technology Support Program (Subproject)", "子课题负责人": "Subproject Lead",
    "以智能学习分析与评价，理解真实学习情境中的行为、认知与反馈。": "We use intelligent learning analytics and assessment to understand behavior, cognition, and feedback in authentic learning settings.", "严谨求知": "Rigorous Inquiry", "跨界协作": "Interdisciplinary Collaboration", "以人为本": "Human-centered Research", "开放成长": "Openness and Growth", "以可复现、可解释的方法对待每一个研究问题，欢迎对假设的质疑与对证据的坚持。": "We approach each question with reproducible, explainable methods, welcoming scrutiny of assumptions and commitment to evidence.", "教育、计算机、心理与艺术在此交汇；我们重视不同背景带来的视角，也重视把复杂问题讲清楚的能力。": "Education, computing, psychology, and the arts meet here. We value diverse perspectives and the ability to make complex ideas clear.", "技术服务于学与教。所有智能系统的终点，是让师生更从容、更有获得感。": "Technology should serve learning and teaching, helping students and educators thrive.", "鼓励早期试错与公开分享，支持成员参加学术会议、联合培养与国际交流。": "We encourage early experimentation and open sharing, and support conference participation and international exchange.", "我们长期欢迎对生成式人工智能、智能音视频处理、学习分析与智慧课堂充满热情的同学。": "We welcome students passionate about generative AI, intelligent audio-visual processing, learning analytics, and smart classrooms.", "招生专业包括计算机、教育学、教育技术、电子信息等，详见教师主页“招生信息”。": "Applicants from computing, education, educational technology, electronic information, and related fields are welcome. See the faculty homepage for admissions information.", "联系方式：": "Contact: ",
    "从信号到认知，": "From Signals to Cognition, ", "从课堂到": "from classrooms to ", "可解释的系统": "Explainable Systems", "以“方向—系统—证据—成果”的方式，讲清我们的科研能力。": "Our research is presented through directions, systems, evidence, and outcomes.", "行为识别": "Behavior Recognition", "专注度": "Attention", "举手行为": "Hand-Raising", "互动讨论": "Interaction", "以下为脱敏演示数据，仅用于展示交互形态；真实系统须作为独立受控平台建设，不与公开官网共用数据域。": "This anonymized sample data illustrates the interface only. Any real system must operate as a separate, controlled platform.", "基于头部姿态与视线落点的课堂整体专注度估计（演示）。": "Illustrative classroom attention estimate based on head pose and gaze.", "单位时间内主动举手参与互动的学生占比（演示）。": "Illustrative share of students raising their hands per unit of time.", "师生、生生多模态互动强度指标（演示）。": "Illustrative multimodal interaction intensity among teachers and students.",
    "首版使用占位图，正式版请替换为团队拥有使用权的实拍照片。": "Placeholder images are used for now; replace them with photos cleared for lab use.", "左右滑动查看更多（移动端单卡接近满宽）": "Swipe horizontally to see more (cards nearly fill the screen on mobile).", "更多内容后续通过内容后台发布。": "More updates will be published through the content system.", "地址：": "Address: ", "邮箱：": "Email: ", "正式名称：": "Official name: ", "导航": "Navigation", "联系": "Contact"
  };
  Object.assign(translations, {
    "王志锋教授实验室": "SCALE Lab",
    "一群来自教育、计算机、心理与艺术交叉背景的研究者，围绕“理解学习”这一共同问题紧密协作。": "We are researchers from education, computing, psychology, and the arts, working together to understand how learning happens.",
    "SCALE Lab（智能学习分析与评价实验室）由王志锋教授负责，聚焦教育数据挖掘、多模态课堂分析，以及教育人工智能理论与实证研究。": "Led by Professor Zhifeng Wang, SCALE Lab studies educational data mining, multimodal classroom analytics, and the theory and empirical practice of AI in education.",
    "SCALE Lab 聚焦教育数据挖掘、多模态课堂分析与教育人工智能理论，利用学习数据和课堂多模态信息理解学习过程、改进评价。": "SCALE Lab brings together educational data mining, multimodal classroom analytics, and AI-in-education theory to understand learning and improve assessment.",
    "以公平、可信、可解释计算为支撑，研究学生建模、资源建模与个性化学习。": "We use fair, trustworthy, and explainable computing to advance learner modeling, resource modeling, and personalized learning.",
    "融合智能感知与多模态大模型，开展学习状态感知、教学质量评价与形成性评价。": "We combine intelligent sensing and multimodal foundation models to study learning states, teaching quality, and formative assessment.",
    "研究智能学习与教育评价理论，以及教育测量和多种实证方法。": "We study theories of intelligent learning and educational assessment, along with educational measurement and empirical methods.",
    "查看研究方向": "Explore Research Directions", "认识团队": "Meet the Team", "了解更多": "Learn More",
    "办公地点：南湖综合楼 N7018": "Office: Nanhu Complex, Room N7018",
    "首版使用占位图，正式版请替换为团队拥有使用权的实拍照片。": "Placeholder images are shown for now and should be replaced with lab photos cleared for use.",
    "← 左右滑动查看更多（移动端单卡接近满宽）": "← Swipe to explore more (cards nearly fill the screen on mobile)",
    "以“方向—系统—证据—成果”的方式，讲清我们的科研能力。": "We present our work through research directions, systems, evidence, and outcomes.",
    "从信号到认知，": "From Signals to Cognition, ", "从课堂到": "from Classrooms to ", "可解释的系统": "Explainable Systems",
    "智慧课堂行为理解系统（示意）": "Smart Classroom Behavior Understanding System (Illustration)",
    "多模态采集（视频 / 音频 / 教学行为日志）→ 表征学习（视觉语言预训练、时空图卷积、ENF 取证）→ 认知建模（知识追踪 GCKT / MMKT、认知诊断）→ 可解释输出（学习预警、形成性评价、教学反馈）。": "Multimodal collection (video, audio, and teaching-behavior logs) → representation learning (vision-language pretraining, spatiotemporal graph convolution, and ENF forensics) → cognitive modeling (GCKT/MMKT knowledge tracing and cognitive diagnosis) → explainable outputs (learning alerts, formative assessment, and teaching feedback).",
    "架构图与系统指标为占位，正式版提供可交互架构图与真实指标。": "The architecture diagram and system metrics are placeholders; an interactive diagram and verified metrics will be added.",
    "切换分析指标，环形图与解释文案同步变化。所有数值均为演示数据。": "Choose a metric to update the chart and its explanation. All values are illustrative.",
    "精选代表性条目；完整列表与 DOI / 链接待补充。": "Selected publications are shown; the full bibliography and DOI links will be added.",
    "指标切换仅改变右上环形图与说明，用于演示“方向—系统—证据”的呈现方式。实际部署中，该模块应来自独立受控研究平台，不与公开官网共用数据域。": "Changing a metric updates only the chart and explanation, illustrating how directions, systems, and evidence are presented. In practice, this module should run on a separate, controlled research platform—not share a data domain with the public website.",
    "以下为脱敏演示数据，仅用于展示交互形态；真实系统须作为独立受控平台建设，不与公开官网共用数据域。": "The anonymized sample data below demonstrates the interface only. Any real system should run on a separate, controlled platform, with a data domain isolated from the public website.",
    "基于头部姿态与视线落点的课堂整体专注度估计（演示）。": "Illustrative estimate of overall classroom attention based on head pose and gaze direction.",
    "单位时间内主动举手参与互动的学生占比（演示）。": "Illustrative proportion of students who raise their hands to participate during a time interval.",
    "师生、生生多模态互动强度指标（演示）。": "Illustrative measure of multimodal interaction among teachers and students.",
    "王志锋教授长期从事生成式人工智能、智能音视频处理与教育智能研究。作为负责人已承担 3 项国家自然科学基金、2 项湖北省自然科学基金；发表学术论文 160 余篇（SCI/SSCI 60 余篇、CSSCI 10 篇、EI 40 余篇），出版学术著作 6 部，第一发明人授权发明专利 32 项、软件著作权 39 项；获湖北省教学成果奖一等奖（2018）、湖北省科技进步奖三等奖（2024）及多项国际会议最佳论文奖。": "Professor Zhifeng Wang studies generative AI, intelligent audio-visual processing, and AI in education. He has led 3 National Natural Science Foundation of China projects and 2 Hubei Natural Science Foundation projects; published more than 160 papers (60+ SCI/SSCI, 10 CSSCI, and 40+ EI); authored 6 academic books; and holds 32 invention patents as first inventor and 39 software copyrights. His honors include the First Prize of the Hubei Provincial Teaching Achievement Award (2018), Third Prize of the Hubei Science and Technology Progress Award (2024), and multiple international conference best-paper awards.",
    "博士毕业于武汉大学计算机学院，研究方向包括教育知识图谱、生成式人工智能、计算机视觉、数据集压缩、AI安全与医学图像分析。已发表学术论文12篇，获授权中国发明专利3项，曾获 MLMI 2019 最佳论文奖及2024年“挑战杯”中国大学生创业计划竞赛国家级银奖。": "Earned a Ph.D. from the School of Computer Science at Wuhan University. Research interests include educational knowledge graphs, generative AI, computer vision, dataset compression, AI safety, and medical image analysis. Published 12 papers and holds 3 authorized Chinese invention patents. Awards include Best Paper at MLMI 2019 and a national silver award in the 2024 Challenge Cup Chinese College Students Entrepreneurship Competition.",
    "博士，2025年毕业于澳大利亚伍伦贡大学，曾赴日本名古屋工业大学交流。现主要从事人工智能、学习分析、教育智能体与复杂网络分析研究，在 SCI/EI 检索的国际期刊和会议发表论文多篇。": "Earned a Ph.D. from the University of Wollongong in 2025 and was a visiting scholar at Nagoya Institute of Technology, Japan. Research focuses on artificial intelligence, learning analytics, AI agents for education, and complex network analysis, with multiple papers published in international SCI/EI-indexed journals and conferences.",
    "澳大利亚伍伦贡大学荣誉教授": "Honorary Professor, University of Wollongong",
    "美国卡内基梅隆大学—华南理工大学联合培养博士": "Joint Ph.D. training at Carnegie Mellon University and South China University of Technology",
    "广州市“菁英计划”入选者": "Selected for Guangzhou’s Elite Scheme",
    "湖北省智能科教研究会理事": "Council Member, Hubei Society for Intelligent Education",
    "IEEE / ACM / CCF 会员": "Member of IEEE, ACM, and CCF",
    "GCCCE 2019–2025 程序委员会委员": "Program Committee Member, GCCCE 2019–2025",
    "教师个人主页": "Faculty Homepage", "讲师（高校）": "University Lecturer", "教授 / 博士生导师 / 硕士生导师": "Professor / Ph.D. Supervisor / Master’s Supervisor",
    "个人照片待补充": "Photo to be added", "照片待补充": "Photo to be added",
    "教育技术学": "Educational Technology", "数字媒体技术": "Digital Media Technology", "计算机技术": "Computer Technology", "软件工程": "Software Engineering",
    "在读博士生": "Ph.D. Student", "在读硕士生": "Master’s Student", "在读硕士生（校外保研）": "Master’s Student (Recommended from Another University)", "在读硕士生（本校保研）": "Master’s Student (Recommended from CCNU)", "在读硕士生（专业第一保研）": "Master’s Student (Top-Ranked Recommendation)",
    "毕业研究生 → 阿里巴巴": "Graduate → Alibaba", "毕业研究生 → 长江存储": "Graduate → Yangtze Memory", "毕业研究生 → 国家电网": "Graduate → State Grid", "毕业研究生 → 字节跳动": "Graduate → ByteDance", "毕业研究生 → 腾讯": "Graduate → Tencent", "毕业研究生 → 百度": "Graduate → Baidu",
    " 人": " people", "项": "items", "部": "books",
    "智能教育基础理论": "Foundations of AI in Education", "智能学习理论": "Theory of Intelligent Learning", "智能教育评价理论": "Theory of AI-Based Educational Assessment", "人机共智学习理论": "Human–AI Co-Learning Theory",
    "教育测量与评价": "Educational Measurement and Assessment", "核心素养": "Core Competencies", "量表": "Assessment Scales", "情景化活动": "Scenario-Based Activities", "教育实证研究": "Empirical Research in Education", "设计": "Research Design", "量化": "Quantitative Methods", "质性": "Qualitative Methods", "综合": "Mixed Methods",
    "中科院1区TOP": "CAS Q1 Top", "中科院 1 区 TOP": "CAS Q1 Top", "中科院 1 区 TOP、JCR 1 区。": "CAS Q1 Top; JCR Q1.", "JCR1区": "JCR Q1", "ESI高被引": "ESI Highly Cited",
    "ENFmamba：融合多尺度 ENF 相位与多谐波线索的音频篡改检测": "ENFmamba: Audio Tampering Detection with Multi-Scale ENF Phase and Multi-Harmonic Cues",
    "多模态语音情感识别的层次注意力与动态融合机制": "Hierarchical Attention and Dynamic Fusion for Multimodal Speech Emotion Recognition",
    "AI 驱动的多模态教学行为分析系统研究": "AI-Driven Multimodal Teaching Behavior Analytics",
    "基于对比视觉—语言预训练的智能教育开放集学习行为检测": "Open-Set Learning Behavior Detection in Smart Education via Contrastive Vision–Language Pretraining",
    "基于习题—知识—认知张量的细粒度智能学习诊断模型": "Fine-Grained Intelligent Learning Diagnosis with Exercise–Knowledge–Cognition Tensors",
    "发表于 Expert Systems with Applications，中科院 1 区 TOP、JCR 1 区。": "Published in Expert Systems with Applications (CAS Q1 Top; JCR Q1).",
    "发表于 Applied Soft Computing，聚焦多模态语音情感识别。": "Published in Applied Soft Computing; focuses on multimodal speech emotion recognition.",
    "发表于 Education and Information Technologies，探讨教师注意力、空间距离与学生言语参与。": "Published in Education and Information Technologies; examines instructor attention, proximity, and student verbal engagement.",
    "发表于 IEEE Transactions on Computational Social Systems，面向智慧教育中的零样本行为检测。": "Published in IEEE Transactions on Computational Social Systems; focuses on zero-shot behavior detection in smart education.",
    "发表于 Behavioral Sciences，用于教育评价中的学习诊断与认知分析。": "Published in Behavioral Sciences; applies to learning diagnosis and cognitive analysis in educational assessment.",
    "主持": "Principal Investigator", "在研": "Ongoing", "结题": "Completed", "子课题负责人": "Subproject Lead",
    "发表论文（SCI/SSCI 60+，CSSCI 10，EI 40+）": "160+ publications (60+ SCI/SSCI, 10 CSSCI, 40+ EI)", "主持国家自然科学基金": "National Natural Science Foundation projects led", "第一发明人授权发明专利": "Invention patents as first inventor", "出版学术著作": "Academic books published",
    "让每一次学习都被温柔地理解，让每一位成员都能在严谨与自由中成长。": "We strive to understand every learning experience with care and help every member grow through rigorous and open inquiry.",
    "严谨，也有温度。": "Rigorous research, with warmth.", "以可复现、可解释的方法对待每一个研究问题，欢迎对假设的质疑与对证据的坚持。": "We approach every research question with reproducible, explainable methods, welcoming scrutiny of assumptions and commitment to evidence.",
    "教育、计算机、心理与艺术在此交汇；我们重视不同背景带来的视角，也重视把复杂问题讲清楚的能力。": "Education, computing, psychology, and the arts meet here. We value the perspectives that different backgrounds bring, as well as the ability to make complex ideas clear.",
    "技术服务于学与教。所有智能系统的终点，是让师生更从容、更有获得感。": "Technology should serve learning and teaching. Intelligent systems should help educators and students thrive.",
    "鼓励早期试错与公开分享，支持成员参加学术会议、联合培养与国际交流。": "We encourage early experimentation and open sharing, and support conference participation, joint training, and international exchange.",
    "我们长期欢迎对生成式人工智能、智能音视频处理、学习分析与智慧课堂充满热情的同学。": "We welcome students passionate about generative AI, intelligent audio-visual processing, learning analytics, and smart classrooms.",
    "招生专业包括计算机、教育学、教育技术、电子信息等，详见教师主页“招生信息”。": "Applicants from computing, education, educational technology, electronic information, and related fields are welcome. See the faculty homepage for admissions information.",
    "联系方式：": "Contact: ", "选择分析指标": "Select an Analysis Metric", "待补充": "To be added",
    "正式名称：": "Official name: ", "单位：": "Affiliation: ", "地址：": "Address: ", "邮箱：": "Email: ", "导航": "Navigation", "联系": "Contact"
  });
  Object.assign(translations, {
    "智能学习分析与评价实验室": "Intelligent Learning Analytics and Assessment Lab",
    "王志锋教授实验室团队：导师、科研人员、在读学生与毕业校友。": "The SCALE Lab team: advisor, researchers, current students, and alumni.",
    "南湖综合楼 N7018": "Nanhu Complex, Room N7018", "南湖综合楼7043": "Nanhu Complex, Room 7043", "南湖综合实验楼7045": "Nanhu Complex, Room 7045",
    "Advisor · 1 人": "Advisor · 1 person", "Researchers · 2 人": "Researchers · 2 people", "Current Students · 8 人": "Current Students · 8 people", "Alumni · 8 人": "Alumni · 8 people",
    "Advisor · 教授 / 博士生导师 / 硕士生导师": "Advisor · Professor / Ph.D. Supervisor / Master’s Supervisor",
    "University Lecturer · 博士": "University Lecturer · Ph.D.",
    "MLMI 2019 最佳论文奖": "MLMI 2019 Best Paper Award", "授权中国发明专利 3 项": "3 Authorized Chinese Invention Patents", "2024年“挑战杯”国家级银奖": "2024 Challenge Cup National Silver Award",
    "伍伦贡大学博士": "Ph.D., University of Wollongong", "名古屋工业大学交流经历": "Visiting Scholar at Nagoya Institute of Technology", "SCI/EI 论文成果": "SCI/EI-Indexed Publications",
    "@@@@": "@@@@", "@@@ 实验室合影": "@@@ Lab Group Photo", "@@@ 学术年会": "@@@ Annual Academic Meeting", "@@@ 团建活动": "@@@ Team-Building Event",
    "（待补充真实活动照片）": "(Real activity photo to be added)", "（待补充）": "(To be added)", "@@@ 研究现场 / 智慧课堂": "@@@ Research in Action / Smart Classroom", "@@@ 学术活动": "@@@ Academic Event", "@@@ 团队建设": "@@@ Team Building",
    "讲师（高校） · 博士": "University Lecturer · Ph.D.", "Advisor · 教授 / 博导": "Advisor · Professor / Ph.D. Supervisor",
    "选择分析指标": "Select an Analysis Metric", "环形图": "circular chart", "说明": "description",
    "Current Students · 8 人": "Current Students · 8 people",
    "Alumni · 8 人": "Alumni · 8 people",
    "SCALE Lab · CCNU": "SCALE Lab · CCNU"
  });
  var entries = Object.keys(translations).sort(function (a, b) { return b.length - a.length; });
  var textNodes = [], attributes = [];
  function convert(value) {
    var result = value.replace(/\s+/g, ' ');
    entries.forEach(function (zh) { result = result.split(zh).join(translations[zh]); });
    return result;
  }
  function remember() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) textNodes.push({ node: node, original: node.nodeValue });
    document.querySelectorAll('[aria-label], [title], [alt]').forEach(function (el) {
      ['aria-label', 'title', 'alt'].forEach(function (name) {
        if (el.hasAttribute(name)) attributes.push({ el: el, name: name, original: el.getAttribute(name) });
      });
    });
  }
  function setLanguage(lang) {
    textNodes.forEach(function (item) { item.node.nodeValue = lang === 'en' ? convert(item.original) : item.original; });
    attributes.forEach(function (item) { item.el.setAttribute(item.name, lang === 'en' ? convert(item.original) : item.original); });
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    document.querySelectorAll('[data-language-toggle]').forEach(function (button) {
      button.textContent = lang === 'en' ? '中文' : 'En';
      button.setAttribute('aria-label', lang === 'en' ? '切换到中文' : 'Switch to English');
      button.title = lang === 'en' ? '切换到中文' : 'Switch to English';
    });
    try { localStorage.setItem('scale-lab-language', lang); } catch (error) { /* storage may be disabled */ }
  }
  function init() {
    remember();
    document.querySelectorAll('[data-language-toggle]').forEach(function (button) {
      button.addEventListener('click', function () {
        var next = document.documentElement.lang === 'en' ? 'zh' : 'en';
        setLanguage(next);
      });
    });
    var saved = 'zh';
    try { saved = localStorage.getItem('scale-lab-language') || 'zh'; } catch (error) { /* keep Chinese default */ }
    setLanguage(saved);
    var dynamicObserver = new MutationObserver(function (records) {
      records.forEach(function (record) {
        Array.prototype.forEach.call(record.addedNodes, function (added) {
          function translateText(node) {
            var item = { node: node, original: node.nodeValue };
            textNodes.push(item);
            if (document.documentElement.lang === 'en') node.nodeValue = convert(item.original);
          }
          if (added.nodeType === Node.TEXT_NODE) {
            translateText(added);
          } else if (added.nodeType === Node.ELEMENT_NODE) {
            var walker = document.createTreeWalker(added, NodeFilter.SHOW_TEXT);
            var node;
            while ((node = walker.nextNode())) translateText(node);
          }
        });
      });
    });
    dynamicObserver.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
