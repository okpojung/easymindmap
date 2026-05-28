import type { Collaborator } from './types';

export const SAMPLE_COLLABS: Collaborator[] = [
  { id: 'u1', name: '김지연',    initial: '지', colorKey: 'user1', role: 'owner',  active: true,  editing: null },
  { id: 'u2', name: '박민호',    initial: '민', colorKey: 'user2', role: 'editor', active: true,  editing: 'b2-1' },
  { id: 'u3', name: 'Jane Park', initial: 'J',  colorKey: 'user3', role: 'editor', active: true,  editing: null },
  { id: 'u4', name: '최은서',    initial: '은', colorKey: 'user4', role: 'viewer', active: false, editing: null },
];
