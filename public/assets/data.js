/* ============================================================
   cosmoswong.com 的全部内容都在这一个文件里。
   加作品、加旅行 —— 改这里；简历正文改 data/resume.json，不用碰任何页面。
   改完 `npx wrangler deploy` 就上线。

   ⚠️ 这是公开网站。手机号、身份证、年龄、婚姻状况这类信息不要放进来。
   ============================================================ */

window.SITE = {

  /* ---------- 基本信息 ---------- */
  me: {
    name: 'Cosmos Wong',                     // 首页标题、导航、页脚
    title: '运营十年 · 游戏 / 活动 / 社群 / 内容',
    tagline: '',                              // 留空则首页不显示 slogan
    email: 'wangyuwangxinxin@gmail.com',     // 公开邮箱；留空则不显示
    location: '上海',
    jobTitle: '内容运营 / 活动运营',      // JSON-LD 用
    knowsAbout: ['活动策划', '内容运营', '社群运营', '游戏运营', '原型设计', 'AI 协作'],
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
      id: 'my-workbench', title: '我的工作台 · 和 AI 一起给自己搭的工作台', category: '产品与工具', year: '2026',
      summary: '项目少但每个都很深：把在等谁、拍板的口径、交付节点、几个 AI 的比稿版本一页理清。一天迭代五版，三种风格可切换，演示版可以直接试用。',
      featured: true,
      cover: '/media/workbench-glass.webp',
      video: '/media/workbench-demo.mp4', poster: '/media/workbench-demo-poster.jpg',   // 案例头部的短视频（截图都来自演示版，数据虚构）
      tags: ['产品设计', 'AI 协作', '工作流', 'Cloudflare'],
      body: '背景：我做运营（活动策划、原型、客服文档），同时只有几个项目，但每个都有一堆没定的口径、几个 AI 的比稿版本、我手改过的底稿、在等别人给的东西。现成的项目管理工具擅长「管很多条相似记录」，正好不是我要的。\n\n做了什么：今天页顶部是焦点仪表盘（离上线几天、今天做什么、卡在谁那里）；项目页一页读完下一步、在等谁、已拍板的口径、交付物；「开工包」把口径、去年同类项目、相关笔记和素材拼好交给 AI，AI 收工汇报贴回来自动更新；知识库和素材库直接读电脑上的文件、不上传；三种风格（经典 / 精密 / 玻璃）随时切换。\n\n怎么做的：需求、取舍、审美和验收是我，代码和测试主要是 Claude Code。第一版照搬了另一个工作台，用半天觉得太重，当天按自己的工作重做——这成了后面所有设计的第一原则。每次大改都留一条命令就能回退；真实数据不进公开代码仓库；每一版都用真浏览器跑自动化测试。\n\n演示版：同一套页面代码，数据是虚构的、只存在访客自己的浏览器里，可以随便点。',
      links: [{ label: '看完整案例', url: '/workbench' }, { label: '在线试用演示版', url: '/desk-demo' }],
      images: ['/media/workbench-precise.webp', '/media/workbench-kickpack.webp'],
      // 内容块（可选）：stats 数字 / video 视频 / compare 对比 / phone 手机截图 / quote 引言 / image 大图 / gallery 多图，写法见 AGENTS.md
      blocks: [
        { type: 'stats', items: [{ value: '5 版', label: '一天迭代' }, { value: '3 种', label: '界面风格随时切换' }, { value: '1 条命令', label: '每次大改都能回退' }] },
        { type: 'compare', before: '/media/workbench-classic.webp', after: '/media/workbench-glass-dark.webp', beforeLabel: '经典', afterLabel: '玻璃 · 深色', cap: '同一套页面，三种风格随时切换（拖动中间看差别）' },
        { type: 'phone', src: '/media/workbench-phone.webp', title: '手机上也能用', body: '手机上左侧导航收成底部 5 个按钮加「更多」，今天页、项目页照样能看能改。' },
        { type: 'quote', text: '第一版照搬了另一个工作台，用半天觉得太重——当天按自己的工作重做，这成了后面所有设计的第一原则。' }
      ]
    },
    {
      id: 'case-gallery', title: '案例展厅 · 四个运营案例的交互式原型', category: '活动策划', year: '2026',
      summary: '把四个真实案例做成可以点着看的展厅：手机原型上的编号热点对应每一处的设计备注，低保真与成稿可切换对比，旁边摆着要点与经验；另附从需求到上线的整体流程。',
      featured: true, cover: '/media/cases-cover.jpg',
      tags: ['活动策划', '原型', '交互展示', '设计沟通'],
      body: '做什么：把四个运营案例（十月会员促活、四川福利中心、桂BA 投票、贵州 NBA 门票抽奖）和“从需求到上线”的整体流程，做成一个可以点着看的展厅，原本是给营销策划组和搭建组交流分享用的。\n\n怎么看：每个案例都是可滚动的手机原型，图上有编号热点，点开就是这一块的设计备注——为什么这样做、取舍了什么、搭建要配什么；低保真和设计成稿可以一键切换或并排对比；每页旁边摆着这个案例的要点与经验。\n\n整体流程：一张泳道图标出业务方、我、设计师、搭建组四方在哪里交接，点任一环节可以跳到对应案例。\n\n说明：展示用的是低保真与线框，球员照片、第三方形象、二维码与规则数值均已隐去。',
      links: [{ label: '打开案例展厅', url: '/cases' }], images: []
    },
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
      id: 'migu-monthly-oct', title: '咪咕视频 · 月度会员促活（十月）', category: '活动策划', year: '2026',
      summary: '每月一期的全国会员促活页：先分清固定权益和每月要重做的两块，再用“三选一 → 再三选一 → 单方案”一步步收敛创意，连同规则、客服文档、动效稿一起交付。',
      featured: true, cover: '/media/case-oct-themes.jpg',
      tags: ['活动策划', '创意收敛', 'H5 原型', '会员促活'],
      body: '背景：咪咕视频全国月度会员促活，每月一期，每期两个页面、三份 Word 和一版动效稿。我负责十月这一期从思路到交付的全流程。\n\n先拆骨架：把上月线上页的配置扒下来逐块对照，发现头图、免费流量、签到、累计打卡、一周限时专享这些固定权益月月都在，只换皮；真正每月要重做的只有主玩法和任务结构，创意预算只花在这两处。\n\n一步只比一件事：先三选一定主题方向，再三选一定抽奖小游戏怎么玩，再把三条长图并排比选（骨架完全一样，只有头图、主色、小游戏三处不同），收敛成单方案后才进 Figma 精修。每一步单独出一版文件，落选版留作备查。\n\n把玩法拆成后端能算清的东西：抽奖小游戏本质是“点一次 → 前端动效 → 后台开奖 → 弹结果”，所以换皮分三档（只换皮 / 多个热区选一个 / 顺带攒收集物）；连抽的倍率要落到一个明确的对象上（三选一，我们选了中奖率），页面只画示意，数值由搭建同事在后台配置。\n\n踩过的坑：主 Slogan 前半句可以口语、后半句必须书面；拿到的参考玩法先出最简一版再展开；头图的主视觉不要和玩法的视觉画成同一个东西。\n\n交付：Figma 低保真原型、客服文档、活动规则、动效稿，按上线日倒排时间表推进。',
      links: [{ label: '查看交互展厅', url: '/cases#oct' }], images: ['/media/case-oct-themes.jpg', '/media/case-oct-lottery.jpg']
    },
    {
      id: 'sichuan-welfare', title: '四川福利中心 · 蜀地专属，“移”起抽好礼', category: '活动策划', year: '2026',
      summary: '拿到的是一份方案和一封省公司邮件：先逐条对出材料里互相矛盾的地方，再画原型；把四川做进玩法，并留好兜底版本。',
      featured: true, cover: '/media/case-sc-cover.jpg',
      tags: ['省级运营', '本地化', '口径核对', '原型'],
      body: '背景：省级福利中心的专属活动，手上只有一份方案 Word 和一封省公司的邮件。\n\n先对材料，再画图：逐条对出十余处不一致或缺失，全部列进原型外侧的“待确认”说明卡。其中一条是“数学上做不到”——活动月中才上线，当月剩余天数不够完成打卡要求的天数，首月只能靠其他任务拿奖。\n\n页面不画奖品数量、库存、概率：这些由搭建同事在后台填，原型的读者是设计师，存疑的数值只放在说明卡里给业务方确认。\n\n把地域做进玩法，不只是文案：抽奖做成“涮锅”，模块标题统一成六个字；方言只用最通行的几个词、全页最多两处，请本地同事过一遍。\n\n先想最坏的版本：接口来不及联调，就有只保留可上线模块的兜底版。\n\n交付：低保真原型（含全部状态弹窗）、活动规则、客服文档；设计师出成稿后，再按最终长图复核口径。',
      links: [{ label: '查看交互展厅', url: '/cases#sc' }], images: ['/media/case-sc-lowfi.jpg', '/media/case-sc-final.jpg']
    },
    {
      id: 'guiba-vote', title: '广西城市篮球联赛 · “桂BA”投票页', category: '活动策划', year: '2026',
      summary: '评选规则要求“一次投满 10 人”，页面能力却做不到：原型一轮轮降到能做，规则一个字不改。',
      featured: false, cover: '/media/case-gba-cover.jpg',
      tags: ['投票评选', '原型取舍', '规则与能力', '状态设计'],
      body: '背景：南北赛区最佳阵容与最具人气球员评选。规则是一份 Word，页面载体是咪咕的“设计切图 + 热区”活动页。\n\n难点：规则要求一次推选多人、提交后不可修改，而这类页面只能做一层 tab、点选一个、展开更多和跳转，没有“选满才能提交”的联动校验。\n\n做法：给出两个方案——页面内投票加后端聚合（页面只展示后端返回的进度），或页面只展示、导流到投票渠道。我定的原则是规则不改，前端做不到的校验，不用演示稿假装能做。\n\n原型一轮轮往下降：从一个步骤一屏的十几屏，收成一张主长图；评审用的文字全部挪到侧面标注；规则弹窗只做示意；交互只留点击和上下滑；投票后的状态用弹窗提示代替每张卡的置灰态，切图量减半。\n\n几个“不做”：不做实时榜单（规则里没有授权）、球员卡上不放票数、副标题不写规则里没有的奖励。\n\n版本约定：不在旧版上原地改，每次另起一版，全部保留。',
      links: [{ label: '查看交互展厅', url: '/cases#gba' }], images: ['/media/case-gba-board.jpg', '/media/case-gba-page.jpg']
    },
    {
      id: 'guizhou-nba', title: '贵州 · NBA 中国赛门票抽奖页', category: '活动策划', year: '2026',
      summary: '抽奖模块贴合 NBA 赛事形象做成“票根”，标题与 Slogan 以“黔”字结合贵州地域特色；线框之外用三点说明向设计师传达意图，并把全部状态一次梳理完整。',
      featured: false, cover: '/media/case-gz-cover.jpg',
      tags: ['抽奖页', '地域化文案', '设计沟通', '状态设计'],
      body: '背景：贵州移动咪咕视频体育会员专属的 NBA 中国赛门票抽奖页，每日抽奖，非会员引导开通。\n\n亮点一 · 抽奖模块结合 NBA 的样子：抽奖入口做成赛事“票根”，票面含赛事名、对阵双方、时间地点与“立即抽奖”按钮，红蓝配色承接赛事主视觉；触发后只做篮球飞入篮网的轨迹，其余元素保持静止。\n\n亮点二 · 标题与 Slogan 结合贵州特色：以“黔”字为地域锚点，一句文案只用一个主锚点——“黔力拉满 好运上场”，模块标题延续为“‘黔’来领取”“‘黔’来观看”。\n\n设计沟通：线框之外给设计师三点说明——元素、色系、哪里动、哪里是重点，不替设计师定参数。\n\n状态一次想全：开奖中、中奖、未中奖、次数用尽、非会员、未登录、系统异常等状态在线框阶段就列成清单，设计一次出齐、搭建一次配齐。',
      links: [{ label: '查看交互展厅', url: '/cases#gz' }], images: ['/media/case-gz-wireframe.jpg']
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
      summary: '知识库与协作流程项目；输入口令后可查看详细架构和方法。',
      featured: false, cover: '',
      tags: ['知识管理', 'AI 工作流', '流程设计'],
      body: '知识库与协作流程项目；输入口令后可查看详细架构和方法。',
      links: [{ label: '架构说明', url: '/knowledge/overview' }],
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
  resume: { pdf: '/resume.pdf' }, // 正文在data/resume.json，仅构建期读取。

  /* ---------- 旅游计划 ---------- */
  trips: [
    {
      category: '东南亚',
      items: [
        { title: '印尼 · 科莫多 / 巴厘岛 / 布罗莫', dates: '2026.10.01 — 10.09', status: '进行中',
          summary: 'Padar 山海、罗威纳海豚、布罗莫日出。协作行程站，搭子一起编辑。',
          url: 'https://indonesia.cosmoswong.com' },
        { title: '2026 国庆 · 普吉岛', dates: '2026.10.03 — 10.08', status: '规划中',
          summary: '单人出发，途中也可约搭子。按天气调整皮皮岛，管理酒店、海况、预算和清单。',
          url: 'https://phuket.cosmoswong.com' }
      ]
    }
  ],

  /* ---------- 工具箱 ---------- */
  // 工具箱：url 统一写 /go/<id>，真实地址在 src/tools-gate.js 的 TARGETS（点进去要口令）
  tools: [
    { name: '补时计算器', desc: '上传 OA 截图，自动核算每日盈亏和月度补时余额；按月查看日历与历史记录。每个人自行注册，记录独立保存，截图在本机识别。', icon: '⏱', url: '/go/attendance' },
    { name: 'Cosmos OS', desc: 'macOS 个人工作系统，把日常流程做成自己的操作系统。开发中。', icon: '🖥', url: '/go/cosmos-os' },
    { name: '旅行协作站', desc: '扫码进组一起编辑行程、清单、预算。印尼这次在用，之后每次旅行都能复用。', icon: '🧭', url: '/go/travel' },
    { name: '动效 H5 编辑器', desc: '把长图和 GIF 叠在一起，发布成手机上手动滑动、动图原地播放的 H5 页面。带图层、修图（智能修补、仿制图章、画笔）和静态图生成摆动、飘落动效。需口令才能使用。', icon: '🎞', url: '/go/h5-editor' },
    { name: '跑马灯 GIF 生成器', desc: '输入一段公告文字，调字号、颜色和速度，直接导出透明背景的滚动字幕 GIF，放进活动页面就能用。全部在浏览器里生成，文字不上传。', icon: '📢', url: '/go/marquee' },
    { name: '邮件名单透视', desc: '拖入 Mailchimp 导出的表格，自动生成人群画像、退订诊断和每期变化，附单封邮件诊断器。表格在浏览器里计算，只保存汇总数字。需口令才能使用。', icon: '📬', url: '/go/mail-insight' }
  ],

  /* ---------- 收藏 ---------- */
  bookmarks: [
    { category: '案例', items: [] },
    { category: '文章', items: [] }
  ]
};
