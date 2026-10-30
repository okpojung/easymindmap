import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { mailRegistry, renderTemplate, validateTemplate } from './mail-templates';
@Injectable()
export class MailTemplatesService {
  constructor(private readonly db: DatabaseService) {
    mailRegistry().render = (id, variables) => this.render(id, variables);
  }

  private definition(id: string) {
    const definition = mailRegistry().definitions.get(id);
    if (!definition) throw new NotFoundException('메일 유형을 찾을 수 없습니다.');
    return definition;
  }

  private async ready(): Promise<boolean> {
    const { rows } = await this.db.query<{ ready: boolean }>(
      "SELECT to_regclass('public.mail_template_overrides') IS NOT NULL AS ready",
    );
    return !!rows[0]?.ready;
  }

  async list() {
    if (!await this.ready()) {
      throw new ServiceUnavailableException(
        '메일 문구 저장 스키마를 적용해야 합니다. 기존 기본문구 발송은 유지됩니다.',
      );
    }
    const { rows } = await this.db.query<{
      id: string; subject: string; body: string; updated_at: string;
    }>('SELECT id, subject, body, updated_at::text AS updated_at FROM public.mail_template_overrides');
    return {
      templates: [...mailRegistry().definitions.values()].map((definition) => {
        const row = rows.find((value) => value.id === definition.id);
        return {
          id: definition.id,
          label: definition.label,
          subject: row?.subject ?? definition.subject,
          text: row?.body ?? definition.text,
          defaultSubject: definition.subject,
          defaultText: definition.text,
          required: definition.required,
          variables: Object.keys(definition.sample),
          footer: definition.footer ?? '',
          updatedAt: row?.updated_at ?? null,
        };
      }),
    };
  }

  private validated(id: string, body: Record<string, unknown>) {
    const definition = this.definition(id);
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some((key) => !['subject', 'text', 'baseUpdatedAt'].includes(key))) {
      throw new BadRequestException('지원하지 않는 항목입니다.');
    }
    try {
      return { definition, value: validateTemplate(definition, body.subject, body.text) };
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  preview(id: string, body: Record<string, unknown>) {
    const { definition, value } = this.validated(id, body);
    return renderTemplate(definition, value, definition.sample);
  }

  async save(id: string, body: Record<string, unknown>, actor: string) {
    const { value } = this.validated(id, body);
    if (!await this.ready()) throw new ServiceUnavailableException('메일 문구 저장 스키마를 적용해야 합니다.');
    if (body.baseUpdatedAt !== null && typeof body.baseUpdatedAt !== 'string') {
      throw new BadRequestException('기준 수정시각이 필요합니다.');
    }

    // DatabaseService.transaction supplies one PoolClient and commits/rolls back for us.
    return this.db.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('mail-template:' || $1))", [id]);
      const { rows } = await client.query<{ updated_at: string }>(
        'SELECT updated_at::text AS updated_at FROM public.mail_template_overrides WHERE id = $1 FOR UPDATE',
        [id],
      );
      // Preserve PostgreSQL microseconds instead of truncating through JavaScript Date.
      if ((rows[0]?.updated_at ?? null) !== body.baseUpdatedAt) {
        throw new ConflictException('다른 관리자가 수정했습니다. 새로고침 후 다시 저장해 주세요.');
      }
      const saved = await client.query<{ updated_at: string }>(
        `INSERT INTO public.mail_template_overrides(id, subject, body, updated_by)
         VALUES($1, $2, $3, $4)
         ON CONFLICT(id) DO UPDATE SET subject = EXCLUDED.subject, body = EXCLUDED.body,
           updated_by = EXCLUDED.updated_by, updated_at = clock_timestamp()
         RETURNING updated_at::text AS updated_at`,
        [id, value.subject, value.text, actor],
      );
      return { updatedAt: saved.rows[0].updated_at };
    });
  }

  async render(id: string, variables: Record<string, string>) {
    const definition = this.definition(id);
    const row = await this.ready()
      ? (await this.db.query<{ subject: string; body: string }>(
        'SELECT subject, body FROM public.mail_template_overrides WHERE id = $1', [id],
      )).rows[0]
      : undefined;
    return renderTemplate(
      definition,
      row ? { subject: row.subject, text: row.body } : definition,
      variables,
    );
  }
}
