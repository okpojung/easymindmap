// Public mail-template contract. Private extensions register their own definitions.
export interface MailTemplateDefinition {
  id: string;
  label: string;
  subject: string;
  text: string;
  required: string[];
  sample: Record<string, string>;
  footer?: string;
}

export interface RenderedMail {
  subject: string;
  text: string;
}

export interface TemplateRegistry {
  definitions: Map<string, MailTemplateDefinition>;
  render?: (id: string, variables: Record<string, string>) => Promise<RenderedMail>;
}

const REGISTRY_KEY = Symbol.for('easymindmap.mail-templates.v1');

export function mailRegistry(): TemplateRegistry {
  const registry = globalThis as unknown as Record<symbol, TemplateRegistry>;
  return registry[REGISTRY_KEY] ??= { definitions: new Map() };
}

const CODE_TEMPLATES = [
  ['signup', '가입 인증번호'],
  ['adminLogin', '관리자 로그인 인증번호'],
  ['passwordReset', '비밀번호 재설정 인증번호'],
] as const;

for (const [purpose, label] of CODE_TEMPLATES) {
  const id = `auth.${purpose}`;
  mailRegistry().definitions.set(id, {
    id,
    label,
    subject: `[EasyMindMap] ${label} {{code}}`,
    text: `EasyMindMap ${label}입니다.\n\n인증번호: {{code}}\n{{minutes}}분 안에 입력해 주세요.`,
    required: ['code', 'minutes'],
    sample: { code: '123456', minutes: '10' },
    footer: '본인이 요청하지 않았다면 이 메일은 무시하셔도 됩니다.',
  });
}

export function validateTemplate(
  definition: MailTemplateDefinition,
  subject: unknown,
  text: unknown,
): { subject: string; text: string } {
  if (typeof subject !== 'string' || !subject.trim() || subject.length > 200
    || /[\x00-\x1f\x7f\u2028\u2029]/.test(subject)) {
    throw new Error('제목은 줄바꿈 없는 1~200자여야 합니다.');
  }
  if (typeof text !== 'string' || !text.trim() || text.length > 20_000
    || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) {
    throw new Error('본문은 1~20000자 일반 텍스트여야 합니다.');
  }

  const combined = `${subject}\n${text}`;
  const tokens = [...combined.matchAll(/{{([A-Za-z][A-Za-z0-9]*)}}/g)].map((match) => match[1]);
  const unknown = tokens.some((name) => !Object.prototype.hasOwnProperty.call(definition.sample, name));
  const malformed = /{{|}}/.test(combined.replace(/{{([A-Za-z][A-Za-z0-9]*)}}/g, ''));
  if (unknown || malformed) throw new Error('허용되지 않은 치환변수입니다.');

  if (definition.required.some((name) => !text.includes(`{{${name}}}`))) {
    throw new Error(`본문 필수 치환변수를 삭제할 수 없습니다: ${definition.required.join(', ')}`);
  }
  return { subject, text };
}

export function renderTemplate(
  definition: MailTemplateDefinition,
  value: { subject: string; text: string },
  variables: Record<string, string>,
): RenderedMail {
  validateTemplate(definition, value.subject, value.text);
  // A single substitution pass: inserted values cannot introduce further placeholders.
  const replace = (source: string) => source.replace(
    /{{([A-Za-z][A-Za-z0-9]*)}}/g,
    (_, name: string) => String(variables[name] ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ''),
  );
  const subject = replace(value.subject)
    .replace(/[\x00-\x1f\x7f\u2028\u2029]/g, ' ')
    .slice(0, 200)
    .trim();
  // Validate the final header too, after every variable has been interpolated.
  if (!subject || /[\x00-\x1f\x7f\u2028\u2029]/.test(subject)) {
    throw new Error('메일 제목을 생성할 수 없습니다.');
  }
  return {
    subject,
    text: replace(value.text) + (definition.footer ? `\n\n${definition.footer}` : ''),
  };
}
