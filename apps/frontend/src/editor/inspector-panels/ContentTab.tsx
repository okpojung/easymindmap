// ContentTab — node icon/symbol, hyperlinks, and attachments (document + media),
// wired to the selected node via documentStore. Background image (IMG-01~05) is
// a V1 feature and stays as a visual placeholder.

import { Fragment, useState, type DragEvent, type ReactNode } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { AttachmentKind } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { useDocumentStore, findNodeInMap } from '@/stores/documentStore';
import { authEnabled, useAuthStore } from '@/stores/authStore';
import { attachFileWithProgress } from '@/utils/attachmentFile';
import { attachmentKindFor, isImageFileName } from '@/utils/attachmentKind';
import {
  CLIPBOARD_NO_IMAGE, CLIPBOARD_UNSUPPORTED, clipboardImageFiles, clipboardReadErrorMessage,
} from '@/utils/clipboardRead';
import { cloudApi, serverAttachmentId } from '@/services/cloud/apiClient';
import { InspectorSection } from './InspectorSection';
import { useTr } from '@/i18n';
import { rich } from '@/i18n/rich';


// 손가락 기기의 입력칸 16px·누를 자리 40px (data-mm-touch) — 불러오기만 하면 CSS 가 들어간다
import '@/components/ui/mobileCss';
export function ContentTab({ t, selectedId }: { t: ThemeTokens; selectedId: string | null }) {
  const tr = useTr();
  const map = useDocumentStore((s) => s.map);
  const addNodeLink = useDocumentStore((s) => s.addNodeLink);
  const removeNodeLink = useDocumentStore((s) => s.removeNodeLink);
  const addNodeAttachment = useDocumentStore((s) => s.addNodeAttachment);
  const removeNodeAttachment = useDocumentStore((s) => s.removeNodeAttachment);

  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  // 첨부 실패(서버 업로드 쿼터 초과 등) 안내 — 첨부 섹션 아래 빨간 줄
  /** 첨부 오류 — **어느 섹션에서 났는지**까지 담는다 (2026-08-06) */
  const [attErr, setAttErr] = useState<{ where: 'doc' | 'media'; msg: string } | null>(null);
  // Guest 체험 — 첨부 기능 없음 (2026-08-04)
  const guest = useAuthStore((s) => s.guest);
  const isGuest = authEnabled && guest;

  const node = findNodeInMap(map, selectedId);
  const disabled = !selectedId || !node;

  const links = node?.links ?? [];
  const attachments = node?.attachments ?? [];
  // 그림은 kind 가 'file' 이지만 **멀티미디어 목록**에 둔다 — 이름으로 알아본다
  // (utils/attachmentKind.ts, 2026-10-01). 드롭·Ctrl+V·「미디어 선택」·
  // 「첨부파일로 이미지 붙여넣기」 어느 길로 붙였든 같은 자리에 보인다.
  const docs = attachments.filter((a) => a.kind === 'file' && !isImageFileName(a.name));
  const media = attachments.filter((a) =>
    a.kind === 'audio' || a.kind === 'video' || isImageFileName(a.name));

  // 파일 첨부 — ≤2MB 내장 / 초과는 서버 업로드(attachmentUrlForFile).
  // 업로드 실패(쿼터 초과 등)는 그 파일만 건너뛰고 메시지를 보여준다.
  // **오류를 그 오류가 난 섹션에 보여 준다** (2026-08-06 보고).
  // 예전에는 안내가 '첨부 (문서)' 섹션에만 있어서, **미디어를 고르다 난
  // 오류가 문서 밑에** 떴다 ("멀티미디어 선택했는데 문서선택 밑에
  // 메시지가 표시된다").
  const addFiles = async (
    files: File[], kindOf: (f: File) => AttachmentKind, where: 'doc' | 'media',
  ) => {
    if (!selectedId) return;
    setAttErr(null);
    // 같은 문서인지 — 업로드 중에 다른 맵을 열면 붙이지 않는다 (2026-10-01)
    const epoch = useDocumentStore.getState().docEpoch;
    for (const f of files) {
      try {
        // 8MB 초과는 **청크 업로드**로 간다 — 진행률은 화면 아래 줄에
        // 뜨고, 사용자가 고를 것은 없다 (§12.7 — 경로를 나누지 않는다).
        // **크기를 함께 적어 둔다** (2026-08-07) — 서버 저장소 첨부는
        // URL 만으로 크기를 알 수 없어 하단 상태바가 셀 수 없었다.
        const url = await attachFileWithProgress(f);
        if (useDocumentStore.getState().docEpoch !== epoch) {
          setAttErr({ where, msg: tr('inspector.content.switchedMap', { name: f.name }) });
          return;
        }
        addNodeAttachment(selectedId, { name: f.name, kind: kindOf(f), size: f.size, url });
      } catch (err) {
        // 사용자가 [취소]를 누른 것은 오류가 아니다 — 빨간 줄을 띄우지 않는다.
        if ((err as Error)?.name === 'UploadAborted') continue;
        setAttErr({
          where,
          msg: err instanceof Error ? err.message : tr('inspector.content.attachFailed'),
        });
      }
    }
  };

  // 첨부 삭제 — 서버 첨부 저장소(B9)에 올라간 파일이면 서버에서도 지운다
  // (실패해도 노드에서는 빠진다 — 서버 쪽은 쿼터 정리용 best-effort)
  const removeAttachment = (a: { id: string; url?: string }) => {
    if (!selectedId) return;
    removeNodeAttachment(selectedId, a.id);
    const serverId = serverAttachmentId(a.url);
    if (serverId) void cloudApi.deleteAttachment(serverId).catch(() => undefined);
  };

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
    <div data-mm-touch="" style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
      <InspectorSection t={t} title={tr('inspector.content.links')}>
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
            placeholder={tr('inspector.content.linkLabel')} style={inputStyle(t)} />
          <div style={{ display: 'flex', gap: 4 }}>
            <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitLink(); }}
              placeholder="https://..." style={{ ...inputStyle(t), flex: 1 }} />
            <button onClick={commitLink} style={addBtnStyle(t)}>{tr('inspector.content.add')}</button>
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
            {tr('inspector.content.urlDrop')}
          </div>
        </div>
      </InspectorSection>

      {isGuest ? (
        // Guest 체험 (2026-08-04) — 첨부 기능 없음 (가입 유도 안내만)
        <InspectorSection t={t} title={tr('inspector.content.attach')}>
          <div data-testid="guest-attach-note" style={{
            fontSize: 11, color: t.textMuted, lineHeight: 1.6,
            padding: '8px 10px', borderRadius: 6,
            background: t.surfaceAlt, border: `1px dashed ${t.border}`,
          }}>
            {tr('inspector.content.guest1')}<br />
            {rich(tr('inspector.content.guest2'), { b: <b>{tr('inspector.content.guestSignup')}</b> })}
          </div>
        </InspectorSection>
      ) : (<>
      <InspectorSection t={t} title={tr('inspector.content.attachDocs')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
          {docs.map((a) => (
            <AttachmentRow key={a.id} t={t} icon="📄" name={a.name}
              onRemove={() => selectedId && removeAttachment(a)} />
          ))}
        </div>
        <FilePickerButton t={t} label={tr('inspector.content.pickDocs')} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md"
          disabled={!selectedId}
          onFiles={(files) => addFiles(files, () => 'file', 'doc')} />
        <div style={{ fontSize: 10, color: t.textSubtle, marginTop: 5, lineHeight: 1.45 }}>
          {rich(tr('inspector.content.docsHelp'), { b: <b>{tr('inspector.content.docsHelpWhere')}</b> })}
        </div>
        {attErr?.where === 'doc' && (
          <div data-testid="attach-error"
            style={{ fontSize: 10.5, color: t.danger, marginTop: 5, lineHeight: 1.45 }}>
            ⚠ {attErr.msg}
          </div>
        )}
      </InspectorSection>

      <InspectorSection t={t} title={tr('inspector.content.attachMedia')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
          {media.map((a) => (
            <AttachmentRow key={a.id} t={t}
              icon={a.kind === 'audio' ? '🎤' : a.kind === 'video' ? '🎬' : '🖼'} name={a.name}
              onRemove={() => selectedId && removeAttachment(a)} />
          ))}
        </div>
        <FilePickerButton t={t} label={tr('inspector.content.pickMedia')} accept="audio/*,video/*,image/*"
          disabled={!selectedId}
          onFiles={(files) => addFiles(files, attachmentKindFor, 'media')} />
        <ClipboardImageButton t={t} disabled={!selectedId}
          onFiles={(files) => addFiles(files, attachmentKindFor, 'media')}
          onError={(msg) => setAttErr({ where: 'media', msg })} />
        <div style={{ fontSize: 10, color: t.textSubtle, marginTop: 5, lineHeight: 1.45 }}>
          {rich(tr('inspector.content.mediaHelp'), { key: <b>Ctrl+V</b> })}
          <br />
          <b>{tr('inspector.content.bigFiles')}</b>{tr('inspector.content.bigFilesRest')}
        </div>
        {attErr?.where === 'media' && (
          <div data-testid="attach-error-media"
            style={{ fontSize: 10.5, color: t.danger, marginTop: 5, lineHeight: 1.45 }}>
            ⚠ {attErr.msg}
          </div>
        )}
      </InspectorSection>
      </>)}

      <InspectorSection t={t} title={tr('inspector.content.bgImage')}>
        <div style={{ fontSize: 10.5, color: t.textSubtle, lineHeight: 1.5 }}>
          {tr('inspector.content.bgImageNote')}
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
  onFiles: (files: File[]) => void | Promise<void>;
}) {
  const tr = useTr();
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
      <I.Plus size={12} /> {tr('inspector.content.pickOrDrop', { label })}
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

/**
 * 「첨부파일로 이미지 붙여넣기」 (2026-10-01 사용자 제안) — 비동기 클립보드 API 로
 * 그림을 읽어 「미디어 선택」과 같은 길로 첨부한다. Ctrl+V 는 캔버스에
 * 포커스가 있을 때만 잡히므로, 이 탭을 보고 있을 때의 입구다.
 */
function ClipboardImageButton({ t, disabled, onFiles, onError }: {
  t: ThemeTokens;
  disabled?: boolean;
  onFiles: (files: File[]) => void | Promise<void>;
  onError: (msg: string) => void;
}) {
  const tr = useTr();
  const [busy, setBusy] = useState(false);
  const supported = typeof navigator !== 'undefined'
    && typeof navigator.clipboard?.read === 'function';
  const run = async () => {
    if (disabled || busy) return;
    if (!supported) { onError(CLIPBOARD_UNSUPPORTED); return; }
    setBusy(true);
    try {
      const files = await clipboardImageFiles(navigator.clipboard, new Date());
      if (!files.length) { onError(CLIPBOARD_NO_IMAGE); return; }
      await onFiles(files);
    } catch (err) {
      onError(clipboardReadErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      data-testid="attach-clipboard-image"
      disabled={disabled || busy}
      onClick={() => { void run(); }}
      title={supported ? tr('inspector.content.clipboardTitle')
        : CLIPBOARD_UNSUPPORTED}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        width: '100%', padding: '8px 10px', marginTop: 6,
        background: t.surfaceAlt, border: `1px dashed ${t.border}`,
        borderRadius: 5, color: supported ? t.textMuted : t.textSubtle,
        cursor: disabled || busy ? 'default' : 'pointer',
        fontSize: 11.5, fontWeight: 500, justifyContent: 'center',
        boxSizing: 'border-box', fontFamily: 'inherit',
      }}>
      📋 {busy ? tr('inspector.content.pasting') : tr('inspector.content.pasteImage')}
    </button>
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
  const tr = useTr();
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
      <button onClick={onRemove} title={tr('inspector.content.removeAttachment')} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: t.textMuted, padding: 2, display: 'flex',
      }}>
        <I.X size={11} />
      </button>
    </div>
  );
}
