/* =========================================================================
   内容数据（首版评审用，生产环境由后端 /api/v1 提供）
   说明：真实信息来自华中师范大学教师主页（王志锋）。
   凡是主页未给出、需后续补充的字段，一律以 "@@@" 占位。
   ========================================================================= */

window.LAB = {
  /* ---------- 实验室 / 站点基本信息 ---------- */
  lab: {
    nameZh: "智能学习分析与评价实验室",
    nameEn: "SCALE Lab",
    // 以下为实验室正式中英文名，主页未单独给出，留待补充
    formalNameZh: "@@@",
    formalNameEn: "@@@",
    department: "华中师范大学",
    university: "人工智能教育学部",
    universityEn: "Central China Normal University (CCNU)",
    // 仿 Terrer Lab 的宣言式 Hero 文案（基于真实研究方向凝练）
    tagline: "以智能学习分析与评价，理解真实学习情境中的行为、认知与反馈。",
    taglineEn: "Understanding learning with intelligent technology — measurable, explainable, optimizable classrooms.",
    intro:
      "SCALE Lab（智能学习分析与评价实验室）由王志锋教授负责，聚焦教育数据挖掘、多模态课堂分析，以及教育人工智能理论与实证研究。",
    location: "南湖综合楼 N7018",
    email: "@@@",          // 主页联系方式为加密字段，需补充
    officePhone: "@@@",
    established: "@@@",     // 实验室成立年份未给出
    pi: {
      nameZh: "王志锋",
      nameEn: "Zhifeng Wang",
      title: "教授 / 博士生导师",
      titlesEn: "Professor, PhD Supervisor",
      honors: [
        "澳大利亚伍伦贡大学荣誉教授",
        "美国卡内基梅隆大学—华南理工大学联合培养博士",
        "广州市“菁英计划”入选者",
        "湖北省智能科教研究会理事",
        "IEEE / ACM / CCF 会员",
        "GCCCE 2019–2025 程序委员会委员"
      ],
      bio:
        "王志锋教授长期从事生成式人工智能、智能音视频处理与教育智能研究。作为负责人已承担 3 项国家自然科学基金、2 项湖北省自然科学基金；发表学术论文 160 余篇（SCI/SSCI 60 余篇、CSSCI 10 篇、EI 40 余篇），出版学术著作 6 部，第一发明人授权发明专利 32 项、软件著作权 39 项；获湖北省教学成果奖一等奖（2018）、湖北省科技进步奖三等奖（2024）及多项国际会议最佳论文奖。",
      education: [
        { years: "2011.9–2012.9", text: "联合培养博士，美国卡内基梅隆大学(CMU)计算机学院，于图灵奖得主 Raj Reddy 教授语音组开展鲁棒语音技术研究" },
        { years: "2009.9–2013.6", text: "博士（保送），华南理工大学电子与信息学院，信号与信息处理专业" },
        { years: "2008.9–2009.6", text: "硕士（保送），华南理工大学电子与信息学院，信号与信息处理专业" },
        { years: "2004.9–2008.6", text: "本科，中国地质大学（武汉）机电学院，电子信息工程专业" }
      ],
      experience: [
        { years: "2025.7–至今", text: "教授、博士生导师、硕士生导师，华中师范大学人工智能教育学部" },
        { years: "2016.6–2025.6", text: "副教授、博士生导师、硕士生导师，华中师范大学人工智能教育学部" },
        { years: "2013.7–2016.6", text: "讲师、硕士生导师，华中师范大学人工智能教育学部" },
        { years: "2011.9–2012.9", text: "助理研究员，美国卡内基梅隆大学(CMU)计算机学院" }
      ]
    },
    keywords: ["生成式人工智能", "智能音视频处理", "教育大数据", "学习分析", "知识追踪", "人机交互", "虚拟现实", "多媒体取证"]
  },

  /* ---------- 研究方向（仿 Terrer Lab 编号主题） ---------- */
  directions: [
    {
      id: "genai-edu",
      num: "01",
      titleZh: "教育数据挖掘",
      titleEn: "Generative AI in Education",
      summary: "以公平、可信、可解释计算为支撑，开展教育数据挖掘研究。",
      participants: "晓雪、孟皓、玉林",
      areas: [
        { title: "学生建模", items: ["认知诊断", "知识追踪", "学习分析"] },
        { title: "资源建模", items: ["跨模态分析", "知识图谱", "LLM"] },
        { title: "个性化学习", items: ["自适应学习", "智能推荐", "学习路径规划", "自动解题", "智能体"] }
      ]
    },
    {
      id: "av-multimedia",
      num: "02",
      titleZh: "多模态课堂分析",
      titleEn: "Intelligent Audio-Visual Processing & Multimedia Forensics",
      summary: "结合智能感知与多模态大模型，理解课堂中的学习过程并支持教学评价。",
      participants: "宇轩、张杉、自力",
      areas: [
        { title: "学习状态感知", items: ["行为", "情感", "认知"] },
        { title: "教学质量评价", items: ["语言", "姿态", "交互"] },
        { title: "形成性评价", items: ["追踪", "全景", "证据"] }
      ]
    },
    {
      id: "learning-analytics",
      num: "03",
      titleZh: "教育人工智能理论与实证",
      titleEn: "Learning Analytics & Knowledge Tracing",
      summary: "围绕教育基础理论与实证研究，发展智能教育理论、测量评价方法与研究证据。",
      participants: "梦珂、兴翰、思雨",
      areas: [
        { title: "智能教育基础理论", items: ["智能学习理论", "智能教育评价理论", "人机共智学习理论"] },
        { title: "教育测量与评价", items: ["核心素养", "量表", "情景化活动", "智能体"] },
        { title: "教育实证研究", items: ["设计", "量化", "质性", "综合"] }
      ]
    },
  ],

  /* ---------- 关键指标（部分来自真实简介，部分为演示占位） ---------- */
  stats: [
    { n: "160", u: "+", l: "发表论文（SCI/SSCI 60+，CSSCI 10，EI 40+）" },
    { n: "3", u: "项", l: "主持国家自然科学基金" },
    { n: "32", u: "项", l: "第一发明人授权发明专利" },
    { n: "6", u: "部", l: "出版学术著作" }
  ],

  /* ---------- 代表性论文（来自真实主页，精选代表性条目） ---------- */
  publications: [
    { year: 2027, title: "ENFmamba: Cross-scale fusion of ENF phase and multi-harmonic cues with long-short term integrating Mamba for audio tampering detection", authors: "Chunyan Zeng, Qi Pan, Zhifeng Wang*", venue: "Expert Systems with Applications", badge: "中科院1区TOP", url: "@@@" },
    { year: 2026, title: "Leveraging hierarchical attention and dynamic fusion mechanisms for multi-modal speech emotion recognition", authors: "Zengzhao Chen, Chuanxu Zhao, Zhifeng Wang*, et al.", venue: "Applied Soft Computing", badge: "JCR1区", url: "@@@" },
    { year: 2026, title: "How do instructors' attention and proximity influence students' verbal engagement in higher education? Insights from an AI-driven multimodal teaching behavior analytics system", authors: "Yawen Shi, Zengzhao Chen, Zhifeng Wang*, et al.", venue: "Education and Information Technologies", badge: "JCR1区", url: "@@@" },
    { year: 2026, title: "Leveraging Contrastive Vision-Language Pretraining for Zero-Shot Open Learning Behavior Detection in Smart Education", authors: "Zhifeng Wang*, Longlong Li, Chunyan Zeng, et al.", venue: "IEEE Transactions on Computational Social Systems", badge: "JCR1区", url: "@@@" },
    { year: 2026, title: "GCKT: Context-Aware Gating of Heterogeneous Learning Features With Transformer for Cognitive Knowledge Tracing", authors: "Zhifeng Wang*, Jinyu Liu, Chunyan Zeng", venue: "International Journal of Intelligent Systems", badge: "JCR1区", url: "@@@" },
    { year: 2025, title: "SLBDetection-Net: Towards closed-set and open-set student learning behavior detection in smart classroom of K-12 education", authors: "Zhifeng Wang, Longlong Li, Chunyan Zeng, et al.", venue: "Expert Systems with Applications", badge: "中科院1区TOP", url: "@@@" },
    { year: 2024, title: "Design and implementation of an AI-enabled visual report tool as formative assessment to promote learning achievement and self-regulated learning", authors: "Xiaofang Liao, Xuedi Zhang, Zhifeng Wang*, et al.", venue: "British Journal of Educational Technology", badge: "中科院1区TOP / ESI高被引", url: "@@@" },
    { year: 2023, title: "Students' Classroom Behavior Detection System Incorporating Deformable DETR with Swin Transformer and Light-Weight Feature Pyramid Network", authors: "Zhifeng Wang*, Jialong Yao, Chunyan Zeng, et al.", venue: "Systems", badge: "JCR1区", url: "@@@" }
  ],

  /* ---------- 科研项目（来自真实主页，精选） ---------- */
  projects: [
    { level: "国家自然科学基金面上项目", grant: "62577027", period: "2026.01–2029.12", role: "主持", status: "在研" },
    { level: "国家自然科学基金面上项目", grant: "62177022", period: "2022.01–2025.12", role: "主持", status: "在研" },
    { level: "国家自然科学基金", grant: "61501199", period: "2016.01–2018.12", role: "主持", status: "结题" },
    { level: "湖北省自然科学基金", grant: "2017CFB683", period: "2018.01–2019.12", role: "主持", status: "结题" },
    { level: "国家科技支撑计划（子课题）", grant: "2015BAK33B02", period: "2015.07–2017.12", role: "子课题负责人", status: "结题" }
  ],

  /* ---------- 成员（照片均缺，用 @@@ 占位；学生/校友来自真实名单） ---------- */
  members: {
    advisor: [
      {
        nameZh: "王志锋", nameEn: "Zhifeng Wang", role: "Advisor · 教授 / 博导",
        photo: "assets/images/wang-zhifeng.png", homepage: "@@@", bio: "王志锋，华中师范大学人工智能教育学部教授、博士生导师、硕士生导师，澳大利亚伍伦贡大学荣誉教授，美国卡内基梅隆大学—华南理工大学联合培养博士。研究方向涵盖生成式人工智能、智能音视频处理、教育大数据、自适应学习、学习分析、人机交互、虚拟现实与游戏技术等。个人主页见https://faculty.ccnu.edu.cn/wangzhifeng/zh_CN/index.htm",
        tags: ["生成式AI", "多媒体取证", "知识追踪"],
        links: { orcid: "@@@", github: "@@@", email: "@@@" }
      }
    ],
    researcher: [
      {
        nameZh: "熊宇轩", nameEn: "Yuxuan Xiong", role: "讲师（高校） · 博士",
        photo: "assets/images/xiong-yuxuan.png", homepage: "https://faculty.ccnu.edu.cn/xiongyuxuan/zh_CN/index.htm",
        location: "南湖综合楼7043",
        bio: "博士毕业于武汉大学计算机学院，研究方向包括教育知识图谱、生成式人工智能、计算机视觉、数据集压缩、AI安全与医学图像分析。已发表学术论文12篇，获授权中国发明专利3项，曾获 MLMI 2019 最佳论文奖及2024年“挑战杯”中国大学生创业计划竞赛国家级银奖。",
        tags: ["教育知识图谱", "生成式人工智能", "计算机视觉", "数据集压缩", "AI 安全", "医学图像分析"],
        honors: ["MLMI 2019 最佳论文奖", "授权中国发明专利 3 项", "2024年“挑战杯”国家级银奖"]
      },
      {
        nameZh: "刘晓雪", nameEn: "Xiaoxue Liu", role: "讲师（高校） · 博士",
        photo: "assets/images/liu-xiaoxue.png", homepage: "https://faculty.ccnu.edu.cn/liuxiaoxue/zh_CN/index.htm",
        location: "南湖综合实验楼7045",
        bio: "博士，2025年毕业于澳大利亚伍伦贡大学，曾赴日本名古屋工业大学交流。现主要从事人工智能、学习分析、教育智能体与复杂网络分析研究，在 SCI/EI 检索的国际期刊和会议发表论文多篇。",
        tags: ["人工智能", "学习分析", "教育智能体", "复杂网络分析"],
        honors: ["伍伦贡大学博士", "名古屋工业大学交流经历", "SCI/EI 论文成果"]
      }
    ],
    student: [
      { nameZh: "侯玉林", nameEn: "@@@", role: "在读博士生", photo: "@@@", homepage: "@@@", bio: "@@@", tags: ["教育技术学"], links: { orcid: "@@@", github: "@@@", email: "@@@" } },
      { nameZh: "王思雨", nameEn: "@@@", role: "在读博士生", photo: "@@@", homepage: "@@@", bio: "@@@", tags: ["教育技术学"], links: { orcid: "@@@", github: "@@@", email: "@@@" } },
      { nameZh: "王小艺", nameEn: "@@@", role: "在读硕士生（校外保研）", photo: "@@@", homepage: "@@@", bio: "@@@", tags: ["数字媒体技术"], links: { orcid: "@@@", github: "@@@", email: "@@@" } },
      { nameZh: "斯雨婕", nameEn: "@@@", role: "在读硕士生（本校保研）", photo: "@@@", homepage: "@@@", bio: "@@@", tags: ["数字媒体技术"], links: { orcid: "@@@", github: "@@@", email: "@@@" } },
      { nameZh: "李龙龙", nameEn: "@@@", role: "在读硕士生（校外保研）", photo: "@@@", homepage: "@@@", bio: "@@@", tags: ["人工智能"], links: { orcid: "@@@", github: "@@@", email: "@@@" } },
      { nameZh: "苏美欣", nameEn: "@@@", role: "在读硕士生（专业第一保研）", photo: "@@@", homepage: "@@@", bio: "@@@", tags: ["数字媒体技术"], links: { orcid: "@@@", github: "@@@", email: "@@@" } },
      { nameZh: "唐照康", nameEn: "@@@", role: "在读硕士生", photo: "@@@", homepage: "@@@", bio: "@@@", tags: ["人工智能"], links: { orcid: "@@@", github: "@@@", email: "@@@" } },
      { nameZh: "王明辉", nameEn: "@@@", role: "在读硕士生", photo: "@@@", homepage: "@@@", bio: "@@@", tags: ["计算机技术"], links: { orcid: "@@@", github: "@@@", email: "@@@" } }
    ],
    alumni: [
      { nameZh: "陆子欣", nameEn: "@@@", role: "毕业研究生 → 阿里巴巴", photo: "@@@", homepage: "@@@", bio: "@@@", tags: ["数字媒体技术"], links: { orcid: "@@@", github: "@@@", email: "@@@" } },
      { nameZh: "胡文婷", nameEn: "@@@", role: "毕业研究生 → 长江存储", photo: "@@@", homepage: "@@@", bio: "@@@", tags: ["软件工程"], links: { orcid: "@@@", github: "@@@", email: "@@@" } },
      { nameZh: "刘特", nameEn: "@@@", role: "毕业研究生 → 阿里巴巴", photo: "@@@", homepage: "@@@", bio: "@@@", tags: ["计算机技术"], links: { orcid: "@@@", github: "@@@", email: "@@@" } },
      { nameZh: "王熙源", nameEn: "@@@", role: "毕业研究生 → 国家电网", photo: "@@@", homepage: "@@@", bio: "@@@", tags: ["计算机技术"], links: { orcid: "@@@", github: "@@@", email: "@@@" } },
      { nameZh: "李璐瑶", nameEn: "@@@", role: "毕业研究生 → 字节跳动", photo: "@@@", homepage: "@@@", bio: "@@@", tags: ["数字媒体技术"], links: { orcid: "@@@", github: "@@@", email: "@@@" } },
      { nameZh: "何佳琪", nameEn: "@@@", role: "毕业研究生 → 字节跳动", photo: "@@@", homepage: "@@@", bio: "@@@", tags: ["软件工程"], links: { orcid: "@@@", github: "@@@", email: "@@@" } },
      { nameZh: "方舟", nameEn: "@@@", role: "毕业研究生 → 腾讯", photo: "@@@", homepage: "@@@", bio: "@@@", tags: ["计算机技术"], links: { orcid: "@@@", github: "@@@", email: "@@@" } },
      { nameZh: "陈喆", nameEn: "@@@", role: "毕业研究生 → 百度", photo: "@@@", homepage: "@@@", bio: "@@@", tags: ["计算机技术"], links: { orcid: "@@@", github: "@@@", email: "@@@" } }
    ]
  },

  /* ---------- 实验室新闻 / 动态（以真实获奖与荣誉为依据，日期缺省用 @@@） ---------- */
  news: [
    { date: "2027", year: "2027", title: "ENFmamba：融合多尺度 ENF 相位与多谐波线索的音频篡改检测", text: "发表于 Expert Systems with Applications，中科院 1 区 TOP、JCR 1 区。" },
    { date: "2026", year: "2026", title: "多模态语音情感识别的层次注意力与动态融合机制", text: "发表于 Applied Soft Computing，聚焦多模态语音情感识别。" },
    { date: "2026", year: "2026", title: "AI 驱动的多模态教学行为分析系统研究", text: "发表于 Education and Information Technologies，探讨教师注意力、空间距离与学生言语参与。" },
    { date: "2026", year: "2026", title: "基于对比视觉—语言预训练的智能教育开放集学习行为检测", text: "发表于 IEEE Transactions on Computational Social Systems，面向智慧教育中的零样本行为检测。" },
    { date: "2026", year: "2026", title: "基于习题—知识—认知张量的细粒度智能学习诊断模型", text: "发表于 Behavioral Sciences，用于教育评价中的学习诊断与认知分析。" }
  ],

  /* ---------- 实验室文化 / 价值观（结合研究特点凝练，理念类可用；具体活动照片 @@@） ---------- */
  culture: {
    vision: "让每一次学习都被温柔地理解，让每一位成员都能在严谨与自由中成长。",
    values: [
      { idx: "01", title: "严谨求知", text: "以可复现、可解释的方法对待每一个研究问题，欢迎对假设的质疑与对证据的坚持。" },
      { idx: "02", title: "跨界协作", text: "教育、计算机、心理与艺术在此交汇；我们重视不同背景带来的视角，也重视把复杂问题讲清楚的能力。" },
      { idx: "03", title: "以人为本", text: "技术服务于学与教。所有智能系统的终点，是让师生更从容、更有获得感。" },
      { idx: "04", title: "开放成长", text: "鼓励早期试错与公开分享，支持成员参加学术会议、联合培养与国际交流。" }
    ],
    activities: [
      { title: "@@@ 实验室合影", desc: "（待补充真实活动照片）" },
      { title: "@@@ 学术年会", desc: "（待补充）" },
      { title: "@@@ 团建活动", desc: "（待补充）" }
    ]
  },

  /* ---------- 画廊（照片占位） ---------- */
  gallery: [
    { caption: "@@@ 研究现场 / 智慧课堂" },
    { caption: "@@@ 实验室合影" },
    { caption: "@@@ 学术活动" },
    { caption: "@@@ 团队建设" }
  ],

  /* ---------- 研究页 BehaviorDemo 配置（演示数据，非真实课堂） ---------- */
  demo: {
    note: "以下为脱敏演示数据，仅用于展示交互形态；真实系统须作为独立受控平台建设，不与公开官网共用数据域。",
    metrics: [
      { id: "focus", name: "专注度", value: 78, desc: "基于头部姿态与视线落点的课堂整体专注度估计（演示）。" },
      { id: "raise", name: "举手行为", value: 34, desc: "单位时间内主动举手参与互动的学生占比（演示）。" },
      { id: "interact", name: "互动讨论", value: 61, desc: "师生、生生多模态互动强度指标（演示）。" }
    ]
  }
};
