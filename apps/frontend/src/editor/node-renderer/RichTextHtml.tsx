// RichTextHtml — 노드 본문을 HTML로 그리는 공용 리치 텍스트 (리치 노드 P4).
//
// 맵(SVG 노드)과 같은 파서(mdCode·mdTable·mdCheck·inlineMarks)를 써서
// 아웃라인 행과 칸반 카드/컬럼 헤더가 노드 블록을 같은 규칙으로 보여준다:
//   · 코드 펜스(```)  → 회색 모노 패널 (언어 라벨 헤더)
//   · - [x] 체크 줄   → 체크박스 글리프 (onToggleCheck 있으면 클릭 토글)
//   · 파이프 표       → 작은 격자 표
//   · 인라인 마크     → **굵게** 등 (마커 숨김, 하이라이트/코드 고정색)
//
// flattenNodeText는 한 줄 요약이 필요한 곳(검색 결과 목록 등)에서
// 마커 원문 대신 ☑/☐·⧉코드·⊞표 로 접어 보여주기 위한 도우미다.

import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { parseInlineMarks, CODE_BG, CODE_TEXT } from './inlineMarks';
import { parseMdCode } from './mdCode';
import { parseMdTable } from './mdTable';
import { parseCheckLine, toggleCheckInText } from './mdCheck';
import { CodeBlockDialog, replaceCodeBlock } from './CodeBlockDialog';

const MONO = "ui-monospace, 'Cascadia Mono', 'Consolas', 'D2Coding', monospace";

// 인라인 마크 한 줄 — 아웃라인·칸반 공용 스타일 (다크 고정색 포함)
export function InlineMarkSpans({ text }: { text: string }) {
  return (
    <>
      {parseInlineMarks(String(text)).map((sg, k) => (
        <span
          key={k}
          style={{
            fontWeight: sg.b ? 700 : undefined,
            fontStyle: sg.i ? 'italic' : undefined,
            textDecoration:
              [sg.s ? 'line-through' : '', sg.u ? 'underline' : '']
                .filter(Boolean).join(' ') || undefined,
            background: sg.h ? '#FFE066' : sg.c ? CODE_BG : undefined,
            // 형광펜/코드 배경 위 글자는 진한 고정색 (다크 모드 가독성)
            color: sg.h ? '#1F1B16' : sg.c ? CODE_TEXT : undefined,
            fontFamily: sg.c ? MONO : undefined,
            borderRadius: sg.h || sg.c ? 2 : undefined,
            padding: sg.h ? '0 1px' : undefined,
          }}
        >
          {sg.text}
        </span>
      ))}
    </>
  );
}

// 체크박스 글리프 (HTML) — 맵의 SVG 글리프와 같은 색 규칙
function CheckGlyph({
  checked,
  onClick,
}: {
  checked: boolean;
  onClick?: () => void;
}) {
  return (
    <span
      data-html-check
      data-checked={checked ? '1' : '0'}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}
      onPointerDown={(e) => e.stopPropagation()}
      title={onClick ? (checked ? '클릭하면 미완료([ ])로' : '클릭하면 완료([x])로') : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 13, height: 13, borderRadius: 3, marginRight: 5,
        border: `1.5px solid ${checked ? '#22A06B' : '#8B94A3'}`,
        background: checked ? '#22A06B' : 'transparent',
        color: '#FFF', fontSize: 9, fontWeight: 800, lineHeight: 1,
        cursor: onClick ? 'pointer' : 'default',
        verticalAlign: 'text-bottom', flexShrink: 0,
        boxSizing: 'border-box',
      }}
    >
      {checked ? '✓' : ''}
    </span>
  );
}

// 파이프 표 줄 판정 (mdTable.ts의 isPipeRow와 동일 감 — 2셀 이상)
function isPipeRow(line: string): boolean {
  const s = line.trim();
  return s.length > 1 && s.includes('|');
}
function isSepRow(line: string): boolean {
  if (!isPipeRow(line)) return false;
  const cells = splitCells(line);
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}
function splitCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

