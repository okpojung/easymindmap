// 로컬 첨부 사전을 코어 사전에 얹는다 — i18n index 를 건드리지 않는 register 패턴.
import { registerDict } from '@/i18n';
import dict from '@/i18n/dict/localAttachments';

registerDict(dict);
