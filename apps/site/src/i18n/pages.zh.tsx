/**
 * 하위 페이지 문구 — 简体中文. 구조와 쓰는 법은 pages.ts 머리말을 본다.
 * 용어는 BRIEF.md 와 template.zh.html · strings.zh.json 을 따른다
 * (知识库 · 社区 · 联系我们 · 登录 EMM · 以访客身份试用 · 导图 · 思维导图), 앱 용어: 我的导图 · [上架到知识库] · [撤销].
 * 라틴 문자·숫자와 한자 사이는 반각 공백, 문장부호는 전각.
 * ★ JSX 안 한자 문장은 줄을 태그 옆에서만 나눈다(문장 중간 줄바꿈은 공백이 된다).
 */
import type { PageText } from './pages';

const zh: PageText = {
  common: {
    loading: '加载中…',
    more: '加载更多',
    retry: '重试',
    clearSearch: '清除搜索内容',
    listLoadFailed: '无法加载列表。',
    dateOptions: { year: 'numeric', month: 'long', day: 'numeric' },
  },

  api: {
    listedFailed: (status) => `无法加载列表（HTTP ${status}）`,
    network: '无法连接到服务器，请稍后重试。',
    requestFailed: (status) => `无法处理请求（HTTP ${status}）。`,
  },

  functions: {
    eyebrow: '功能',
    title: '能做些什么',
    lead: (
      <>
        创建导图，以多种形式查看，在节点中存放文档，导出为标准 Markdown，再通过链接分享。这里只列出
        <b>用户指南中有专门章节的功能</b>。
      </>
    ),
    guidePrefix: '指南',
    groups: {
      ai: {
        title: '用 AI 创建',
        lead: '只要给出主题，就能展开框架；对话内容也能原样留存为导图。',
        items: [
          'AI 生成——给出主题或文档，自动展开分支',
          'Claude 连接器（MCP）——在对话中直接创建导图 · 读取“我的导图”中的导图',
          '把 AI 的回答作为分支，添加到指定节点下',
          '自动勾选复选框——“把完成的项目勾上”',
        ],
        more: '详细了解 AI 集成',
        guide: '07. AI 生成 · 12. AI 连接器（MCP）',
      },
      edit: {
        title: '创建和编辑导图',
        lead: '添加、移动、美化节点，这些都是每天会用到的。',
        items: [
          '从模板开始 · 注册自己的模板',
          '节点的添加、删除、复制、拖动移动、调整大小',
          '一次添加多个节点（用缩进连层级一起建好）',
          '多选——一起移动、一起统一大小',
          '加粗、斜体、删除线、下划线、荧光笔局部强调',
          '形状、颜色、字体——层级规则 + 单个节点覆盖设置',
        ],
        guide: '02. 创建导图 · 03. 编辑节点',
      },
      view: {
        title: '查看与布局',
        lead: '以多种形式查看同一份内容。',
        items: [
          '7 种布局——放射型、树形、层级型、进程树、看板、时间排列等',
          '按层级、按子树混用不同布局',
          '折叠/展开 · 展开所选节点下的全部内容',
          '缩放 · 适应屏幕 · 居中查看',
          '大纲分屏查看 · 大纲 ↔ 导图切换',
          '深色模式',
        ],
        guide: '04. 布局与查看',
      },
      attach: {
        title: '节点中可以存放的内容',
        lead: '正是这些，让思维导图可以代替文档。',
        items: [
          '笔记——段落 · 代码（语言标签、复制） · 表格网格 · 勾选清单',
          '超链接',
          '附件 · 照片（连在正文中的位置也会保留）',
          '标签',
          '节点搜索——标题以及导图中的内容',
        ],
        guide: '05. 笔记、链接、附件、标签 · 06. 搜索',
      },
      io: {
        title: '导入与导出',
        lead: '不会被锁定。文件始终是标准 Markdown。',
        items: [
          '导入 Markdown——标题、表格、代码、勾选清单一并导入',
          '导出 Markdown（mmd）——结构、内容、布局规则都能往返保留',
          '导出 HTML——无需联网即可打开的查看器（支持折叠、缩放、搜索）',
          '云端“我的导图”——登录后随时随地接着用',
          '版本记录与恢复 · 长期保存（星标）',
        ],
        guide: '08. 导出与导入 · 11. 版本记录',
      },
      share: {
        title: '分享',
        lead: '把完成的导图分享出去。',
        items: [
          '发布——无需登录即可打开的链接',
          '私密（保存）↔ 免费公开切换，地址保持不变',
          '链接卡片——粘贴到 KakaoTalk、Slack，即显示标题、简介和预览',
          '上架到知识库——浏览的人也能看到',
        ],
        guide: '27-publish-share.md · 主页知识库',
      },
    },
    ctaTitle: '亲手试试更快',
    ctaBody: '点击右上角的“登录 EMM”，即可打开登录界面。会员直接登录；如果是第一次使用，可以在该界面选择“以访客身份试用”，无需注册即可马上开始。',
    ctaAi: '查看 AI 集成',
  },

  ai: {
    eyebrow: 'AI 集成——连接器（MCP）',
    title: <>AI 依据<b>我导图中的上下文</b>工作</>,
    lead: (
      <>
        普通聊天机器人不知道我已经整理过什么。把 EasyMindMap 作为连接器接入后，AI 会
        <b>读取“我的导图”中的导图</b>，把对话内容<b>原样留存为导图</b>，并在我指定的节点下添加分支。
      </>
    ),
    principlesTitle: '我们定下的四件事',
    principles: [
      {
        title: '① 导图不是对话的副产品，而是成果',
        body: (
          <>
            对话会随着滚动而消失。因此，我们让 AI 的回答可以留存在<b>当前打开的导图中、当前选中的节点下</b>。在下一次对话中，AI 会重新读取这张导图，在此基础上继续。
          </>
        ),
      },
      {
        title: '② AI 处理的是标准文本',
        body: (
          <>
            我们不教 AI 专用格式。双方交换的是 <b>mmd（Mindmap Markdown）</b>——用标题构建层级的普通 GFM。即使没有声明也有效，所以哪怕 LLM
            <b> 只输出普通的 Markdown</b>，也能成为导图。
          </>
        ),
      },
      {
        title: '③ 无法挽回的操作，不交给 AI',
        body: (
          <>
            <b>不存在删除导图或账户的工具。</b>也没有修改或删除现有文字的工具。AI 能改变的只有<b>追加内容</b>和<b>一个复选框字符</b>，两者都会留下版本记录，可以在应用中还原。
          </>
        ),
      },
      {
        title: '④ 不另立一套规则',
        body: (
          <>
            连接器的工具是对应用所用 API 的<b>薄封装</b>。配额、权限、编辑锁都照常适用——别人的导图对 AI 同样不可见，有人正在编辑的导图，AI 也无法介入。
          </>
        ),
      },
    ],
    toolsTitle: '向 AI 开放的六个工具',
    toolsHead: { tool: '工具', say: '在对话中这样说', does: '作用' },
    tools: {
      create_map: { say: '“把现在的内容存成导图”', does: <>把对话内容作为<b>新导图</b>保存到“我的导图”</> },
      append_to_map: { say: '“添加到‘下次会议 > 议题’下面”', does: <>在该节点下<b>追加分支</b></> },
      get_map: { say: '“读一下上周的会议导图”', does: '以 mmd 格式读取一张导图（不会产生编辑锁）' },
      list_maps: { say: '“策划文件夹里有什么？”', does: '列出我自己的导图和共享给我的导图（名称、文件夹、修改日期、节点数）' },
      get_open_map: { say: '“在现在打开的导图里”', does: '告知应用中正在查看的导图，以及所选节点的位置' },
      check_items: { say: '“把完成的项目勾上”', does: <>只勾选/取消勾选复选框（<code>[ ]</code> ↔ <code>[x]</code>）</> },
    },
    toolsNote: (
      <>
        导图的形式可以直接用话来指定——像“用看板”“按时间顺序”这样指定模板，就会照此绘制。客户端每次连接时都会重新读取工具列表，所以即使工具增加，
        <b>也无需重新注册连接器。</b>
      </>
    ),
    connectTitle: '如何接入——两种方式',
    connectLead: (
      <>
        <b>“二选一”这种说法容易引起误解。</b>做选择的不是用户，而是<b>客户端</b>。claude.ai 聊天窗口里根本没有填写令牌的地方，Claude Code 里也没有登录按钮。按使用场景选择合适的方式接入即可，
        <b>两者同时开启也互不干扰。</b>
      </>
    ),
    connectHead: { item: '项目', chat: 'claude.ai 聊天窗口', chatSub: '（自定义连接器）', code: 'Claude Code', codeSub: '（终端 · 网页）' },
    connectRows: [
      { label: '认证方式', chat: 'OAuth——登录按钮', code: <>PAT——<code>emm_…</code> 令牌原文</> },
      { label: '我要粘贴的内容', chat: '一行地址', code: '地址 + 令牌' },
      { label: '密钥有效期', chat: '较短，自动续期', code: <><b>无限期</b>——永不过期</> },
      { label: '令牌泄露时', chat: '很快就会过期', code: <>需要在应用中<b>[撤销]</b>才会失效</> },
      { label: '断开位置', chat: 'claude.ai 连接器页面', code: '应用 ▸ 🔌 AI 连接器（MCP）' },
      { label: '适用场景', chat: '日常边聊边整理时', code: '与代码、文档工作一起使用时' },
    ],
    connectNote: (
      <>
        <b>在安全方面，真正的区别只有一个</b>——令牌（PAT）没有有效期。泄露的令牌在有人点击撤销之前会一直有效，所以如果在公用电脑上用过，用完后请在应用中撤销。OAuth 方式在结构上不存在这种风险。
      </>
    ),
    inAppTitle: '没有连接器也可以——应用内的 AI',
    inApp: [
      {
        title: 'AI 生成',
        body: (
          <>
            在应用中给出主题或文档，就会展开分支。无需接入连接器，结果也是<b>普通的导图</b>，可以直接修改使用。
          </>
        ),
      },
      {
        title: '粘贴 Markdown',
        body: (
          <>
            无论哪个 AI 输出的 Markdown，导入后都能变成导图——连同标题、表格、代码、勾选清单。<b>不支持集成的 AI 也有办法。</b>
          </>
        ),
      },
    ],
    ctaTitle: '一次对话，一张导图',
    ctaBody: '从在应用中签发令牌，或注册连接器地址开始。',
    ctaApp: '在应用中打开连接器',
    ctaFunctions: '查看全部功能',
  },

  mmd: {
    siteUrl: 'https://www.mindmapmarkdown.org/zh/',
    badge: 'MMD Spec · Draft · 公开完善中',
    heroTitle: <>同一份知识，<br />人类与 AI 各有表达。</>,
    heroLead: (
      <>
        Mindmap Markdown 是一种
        <b>往返稳定（round-trip stable）的 Markdown 规范（profile）</b>，让人类与 AI 能以各自的表达处理同一份知识。EasyMindMap 遵循这一标准，把 Markdown 文字展开为导图，再还原为文字。
      </>
    ),
    readSpec: '阅读规范 →',
    vizAria: 'Markdown 文字通过 lift 变成树，再通过 projection 变回文字的示意图',
    depth: {
      aria: '概念图：文档层级越深，以纯文本阅读时人能读出的结构越少，以树形查看时则保持不变',
      x: '文档层级深度 →',
      y: '结构的可读程度 →',
      machine: '机器 · AI',
      tree: '人 · 以树形查看',
      plain: '人 · 以纯文本阅读',
      gap: 'Mindmap Markdown 填补的差距',
    },
    propsTitle: '文档格式要同时服务人与机器，需要具备四个特性',
    propsSub: 'Markdown 满足前三个。剩下的一个，只在文档层级较浅时才成立。',
    props: {
      open: { title: '开放标准', desc: '任何人都能使用和实现' },
      machine: { title: '机器可读', desc: '解析器能准确解析' },
      ai: { title: 'AI 可读', desc: 'LLM 可直接读取' },
    },
    human: { title: '人类可读', desc: '仅限层级较浅时', depth: ['● 深度 1–2', '● 3–4', '● 5+'] },
    chartTitle: '层级越深，只有人会失去对结构的把握',
    chartNote: '概念图 · 非实测值',
    roundTitle: <>画成树很容易。<br />无损地还原才是难点。</>,
    roundBody: '层级一深，人就无法从纯文本中看出结构，而同样的结构画成树形却一目了然。然而，在 LLM 重写文档的那一刻，下列信息会悄无声息地消失，目前还没有任何标准把这当作问题来处理。',
    lostAria: 'LLM 重写时丢失的信息',
    lost: ['节点标识', '人工批注', '布局', '审阅记录'],
    viewsTitle: '免安装的单个 HTML，两种视图',
    viewsBody: 'Mindmap Markdown 文档会渲染为无需安装任何东西的单个 HTML 文件，其查看器同时提供思维导图和大纲两种视图。因为没有任何单一视图能适用于所有规模。',
    mindmap: { title: '思维导图', desc: <>一目了然的形态<br />层级深时更有优势</> },
    outline: { title: '大纲', desc: <>可浏览的顺序<br />节点多时更有优势</> },
    levelsTitle: '一致性级别',
    levelsSub: '级别是累积的。实现需声明自己所主张的最高级别。',
    levels: {
      L0: { desc: '符合规范的文档就是普通的 Markdown。在现有的所有 Markdown 工具中，层级都能保留。', status: '所有 Markdown 工具' },
      L1: { desc: '文档 → 树（lift）、树 → 文档（canonical projection）各自唯一确定，且互为逆函数。', status: '已在 mindmapmd 中实现' },
      L2: { desc: '树与树之间的结构化 diff 与 merge，以及无需整篇文档、以子树为单位进行处理。', status: '规则尚未编写' },
    },
    source: (site, spec) => (
      <>
        出处：{site} 首页（截至 2026-10-26）。规范目前处于 Draft 阶段，内容可能会有变动。
        {' '}· {spec('阅读规范 →')}
      </>
    ),
    principlesTitle: '设计原则',
    principles: [
      { title: '依然是 Markdown', desc: '在 GitHub、Obsidian 等你正在使用的编辑器中可以直接打开。引入成本从零开始。' },
      { title: '语义在文档中，呈现放在旁边', desc: '布局和样式放在 sidecar 中，不放进发送给模型的文本。' },
      { title: '可验证的一致性', desc: '无法检验的规范只是建议。规范与测试由同一来源生成。' },
      { title: '互操作优先于竞争', desc: '优先为 OPML、JSON Canvas、markmap 等现有格式开发适配器。' },
    ],
    reposTitle: '仓库',
    repos: {
      spec: { desc: '规范与规范性示例', pill: '公开' },
      mindmapmd: { desc: '参考实现：lift · canonical projection', pill: 'L1' },
      conformance: { desc: '测试套件、运行器、实现登记表', pill: '计划中' },
      adapters: { desc: 'OPML · JSON Canvas · markmap 互操作', pill: '计划中' },
    },
    ctaTitle: '现在正是提出反对意见的最佳时机',
    ctaBody: '规范正处于最早期、也最容易改变的阶段。',
    ctaDraft: '阅读草案',
    ctaDiscuss: '提问 · 提建议',
    ctaImplement: '进行独立实现',
    footNote: (library, github) => (
      <>
        想看从 EasyMindMap 导出为 Markdown 的导图，可以{library('浏览知识库')} ·
        {' '}标准仓库合集请见 {github}
      </>
    ),
  },

  library: {
    title: '知识库',
    intro: '浏览作者公开的导图。无需登录即可直接打开。',
    searchPlaceholder: '在导图名称和导图内容中搜索',
    searchAria: '在知识库中搜索',
    searchHint: <>不仅搜索名称，还会搜索<b>导图中的节点、笔记和标签</b>。</>,
    emptyTitle: '还没有上架的导图。',
    emptyBody: <>发布导图后开启<b>[上架到知识库]</b>，导图就会出现在这里。</>,
    noResults: (q) => `没有找到与“${q}”相关的导图。`,
    noResultsBody: '已在导图名称和导图内容中全部搜索过。请换个词试试。',
    showAll: '查看全部',
    openAria: (title) => `${title}——在新标签页中打开`,
    noPreview: '暂无预览',
    priceTitle: '付费导图——预览最多显示到第 2 级',
    price: (amount) => `${amount} 韩元`,
    nodes: (n) => `${n} 个节点`,
    likeAria: (n) => `点赞 ${n}`,
    commentAria: (n) => `评论 ${n}`,
    hitsTitle: (n) => `在此导图的内容（节点、笔记、标签）中找到 ${n} 处`,
    hits: (n) => `内容 ${n} 处`,
  },

  board: {
    docTitle: (board) => `社区 · ${board} | EasyMindMap`,
    title: '社区',
    intro: '欢迎分享使用感受、意见和 Bug。任何人都可以阅读，只有会员可以发帖和评论。',
    names: { review: '使用感受', free: '自由讨论', bug: 'Bug 反馈', notice: '公告' },
    noticesAria: '最新公告',
    noticesLabel: '公告',
    pinned: '置顶',
    tabsAria: '版块类型',
    searchPlaceholder: '在标题和内容中搜索',
    searchAria: (board) => `在“${board}”中搜索`,
    write: '发帖 ↗',
    writeHint: '只有登录应用的会员才能发帖和评论。点击按钮将跳转到应用。',
    bugHint: (issues) => <>如果你是开发者，也可以在 {issues} 上提交。请确认截图中没有暴露个人信息。</>,
    noResults: (q) => `没有找到与“${q}”相关的帖子。`,
    empty: (board) => `“${board}”还没有帖子。`,
    firstPost: '来发第一篇帖子吧。',
    commentCountAria: (n) => `${n} 条评论`,
    hasPhotoAria: '含图片',
    postLoadFailed: '无法加载帖子。',
    notFound: '找不到该帖子。可能已被删除或隐藏。',
    edited: '（已编辑）',
    backToList: (board) => `← 返回“${board}”列表`,
    photoAlt: '附件图片',
    externalPhoto: '查看外部图片',
    commentsAria: '评论',
    commentsTitle: (n) => `评论 ${n}`,
    writeComment: '写评论 ↗',
    noComments: '还没有评论。',
    moreComments: '更多评论',
    commentHint: '只有登录应用的会员才能发表评论。',
    askText: '没有找到想要的答案？个人咨询或合作提议请另行发送。',
    askButton: '✉ 联系我们',
  },

  contact: {
    docTitle: '联系我们 | EasyMindMap',
    title: '联系我们',
    intro: '关于使用方法、错误、费用、合作等任何疑问，都欢迎留言。工作人员确认后，会回复到你填写的邮箱。',
    doneTitle: '已收到你的咨询。',
    doneBody: '我们确认后会回复到你填写的邮箱。',
    another: '提交其他咨询',
    viewBoard: '查看社区',
    boardHint: (board) => <>使用感受或 Bug 请发到{board('社区')}，这样其他用户也能看到。</>,
    name: '姓名',
    email: '接收回复的邮箱',
    category: '咨询类型',
    choose: '请选择',
    categories: { usage: '使用方法', bug: '错误、Bug', billing: '费用、支付', partnership: '合作、协作', other: '其他' },
    body: '咨询内容',
    bodyHelp: (len, max, min, links) => `${len}/${max} 字 · 至少 ${min} 字，链接最多 ${links} 个`,
    honeypot: '网站（请留空）',
    consentLegend: '同意收集和使用个人信息（必选）',
    consentItems: [
      '收集项目：姓名、邮箱、咨询内容',
      '使用目的：回复咨询',
      '保存期限：处理完成后 1 年',
      '不同意则无法提交咨询。',
    ],
    consentAgree: '我同意以上内容。',
    errors: {
      nameRequired: '请输入姓名。',
      nameTooLong: (max) => `姓名最多 ${max} 个字。`,
      emailInvalid: '请正确输入接收回复的邮箱地址。',
      categoryRequired: '请选择咨询类型。',
      bodyTooShort: (min) => `咨询内容请至少填写 ${min} 个字。`,
      bodyTooLong: (max) => `咨询内容最多 ${max} 个字。`,
      tooManyLinks: (max) => `最多只能包含 ${max} 个链接。`,
      consentRequired: '请同意收集和使用个人信息。',
    },
    captchaFirst: '请先完成下方的防垃圾信息验证，再提交。',
    captchaTitle: '请先完成防垃圾信息验证',
    tooMany: (minutes) => `咨询过于频繁。请${minutes ? ` ${minutes} 分钟` : '稍'}后再提交。`,
    sendFailed: '咨询提交失败。',
    sending: '提交中…',
    send: '提交咨询',
    turnstileFailed: '无法加载防垃圾信息验证工具。请关闭广告拦截程序，或稍后刷新页面。',
    turnstileLanguage: 'zh-cn',
  },
};

export default zh;
