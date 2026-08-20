// articleContent — 웹 기사(text/html)를 "노드에 직접" 붙여넣기 위해,
// sanitizeRichHtml을 통과한 HTML에서 텍스트와 사진을 **원문 순서대로**
// 함께 뽑는다. 사진은 "몇 번째 텍스트 줄 뒤인지"(afterLine)로 기록되어
// 노드 텍스트 중간의 원래 자리에 렌더링된다 (NodeInlineImage).
//
// 줄 규칙: 블록 요소(P/DIV/LI/H* 등)와 <br>이 줄을 끊는다. 빈 줄은
// 만들지 않는다 — 노드 안에서는 사진 밴드가 자체 여백을 가지므로 문단
// 사이 공백 줄이 필요 없다. afterLine은 "그 시점까지 쌓인 줄 수"라서
// 텍스트와 항상 일치한다 (text/plain과 줄을 맞추는 방식은 어긋나기 쉽다).

import { sanitizeRichHtml } from './sanitizeRichHtml';
import { importRemoteImage } from './embedImage';

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'PRE', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR',
  'FIGURE', 'FIGCAPTION', 'HR',
]);

export interface ArticleImageRef {
  src: string;
  afterLine: number; // 이 사진 앞에 있는 텍스트 줄 수 (0 = 맨 앞)
}

export interface ArticleContent {
  text: string; // 줄바꿈(\n)으로 이어붙인 본문 (빈 줄 없음)
  images: ArticleImageRef[];
}

// HTML <table> → 파이프 MD 표 줄들 (2026-07-31 사용자 요청 — 그룹웨어
// 결재 화면 등에서 복사한 표를 노드에 붙이면 노드 표 격자로 렌더되고,
// MD로 내보낼 때도 자연히 MD 표 형식이 된다). 셀 안 | 는 \| 로 이스케이프,
// 줄바꿈은 공백으로. 유효한 행이 1개뿐이면(헤더만) 표로 만들지 않는다.
function htmlTableToMdLines(tableEl: Element): string[] {
  const trs = Array.from(tableEl.querySelectorAll('tr'))
    .filter((tr) => tr.closest('table') === tableEl); // 중첩 표는 바깥만
  const cellsOf = (tr: Element) =>
    Array.from(tr.children)
      .filter((c) => /^(TD|TH)$/i.test(c.tagName))
      .map((c) =>
        (c.textContent || '').replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|'),
      );
  const out: string[] = [];
  let cols = 0;
  for (const tr of trs) {
    const cells = cellsOf(tr);
    if (!cells.length || cells.every((c) => !c)) continue;
    if (!cols) cols = cells.length;
    out.push('| ' + cells.join(' | ') + ' |');
    if (out.length === 1) out.push('|' + Array(cols).fill('---').join('|') + '|');
  }
  return out.length >= 3 ? out : []; // 헤더 + 구분선 + 본문 1행 이상
}

/**
 * 이 표 → 안 되면 **안쪽 표들**을 차례로 시도해 첫 성공을 돌려준다.
 * (엑셀에서 다시 복사한 표는 바깥 껍데기 표 안에 실제 표가 든 경우가
 * 있어, 바깥만 보면 변환에 실패한다 — 2026-08-06 보고)
 */
function tableToMdDeep(tableEl: Element): string[] {
  const direct = htmlTableToMdLines(tableEl);
  if (direct.length) return direct;
  for (const inner of Array.from(tableEl.querySelectorAll('table'))) {
    const md = htmlTableToMdLines(inner);
    if (md.length) return md;
  }
  return [];
}

