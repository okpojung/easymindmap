import type { Guide } from './content';
import { BRAND_LOGO_URL, BRAND_FAVICON_URL } from './brand';
import personUrl from './logo-person.zh.svg';

/** Simplified Chinese (zh-Hans) translation of GUIDES. Structure mirrors content.ts / brand.ts exactly. */
export const GUIDES_ZH: Record<string, Guide> = {
  "questions": {
    "category": "AI 时代，提问的力量",
    "eyebrow": "From answers to better questions",
    "title": "AI 作答的时代，问什么由我来决定。",
    "description": "光是多提问还不够。试着练习这样的提问：先明确目的，再核实依据，并比较不同的视角。",
    "body": `<h2>为什么提问的能力如此重要</h2><p>使用 AI 时，需要的不只是输入合适提示词的技巧。还需要明确自己想解决什么，审视回答的依据和局限，并判断是否要把结果应用到自己的情况中。OECD 的 AI 素养框架也强调批判性地评估 AI 结果、负责任地使用 AI 的能力。</p><h2>生成答案的能力越是普及，“问什么”就越成为竞争力。</h2><p>AI 能借助海量信息，迅速给出回答的初稿和替代方案。在这样的环境中，只靠掌握知识、复现标准答案的能力，越来越难以拉开差距。EasyMindMap 关注的是这些活动：找到自己要解决的问题，拓宽视角，提出下一个问题。</p><h2>别让 AI 的第一个答案，成为自己思考的终点。</h2><p>如果不换一种问法，思考就可能停留在 AI 给出的答案框架里。再问问看：为什么会这样？出处在哪里？有没有反面案例？条件变了又会怎样？思维导图就是一个工作空间，让你把这些问题一目了然地展开、相互连接。</p><div class="callout">提问，由我来；回答，与 AI 一起；判断，再回到我。意思是：可以借助 AI，但问题的方向和最终判断的主导权要握在自己手里。专业知识和经验，是提出好问题、验证回答的基础。</div><h2>思维导图，是把问题从脑中拿出来的工作空间。</h2><p>从一个模糊的好奇出发，按目的、依据、替代方案分出分支。看着眼前展开的问题，合并重复的内容，找出遗漏的条件，再挑出要先核实的问题。思维导图是支持这种活动的工具，而不是替你思考的标准答案机器。</p><h2>同一个主题，更具体一步的问题</h2><pre>最初的问题\n“我们团队也该用 AI 吗？”\n\n重新提出的问题\n“如果在重复性的会议纪要整理中使用 AI，\n该如何检查信息遗漏、个人信息和修改所需的时间，\n又该依据什么标准判断是否引入？”</pre><h2>让问题不断深入的四个步骤</h2><ol><li><strong>先写下我的问题：</strong>在看 AI 的回答之前，先写下自己好奇的事。</li><li><strong>展开视角：</strong>把为什么需要、有什么依据、有没有反面案例分成不同的分支。</li><li><strong>审视回答：</strong>区分 AI 回答中的事实和推测，核实出处和遗漏的条件。</li><li><strong>提出下一个问题：</strong>记下审视后仍然存在的疑问，把最初的问题改得更具体。</li></ol><div class="callout">只是打开工具、做出漂亮的导图，提问能力并不会自动提升。关键在于亲自提问、核实依据、再加以修改的练习。</div><h2>研究说明了什么，又还不能说明什么</h2><p>2025 年发表的一项基于概念图的协作式出题研究，报告了在特定学习环境中，问题的相关性和深度方面的积极结果。但概念图（concept map）和放射状思维导图并不是同一种工具，也不能把教学设计的效果说成是 EasyMindMap 软件本身的效果。</p><p>因此，我们不说“EasyMindMap 已证明能提升提问能力”，而是说“它支持展开、串联和打磨问题的练习”。能力是否真正提升，需要通过单独的用户研究来验证。</p><button class="btn" data-try="questions" type="button">把我的问题展开成导图 ↗</button><h2>延伸阅读</h2><ul><li><a class="textlink" href="https://www.oecd.org/en/publications/empowering-learners-for-the-age-of-ai_65cd27d4-en.html" target="_blank" rel="noopener noreferrer">OECD · Empowering Learners for the Age of AI (2026)</a></li><li><a class="textlink" href="https://link.springer.com/article/10.1007/s11423-025-10469-y" target="_blank" rel="noopener noreferrer">基于概念图的协作式出题研究（2025）</a></li><li><a class="textlink" href="https://pmc.ncbi.nlm.nih.gov/articles/PMC11639541/" target="_blank" rel="noopener noreferrer">护理专业学生思维导图研究：未发现批判性思维得分存在显著差异</a></li></ul><p class="source-line">参考资料可通过上方链接查看。请将一般的教育研究与本产品的验证结果区分开来。</p>`
  },
  "mindmap": {
    "category": "新手入门",
    "eyebrow": "A map for your thoughts",
    "title": "思维导图不考验画功，而是一种看清想法之间关系的方法。",
    "description": "把一个主题放在中心，用分支连接相关的想法。这是一种从不同角度审视复杂信息的工具。",
    "body": `<h2>文字已经写得不错了，为什么还需要导图？</h2><p>长文适合顺着上下文阅读。但如果要同时比较多个主题，或在大主题和细节之间来回切换，单独看清结构可能会更方便。思维导图能把这种结构直观地展开。</p><h2>这些时候，不妨试试。</h2><ul><li><strong>会议：</strong>想把议题、讨论、决定和下一步行动分开时。</li><li><strong>学习：</strong>想把新概念和已知的内容连起来时。</li><li><strong>计划：</strong>想看看众多准备事项中漏掉了什么时。</li></ul><h2>一开始，三个分支就够了。</h2><ol><li>用一句话写下中心主题。</li><li>把相关的大主题分成 2～4 个。</li><li>在每个主题下补充具体内容或问题。</li><li>最后，选出下一步要做的一件事。</li></ol><div class="callout">思维导图并非在任何情况下都优于其他文档。简短的备忘、长篇的论证、精确的数值计算，用列表、段落和表格可能更合适。在需要的时候，把它当作看清结构的工具来用吧。</div><h2>比起画得多，重新写一遍更重要。</h2><p>增加颜色和分支本身并不是目标。确认一下，自己能否回答这些问题：“我理解了什么？”“我漏掉了什么？”“下一步做什么？”</p>`
  },
  "markdown": {
    "category": "新手入门",
    "eyebrow": "A little structure goes a long way",
    "title": "Markdown，从三个符号开始。",
    "description": "它不关注文字的外观，而是用简单的文本标出标题和列表的结构。文件扩展名通常是 .md。",
    "body": `<h2>只要知道这些，就能看懂结构。</h2><pre># 周末出游\n## 要准备的\n- 充电器\n- 舒适的鞋子\n## 想去的地方\n- 海边小城\n- 附近的古镇</pre><ul><li><strong>#</strong> 后面的文字是文档的大标题。</li><li><strong>##</strong> 后面的文字是下一级的标题。</li><li><strong>-</strong> 后面的文字是列表中的一项。</li></ul><p>符号和内容之间请留一个空格。把这个结构读成导图，大标题就是中心主题，下级标题是大分支，列表则是其下的分支。</p><h2>它和 HWP、Word、HTML 有什么不同？</h2><p><strong>HWP、Word</strong> 擅长页面排版和精细的格式编辑。<strong>HTML</strong> 用来表示网页的结构。<strong>Markdown</strong> 则用相对简单的语法，标出文字中的标题、列表等。它们用途不同，任何一种都无法完全取代其他文档。</p><h2>和 AI 一起使用时，结构同样重要。</h2><p>标题和列表清晰，可能有助于人和 AI 把握文档的层次划分。不过，并不是用了 Markdown，就能保证回答准确或节省成本。仍然需要核实原文内容和 AI 的结果。</p><h2>需要把 Markdown 全部学会吗？</h2><p>不需要。从用得到的符号开始，一个个熟悉就好。表格、勾选清单、代码等写法，等需要时再学也不迟。主页上的简易体验是这样的：在左侧大纲中添加、编辑、删除节点，右侧导图会立即同步更新。Markdown 导入和完整的编辑功能在应用中另行提供。</p>`
  },
  "why": {
    "category": "产品故事",
    "eyebrow": "Write. Connect. Continue.",
    "title": "在文档和思维导图之间，让思考不被打断。",
    "description": "EasyMindMap 希望实现这样的流程：在文字和导图之间来回整理，并与 AI 连接，让内容不断延续。",
    "body": `<h2>1. 从已经写好的文字开始。</h2><p>可以导入 Markdown 文档，把标题和列表作为分支来查看。据目前官网介绍，表格、代码和勾选清单也受支持。反过来，也提供把导图导出为文字、再作为文档使用的流程。</p><h2>2. 不必每次都向 AI 从头解释。</h2><p>目前官网介绍了这样的流程：通过 Claude 连接器（MCP），在对话中创建导图、读取“我的导图”中的导图，并在指定节点下添加分支。这需要另外设置连接器，并具备相应的访问权限。仅仅修改主页上的大纲示例，并不会连接到 AI。</p><h2>3. 根据目的切换查看方式。</h2><p>产品提供思维导图、大纲、看板等形式。审视整体关系时和阅读细节文字时，可以选择适合当下情况的呈现方式。本主页的简易体验并未重现完整的产品编辑器。</p><h2>4. 分享并保存整理好的成果。</h2><p>目前官网介绍了公开链接发布，以及可在离线浏览器中打开的 HTML 导出。创建公开链接前，请先确认个人信息和公开范围。</p><div class="callout">mmd（Mindmap Markdown）是 EasyMindMap 提出的一种基于文本的表示规范。这并不意味着它已经是所有思维导图产品都采用的行业标准。</div><h2>现在，从一个小体验开始。</h2><p>如果是第一次访问，不必理解所有专业术语。先看看大纲中的节点是如何与导图相连的，再从你觉得需要的功能开始了解。</p><p><a class="textlink" href="https://www.easymindmap.org/function" target="_blank" rel="noopener noreferrer">在当前官网查看功能介绍 ↗</a></p><p class="source-line">功能说明依据：调查时的 www.easymindmap.org 及 apps/site/README.md。</p>`
  },
  "meeting": {
    "category": "使用案例",
    "eyebrow": "For work / Example",
    "title": "会开完了，下一步行动一目了然。",
    "description": "以下示例用于说明使用方式，并非真实的用户评价或成效统计。",
    "body": `<h2>别把所有发言都堆在同一个列表里。</h2><p>会议记录里，问题、意见和决定很容易混在一起。先试着分出“要讨论的”“要决定的”“要记录的”这几个大分支。</p><pre># 下周团队会议\n## 要讨论的\n- 新网站的方向\n- 用户反馈\n## 要决定的\n- 先做什么\n- 确定负责人\n## 要记录的\n- 决定事项\n- 下次会议时间</pre><h2>会议结束时，只需确认三件事。</h2><ol><li>已确定的内容和仍在讨论的内容分开了吗？</li><li>下一步行动有负责人和截止日期吗？</li><li>没参会的人也能看懂上下文吗？</li></ol><div class="callout">思维导图不会自动指定负责人，也不会替你执行任务。最后的确认和执行，需要由人来判断。</div><button class="btn" data-try="meeting" type="button">用这个示例体验 ↗</button>`
  },
  "study": {
    "category": "使用案例",
    "eyebrow": "For learning / Example",
    "title": "与其照抄读过的内容，不如把自己的问题连起来。",
    "description": "以下是整理读书笔记的示例，并不保证学习效果或记忆力的提升。",
    "body": `<h2>不必把一整本书都装进去。</h2><p>从今天读过的部分中，挑出核心概念、我的问题和要实践的事各一个。把作者的观点和自己的意见分开，重读时更容易把握上下文。</p><pre># 今天读的书\n## 核心概念\n- 作者的观点\n- 值得记住的例子\n## 我的问题\n- 为什么会这样？\n- 有没有别的视角？\n## 要实践的\n- 今天的一个小行动\n- 需要重读的部分</pre><h2>合上导图，试着讲一遍。</h2><p>想想看，要怎样向别人解释这个概念。讲不下去的地方，可以留在问题分支里，作为下次阅读的起点。引用时，最好一并记下书名和页码。</p><div class="callout">公开笔记时，请确认著作权和引用范围。避免照搬整本书的内容进行分享。</div><button class="btn" data-try="study" type="button">用这个示例体验 ↗</button>`
  },
  "travel": {
    "category": "使用案例",
    "eyebrow": "For everyday / Example",
    "title": "这个周末，从一个小计划开始吧。",
    "description": "把地点、要带的东西和想做的事分开列出，就能从不同角度审视计划。",
    "body": `<h2>在导图中心写下“周末出游”。</h2><p>不要一开始就想排好完整的时间表。先把想法分成要准备的、想做的、想去的地方，再从需要的部分开始逐步细化。</p><pre># 周末出游\n## 要准备的\n- 充电器\n- 舒适的鞋子\n## 想做的事\n- 海边散步\n- 品尝当地美食\n## 想去的地方\n- 海边小城\n- 附近的古镇</pre><h2>接下来，确认实际条件。</h2><p>看着导图定好优先顺序后，再单独确认预算、交通时间以及能否预订。本示例不提供旅游信息搜索或实时预订功能。</p><button class="btn" data-try="travel" type="button">用这个示例体验 ↗</button>`
  },
  "brand": {
    "category": "品牌故事",
    "eyebrow": "Write for AI. Think for yourself.",
    "title": "标志里蕴含的思考",
    "description": "便于 AI 阅读的文字，由人来培育的问题。介绍 EasyMindMap 标志的含义和数字标准色。",
    "body": `<figure class="brand-story-visual"><img src="${BRAND_LOGO_URL}" width="670" height="410" alt="EasyMindMap 官方标志。循环箭头内有 Mark Down 和 AI-ready 字样，四个分支从人头形状的中心圆展开。" decoding="async"><figcaption>便于 AI 阅读的文字，由人来培育的问题。</figcaption></figure><h2>记录变成问题，问题又生长为下一个想法。</h2><p>EasyMindMap 的标志，蕴含着记录文字、展开问题、再修正想法的循环。它把 AI 要读取的文档结构，和人要审视的想法之间的关系，连接成一个流程。</p><h2>内侧的 Markdown：便于与 AI 交流的结构</h2><p>循环箭头内的 Mark Down 指的是 Markdown。它用相对简单的文本表示标题、列表、表格等结构，帮助人和 AI 把握文档的层次和上下文。小字 AI-ready 代表这种结构上的可读性。</p><div class="callout"><strong>AI-ready 不是认证，也不代表保证准确。</strong>使用 Markdown，并不意味着所有 AI 都能准确理解内容或给出正确的答案。需要明确提问的目的和条件，并核实回答的依据和错误。</div><h2>中央的圆：提问者的头部</h2><p>中央的圆是人的头部。左半边代表棕色的头发，右半边代表脸。这表示心怀待解问题的人位于思考的中心。AI 可以提出初稿和替代方案，但问什么、接受什么样的答案，由人来判断。</p><h2>把标志竖起来看：从文字中舒展开的人</h2><figure class="brand-story-visual brand-story-person"><img src="${personUrl}" width="580" height="720" alt="将标志顺时针旋转 90 度后的图。中央的圆是头，外侧两个分支是双臂，内侧两个分支是双腿。" decoding="async" loading="lazy"><figcaption>顺时针旋转 90 度的标志：头、双臂、双腿</figcaption></figure><p>将标志顺时针旋转 90 度，中央的圆就是头，外侧两个分支是双臂，内侧两个分支是双腿。它寓意 Markdown 文字（md）展开为便于人阅读的导图，也就是说，EasyMindMap 把文字呈现为<strong>对人友好的导图</strong>。横着看是一张普通的思维导图，竖起来看，则能发现藏在其中的人形。</p><h2>四个圆：让问题成长的四个动作</h2><p>从中央展开的分支代表 Mindmap。这是一个工作空间：把想法摆在眼前，审视关系和遗漏的条件，打磨问题。四个圆从标志的上方到下方，依次表示以下过程。用双臂（发现与实践）伸手探寻、付诸行动，用双腿（探究与视角转换）站在依据和不同的视角之上。</p><ol class="brand-steps"><li><strong>发现 · 琥珀色（臂）</strong><span>我好奇的是什么？从模糊的想法中找到我的问题。</span></li><li><strong>探究 · 蓝色（腿）</strong><span>依据是什么？区分事实和推测，并加以核实。</span></li><li><strong>视角转换 · 紫色（腿）</strong><span>换个角度看会怎样？比较反面案例和被忽略的可能性。</span></li><li><strong>实践 · 橄榄绿（臂）</strong><span>先从哪里做起？选定下一步行动，再把结果记录下来。</span></li></ol><p>仅仅画出思维导图，提问能力并不会自动提升。它的意义在于支持你练习亲自提问、审视依据、修改问题。</p><h2>循环箭头与连线：不止步于一次回答</h2><p>深森林绿的箭头和连线，把不同的颜色串联为一体。连线连接概念、经验与条件；循环箭头则代表持续的探究：把实践的结果重新记录下来，再从记录中发现新的问题。</p><h2>品牌色彩定义表</h2><p>我们把标志的代表色整理为用于数字制作的标准色。颜色的名称和含义是 EasyMindMap 选择的品牌语言，并不是在主张普遍的心理效果。</p><div class="brand-palette-scroll" role="region" aria-label="品牌色彩定义表，可横向滚动" tabindex="0"><table class="brand-palette"><caption>EasyMindMap 数字标准色 · HEX / RGB（sRGB）</caption><thead><tr><th scope="col">应用元素</th><th scope="col">颜色名称</th><th scope="col">HEX</th><th scope="col">RGB</th><th scope="col">寓意</th></tr></thead><tbody><tr><th scope="row">文字</th><td><span class="brand-swatch" style="background:#1F292E" aria-hidden="true"></span>记录的炭灰</td><td><code>#1F292E</code></td><td>31, 41, 46</td><td>把想法写成文字的起点</td></tr><tr><th scope="row">循环箭头、连线、头部轮廓</th><td><span class="brand-swatch" style="background:#235A48" aria-hidden="true"></span>延续的森林绿</td><td><code>#235A48</code></td><td>35, 90, 72</td><td>重新连接记录与问题、想法与上下文的流动</td></tr><tr><th scope="row">头部左半边（头发）</th><td><span class="brand-swatch" style="background:#5A3825" aria-hidden="true"></span>人的棕色</td><td><code>#5A3825</code></td><td>90, 56, 37</td><td>心怀问题的人</td></tr><tr><th scope="row">头部右半边（脸）</th><td><span class="brand-swatch" style="background:#F0C49C" aria-hidden="true"></span>脸庞的杏色</td><td><code>#F0C49C</code></td><td>240, 196, 156</td><td>站在思考中心的人</td></tr><tr><th scope="row">从上数第一个圆（臂）</th><td><span class="brand-swatch" style="background:#DA8740" aria-hidden="true"></span>发现的琥珀色</td><td><code>#DA8740</code></td><td>218, 135, 64</td><td>发现自己好奇的是什么</td></tr><tr><th scope="row">从上数第二个圆（腿）</th><td><span class="brand-swatch" style="background:#4481B7" aria-hidden="true"></span>探究的蓝色</td><td><code>#4481B7</code></td><td>68, 129, 183</td><td>寻找并核实依据</td></tr><tr><th scope="row">从上数第三个圆（腿）</th><td><span class="brand-swatch" style="background:#8F6AA3" aria-hidden="true"></span>视角的紫色</td><td><code>#8F6AA3</code></td><td>143, 106, 163</td><td>比较不同的视角和可能性</td></tr><tr><th scope="row">从上数第四个圆（臂）</th><td><span class="brand-swatch" style="background:#8CA357" aria-hidden="true"></span>实践的橄榄绿</td><td><code>#8CA357</code></td><td>140, 163, 87</td><td>选定下一步行动，再回头审视</td></tr></tbody></table></div><p class="source-line">HEX 和 RGB 是屏幕显示用的标准。标志中的循环箭头和文字是栅格图像，包含柔和的边缘和细微的中间色调。印刷用的 CMYK 需要根据纸张和输出配置文件另行转换和确认。</p><h2>因尺寸而变，身份始终如一</h2><div class="brand-icon-example"><img src="${BRAND_FAVICON_URL}" width="48" height="48" alt="简化版网站图标：森林绿的循环箭头和人头形状的中心圆"><p>正式标志同时使用 Markdown 与 AI-ready 字样，以及人形的四个分支。在网站图标这样的小空间里，则省略文字和分支，只保留循环箭头和人的头部。</p></div><p>不拉伸标志、不改变比例，并保持明亮的背景和充足的留白。在非常小的地方，使用简化图标来减少复杂感。</p>`
  },
  "publishing": {
    "category": "运营构想",
    "eyebrow": "Content without the complexity",
    "title": "写起来轻松，发布前确认。",
    "description": "以下内容是运营设计方案。本草案并未实现实际的文章保存、登录、社区或自动发布功能。",
    "body": `<h2>以“我的导图”中的 homepage 导图作为内容原稿。</h2><p>将现有“easymindmap homepage”导图中的 Markdown、Mindmap、EasyMindmap 分支，用作教育内容的骨架。首页放经过编辑的简短摘要，下级详情页则放充分的说明。</p><h2>为什么不把整张导图直接放在首页。</h2><p>对不熟悉思维导图的访客来说，大幅导图和长长的文章列表可能会成为另一项学习任务。为了不让主页本身要求访客先学会使用导图，默认页面以易读的网页内容呈现。想看导图的人，可以通过辅助链接查看。</p><h2>建议的发布流程</h2><ol><li>在单独指定的主页专用导图中编辑草稿。</li><li>由 AI 只提取要公开的节点，并检查文字、链接和个人信息。</li><li>在预览中确认内容和设计。</li><li>只对批准后的快照保留版本并发布。</li></ol><div class="callout">不会把“我的导图”整体作为公开 API 开放，也不会把个人账户令牌放进浏览器。设计为在经过认证的服务器端或构建阶段只提取允许的节点；如果失败，则保留最后一个批准版本。</div><h2>撰写帖子与修改主页分开处理。</h2><p>如果是公告、使用技巧这类只有运营者发文的区域，先考虑接入一个简单的写作页面。包含访客注册、评论、附件、搜索在内的公开社区则是另一项功能，需要先设计好防垃圾信息、权限、文件检查、备份和删除策略，再接入。</p><p>建议的配置是：运营者只看到“写新文章 → 预览 → 发布”，不暴露代码、主题和部署设置。</p>`
  }
};
