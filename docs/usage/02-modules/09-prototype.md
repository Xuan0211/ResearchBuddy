---
title: Prototype — 原型与实验
---

# Prototype — 原型与实验

Prototype 模块用于管理项目的原型代码、实验脚本和探索性开发。

## 当前功能

- **文档关联**：将 Docs 或 Paper Notes 附加到 Prototype 模块，集中查阅背景资料
- **GitHub 链接**：保存原型仓库或分支的链接，方便团队访问

:::note
Prototype 模块目前是占位状态，主要功能待开发。实际代码文件建议通过 Workspace 模块或本地 git 克隆管理，存放在项目仓库的 `prototype/` 目录下。
:::

## 存储位置

克隆项目仓库后，原型代码可以放在 `prototype/` 目录下自由组织：

```
prototype/
├── experiment-name/
│   ├── README.md      # 说明你做了什么、结论是什么
│   ├── code/
│   └── results/
```

每次提交都会产生 git 版本记录，完整保留实验历史。