export function extractArticleContent(rawHtml: string): ArticleContent {
  const clean = sanitizeRichHtml(rawHtml);
  if (!clean.html) return { text: '', images: [] };

  const doc = new DOMParser().parseFromString(clean.html, 'text/html');
  const lines: string[] = [];
  const images: ArticleImageRef[] = [];
  let cur = '';
  /** 변환 실패한 표 안을 훑는 중 — 그 안의 표를 다시 MD 로 만들지 않는다 */
  let inFailedTable = false;

  const endLine = () => {
    const t = cur.replace(/\s+/g, ' ').trim();
    cur = '';
    if (t) lines.push(t);
  };

  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        cur += child.textContent ?? '';
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const el = child as Element;
      const tag = el.tagName.toUpperCase();
      if (tag === 'BR') {
        endLine();
        continue;
      }
      if (tag === 'IMG') {
        const src = el.getAttribute('src');
        if (src) {
          endLine(); // 진행 중이던 줄을 닫고 그 뒤 자리에 사진을 기록
          images.push({ src, afterLine: lines.length });
        }
        continue;
      }
      if (tag === 'TABLE' && !inFailedTable) {
        // 표는 파이프 MD로 변환해 통째로 삽입 (셀별 순회 대신).
        //
        // **표 안으로 들어가 텍스트를 또 뱉지 않는다** (2026-08-06 보고:
        // "엑셀 표를 붙여 넣으면 텍스트도 보이고 표도 보인다").
        // 예전에는 바깥 표의 변환이 실패하면(중첩 표·병합 셀 등) 아래
        // walk 로 흘러가 **셀 텍스트가 줄로 쌓이고, 그 안의 중첩 표가
        // 다시 MD 로 변환**돼 같은 내용이 두 벌 들어갔다.
        //
        // 그래서 ① 이 표 ② 안 되면 안쪽 표들 순서대로 시도하고,
        // 하나라도 되면 **그것만** 넣는다. 전부 실패할 때만 텍스트로
        // 떨어뜨리되, 그때는 안쪽 표를 다시 MD 로 만들지 않는다.
        const md = tableToMdDeep(el);
        if (md.length) {
          endLine();
          lines.push(...md);
          continue;
        }
        // 정말 표로 못 만든다 — 텍스트로만 (중첩 표 재변환 금지)
        endLine();
        const prev = inFailedTable;
        inFailedTable = true;
        walk(el);
        inFailedTable = prev;
        endLine();
        continue;
      }
      if (BLOCK_TAGS.has(tag)) {
        endLine();
        walk(el);
        endLine();
      } else {
        walk(el); // 인라인 요소 — 줄을 끊지 않는다
      }
    }
  };

  walk(doc.body);
  endLine();

  return { text: lines.join('\n'), images };
}

// 사진을 ① 서버 저장소로 가져오고(importRemoteImage — 로그인 상태면
// 서버가 대신 받아 저장하고 **주소만** 남긴다. 막히면 지금까지처럼 data
// URL 내장 — 기사 삭제·오프라인에도 사진 보존), 둘 다 막혔을 때만
// ② 원본 URL을 유지한 채 실제 픽셀 크기를 재서 done에 전달한다. 실측도
// 실패하면 기본 크기(400×300) — 위치는 항상 지킨다. 모든 처리가 끝나면
// 한 번 호출된다.
//
// 여기서 나온 값은 **노드 사진**(`images[]`)이 된다 — 내보내기가 서버
// 사진을 되돌려 담고(export/serverImages.ts) 화면이 토큰을 붙이는
// (utils/imageSrc.ts) 자리라, 서버 주소를 남겨도 안전하다.
export function probeArticleImages(
  images: ArticleImageRef[],
  done: (resolved: { src: string; w: number; h: number; afterLine: number }[]) => void,
): { src: string; w: number; h: number; afterLine: number }[] {
  const initial = images.map((im) => ({ ...im, w: 400, h: 300 }));
  if (images.length === 0) return initial;
  const resolved = initial.map((im) => ({ ...im }));
  let pending = images.length;
  const finish = () => {
    pending -= 1;
    if (pending === 0) done(resolved);
  };
  images.forEach((im, i) => {
    (async () => {
      const got = await importRemoteImage(im.src);
      if (got) {
        resolved[i] = { ...resolved[i], src: got.src, w: got.w, h: got.h };
        return;
      }
      await new Promise<void>((res) => {
        const probe = new Image();
        probe.onload = () => {
          resolved[i].w = probe.naturalWidth || 400;
          resolved[i].h = probe.naturalHeight || 300;
          res();
        };
        probe.onerror = () => res();
        probe.src = im.src;
      });
    })().catch(() => undefined).finally(finish);
  });
  return initial;
}
