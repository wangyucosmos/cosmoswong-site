/* ============================================================
   cosmoswong.com 的全部内容都在这一个文件里。
   加作品、加旅行、改简历 —— 只改这里，不用碰任何页面。
   改完 `npx wrangler deploy` 就上线。

   ⚠️ 这是公开网站。手机号、身份证、年龄、婚姻状况这类信息不要放进来。
   ============================================================ */

window.SITE = {

  /* ---------- 基本信息 ---------- */
  me: {
    name: 'Cosmos',
    fullName: 'Cosmos Wong · 王宏宇',
    title: '运营十年 · 游戏 / 活动 / 社群 / 内容',
    tagline: '把活动做起来，把用户留下来，把复杂的事做清楚。',
    email: 'wangyuwangxinxin@gmail.com',     // 公开邮箱；留空则不显示
    location: '上海',
    links: [
      { label: 'GitHub', url: 'https://github.com/wangyucosmos' }
    ]
  },

  /* ---------- 作品集 ----------
     id / title / category / year / summary / featured / cover / tags / body / links / images
     cover 放 public/assets/img/ 下，留空显示渐变占位
  ------------------------------------ */
  portfolio: [
    {
      id: 'indonesia-trip-app', title: '国庆印尼旅游 · 多人协作行程站', category: '产品与工具', year: '2026',
      summary: '从需求到上线一周做完：搭子扫码进组一起编辑行程、清单、预算；组长权限、模块锁、改动回滚；大陆网络直连。',
      featured: true, cover: '',
      tags: ['产品设计', 'Cloudflare', 'AI 协作开发', '权限模型'],
      body: '背景：国庆和朋友去印尼，市面上的行程工具要么要注册、要么大陆打不开、要么不能多人改。\n\n做了什么：用 AI 协作（Codex + Claude）从零搭了一个协作站。没有账号系统，扫码填名字就能进；每个人有自己的钥匙，组长能管人、锁模块、换邀请链接、开审批；每条记录都有历史版本可以一键回滚。模块和字段本身可以自定义，航班按人分组。\n\n技术取舍：Cloudflare Worker + D1，运行时零外部请求（不加载字体 / 地图 / CDN），这是大陆蜂窝网络和微信内置浏览器都能稳定打开的关键。二维码在本地生成，不把邀请密钥发给第三方。\n\n结果：实测大陆 5G + 微信内置浏览器可用，三人协作正常，首屏 0.3 秒。',
      links: [
        { label: '打开网站', url: 'https://indonesia.cosmoswong.com' },
        { label: 'GitHub', url: 'https://github.com/wangyucosmos/guoqing-indonesia-travel' }
      ],
      images: []
    },
    {
      id: 'migu-national-campaign', title: '咪咕视频 · 全国促活活动策划与原型', category: '活动策划', year: '2026',
      summary: '面向全国用户的大页面促活活动：从活动机制、规则、文案到低保真原型，可直接进入设计与开发。',
      featured: true, cover: '',
      tags: ['活动策划', '促活', 'H5 原型', '规则与客服文档'],
      body: '负责咪咕视频全国促活活动的完整策划：活动机制设计、参与路径、奖励逻辑、活动规则与客服口径，并产出黑白灰低保真原型供设计和开发对接。\n\n交付物包括策划案（Word）、长 H5 原型（Figma）、活动规则、客服 FAQ 与题库、上线后的拨测报告。\n\n方法上把"策划案 → 原型 → 规则 → 客服文档"做成了可复用的流程和检查清单，后续活动直接套用。',
      links: [], images: []
    },
    {
      id: 'five-province-welfare', title: '五省福利中心 · 本地化策划与原型', category: '活动策划', year: '2026',
      summary: '河南、安徽、浙江、海南、广东五省福利中心的活动策划案与原型，每省按方言、民俗、赛事和政策做本地化。',
      featured: true, cover: '',
      tags: ['省级运营', '本地化', '策划案', '原型'],
      body: '五个省份的福利中心各有一套策划案和原型，不是一套模板换个省名：方言梗、地方民俗、本地赛事、当期政策都要查证后再写进方案，无法确认的一律标"待确认"。\n\n同时维护了一套跨省通用的页面规范和原型规范（字体、图层命名、素材槽、版权红线），保证不同省份的东西看起来是一个体系。',
      links: [], images: []
    },
    {
      id: 'cosmos-os', title: 'Cosmos OS · macOS 个人工作系统', category: '产品与工具', year: '2026',
      summary: '一个原生 macOS 应用，把日常工作流程做成自己的"操作系统"。PRD、UI 设计、架构、路线图全部文档驱动，AI 协作开发。',
      featured: false, cover: '',
      tags: ['Swift', 'macOS', '产品定义', 'PRD'],
      body: '长期项目，不是 demo。先写了七份文档（PRD / UI 设计 / 架构 / 路线图 / 设计哲学 / 工作空间愿景 / 当前状态），再让 Codex 按文档开发，我做产品负责人和最终决策。\n\n这个项目是我练习"把想法翻译成可执行的产品定义"的地方。',
      links: [{ label: 'GitHub', url: 'https://github.com/wangyucosmos/Cosmos-Toolbox' }],
      images: []
    },
    {
      id: 'multi-agent-workflow', title: '多智能体协作知识库 · 卓望工作流', category: '知识与流程', year: '2026',
      summary: '让 Claude、Codex、DeepSeek 三个 AI 共用一套知识库、进度看板和流程文件，谁开工都能接上上一个的活。',
      featured: false, cover: '',
      tags: ['知识管理', 'AI 工作流', '流程设计'],
      body: '问题：同一份工作在不同 AI 工具之间切换时，每次都要重新解释背景。\n\n做法：把"知识（是什么）/ 进度（做到哪）/ 流程（怎么做）"拆成三层放进一个 Git 仓库，三个工具各自 clone，开工先 pull、收工必更新进度。本地工具只保留触发指针，不内嵌业务知识。\n\n效果：任何一个工具接手都是分钟级，而且交付物的规范（Word 排版禁忌、原型精度、版权红线）不会因为换工具而漂移。',
      links: [{ label: 'GitHub', url: 'https://github.com/wangyucosmos/zhuowang-workspace' }],
      images: []
    },
    {
      id: 'stefani-portfolio', title: 'Stefani · 社媒运营作品集网页', category: '产品与工具', year: '2026',
      summary: '为一位社媒运营朋友做的单页作品集，用于求职投递。',
      featured: false, cover: '',
      tags: ['作品集', '网页', '视觉'],
      body: '把对方的社媒运营案例整理成一页可直接发给 HR 的网页作品集。',
      links: [{ label: 'GitHub', url: 'https://github.com/wangyucosmos/-' }],
      images: []
    },
    {
      id: 'xianjian-webgame', title: '《新仙剑奇侠传》页游 · 综合运营', category: '游戏运营', year: '2013 – 2016',
      summary: '上海骏梦。用户、活动、版本、数据、内容五条线一起跑，体验服全权管理。',
      featured: false, cover: '',
      tags: ['页游', '用户运营', '活动运营', '版本运营', '数据复盘'],
      body: '用户运营：核心用户维护、QQ 群 / 论坛 / 贴吧社群、反馈收集与玩家生态。\n\n活动运营：常规 / 登录 / 活跃 / 拉收 / 大型节假日活动的策划、配置、上线跟进与复盘。\n\n版本运营：版本上线跟进、测试服 BUG 收集、更新公告撰写、玩法与活动策划案、玩家调研；体验服全权管理。\n\n数据：日常关注 DAU、留存、活动参与、流水与玩家反馈，做活动效果复盘和用户行为分析。',
      links: [], images: []
    },
    {
      id: 'mobile-games-ops', title: '《次元之战》《暴走英雄坛》手游 · 产品运营', category: '游戏运营', year: '2016 – 2018',
      summary: '上海听枫语。从上线前准备到版本迭代的全流程运营。',
      featured: false, cover: '',
      tags: ['手游', '上线筹备', '版本跟进', '社区'],
      body: '上线前：活动规划、社区搭建、内容准备。\n\n上线后：对接研发与合作方跟进版本更新与修复；策划执行线上活动提升活跃与留存；撰写公告、活动文案、版本说明；整理玩家反馈与 BUG 推动解决；协助版本测试与上线前检查。',
      links: [], images: []
    }
  ],

  /* ---------- 简历 ---------- */
  resume: {
    pdf: '',                                  // 放 PDF 到 public/ 下后填 '/resume.pdf'
    summary: '十年以上互联网运营经验，游戏运营出身，活动、用户、社群、内容都做过，也带过团队、做过项目统筹。习惯把一件事从策划、规则、文案做到原型和复盘，交付能直接进设计和开发。2026 年起把 AI 当协作者用：自己定义产品、让 AI 写代码，从零上线过多人协作网站和 macOS 应用。目前开放游戏运营 / 活动运营 / 社群运营方向的机会。',
    experience: [
      { org: '卓望 · 咪咕视频合作项目', role: '内容运营', period: '2026.07 — 至今',
        points: [
          '负责河南、安徽、浙江、海南、广东五省福利中心的活动策划案与原型，按省做方言、民俗、赛事、政策本地化',
          '负责咪咕视频全国促活活动的大页面策划案与活动原型，含活动规则、客服文档、题库与上线拨测报告',
          '把策划到交付的流程沉淀成可复用的检查清单与规范（Word 排版、原型精度、版权红线）'
        ] },
      { org: '江苏茂港实业有限公司', role: '运营支持 / 项目协调', period: '2020.07 — 2026.03',
        points: [
          '统筹跨部门项目推进：沟通、进度跟进、问题协调，多线程并行',
          '负责业务数据整理、报表统计与运营数据汇总分析',
          '制定并优化内部 SOP，对接供应商与外部合作方推进落地'
        ] },
      { org: '上海复通软件技术有限公司', role: '社群运营 / 活动运营 / 内容运营', period: '2018.10 — 2020.05',
        points: [
          '负责小程序产品的社群运营与用户活跃维护，显著提升社群活跃度与互动频率',
          '策划执行节日、拉新、互动等线上活动；负责公众号、微博内容与文案',
          '建立用户反馈收集与同步机制，提高问题响应效率'
        ] },
      { org: '上海听枫语数字传媒科技有限公司', role: '游戏运营', period: '2016.08 — 2018.06',
        points: [
          '负责手游《次元之战》《暴走英雄坛》产品运营：上线前活动规划与社区搭建，上线后版本跟进与活动执行',
          '撰写游戏公告、活动文案、版本说明；整理玩家反馈与 BUG 推动解决'
        ] },
      { org: '上海骏梦网络科技有限公司', role: '综合游戏运营', period: '2013.08 — 2016.08',
        points: [
          '负责页游《新仙剑奇侠传》：用户、活动、版本、数据、内容五条线',
          '体验服全权管理；活动策划 / 配置 / 上线 / 复盘闭环；日常跟 DAU、留存、流水做分析',
          '撰写玩法与活动策划案、版本公告、社区攻略'
        ] }
    ],
    education: [
      { school: '淮阴工学院', major: '工商管理', period: '2016.09 — 2018.07' },
      { school: '江苏联合职业技术学院', major: '计算机应用', period: '2009.09 — 2014.06' }
    ],
    skills: [
      { group: '运营', items: ['游戏运营', '活动策划与执行', '用户 / 社群运营', '版本跟进', '数据复盘'] },
      { group: '内容与交付', items: ['策划案', '活动规则', '客服文档 / 题库', '文案', '低保真 / 高保真原型'] },
      { group: 'AI 协作', items: ['产品定义 → AI 开发', 'Claude / Codex / ChatGPT', '多智能体工作流', 'Figma MCP'] },
      { group: '工具', items: ['Figma', 'Word / Excel / PPT', 'Notion', 'Git / Cloudflare'] },
      { group: '游戏', items: ['魔域', '天龙八部', 'DNF', '逆水寒', 'LOL', 'CF / 三角洲行动'] }
    ]
  },

  /* ---------- 旅游计划 ---------- */
  trips: [
    {
      category: '东南亚',
      items: [
        { title: '印尼 · 科莫多 / 巴厘岛 / 布罗莫', dates: '2026.10.01 — 10.09', status: '进行中',
          summary: '国庆 9 天，三个人。Padar 山海、罗威纳海豚、布罗莫日出。协作行程站，搭子一起编辑。',
          url: 'https://indonesia.cosmoswong.com' }
      ]
    }
  ],

  /* ---------- 工具箱 ---------- */
  tools: [
    { name: 'Cosmos OS', desc: 'macOS 个人工作系统，把日常流程做成自己的操作系统。开发中。', icon: '🖥', url: 'https://github.com/wangyucosmos/Cosmos-Toolbox' },
    { name: '旅行协作站', desc: '扫码进组一起编辑行程、清单、预算。印尼这次在用，之后每次旅行都能复用。', icon: '🧭', url: 'https://indonesia.cosmoswong.com' }
  ],

  /* ---------- 收藏 ---------- */
  bookmarks: [
    { category: '案例', items: [] },
    { category: '文章', items: [] }
  ]
};
