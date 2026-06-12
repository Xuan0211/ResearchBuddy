---
title: Git 工作流 & 冲突处理
---

# Git 工作流 & 冲突处理

## 日常推送流程

```bash
git add -A && git commit -m "描述改动" && git push
```

如果出错，按照下面的级别依次排查。

---

## 错误级别 1：需要先 fetch（非分叉）

**错误信息**：`Updates were rejected because the tip of your current branch is behind`

**原因**：远程有新提交，本地没有，但历史没有分叉。

```bash
git pull --rebase origin main
git push origin main
```

---

## 错误级别 2：分叉分支（Divergent Branches）— 终极解决方案

**错误信息**：`hint: You have divergent branches and need to specify how to reconcile them`

**原因**：你和别人（或你自己在另一台机器上）同时基于同一个父提交做了修改，历史出现了两条并行的提交线：

```
远程 origin/main:  ... → 9f7b2d3 → A（别人推的）
本地 main:         ... → 9f7b2d3 → B（你提交的）
```

### 方案 A：变基（Rebase）— 强烈推荐

把你的本地提交"移动"到远程最新提交后面，保持线性历史：

```bash
# 1. 拉取并变基
git pull --rebase origin main

# 2. 如果出现冲突（大概率没有，因为通常改的是不同文件）
#    打开冲突文件，保留需要的内容，然后：
git add <冲突文件>
git rebase --continue

# 3. 推送
git push origin main
```

### 方案 B：只想用本地版本覆盖远程（谨慎！）

确认远程的提交可以丢弃时才用：

```bash
git push origin main --force-with-lease
```

`--force-with-lease` 比 `--force` 安全：如果远程在你上次 fetch 后又有新提交，会拒绝推送而非静默覆盖。

### 方案 C：合并（Merge）— 保留完整历史

会产生一个额外的"合并提交"：

```bash
git pull --no-rebase origin main
git push origin main
```

---

## 设置默认行为（一次性配置）

避免每次 pull 都提示 "how to reconcile"：

```bash
# 全局设为 rebase（推荐）
git config --global pull.rebase true

# 或只对当前仓库
git config pull.rebase true
```

---

## 常见场景

| 场景 | 推荐命令 |
|---|---|
| 只有远程有新提交 | `git pull --rebase origin main` |
| 本地和远程都有新提交（分叉） | `git pull --rebase origin main` |
| 确定要丢弃远程新提交 | `git push origin main --force-with-lease` |
| 出现冲突 | 解决后 `git add <file>` + `git rebase --continue` |
| 想放弃变基回到原始状态 | `git rebase --abort` |

---

## 变基出现冲突时的完整流程

```bash
git pull --rebase origin main
# ↑ 如果提示 CONFLICT，执行下面的步骤：

# 查看哪些文件冲突
git status

# 打开每个冲突文件，找到 <<<<<<< ======= >>>>>>> 标记，手动保留正确内容
# 编辑完后：
git add <冲突文件名>

# 继续变基（每个冲突提交都要执行一次）
git rebase --continue

# 全部解决后推送
git push origin main
```
