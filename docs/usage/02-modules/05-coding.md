---
title: Coding — 质性编码
---

# Coding — 质性编码

Coding 模块提供定性研究的编码工作台，支持文献筛选（Screening）、摘录（Excerpt）和逐字稿编码（Transcript）。

## 创建编码本（Codebook）

点击 **+ New Codebook** 新建编码本。

一个编码本包含多个 **Code（编码条目）**：
- 可设置颜色标签
- 支持父子层级关系（子编码）
- 可添加自定义字段

## 文献筛选（Screening）

适合系统综述（Systematic Review）场景：

1. 在 Papers 模块添加待筛选文献
2. 在 Coding → Screening 设置筛选标准（Inclusion / Exclusion criteria）
3. 逐篇标记 **Included / Excluded / Pending**
4. 支持 `all_pass`（所有标准都满足）或 `any_pass`（任一标准满足）通过逻辑
5. 完成后导出筛选结果为 CSV

## 摘录（Excerpt）

从论文中提取有代表性的文本片段，打上编码标签：

1. 选择要编码的论文
2. 在文本框中粘贴摘录
3. 选择对应的 Code（支持多码）
4. 可上传截图作为摘录的视觉材料

:::tip
支持多编码员（`coder` 字段），方便计算编码一致性（Inter-rater reliability）。
:::

## 逐字稿编码（Transcript）

上传访谈或会议的转录文本，对文本片段按时间段打码。

## 导出

编码结果可以导出为 CSV，包含：
- 摘录文本
- 对应的 Code 和层级
- 编码员
- 来源论文
