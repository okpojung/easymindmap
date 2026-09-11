// `ProModule` DI 시험 (2026-09-11) — **유료 모듈이 꽂혔을 때** 다른 모듈이
// `PRO` 를 주입받을 수 있는가.
//
//   npm run build && node test/pro-module-di.test.mjs
//
// 왜 시험하나: 협업 방 거절(§9.13, e2e249)을 dev 에 올렸는데 **거절이 안
// 됐다.** 코어 `pro.module.ts` 의 유료 분기가 `exports: [PRO_INSTALLED]` 만
// 내보내고 `PRO` 는 안 내보냈다 — 전역 모듈이라도 **export 하지 않은 것은
// 밖에서 못 받는다.** MCP 서비스의 `@Optional() @Inject(PRO)` 가 조용히
// undefined 가 됐고, 방 판정은 늘 "없음" 이었다. 스텁 분기는 `PRO` 를
// 내보내 단위 시험이 그 구멍을 못 봤다. 이 시험은 `require('@easymindmap/pro')`
// 를 가짜로 바꿔 유료 분기를 **실제 Nest 컨테이너**로 돌려 본다.
import Module from 'node:module';
import { Inject, Injectable, Module as NestModule, Optional } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ProModule } from '../dist/pro/pro.module.js';
import { PRO, PRO_INSTALLED } from '../dist/pro/pro.contract.js';

let failed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const ok = g === w; if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

// 소비자 — MCP 서비스와 같은 모양으로 PRO 를 선택 주입받는다 (데코레이터를 손으로 건다)
class Consumer { constructor(pro) { this.pro = pro; } }
Injectable()(Consumer);
Optional()(Consumer, undefined, 0);
Inject(PRO)(Consumer, undefined, 0);
class ConsumerModule {}
NestModule({ providers: [Consumer], exports: [Consumer] })(ConsumerModule);

async function boot() {
  class Root {}
  NestModule({ imports: [ProModule.register(), ConsumerModule] })(Root);
  const app = await NestFactory.createApplicationContext(Root, { logger: false });
  const c = app.get(Consumer);
  const installed = app.get(PRO_INSTALLED);
  await app.close();
  return { pro: c.pro, installed };
}

// ── ① 공개판(스텁): 유료 패키지가 없다 → 스텁이 주입된다 ─────────────────
{
  const { pro, installed } = await boot();
  check('스텁: PRO_INSTALLED=false', installed, false);
  check('스텁: 소비자가 PRO(스텁)를 받는다 — features 있음 · collabRoomLive 없음',
    [typeof pro?.features, typeof pro?.collabRoomLive], ['function', 'undefined']);
}

// ── ② 유료판: require('@easymindmap/pro') 를 가짜로 → PRO 가 밖으로 나가야 한다 ──
{
  const asked = [];
  class FakeProService { features() { return [{ id: 'collab', name: '협업', enabled: true, reason: null }]; } collabRoomLive(id) { asked.push(id); return true; } }
  Injectable()(FakeProService);
  class FakeProModule {}
  NestModule({ providers: [FakeProService, { provide: 'PRO_CONTRACT', useExisting: FakeProService }], exports: ['PRO_CONTRACT'] })(FakeProModule);

  const origLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === '@easymindmap/pro') return { ProModule: FakeProModule };
    return origLoad.call(this, request, ...rest);
  };
  try {
    const { pro, installed } = await boot();
    check('유료: PRO_INSTALLED=true', installed, true);
    check('★ 유료: 소비자가 PRO(유료 구현)를 받는다 — 전역이어도 export 해야 나간다', typeof pro?.collabRoomLive, 'function');
    check('★ 유료: collabRoomLive 가 실제로 유료 쪽으로 간다', [pro?.collabRoomLive?.('m1'), asked], [true, ['m1']]);
  } finally {
    Module._load = origLoad;
  }
}

console.log(failed === 0 ? '\n모두 통과' : `\n실패 ${failed}건`);
process.exit(failed === 0 ? 0 : 1);
