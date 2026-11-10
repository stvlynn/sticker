# Lynn-chan Stickers

<div align="center">
  <img src="./public/stickers/mhy.png" alt="Lynn-chan" width="200" height="200">
</div>

## 使用 Sticker

### Telegram

![2025-12-03 00.53.53.png](https://s2.loli.net/2025/12/03/RnpxzAsYZw6FqDP.png)

[在 Telegram 中添加 Lynn-chan Sticker Pack](https://t.me/addstickers/lynnchan)

动态贴纸（2026-11-06 发布，共 181 张）：

- [Lynn Sticker @stvlynn 1 · 120 张](https://t.me/addstickers/lynn_sticker_stvlynn_1_by_lynn_ai_bot)
- [Lynn Sticker @stvlynn 2 · 61 张](https://t.me/addstickers/lynn_sticker_stvlynn_2_by_lynn_ai_bot)

网站支持“静态／动态”标签切换、当前类型内搜索，以及动态贴纸 WebM 原文件下载。动态贴纸仅在可见区域静音循环播放，开启系统“减少动态效果”后显示静态预览。

### 微信

![sticker.weixin.qq.com_cgi-bin_mmemoticonwebnode-bin_pages_stickerPage_setting_stikerid_stiker_176451914991ba5a1d2bd4a81f.png](https://s2.loli.net/2025/12/03/5uGkTNDiHsfF8MQ.png)

[在微信中使用 Lynn-chan Sticker](https://w.url.cn/s/AhlJ5Bk)

---

## 关于 Lynn 酱

| | |
|---|---|
| Lynn 酱是由 [Steven Lynn](https://x.com/Stv_Lynn) 设计的 OC，经过多次迭代最终形成现在的样子。<br><br>最新一版的 OC 来自于 [YAYOI の 夢](https://x.com/Yayoi_no_yume)，从此转为了白毛的形象～ | ![Lynn OC](./oc.png) |


## 如何贡献

欢迎向 Lynn-chan Sticker 库贡献你的创意作品！

### 提交步骤

1. Fork 本仓库
2. 在 `public/stickers/` 文件夹内添加你的 PNG 图片
3. 提交 PR

### 设计建议

推荐使用 **gemini-3-pro-preview** 生成 Sticker。以下是推荐的 Prompt：

```text
将角色变形并设计一张 LINE 贴纸。姿势和文字排版要富有创意，变化丰富，设计独特。
对话应为简体中文，参考 sticker 示例。
使用文本"[YOUR_TEXT]"，动作是[YOUR_ACTION]。
图片整体使用浅灰色 RGB(240, 240, 240) 背景，文字和角色周围有白色描边。
```

**示例：**

```text
将角色变形并设计一张 LINE 贴纸。姿势和文字排版要富有创意，变化丰富，设计独特。
对话应为简体中文，参考 sticker 示例。
使用文本"干饭"，动作是开心地吃饭。
图片整体使用浅灰色 RGB(240, 240, 240) 背景，文字和角色周围有白色描边。
```

## 请求新 Sticker

如果你有想要的 Sticker 创意，欢迎提交 Issue！

### Issue 格式

```markdown
**Sticker 名称：** [中文名称]

**描述：** [简要描述这个 sticker 的内容、场景、表情等]

**文本建议：** [希望在 sticker 上显示的文本]

**参考：** [可选：参考其他 sticker 或参考图片]
```

**示例：**

```markdown
**Sticker 名称：** 加班中

**描述：** Lynn 酱疲惫地工作，眼神无神，咖啡杯在旁边

**文本建议：** 又是加班的一天

**参考：** 参考 "在忙.png" 的风格
```


## Agent 接入

贴纸库同时提供三种 agent 接入方式，详见 [docs/sticker-agent-stack.md](docs/sticker-agent-stack.md)：

- **Catalog API**：`packages/sticker-catalog/catalog.json`，覆盖 80 张静态贴纸和 181 张动态贴纸。
- **REST / MCP**：`npm run stickers:api` 启动本地 API（含 `/mcp`），`npm run stickers:mcp` 启动 MCP stdio 服务。
- **DeepSeek Harness 插件**：安装 `packages/dsh-sticker` 后，agent 可以在合适的时候调用
  `send_sticker`，贴纸直接显示在对话里；匹配时优先选择动态贴纸。除了模型主动调用，插件还会在
  感谢/问候/开心/累/失败等社交意图，以及任务完成或失败时，通过事件投影自动在回复尾部发一张贴纸。
  插件本身只有约 72 KB，不打包任何贴纸图片/WebM；
  图片和动态图按需从 `https://sticker.stv.pm` 加载。贴纸媒体和完整 catalog 都不会进入模型上下文。

```bash
npm run stickers:build   # 生成 catalog、public/catalog.json、MCP 静帧和插件元数据
npm run stickers:api     # REST API + MCP HTTP，默认 127.0.0.1:4319
npm run stickers:mcp     # MCP stdio
npm run stickers:verify  # 端到端校验
npm run stickers:pack    # 打包 dsh-lynn-sticker 插件
```

插件安装：在 Plugin Manager 中添加本地 bundle 目录 `/absolute/path/to/packages/dsh-sticker`，
或发布后安装 npm 包。`sticker.stv.pm` 已提供 `/catalog.json`，插件会按 TTL（默认 5 分钟）
在后台刷新贴纸元数据；贴纸图片和 WebM 也直接按需从站点加载。MCP 客户端配置示例和上下文开销
说明见 [docs/sticker-agent-stack.md](docs/sticker-agent-stack.md)。

## 协议

本项目中的所有 Sticker 作品采用 **CC BY 4.0** 协议。

- ✅ 可以自由使用、修改和分享
- ✅ 必须署名原作者
- ❌ **禁止商用**

详见 [CC BY 4.0 协议](https://creativecommons.org/licenses/by/4.0/)


## 技术栈

- **框架：** Next.js 14 + React 18
- **样式：** Tailwind CSS
- **动画：** Framer Motion
- **图标：** Lucide React

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 访问 http://localhost:3000
```

### 同步已发布的动态贴纸

资源及来源、顺序和 SHA-256 记录分别保存在 `public/stickers/animated/` 与 `src/data/animated-stickers.json`，运行网站无需 OpenSticker 项目。需要从发布工作目录重新同步时：

```bash
node scripts/sync-animated-stickers.mjs ~/code/OpenSticker/.workspace/lynn-telegram
```

脚本只导入 `pack-plan.json` 中已发布的条目，并核对 `published.json` 的数量和每个 WebM 的 SHA-256。

---

Made with ❤️ by [Steven Lynn](https://x.com/Stv_Lynn)
