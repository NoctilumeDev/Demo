# 浏览器游戏

这里是《面试官眼前一亮》的可玩 V1。

它用确定性仿真把请求、故障、成本和评分摊在同一张桌上。仿真负责让玩家反复做决定；仓库上一级的 Java 工程负责真实 MySQL S0—S6 验收。两边共享业务问题，不互相冒充运行证据。

## 启动

需要 Node.js 26.13.1。

```powershell
npm ci
npm run dev
```

## 验收

```powershell
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm test` 检查游戏规则、独立裁判、成就和存档。Playwright 会让五种流派分别走到结算，完整检查培训派路线，验证学院派不能用课程范围覆盖业务失败，并检查移动端布局。

E2E 的截图会落在 `test-results/evidence/`。它们是浏览器流程证据，不是 MySQL、Redis 或 MQ 的实机证据。

## 目录

```text
src/game/content.ts       事故、决策与五种流派
src/game/engine.ts        一局怎样前进
src/game/judge.ts         只看事实的独立裁判
src/game/score.ts         与业务裁决分开的流派评分
src/game/achievements.ts  有触发证据的成就
src/game/storage.ts       本地生涯记录
e2e/game.spec.ts          完整玩家流程
```
