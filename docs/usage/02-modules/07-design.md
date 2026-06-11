---
title: Design — 设计资产
---

# Design — 设计资产

Design 模块用于管理项目的设计资产和 Figma 链接。

## Figma 链接

在页面底部的 **Figma links** 区域，点击 **Add link**，填入 Figma 文件或 Frame 的 URL，即可保存供团队共享。

:::note
Design 模块目前以 Figma 链接管理为主，后续将支持更多设计协作功能。
:::

## 文件资产

设计文件（导出的切图、原型截图等）可以直接提交到项目 git 仓库的 `design/` 目录，通过 Workspace 模块或本地 git 克隆进行管理。

克隆仓库后，可在 LaTeX 中引用：

```latex
\includegraphics[width=\linewidth]{design/my-figure.pdf}
```

## 关联文档

通过页面顶部的资源面板，可以将 Docs 或 Paper Notes 链接到 Design 模块，方便集中查阅设计相关背景文档。
