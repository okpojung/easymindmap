// nodeBlocks — 노드 본문 속 **블록(표·코드) 전부**를 원문 순서대로 (2026-09-22).
// 예전에는 표 하나·코드 하나만 그렸고, 둘이 함께면 표·코드를 글 뒤로 몰았다
// (사용자 보고: 두 번째 표/코드 블록이 원문 그대로 보였다). 이제 한 번의 줄
// 훑기로 글·표·코드 조각을 순서대로 나누고, sizeNodeForText(크기)·NodeRenderer
// (캔버스)·RichTextHtml(아웃라인/칸반)·HTML 뷰어(exportHtml, 같은 규칙을 JS 로)가
// 이 결과를 공유한다.
//
// 글 조각 다듬기 (예전 parseMdTable/parseMdCode 의 before/after 와 같은 결과):
//   첫 블록 앞 글은 trimEnd, 블록 사이·마지막 글은 trim, 빈 조각은 버린다.
//   블록이 하나도 없으면 원문 그대로 한 조각.

import {
  layoutParsedTable, parseTableAt, MD_TABLE_COPY_STRIP,
  type MdTableAlign, type MdTableLayout,
} from './mdTable';
import { layoutParsedCode, parseCodeAt, type MdCodeLayout } from './mdCode';

const FENCE_RE = /^\s*```/;

export interface TablePart { kind: 'table'; headers: string[]; rows: string[][]; aligns: MdTableAlign[] }
export interface CodePart { kind: 'code'; code: string[]; lang?: string }
export interface TextPart { kind: 'text'; body: string }
export type NodePart = TextPart | TablePart | CodePart;

/** 글·표·코드 조각을 원문 순서대로 */
export function splitNodeParts(text: string): NodePart[] {
  const raw = String(text || '');
  const lines = raw.split('\n');
  const parts: NodePart[] = [];
  let buf: string[] = [];
  const flushText = () => {
    if (buf.length === 0) return;
    const joined = buf.join('\n');
    buf = [];
    const body = parts.length === 0 ? joined.trimEnd() : joined.trim();
    if (body) parts.push({ kind: 'text', body });
  };
  let i = 0;
  while (i < lines.length) {
    if (FENCE_RE.test(lines[i])) {
      const c = parseCodeAt(lines, i);
      if (c) { flushText(); parts.push({ kind: 'code', code: c.code, lang: c.lang }); i = c.end; continue; }
      // 빈 펜스 — 여닫는 줄과 사이를 글로 두고, 닫는 펜스 **뒤**부터 계속
      // (닫는 펜스를 새 여는 펜스로 읽지 않는다 — parseMdCode 와 같은 결과)
      let j = i + 1;
      while (j < lines.length && !FENCE_RE.test(lines[j])) j++;
      const end = Math.min(lines.length, j + 1);
      for (let k = i; k < end; k++) buf.push(lines[k]);
      i = end;
      continue;
    }
    const t = parseTableAt(lines, i);
    if (t) { flushText(); parts.push({ kind: 'table', headers: t.headers, rows: t.rows, aligns: t.aligns }); i = t.end; continue; }
    buf.push(lines[i]);
    i++;
  }
  const hasBlock = parts.some((p) => p.kind !== 'text');
  if (!hasBlock) return [{ kind: 'text', body: raw }];
  flushText();
  return parts;
}

/** 블록을 모두 뺀 일반 글 (조각을 `\n` 으로 이음) — 체크 줄 계산 등에 */
export function plainTextOf(text: string): string {
  return splitNodeParts(text).filter((p): p is TextPart => p.kind === 'text').map((p) => p.body).join('\n');
}

export type NodeBlockLayout =
  ((({ kind: 'table' } & MdTableLayout) | ({ kind: 'code' } & MdCodeLayout)) & {
    /** 이 블록 앞에 오는 일반 글의 수동 줄 수 (누적) */
    beforeLines: number;
    /** 블록 자체 높이 — 표는 복사(⧉) 스트립 포함 */
    blockH: number;
  });

export interface NodeBlocksLayout {
  blocks: NodeBlockLayout[];
  plainText: string;
  hasTable: boolean;
  hasCode: boolean;
}

/** 표·코드 블록 전부의 측정 — 없으면 null. fontSize = 노드 본문 글자 크기 */
export function layoutNodeBlocks(text: string, fontSize: number): NodeBlocksLayout | null {
  const parts = splitNodeParts(text);
  if (!parts.some((p) => p.kind !== 'text')) return null;
  const blocks: NodeBlockLayout[] = [];
  const texts: string[] = [];
  let count = 0;
  for (const p of parts) {
    if (p.kind === 'text') { texts.push(p.body); count += p.body.split('\n').length; continue; }
    if (p.kind === 'table') {
      const lay = layoutParsedTable({ before: '', after: '', headers: p.headers, rows: p.rows, aligns: p.aligns }, fontSize);
      blocks.push({ kind: 'table', ...lay, beforeLines: count, blockH: MD_TABLE_COPY_STRIP + lay.h });
    } else {
      const lay = layoutParsedCode({ before: '', after: '', code: p.code, lang: p.lang }, fontSize);
      blocks.push({ kind: 'code', ...lay, beforeLines: count, blockH: lay.h });
    }
  }
  return {
    blocks,
    plainText: texts.join('\n'),
    hasTable: blocks.some((b) => b.kind === 'table'),
    hasCode: blocks.some((b) => b.kind === 'code'),
  };
}

/**
 * 블록의 위·아래 여백 (측정과 렌더가 같은 규칙):
 *  · 위 6 — 앞에 글이 있거나(at > 0) 앞에 다른 블록이 있을 때
 *  · 아래 6 — 이 블록 뒤에 **글**이 바로 올 때 (같은 자리에 다음 블록이 오면
 *    그 블록의 위 여백이 대신한다)
 */
export function blockGaps(
  blocks: { at: number }[], i: number, lineCount: number,
): { above: number; below: number; total: number } {
  const at = blocks[i].at;
  const above = at > 0 || i > 0 ? 6 : 0;
  const next = blocks[i + 1];
  const textFollows = lineCount > at && (!next || next.at > at);
  const below = textFollows ? 6 : 0;
  return { above, below, total: above + below };
}
