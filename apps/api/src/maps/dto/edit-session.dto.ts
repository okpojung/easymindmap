import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

/** 편집 잠금 하트비트/해제 — 탭 고유 세션 키 (2026-08-04) */
export class EditSessionDto {
  @IsString()
  @MaxLength(64)
  sessionKey!: string;

  /**
   * **지금 앱이 보고 있는 자리** (2026-09-05, MCP `append_to_map` 의
   * `parent:"selected"`). 하트비트마다 실어 보내고 선택이 바뀌면 곧바로 한 번
   * 더 보낸다. 서버는 사용자별로 메모리에 들고 있다(표 없음, FocusService).
   * `focusNodeId` 가 없으면 "선택 없음", `'root'` 면 중심 주제.
   */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  focusNodeId?: string;

  /** 선택 노드까지의 이름 경로(가지 → … → 노드) — 대화에서 부르는 말 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  focusPath?: string[];
}
