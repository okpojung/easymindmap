// Eleven mobile action buttons, the undo count and the row gaps must fit at 320px.
export function mobileToolbarSize(width: number): number {
  return Math.max(24, Math.min(34, Math.floor((width - 44) / 11)));
}

const saveDots = {
  saved: '#2563EB',
  saving: '#D97706',
  retrying: '#D97706',
  dirty: '#DC2626',
  unsaved: '#DC2626',
  error: '#DC2626',
  // Collaboration is live, not proof that a snapshot is saved.
  collab: '#7C3AED',
} as const;

export function mobileSaveDot(state: keyof typeof saveDots, nonSaving = false): string {
  return nonSaving ? '#64748B' : saveDots[state];
}