// 노드 본문 리치 렌더 — 아웃라인 행·칸반 카드/헤더 공용.
// onToggleCheck(nextText)를 주면 체크 글리프 클릭 = 원문 [ ]↔[x] 토글.
export function NodeRichText({
  text,
  onToggleCheck,
  onUpdateText,
  t,
  style,
}: {
  text: string;
  onToggleCheck?: (nextText: string) => void;
  // 코드 블록 ✎ 수정(팝업 편집기) — onUpdateText + t를 주면 언어 라벨
  // 옆 연필로 맵 코드 패널과 동일하게 언어·코드를 팝업에서 고친다
  onUpdateText?: (nextText: string) => void;
  t?: ThemeTokens;
  style?: CSSProperties;
}) {
  const raw = String(text || '');
  const mdc = parseMdCode(raw);
  const [codeDlgOpen, setCodeDlgOpen] = useState(false);
  const codeEditable = !!(onUpdateText && t);
  // 코드 복사 피드백 — 맵 패널의 '⧉ 복사 → 복사됨 ✓'와 동일 (1.5초)
  const [codeCopied, setCodeCopied] = useState(false);
  const copyCode = () => {
    if (!mdc) return;
    const done = () => {
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 1500);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(mdc.code.join('\n')).then(done, done);
    } else done();
  };
  // 코드 앞/뒤 일반 구간 (원문 순서 보존 — 맵과 동일)
  const plains: { seg: string; key: string }[] = mdc
    ? [
        ...(mdc.before ? [{ seg: mdc.before, key: 'b' }] : []),
      ]
    : [{ seg: raw, key: 'all' }];
  const after = mdc?.after ? { seg: mdc.after, key: 'a' } : null;

  // 체크 줄 순번(seq) — toggleCheckInText와 같은 규칙(펜스 밖 순서)
  let seq = 0;

  const renderPlain = (seg: string, key: string) => {
    const mdt = parseMdTable(seg);
    const parts: { kind: 'text' | 'table'; body: string }[] = mdt
      ? [
          ...(mdt.before ? [{ kind: 'text' as const, body: mdt.before }] : []),
          { kind: 'table' as const, body: '' },
          ...(mdt.after ? [{ kind: 'text' as const, body: mdt.after }] : []),
        ]
      : [{ kind: 'text', body: seg }];
    return parts.map((p, pi) => {
      if (p.kind === 'table' && mdt) {
        return (
          // 스크롤 래퍼 — 넓은 표가 좁은 컨테이너(칸반 카드 260~300px 등)를
          // 밀어 옆 컬럼까지 침범하지 않도록 표만 가로 스크롤한다.
          <div
            key={`${key}-t${pi}`}
            style={{ overflowX: 'auto', maxWidth: '100%', margin: '3px 0' }}
          >
          <table
            data-html-table
            style={{
              borderCollapse: 'collapse', margin: 0,
              fontSize: '0.92em',
            }}
          >
            <tbody>
              {[mdt.headers, ...mdt.rows].map((cells, ri) => (
                <tr key={ri}>
                  {cells.map((cell, ci) => (
                    <td
                      key={ci}
                      style={{
                        border: '1px solid currentColor',
                        padding: '1px 6px',
                        fontWeight: ri === 0 ? 700 : 400,
                        opacity: ri === 0 ? 1 : 0.92,
                      }}
                    >
                      <InlineMarkSpans text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        );
      }
      return p.body.split('\n').map((line, li) => {
        const chk = parseCheckLine(line);
        if (chk) {
          const mySeq = seq;
          seq += 1;
          return (
            <div key={`${key}-${pi}-${li}`} style={{ display: 'flex', alignItems: 'baseline' }}>
              <CheckGlyph
                checked={chk.checked}
                onClick={onToggleCheck
                  ? () => onToggleCheck(toggleCheckInText(raw, mySeq))
                  : undefined}
              />
              <span style={{ minWidth: 0 }}><InlineMarkSpans text={chk.text} /></span>
            </div>
          );
        }
        return (
          <div key={`${key}-${pi}-${li}`}>
            <InlineMarkSpans text={line} />
          </div>
        );
      });
    });
  };

  return (
    // overflowWrap: 긴 URL·경로 같은 끊김 없는 토큰이 좁은 컨테이너(칸반
    // 카드 등)를 밀어내지 않도록 필요할 때만 줄바꿈 (상속되는 속성).
    <div style={{ minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere', ...style }}>
      {plains.map((p) => renderPlain(p.seg, p.key))}
      {mdc && (
        // 코드 패널 — 맵 패널과 같은 색 (컴팩트: 언어 라벨 헤더 + 모노 줄)
        <div
          data-html-code
          style={{
            background: CODE_BG, border: '1px solid #D8DDE4', borderRadius: 5,
            margin: '3px 0', overflow: 'hidden', maxWidth: '100%',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '1px 7px', borderBottom: '1px solid #D8DDE4',
            fontFamily: MONO, fontSize: '0.82em', color: '#64748B',
          }}>
            {codeEditable ? (
              // 언어 라벨(✎) 클릭 = 팝업 편집기 — 맵 코드 패널과 동일
              <span
                data-html-code-edit
                onClick={(e) => { e.stopPropagation(); setCodeDlgOpen(true); }}
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                title="클릭하면 팝업에서 언어·코드를 편집합니다"
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                {(mdc.lang || 'code') + ' ✎'}
              </span>
            ) : (
              <span>{mdc.lang || 'code'}</span>
            )}
            {/* ⧉ 복사 — 맵 코드 패널 헤더와 동일 구성 */}
            <span
              data-html-code-copy
              onClick={(e) => { e.stopPropagation(); copyCode(); }}
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              title="코드 복사"
              style={{
                cursor: 'pointer', userSelect: 'none', marginLeft: 10,
                color: codeCopied ? '#15803D' : '#475569', fontWeight: 600,
                fontFamily: 'inherit',
              }}
            >
              {codeCopied ? '복사됨 ✓' : '⧉ 복사'}
            </span>
          </div>
          <pre style={{
            margin: 0, padding: '3px 7px', overflowX: 'auto',
            fontFamily: MONO, fontSize: '0.92em', lineHeight: 1.45,
            color: CODE_TEXT, whiteSpace: 'pre',
          }}>
            {mdc.code.join('\n')}
          </pre>
        </div>
      )}
      {after && renderPlain(after.seg, after.key)}
      {codeDlgOpen && codeEditable && mdc && (
        // 코드 블록 팝업 편집기 — 확인 시 원문의 첫 펜스 블록을 교체
        <CodeBlockDialog
          t={t!}
          initialLang={mdc.lang}
          initialCode={mdc.code.join('\n')}
          onCancel={() => setCodeDlgOpen(false)}
          onSave={(lang, code) => {
            onUpdateText!(replaceCodeBlock(raw, lang, code));
            setCodeDlgOpen(false);
          }}
        />
      )}
    </div>
  );
}

// 한 줄 요약(검색 결과 목록 등) — 블록 마커 원문 대신 접어 표시:
//   코드 펜스 → "⧉코드" 한 번 · 파이프 표 → "⊞표" 한 번 ·
//   - [x] → ☑/☐ + 항목 텍스트 · 나머지 줄은 공백으로 연결
export function flattenNodeText(text: string): string {
  const lines = String(text || '').split('\n');
  const out: string[] = [];
  let inFence = false;
  let codeChip = false;
  let tableChip = false;
  for (const ln of lines) {
    if (/^\s*```/.test(ln)) {
      if (!inFence && !codeChip) { out.push('⧉코드'); codeChip = true; }
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (isPipeRow(ln) && splitCells(ln).length >= 2) {
      if (!isSepRow(ln) && !tableChip) { out.push('⊞표'); tableChip = true; }
      continue;
    }
    const chk = parseCheckLine(ln);
    if (chk) { out.push(`${chk.checked ? '☑' : '☐'} ${chk.text}`); continue; }
    if (ln.trim()) out.push(ln.trim());
  }
  return out.join(' ');
}
