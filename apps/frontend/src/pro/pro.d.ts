// `@pro` 별칭의 타입 — 유료 UI 가 없을 때는 코어의 스텁이 이 모양을 지킨다.
// tsconfig 의 paths 로 해결되지만, 유료 UI 로 바꿔 끼워도 화면 쪽 코드가
// 그대로 돌아야 하므로 **기대하는 모양을 여기 적어 둔다.**
declare module '@pro' {
  import type { ThemeTokens } from '@/components/design-tokens/theme';
  export function ProFeaturePanel(p: { t: ThemeTokens; featureId: string }): JSX.Element;
}
