# openpet-market

openpet 的**角色市场索引仓**。这里没有服务器、没有账号、没有后台——市场就是这个仓库里的一份
`index.json`，openpet 客户端直接拉它。上架 = 提一个 PR；下架 = 从 `index.json` 删掉那一条。

- 客户端入口：openpet → 设置 → **角色库 → 市场** tab
- 默认源两条（客户端预置，可自行增删）：
  - jsDelivr：`https://cdn.jsdelivr.net/gh/Furina-he/openpet-market@main/index.json`
  - GitHub raw：`https://raw.githubusercontent.com/Furina-he/openpet-market/main/index.json`

> jsDelivr 有 CDN 缓存（分钟级），刚合并的条目可能要等一会儿才在 CDN 源可见；GitHub raw 是即时的。
> **jsDelivr 单文件上限 20MB**：超限的包（`build.mjs` 自动判断）`downloadUrl` 改走 GitHub raw——国内直连 raw 可能不通，所以**模型请尽量压到 20MB 以内**（VRM 贴图降到 1024 通常就够）。

## 目录结构

```
index.json          商品索引（唯一的「市场数据库」）
index.example.json  字段示例（soul/full/ref 各一条）——**不是线上数据，客户端不读它**
souls/<id>/         灵魂包的**人类可编辑源**：soul.json（+ 可选 preview.png）
packs/              商品文件：<id>.dssoul（由 souls/ 构建）/ <id>.dspack / <id>.dsbody（openpet 内导出后直接放入）
previews/           预览图：<id>.png|jpg|webp（建议 ≤ 500KB，方图）
scripts/build.mjs   零依赖构建：souls/ → packs/*.dssoul，回填 index.json 的 sha256/size/downloadUrl；`--check` 只校验
```

灵魂包**不要手工打 zip**：改 `souls/<id>/soul.json` → `node scripts/build.mjs` → 提交 `souls/` `packs/` `index.json` 三处即可，
sha256 与体积由脚本回填，不会写错。

## 商品四型

一个角色 = **灵魂**（怎么说话）+ **肉体**（怎么动）+ **声音**（怎么响）。市场按这条切分线流通：

| type | 里面是什么 | 用户安装后 | 适用 |
| --- | --- | --- | --- |
| `soul` | `.dssoul`：纯文本人设 + 世界书（无模型文件） | 选一个**已装角色/形象**作「形象来源」，合成新角色 | **主打形态**，无版权风险 |
| `body` | `.dsbody`：只有形象（模型 + 表情/动作词表 + 交互 cue） | 进「形象库」，可给任意已装角色**一键换形象**（记忆/会话保留） | 你有权再分发的模型 |
| `full` | `.dspack`：完整角色包（灵魂 + 肉体） | 直接可用 | 仅限**你有权再分发**的模型 |
| `ref` | `.dssoul` + 模型外链指引 | 用户自备模型 → 导入 → 作形象来源 | 灵魂对应的形象有版权（Live2D / Booth VRM 等） |

**默认不托管模型文件。** Live2D 官方模型与 VRoid/Booth 上多数 VRM 都禁止再分发；想上架带模型的
`full` 型，必须在 PR 里写清可再分发的依据（自制 / 作者书面授权 / 许可证明确允许）。有版权的模型走
`ref` 型。

## 索引条目字段

```jsonc
{
  "id": "sage-of-the-tower",     // 必填，[a-z0-9][a-z0-9-]*，与包内 id 一致，全市场唯一
  "name": "塔中贤者",             // 必填
  "version": "1.0.0",            // 必填，数字段比较（1.2.0 > 1.10.0 为 false）
  "type": "soul",                // 必填：soul | full | ref
  "summary": "一句话简介",         // ≤200 字
  "tags": ["fantasy", "zh"],     // ≤20 个
  "author": "example-author",
  "license": "CC-BY-4.0",        // 必填——无许可不上架
  "preview": "https://…/previews/<id>.png",   // 绝对 http(s)
  "downloadUrl": "https://…/packs/<id>.dssoul", // 必填，绝对 http(s)
  "size": 8421,                  // 字节，UI 提示用
  "sha256": "…64 位小写 hex…",     // 必填——客户端下载后校验，不符即拒绝安装
  "minAppVersion": "0.1.0",      // 可选，低于此版本的客户端会灰掉安装按钮
  "modelSource": {               // 仅 ref 型必填（缺了客户端会丢弃该条目）
    "name": "原作者 Booth 页面",
    "url": "https://…",
    "note": "使用条款说明"
  }
}
```

格式不合规的条目会被客户端**逐条丢弃**（不会让整份索引失效），所以写错字段只影响你自己那条。

## 上架流程（PR）

1. **准备商品文件**
   - 灵魂包：新建 `souls/<id>/soul.json`（照 `souls/xiaoling/` 抄形状；可放一张 `preview.png`），或用主仓脚本从 SillyTavern 卡批量转（见下）。
   - 完整包 / 形象包：在 openpet 里「角色库 → ⋮ → 导出 .dspack」/「形象 → 导出 .dsbody」，放进 `packs/`。
2. 往 `index.json` 的 `items` 里加一条（summary / tags / author / license / type 手写；`downloadUrl` `size` `sha256` 先留空）。
3. 跑 `node scripts/build.mjs`——灵魂包被打包进 `packs/`，手放的 `packs/<id>.dspack|.dsbody` 按条目 id 对上；`downloadUrl` / `size` / `sha256` 三个机器字段全部自动回填。提 PR 前再跑一次 `--check`。
4. 提 PR，在描述里回答：
   - 内容来源（原创 / 二创 / 转载自哪里）
   - 你有什么权利分发它（自制 / 授权链接 / 许可证）
   - `full` 型另需：**模型可再分发的依据**
5. 维护者人工过 PR 后合并，条目即刻全网可见。

## 转换脚本（ST 卡 → 灵魂包）

openpet 主仓自带一个零依赖脚本，批量把 SillyTavern 角色卡转成灵魂包并生成索引片段：

```bash
node scripts/st-card-to-soul.mjs ./cards --license "CC-BY-4.0" --out ./market-out
# 产出：market-out/packs/*.dssoul、market-out/previews/*.png、market-out/index-fragment.json
```

把 `packs/` `previews/` 里的文件拷进本仓对应目录，再把 `index-fragment.json` 的 `items` 合并进
`index.json` 即可。脚本的人设映射规则与 openpet 客户端内的卡导入完全一致（同一张卡两条路径产出相同人设）。

## 下架 / 修改

- **下架**：从 `index.json` 删掉那一条（PR 或直接由维护者提交）。文件可留可删——客户端只看索引。
- **改内容**：改包文件 → 重算 sha256 → 提高 `version` → 更新条目。客户端会显示「可更新」，
  用户更新走的是**先卸载再安装**（不做原地升级），用户自己的修改会丢失，所以别把大改塞进小版本。
- **侵权/违规投诉**：提 issue 说明条目 id 与理由，核实后删条目。

## 内容约定

- 上传者对内容的权利与合规性负责；本仓只做索引，不为内容背书。
- 二创请遵守原作 IP 的二次创作规约；明确禁止的题材不要上架。
- 不接受：违法内容、真实人物的冒充性人设、恶意 prompt（诱导泄露用户信息 / 越权指令）。
- 客户端侧的安全兜底：sha256 校验 + 解压路径白名单 + 体积上限 + 卡文本清洗；但**这些防不住内容层面的问题**，
  所以人工过 PR 是必要的一环。

## 免责

索引中的角色由第三方提供。维护者不对其内容、许可陈述或可用性做保证；使用即表示你自行承担相应责任。
