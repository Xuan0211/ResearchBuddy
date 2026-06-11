---
title: 项目基础设置
---

# 项目基础设置

在 Home 页面点击 **Project Settings** 展开设置面板（仅 Admin 可见）：

![Project Settings — Google Drive 和 Zotero 配置](/api/help-images/project-settings.png)

---

## 连接 Google Drive

在 **Google Drive** 区域：

1. 如果 Drive 未连接，点击 **Connect in Settings** 跳转到账号设置页连接 Google 账号（见[账号设置](../05-account-settings)）
2. 连接后回到这里，选择文件夹模式（默认用 `ResearchBuddy / 项目名`）
3. 点击 **Save Drive folder**

:::tip
Google Drive 需要在**全局 Settings** 里先连接账号，才能在各项目里选择文件夹。点击 **Global Settings** 按钮可以直接跳过去。
:::

---

## 配置 Zotero

在 **Zotero** 区域填写 API Key 和 Library ID：

![Zotero 设置 — 推荐使用 Group (Shared) 类型方便团队协作](/api/help-images/zotero-group-setting.png)

:::tip
团队项目推荐使用 **Group (Shared)** 类型，在 Zotero 里创建一个 Group Library，所有成员共同维护同一个文献库。
:::

点击字段旁的 **?** 图标可以查看详细的 Group ID 和 API Key 获取步骤。

填写完成后点击 **Save Zotero**，然后去 Papers 页面点击 🔄 按钮开始同步文献。

---

## Google Drive 授权注意

首次连接 Google Drive 时，会出现一个"未验证应用"警告页：

![Google 未验证应用警告 — 点击 Continue（不是 Back to safety）](/api/help-images/google-auth-warning.png)

:::warning
这是正常现象，因为 ResearchBuddy 目前还在测试阶段，未完成 Google 的 OAuth 认证审核。请点击左下角的 **Continue**，**不要**点击 "Back to safety"。
:::
