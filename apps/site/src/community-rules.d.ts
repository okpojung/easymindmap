export type BoardId = 'review' | 'free' | 'bug' | 'notice';
export type InquiryCategory = 'usage' | 'bug' | 'billing' | 'partnership' | 'other';
export interface InquiryForm { name: string; email: string; category: InquiryCategory | ''; body: string; privacyConsent: boolean; website: string }
export const APP_ORIGIN: string;
export const BOARDS: ReadonlyArray<{ id: BoardId; label: string; writable: boolean }>;
export const INQUIRY_CATEGORIES: ReadonlyArray<{ id: InquiryCategory; label: string }>;
export const INQUIRY_LIMITS: { nameMax: number; bodyMin: number; bodyMax: number; linksMax: number };
export function normalizeBoard(value: string | null | undefined): BoardId;
export function boardLabel(id: string): string;
export function appBoardUrl(board: BoardId, opts?: { write?: boolean; post?: string }): string;
export function boardPath(board: BoardId, opts?: { post?: string; q?: string }): string;
export function countLinks(text: string): number;
export function validateInquiry(form: InquiryForm): { field: keyof InquiryForm; message: string } | null;
export function inquiryPayload(form: InquiryForm, formOpenedAt: number): {
  name: string; email: string; category: InquiryCategory; body: string; privacyConsent: true; website: string; formOpenedAt: number;
};
export function formatDate(iso: string): string;
export function safeLinkHref(url: string | undefined | null): string | null;
export function boardAttachmentId(url: string | undefined | null, apiUrl: string): string | null;
