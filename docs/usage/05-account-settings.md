---
title: 账号设置
---

# 账号设置

点击右上角 **Settings** 进入全局账号设置页面：

![Settings 页面 — 账号信息、密码和 Google Drive 连接](/api/help-images/settings-page.png)

---

## 个人信息

修改姓名后点击 **Save account**。邮箱不可修改（登录标识）。

## 修改密码

在 **Password** 区域输入当前密码和新密码，点击 **Update password**。

---

## 连接 Google Drive

点击 **Connect Google Drive** 开始 OAuth 授权流程：

![Google 授权确认页 — 点击 Continue 完成授权](/api/help-images/google-auth-approval.png)

点击 **Continue** 完成授权。授权成功后页面会显示 **Google Drive connected**：

![Google Drive 已连接 — 返回项目继续设置](/api/help-images/google-drive-connected.png)

连接成功后点击右上角 **Back to project** 返回项目，然后在 Home → Project Settings 里选择具体的 Drive 文件夹。

:::warning
授权过程中可能出现 "Google hasn't verified this app" 警告，这是正常的（ResearchBuddy 正在进行 Google OAuth 审核），点击 **Continue** 即可。
:::

---

## API Keys

在 Settings 页面下方可以生成 API Key（`rb_xxx...`），用于 git clone/push 认证（比账号密码更安全）。

生成后**只显示一次**，请立即复制保存。
