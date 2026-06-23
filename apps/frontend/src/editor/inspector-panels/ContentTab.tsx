// ContentTab — node icon/symbol, hyperlinks, and attachments (document + media),
// wired to the selected node via documentStore. Background image (IMG-01~05) is
// a V1 feature and stays as a visual placeholder.

import { useState, type DragEvent } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { AttachmentKind } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { useDocumentStore, findNodeInMap } from '@/stores/documentStore';
import { InspectorSection } from './InspectorSection';

export function ContentTab({ t, selectedId }: { t: ThemeTokens; selectedId: string | null }) {
  const map = useDocumentStore((s) => s.map);
  const addNodeLink = useDocumentStore((s) => s.addNodeLink);
  const removeNodeLink = useDocumentStore((s) => s.removeNodeLink);
  const addNodeAttachment = useDocumentStore((s) => s.addNodeAttachment);
  const removeNodeAttachment = useDocumentStore((s) => s.removeNodeAttachment);

  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');

  const node = findNodeInMap(map, selectedId);
  const disabled = !selectedId || !node;

  const links = node?.links ?? [];
  const attachments = node?.attachments ?? [];
  const docs = attachments.filter((a) => a.kind === 'file');
  const media = attachments.filter((a) => a.kind === 'audio' || a.kind === 'video');

  const commitLink = () => {
    const url = linkUrl.trim();
    if (url && selectedId) addNodeLink(selectedId, url, linkLabel.trim() || undefined);
    setLinkUrl('');
    setLinkLabel('');
  };

  const handleUrlDrop = (e: DragEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    const raw = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    const url = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find((s) => /^https?:\/\//i.test(s));
    if (url) addNodeLink(selectedId, url);
  };

  return (
    <div style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
      <InspectorSection t={t} title="하이퍼링크">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
          {links.map((link) => (
            <div key={link.id} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 8px', background: t.surfaceAlt,
              border: `1px solid ${t.border}`, borderRadius: 6,
              fontSize: 11.5, color: t.accent,
              overflow: 'hidden',
            }}>
              <I.Link size={12} />
              <a href={link.url} target="_blank" rel="noreferrer" style={{
                color: t.accent, textDecoration: 'none', flex: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{link.label || link.url}</a>
              <button onClick={() => selectedId && removeNodeLink(selectedId, link.id)} style={{
                background: 'none', border: 'none', color: t.textMuted,
                cursor: 'pointer', padding: 0, display: 'flex',
              }}>
                <I.X size={11} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)}
            placeholder="표시 이름 (선택)" style={inputStyle(t)} />
          <div style={{ display: 'flex', gap: 4 }}>
            <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitLink(); }}
              placeholder="https://..." style={{ ...inputStyle(t), flex: 1 }} />
            <button onClick={commitLink} style={addBtnStyle(t)}>추가</button>
          </div>
          {/* Drag the address-bar lock/URL from a browser and drop here. */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleUrlDrop}
            style={{
              padding: '8px 10px', borderRadius: 6, textAlign: 'center',
              border: `1px dashed ${t.border}`, background: t.surfaceAlt,
              fontSize: 10.5, color: t.textSubtle,
            }}
          >
            브라우저 주소창의 자물쇠/URL을 여기로 Drag &amp; Drop
          </div>
        </div>
      </InspectorSection>

      <InspectorSection t={t} title="첨부 (문서)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
          {docs.map((a) => (
            <AttachmentRow key={a.id} t={t} icon="📄" name={a.name}
              onRemove={() => selectedId && removeNodeAttachment(selectedId, a.id)} />
          ))}
        </div>
        <FilePickerButton t={t} label="문서 선택" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md"
          disabled={!selectedId}
          onFiles={(files) => {
            if (!selectedId) return;
            files.forEach((f) =>
              addNodeAttachment(selectedId, { name: f.name, kind: 'file', url: URL.createObjectURL(f) }),
            );
          }} />
      </InspectorSection>

      <InspectorSection t={t} title="첨부 (멀티미디어)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
          {media.map((a) => (
            <AttachmentRow key={a.id} t={t} icon={a.kind === 'audio' ? '🎤' : '🎬'} name={a.name}
              onRemove={() => selectedId && removeNodeAttachment(selectedId, a.id)} />
          ))}
        </div>
        <FilePickerButton t={t} label="미디어 선택" accept="audio/*,video/*,image/*"
          disabled={!selectedId}
          onFiles={(files) => {
            if (!selectedId) return;
            files.forEach((f) => {
              const kind: AttachmentKind = f.type.startsWith('audio') ? 'audio' : 'video';
              addNodeAttachment(selectedId, { name: f.name, kind, url: URL.createObjectURL(f) });
            });
          }} />
      </InspectorSection>

      <InspectorSection t={t} title="노드 배경 이미지 (IMG-01~05 · V1)">
        <div style={{ fontSize: 10.5, color: t.textSubtle, lineHeight: 1.5 }}>
          노드 배경 이미지는 V1 범위입니다. (MVP 제외)
        </div>
      </InspectorSection>
    </div>
  );
}

function FilePickerButton({ t, label, accept, disabled, onFiles }: {
  t: ThemeTokens;
  label: string;
  accept: string;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  return (
    <label
      onDragOver={(e) => { if (!disabled) e.preventDefault(); }}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files ?? []);
        if (files.length) onFiles(files);
      }}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        width: '100%', padding: '8px 10px',
        background: t.surfaceAlt, border: `1px dashed ${t.border}`,
        borderRadius: 5, color: t.textMuted,
        cursor: disabled ? 'default' : 'pointer',
        fontSize: 11.5, fontWeight: 500, justifyContent: 'center',
        boxSizing: 'border-box',
      }}>
      <I.Plus size={12} /> {label} · 또는 Drag &amp; Drop
      <input
        type="file"
        accept={accept}
        multiple
        disabled={disabled}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = '';
        }}
        style={{ display: 'none' }}
      />
    </label>
  );
}

function inputStyle(t: ThemeTokens) {
  return {
    fontSize: 11, padding: '5px 7px', borderRadius: 4,
    border: `1px solid ${t.border}`, background: t.surface, color: t.text,
    outline: 'none', fontFamily: 'inherit' as const,
  };
}

function addBtnStyle(t: ThemeTokens) {
  return {
    fontSize: 11, padding: '5px 10px', borderRadius: 4,
    border: `1px solid ${t.primaryBorder}40`, background: t.primarySoft,
    color: t.primary, cursor: 'pointer' as const, fontWeight: 600, flexShrink: 0,
  };
}

function AttachmentRow({ t, icon, name, onRemove }: {
  t: ThemeTokens; icon: string; name: string; onRemove: () => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 8px',
      background: t.surface, border: `1px solid ${t.border}`, borderRadius: 5,
    }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <div style={{
        flex: 1, minWidth: 0, fontSize: 11.5, color: t.text, fontWeight: 500,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{name}</div>
      <button onClick={onRemove} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: t.textMuted, padding: 2, display: 'flex',
      }}>
        <I.X size={11} />
      </button>
    </div>
  );
}
