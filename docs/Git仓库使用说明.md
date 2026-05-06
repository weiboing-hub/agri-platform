# Git 仓库使用说明

## 1. 适用范围

本说明只适用于当前这个独立仓库：

- 仓库目录：`/Users/mac/Documents/New project/agri-platform`
- 远端仓库：`https://github.com/weiboing-hub/liuwb.git`
- 默认分支：`main`

注意：

- 后续 Git 操作只在 `agri-platform/` 目录执行
- 不要再对外层 `/Users/mac/Documents/New project` 做 `git push`

## 2. 日常更新流程

最常用的提交流程：

```bash
cd "/Users/mac/Documents/New project/agri-platform"
git status
git add .
git commit -m "你的更新说明"
git push
```

如果要先看远端有没有新内容：

```bash
cd "/Users/mac/Documents/New project/agri-platform"
git pull --rebase
git push
```

## 3. 推荐操作顺序

每次更新建议按这个顺序做：

1. 进入仓库目录
2. `git status` 看改了哪些文件
3. 确认没有把本地临时文件带进去
4. `git add .`
5. `git commit -m "..."`
6. `git push`

## 4. 当前已忽略的内容

这个仓库现在已经排除了常见本地垃圾和构建产物，包括：

- `admin-api/node_modules/`
- `admin-web/node_modules/`
- `admin-web/dist/`
- `coverage/`
- `.DS_Store`
- `.claude/`
- `.idea/`
- `.vscode/`
- `backups/`
- 文档预览目录
- 本地 `.env` 文件

所以正常情况下，`git status` 不应该再出现这些内容。

## 5. 提交前建议检查

提交前建议至少看一次：

```bash
git status
```

如果你想看本次改动内容：

```bash
git diff
```

如果你已经 `add` 了，想看暂存区内容：

```bash
git diff --cached
```

## 6. 不建议提交的内容

后续不要把下面这些东西提交进仓库：

- 数据库备份
- 服务器导出文件
- 本地截图
- 浏览器缓存
- 打包后的安装包
- `node_modules`
- `dist`
- 含密钥、token、密码的真实配置

## 7. 凭证建议

你之前用于推送的 GitHub token 已经在聊天里暴露过。

建议：

1. 去 GitHub 立即废弃旧 token
2. 重新生成一个新 token
3. 以后不要把 token 写进仓库文件
4. 也不要把 token 直接提交到聊天、代码或 README

## 8. 常用命令

查看远端：

```bash
git remote -v
```

查看当前分支：

```bash
git branch
```

查看最近提交：

```bash
git log --oneline -n 10
```

如果只是想把某个文件恢复到上次提交：

```bash
git restore 路径
```

如果只是想取消暂存：

```bash
git restore --staged 路径
```

## 9. 当前建议

后续如果只是平台代码更新，直接在这个仓库里提交和推送就可以。

如果后面还要管理固件源码，建议单独再做一个独立仓库，例如：

- `firmware/soil_sensor_reporter`

不要把固件、平台、浏览器资料、打包产物继续混在一个大仓库里。
