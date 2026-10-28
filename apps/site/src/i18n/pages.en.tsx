/**
 * 하위 페이지 문구 — English. 구조와 쓰는 법은 pages.ts 머리말을 본다.
 * 용어는 BRIEF.md 와 template.en.html 을 따른다 (Library · Community · Contact us · Log in to EMM · Try as guest · map).
 * /mmd 문구는 www.mindmapmarkdown.org 영어 첫 화면 표현을 따른다.
 */
import type { PageText } from './pages';

const en: PageText = {
  common: {
    loading: 'Loading…',
    more: 'Load more',
    retry: 'Try again',
    clearSearch: 'Clear search',
    listLoadFailed: 'Could not load the list.',
    dateOptions: { year: 'numeric', month: 'short', day: 'numeric' },
  },

  api: {
    listedFailed: (status) => `Could not load the list (HTTP ${status})`,
    network: 'Could not connect to the server. Please try again in a moment.',
    requestFailed: (status) => `The request could not be processed (HTTP ${status}).`,
  },

  functions: {
    eyebrow: 'Features',
    title: 'What you can do',
    lead: (
      <>
        Create maps, view them in different ways, keep documents in nodes, export them as standard Markdown,
        and share them by link. <b>Only features with a chapter in the user guide</b> are listed here.
      </>
    ),
    guidePrefix: 'Guide',
    groups: {
      ai: {
        title: 'Create with AI',
        lead: 'Give it a topic and it lays out the outline; your conversations are kept as maps.',
        items: [
          'AI generation — give it a topic or document and it expands the branches',
          'Claude connector (MCP) — create maps right from a chat · read maps in My maps',
          'Attach AI answers as branches under the node you choose',
          'Automatic checkbox ticking — "Check off the finished items"',
        ],
        more: 'More on AI integration',
        guide: '07. AI generation · 12. AI connector (MCP)',
      },
      edit: {
        title: 'Creating and editing maps',
        lead: 'Adding, moving and styling nodes: the things you use every day.',
        items: [
          'Start from a template · save your own templates',
          'Add, delete, copy, drag and resize nodes',
          'Add many nodes at once (with hierarchy from indentation)',
          'Multi-select — move and resize together',
          'Partial emphasis with bold, italic, strikethrough, underline and highlighter',
          'Shapes, colors and fonts — level rules + per-node overrides',
        ],
        guide: '02. Creating maps · 03. Editing nodes',
      },
      view: {
        title: 'Views and layouts',
        lead: 'See the same content in different ways.',
        items: [
          '7 layouts — radial, tree, hierarchy, progress tree, kanban, timeline and more',
          'Mix different layouts by level or by subtree',
          'Collapse/expand · expand everything under the selected node',
          'Zoom · fit to screen · center view',
          'Split outline view · switch between outline and map',
          'Dark mode',
        ],
        guide: '04. Layouts and views',
      },
      attach: {
        title: 'What a node can hold',
        lead: 'The part that lets a mind map stand in for a document.',
        items: [
          'Notes — paragraphs · code (language label, copy) · table grids · checklists',
          'Hyperlinks',
          'Attachments · photos (their position within the text is kept)',
          'Tags',
          'Node search — titles and the content inside maps',
        ],
        guide: '05. Notes, links, attachments, tags · 06. Search',
      },
      io: {
        title: 'Import and export',
        lead: 'You are never locked in. Your files are always standard Markdown.',
        items: [
          'Markdown import — headings, tables, code and checklists included',
          'Markdown export (mmd) — round-trips structure, content and layout rules',
          'HTML export — a viewer that opens without internet (collapse, zoom and search work)',
          'Cloud documents — log in and pick up where you left off, anywhere',
          'Version history and restore · keep versions longer (starred)',
        ],
        guide: '08. Export and import · 11. Version history',
      },
      share: {
        title: 'Sharing',
        lead: 'Send a finished map out into the world.',
        items: [
          'Publishing — a link that opens without logging in',
          'Switch between private (archived) and free public, with the same address',
          'Link cards — paste into KakaoTalk or Slack for a title, description and preview',
          'List in the Library — visible to people browsing too',
        ],
        guide: '27-publish-share.md · Homepage Library',
      },
    },
    ctaTitle: 'Trying it yourself is quicker',
    ctaBody: 'Press ‘Log in to EMM’ at the top right to open the login screen. Members log in; if you are new, choose ‘Try as guest’ on that screen to start right away without signing up.',
    ctaAi: 'See AI integration',
  },

  ai: {
    eyebrow: 'AI Integration — Connector (MCP)',
    title: <>AI works with <b>the context of my maps</b></>,
    lead: (
      <>
        An ordinary chatbot does not know what I have already organized. Connect EasyMindMap as a
        connector and the AI <b>reads the maps in my documents</b>, keeps the conversation
        <b> as a map just as it is</b>, and attaches branches under the node I choose.
      </>
    ),
    principlesTitle: 'Four things we decided',
    principles: [
      {
        title: '① A map is the result of a conversation, not a by-product',
        body: (
          <>
            Conversations scroll away and disappear. So we made it possible to keep the AI’s answer <b>under the
            node selected right now, in the map open right now</b>. In the next conversation, the AI reads that
            map again and carries on.
          </>
        ),
      },
      {
        title: '② What the AI handles is standard text',
        body: (
          <>
            We do not teach the AI a special format. What goes back and forth is <b>mmd
            (Mindmap Markdown)</b> — ordinary GFM that builds hierarchy from headings. It is valid even without a
            declaration, so an LLM that outputs <b>nothing but plain Markdown</b> still produces a map.
          </>
        ),
      },
      {
        title: '③ Nothing irreversible is given to the AI',
        body: (
          <>
            There is <b>no tool that deletes</b> maps or accounts. There are no tools that edit or remove existing
            text either. All the AI can change is <b>appending</b> and
            <b> a single checkbox character</b>, and both are kept as versions you can undo in the app.
          </>
        ),
      },
      {
        title: '④ No second set of rules',
        body: (
          <>
            The connector’s tools are <b>thin wrappers</b> around the API the app uses. Quotas, permissions and
            edit locks apply as they are — other people’s maps stay invisible to the AI too, and the AI cannot
            step into a map that someone is editing.
          </>
        ),
      },
    ],
    toolsTitle: 'Six tools opened to the AI',
    toolsHead: { tool: 'Tool', say: 'Say this in the chat', does: 'What it does' },
    tools: {
      create_map: { say: '“Save this as a map”', does: <>Saves the conversation to My maps as <b>a new map</b></> },
      append_to_map: { say: '“Add this under ‘Next meeting > Agenda’”', does: <><b>Appends branches</b> under that node</> },
      get_map: { say: '“Read last week’s meeting map”', does: 'Reads one map as mmd (does not create an edit lock)' },
      list_maps: { say: '“What’s in the Planning folder?”', does: 'Lists my maps and maps shared with me (name, folder, modified date, node count)' },
      get_open_map: { say: '“In the map that’s open now”', does: 'Tells it which map you are viewing in the app and where the selected node is' },
      check_items: { say: '“Check off the finished items”', does: <>Only checks/unchecks checkboxes (<code>[ ]</code> ↔ <code>[x]</code>)</> },
    },
    toolsNote: (
      <>
        You set the map’s shape in words — name a template, like “as a kanban” or “in time order”, and it is
        drawn that way. Clients reread the tool list every time they connect, so even when tools are added
        <b> you do not need to register the connector again.</b>
      </>
    ),
    connectTitle: 'How to connect — two paths',
    connectLead: (
      <>
        <b>Saying “pick one of the two” is misleading.</b> It is not the user who picks, but
        the <b>client</b>. The claude.ai chat has no field for a token at all, and Claude Code has no login
        button. Connect the way that fits where you work, and <b>having both on does not cause any conflict.</b>
      </>
    ),
    connectHead: { item: 'Item', chat: 'claude.ai chat', chatSub: '(custom connector)', code: 'Claude Code', codeSub: '(terminal · web)' },
    connectRows: [
      { label: 'Authentication', chat: 'OAuth — a login button', code: <>PAT — the raw <code>emm_…</code> token</> },
      { label: 'What I paste', chat: 'One line: the address', code: 'Address + token' },
      { label: 'Key lifetime', chat: 'Short, renewed automatically', code: <><b>Unlimited</b> — it never expires</> },
      { label: 'If the token leaks', chat: 'It expires soon', code: <>It stops only when you <b>[Revoke]</b> it in the app</> },
      { label: 'Where to disconnect', chat: 'The claude.ai connector screen', code: 'App ▸ 🔌 AI connector (MCP)' },
      { label: 'Best for', chat: 'Organizing as you chat day to day', code: 'Working alongside code and documents' },
    ],
    connectNote: (
      <>
        <b>Only one thing actually differs for security</b> — a token (PAT) does not expire. A leaked token
        stays valid until someone presses Revoke, so if you used it on a shared PC, revoke it in the app
        afterwards. The OAuth path structurally does not have this risk.
      </>
    ),
    inAppTitle: 'Even without a connector — AI inside the app',
    inApp: [
      {
        title: 'AI generation',
        body: (
          <>
            Give the app a topic or a document and it expands the branches. No connector needed, and the result
            is <b>an ordinary map</b>, so you can edit it as you like.
          </>
        ),
      },
      {
        title: 'Paste Markdown',
        body: (
          <>
            Markdown from any AI becomes a map when you import it — headings, tables, code and checklists
            included. <b>There is a way even for AIs that do not support integration.</b>
          </>
        ),
      },
    ],
    ctaTitle: 'One conversation, one map',
    ctaBody: 'Start by issuing a token in the app or registering the connector address.',
    ctaApp: 'Open the connector in the app',
    ctaFunctions: 'See all features',
  },

  mmd: {
    siteUrl: 'https://www.mindmapmarkdown.org/',
    badge: 'MMD Spec · Draft · developed in the open',
    heroTitle: <>The same knowledge,<br />for humans and AI alike.</>,
    heroLead: (
      <>
        Mindmap Markdown is a
        <b> round-trip-stable Markdown profile</b> for human–AI knowledge exchange.
        EasyMindMap follows this standard to unfold Markdown text into a map, and turn it back into text.
      </>
    ),
    readSpec: 'Read the specification →',
    vizAria: 'Markdown text becomes a tree by lift, and becomes text again by projection',
    depth: {
      aria: 'Conceptual chart: as document hierarchy deepens, how well a human sees the structure drops when read as plain text, but holds when drawn as a tree',
      x: 'hierarchy depth →',
      y: 'how well structure is seen →',
      machine: 'machine · AI',
      tree: 'human · as a tree',
      plain: 'human · as plain text',
      gap: 'the gap Mindmap Markdown closes',
    },
    propsTitle: 'A format that serves people and machines needs four properties',
    propsSub: 'Markdown delivers three of them outright. The fourth holds only while the document stays shallow.',
    props: {
      open: { title: 'Open standard', desc: 'anyone can use and implement' },
      machine: { title: 'Machine-readable', desc: 'parsers read it exactly' },
      ai: { title: 'AI-readable', desc: 'LLMs read it as-is' },
    },
    human: { title: 'Human-readable', desc: 'only while shallow', depth: ['● depth 1–2', '● 3–4', '● 5+'] },
    chartTitle: 'As depth grows, only the human loses the shape',
    chartNote: 'conceptual · not measured',
    roundTitle: <>Drawing the tree is easy.<br />Getting back without losing anything is not.</>,
    roundBody: 'Once a document has real hierarchical depth, a human can no longer see its shape in plain text, while the same structure is trivially legible when drawn as a tree. When an LLM rewrites a document, these are silently destroyed, and no standard yet treats this as a problem.',
    lostAria: 'Information lost when an LLM rewrites a document',
    lost: ['Node identity', 'Human annotations', 'Layout', 'Review history'],
    viewsTitle: 'One self-contained HTML file. Two views.',
    viewsBody: 'A Mindmap Markdown document renders to a single self-contained HTML file: no server, no runtime, no installation. The viewer carries two views of the same document, because no single view survives every scale.',
    mindmap: { title: 'Mindmap', desc: <>shape, at a glance<br />holds up when depth is high</> },
    outline: { title: 'Outline', desc: <>sequence, navigable<br />holds up when node count is high</> },
    levelsTitle: 'Conformance levels',
    levelsSub: 'Levels are cumulative. An implementation states the highest level it claims.',
    levels: {
      L0: { desc: 'A conforming document is ordinary Markdown. Its hierarchy survives in every existing Markdown tool.', status: 'Every Markdown tool' },
      L1: { desc: 'Lift and canonical projection: a document determines one tree, a tree determines one document, and the two are mutually inverse.', status: 'Implemented in mindmapmd' },
      L2: { desc: 'Structural diff and merge between trees, and working on a subtree without the rest of the document.', status: 'Rules not yet written' },
    },
    source: (site, spec) => (
      <>
        Source: the {site} home page (as of 2026-10-26). The specification is a Draft, so its content may change.
        {' '}· {spec('Read the specification →')}
      </>
    ),
    principlesTitle: 'Design constraints',
    principles: [
      { title: 'It is still Markdown', desc: 'A Mindmap Markdown file opens and renders in GitHub, Obsidian, or any editor you already use. Adoption cost starts at zero.' },
      { title: 'Semantics in, presentation beside', desc: 'Layout and styling live in a sidecar, never in the text sent to a model.' },
      { title: 'Conformance is testable', desc: 'A specification that cannot be checked is a suggestion. The spec and its test suite come from the same source.' },
      { title: 'Interoperate, not compete', desc: 'Adapters for existing formats such as OPML, JSON Canvas, and markmap come first.' },
    ],
    reposTitle: 'Repositories',
    repos: {
      spec: { desc: 'The specification and its normative examples', pill: 'public' },
      mindmapmd: { desc: 'Reference implementation: lift and canonical projection', pill: 'L1' },
      conformance: { desc: 'Test suite, runner, and implementation registry', pill: 'planned' },
      adapters: { desc: 'Interoperability with OPML, JSON Canvas, and markmap', pill: 'planned' },
    },
    ctaTitle: 'The most useful moment to disagree is now',
    ctaBody: 'The specification is at its earliest and most changeable stage.',
    ctaDraft: 'Read the draft',
    ctaDiscuss: 'Ask · Suggest',
    ctaImplement: 'Build an independent implementation',
    footNote: (library, github) => (
      <>
        To see maps exported from EasyMindMap as Markdown, {library('browse the Library')} ·
        {' '}all the standard’s repositories are on {github}
      </>
    ),
  },

  library: {
    title: 'Library',
    intro: 'Browse maps that their authors have made public. They open right away, no login needed.',
    searchPlaceholder: 'Search map names and the content inside maps',
    searchAria: 'Search the Library',
    searchHint: <>Searches not only names but also <b>nodes, notes and tags inside maps</b>.</>,
    emptyTitle: 'No maps on display yet.',
    emptyBody: <>Publish a map and turn on <b>[Add to the Library]</b> to have it appear here.</>,
    noResults: (q) => `No maps found for “${q}”.`,
    noResultsBody: 'We searched both map names and the content inside maps. Try different words.',
    showAll: 'Show all',
    openAria: (title) => `${title} — open in a new tab`,
    noPreview: 'No preview',
    priceTitle: 'Paid map — the preview shows up to level 2',
    price: (amount) => `₩${amount}`,
    nodes: (n) => `${n} ${n === 1 ? 'node' : 'nodes'}`,
    likeAria: (n) => `${n} ${n === 1 ? 'like' : 'likes'}`,
    commentAria: (n) => `${n} ${n === 1 ? 'comment' : 'comments'}`,
    hitsTitle: (n) => `Found ${n} ${n === 1 ? 'match' : 'matches'} in this map’s content (nodes, notes, tags)`,
    hits: (n) => `${n} in content`,
  },

  board: {
    docTitle: (board) => `Community · ${board} | EasyMindMap`,
    title: 'Community',
    intro: 'Share your experience, ideas and bug reports. Anyone can read; only members can post and comment.',
    names: { review: 'Reviews', free: 'Open forum', bug: 'Bug reports', notice: 'Notices' },
    noticesAria: 'Recent notices',
    noticesLabel: 'Notice',
    pinned: 'Pinned',
    tabsAria: 'Boards',
    searchPlaceholder: 'Search titles and content',
    searchAria: (board) => `Search ${board}`,
    write: 'Write a post ↗',
    writeHint: 'Only members logged in to the app can post and comment. The button takes you to the app.',
    bugHint: (issues) => <>If you are a developer, you can also report on {issues}. Please make sure no personal information is visible in screenshots.</>,
    noResults: (q) => `No posts found for “${q}”.`,
    empty: (board) => `No posts in ${board} yet.`,
    firstPost: 'Be the first to post.',
    commentCountAria: (n) => `${n} ${n === 1 ? 'comment' : 'comments'}`,
    hasPhotoAria: 'Has photos',
    postLoadFailed: 'Could not load the post.',
    notFound: 'Post not found. It may have been deleted or hidden.',
    edited: ' (edited)',
    backToList: (board) => `← Back to ${board}`,
    photoAlt: 'Attached photo',
    externalPhoto: 'View external photo',
    commentsAria: 'Comments',
    commentsTitle: (n) => `Comments ${n}`,
    writeComment: 'Write a comment ↗',
    noComments: 'No comments yet.',
    moreComments: 'More comments',
    commentHint: 'Only members logged in to the app can comment.',
    askText: 'Didn’t find the answer you wanted? Send personal questions or partnership proposals separately.',
    askButton: '✉ Contact us',
  },

  contact: {
    docTitle: 'Contact us | EasyMindMap',
    title: 'Contact us',
    intro: 'Ask us anything about how to use it, errors, pricing, partnerships and more. We will check your message and reply to the email you enter.',
    doneTitle: 'Your message has been received.',
    doneBody: 'We will check it and reply to the email you entered.',
    another: 'Send another message',
    viewBoard: 'Go to Community',
    boardHint: (board) => <>For reviews or bug reports, post in {board('Community')} so other users can see them too.</>,
    name: 'Name',
    email: 'Email for our reply',
    category: 'Type of inquiry',
    choose: 'Please choose',
    categories: { usage: 'How to use', bug: 'Errors · bugs', billing: 'Pricing · payment', partnership: 'Partnership · collaboration', other: 'Other' },
    body: 'Message',
    bodyHelp: (len, max, min, links) => `${len}/${max} characters · at least ${min}, up to ${links} links`,
    honeypot: 'Website (leave blank)',
    consentLegend: 'Consent to collection and use of personal information (required)',
    consentItems: [
      'Items collected: name, email, message',
      'Purpose: replying to your inquiry',
      'Retention: 1 year after the inquiry is resolved',
      'You cannot send an inquiry without giving consent.',
    ],
    consentAgree: 'I agree to the above.',
    errors: {
      nameRequired: 'Please enter your name.',
      nameTooLong: (max) => `Your name can be up to ${max} characters.`,
      emailInvalid: 'Please enter a valid email address for our reply.',
      categoryRequired: 'Please choose the type of inquiry.',
      bodyTooShort: (min) => `Please write at least ${min} characters.`,
      bodyTooLong: (max) => `Your message can be up to ${max} characters.`,
      tooManyLinks: (max) => `You can include up to ${max} links.`,
      consentRequired: 'Please agree to the collection and use of personal information.',
    },
    captchaFirst: 'Please complete the spam check below before sending.',
    captchaTitle: 'Please complete the spam check first',
    tooMany: (minutes) => `Too many inquiries. Please try again ${minutes ? `in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}` : 'in a little while'}.`,
    sendFailed: 'Could not send your message.',
    sending: 'Sending…',
    send: 'Send',
    turnstileFailed: 'Could not load the spam check. Please turn off your ad blocker or refresh the page in a moment.',
    turnstileLanguage: 'en',
  },
};

export default en;
