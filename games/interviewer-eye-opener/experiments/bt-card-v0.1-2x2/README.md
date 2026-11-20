# BT-CARD-v0.1 2 x 2 对照

这套材料只负责冻结实验坐标，不负责证明画像有效。

## 四个条件

| 条件 | 呈现方式 | 历史上下文 |
| --- | --- | --- |
| A | `FOUR_WAY` | `COLD` |
| B | `CARD_KEEP_THEN_CHOOSE` | `COLD` |
| C | `FOUR_WAY` | `FIXED_CONTEXT` |
| D | `CARD_KEEP_THEN_CHOOSE` | `FIXED_CONTEXT` |

每个模型在四个条件中使用四个独立会话。一个会话只能属于一个条件。四组共同可比较的结果只有 `finalChoice`；`cardJudgments` 只存在于 B、D 组。

## 停止线

正式 52 会话开始前，必须同时满足：

1. 游戏中的逐张协议状态机、持久化、恢复、24 种排列和浏览器刷新反例通过；
2. `generate-manifest.mjs` 生成固定输入及 52 个会话坐标；
3. `validate-record.mjs` 能拒绝跨条件字段、重复卡片、缺失最终选择和事后回填；
4. 至少一组逐张试跑完成，且原始消息、逐张判断和最终选择能够分别读回；
5. 试跑记录不能混入正式结果。

正式实验一旦开始，题卡、背景包、提示模板、参数、顺序分配和输出结构不得原地修改。发现问题时封存该轮，另起协议版本。

## 生成冻结材料

在仓库根目录运行：

```powershell
$nodeRoot = 'D:\IDEA\Node26.13.1\node-v26.13.1-win-x64'
$env:Path = "$nodeRoot;$env:Path"

node --experimental-strip-types `
  games/interviewer-eye-opener/experiments/bt-card-v0.1-2x2/generate-manifest.mjs `
  C:\Users\lenovo\Downloads\BT-CARD-v0.1_2x2
```

生成物包括题卡快照、固定背景包、提示模板、输出结构和 52 个预分配会话。API 密钥不属于实验输入，不能写入任何生成物或日志。

## 记录边界

- `presentationOrder`：会话开始前分配，不能从回答倒推；
- `cardJudgments`：每张卡当时的 `KEEP/SKIP`，不能由最终选择回填；
- `finalChoice`：四张判断完成后的独立决定；
- `assumptions`：第一轮原样保存，后续审查不能改写；
- `retainedOptionIds`：如需导出，只能由不可变的 `cardJudgments` 派生，不是第四份事实源。

AI 试跑或正式结果都不代表真人样本，也不能据此冻结百分制或流派映射。
