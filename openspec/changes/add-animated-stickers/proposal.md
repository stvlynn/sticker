# Change: 同步 Telegram 动态贴纸并提供类型切换

## Why
本项目当前只展示静态贴纸。用户要求同步 2026-11-06 晚在 OpenSticker 中上传到 Telegram 的全部动态贴纸，并提供动态／静态切换。

## What Changes
- 以 `/Users/steven/code/OpenSticker/.workspace/lynn-telegram/pack-plan.json` 和 `published.json` 为来源，同步两个已发布包中的全部 181 张 WebM 动态贴纸（120＋61）。不引入被审核排除的 58 张候选贴纸。
- 将文件复制到本项目的 `public/stickers/animated/`，保留名称、顺序、来源包及 SHA-256 校验信息，部署后无需依赖 OpenSticker 目录。
- 在贴纸网格上方增加“静态”和“动态”切换标签及数量，默认保持静态视图；搜索仅过滤当前类型，切换时保留关键词。
- 动态卡片提供透明背景、静音循环预览与 WebM 原文件下载，并按可见范围控制播放和加载；减少动态效果偏好下显示静态预览。
- 静态贴纸继续支持 PNG 预览、复制和下载；动态卡片避免将 WebM 作为 PNG 复制到剪贴板，提供 Telegram 来源包入口。

## Impact
- Affected specs: sticker-gallery（新增）
- Affected code: `src/data/stickers.ts`, `src/app/page.tsx`, `src/components/sticker/StickerCard.tsx`, `src/components/sticker/StickerGrid.tsx`, `public/stickers/animated/`
- 181 个已发布原文件已逐一按发布清单核对 SHA-256，WebM 资源总量 31.7 MiB。
- 无需新增运行时依赖。

## Approval
用户已通过“execute”确认本提案并授权实施。
