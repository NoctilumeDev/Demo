# 浏览器游戏

这里是《面试官眼前一亮》的可玩 V1.1。

它先用 `BT-v0.3.2` 七组候选题记录玩家愿意考虑什么，再把玩家放进一个连续演进的确定性仿真世界。组件、控制、未解决故障和可靠性债会跨事故保留，同一个按钮不再天然对应固定结论。

入场协议是 `BT-CARD-v0.1-rc1`：四个方案按已记录的随机顺序逐张展示，分别保存“留下/跳过”、是否看过解释和最后真正选择。当前画像只使用最终选择产生候选观察；保留集合先作为原始记录，不提前冻结新的评分含义。

仿真负责让玩家反复做决定；仓库上一级的 Java 工程负责真实 MySQL S0—S6 验收。两边共享业务问题，不互相冒充运行证据。

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

`npm test` 检查逐张协议、连续世界、画像资格、独立裁判、成就和存档。Playwright 会让五种流派分别走到结算，检查随机卡片、解释阅读、最终改选、培训派路线，验证学院派不能用课程范围覆盖业务失败，并检查移动端布局。

E2E 的截图会落在 `test-results/evidence/`。它们是浏览器流程证据，不是 MySQL、Redis 或 MQ 的实机证据。

## 目录

```text
src/game/assessment.ts    七题、逐张顺序与原始选择
src/game/profile.ts       入场画像、行为画像与变化依据
src/game/content.ts       事故、决策与五种流派
src/game/engine.ts        连续世界怎样随历史前进
src/game/judge.ts         只看运行事实的独立裁判
src/game/score.ts         与业务裁决分开的流派评分
src/game/achievements.ts  有触发证据的成就
src/game/storage.ts       本地草稿、生涯与 V1 存档迁移
e2e/game.spec.ts          完整玩家流程
```
