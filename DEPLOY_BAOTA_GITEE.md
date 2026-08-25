# 宝塔 + Gitee 自动部署

本项目是 Vite 静态站。每次推送 `main` 分支后，Gitee 将触发宝塔 WebHook；服务器拉取代码、执行构建，宝塔网站直接发布 `dist/`。

## 首次部署

在服务器终端执行：

```bash
cd /www/wwwroot
git clone https://gitee.com/davon57/fortress-frontier.git fortress-frontier
cd fortress-frontier
npm ci
npm run build
chmod +x deploy/deploy.sh
```

在宝塔创建网站，根目录填写：

```text
/www/wwwroot/fortress-frontier/dist
```

绑定你的域名并申请 SSL 证书，开启强制 HTTPS。

## 宝塔 WebHook

安装宝塔 WebHook 插件，新建钩子，脚本填入：

```bash
#!/usr/bin/env bash
export PROJECT_DIR="/www/wwwroot/fortress-frontier"
export BRANCH="main"
export LOG_FILE="/www/wwwlogs/fortress-frontier-deploy.log"

mkdir -p "$(dirname "$LOG_FILE")"
nohup bash "$PROJECT_DIR/deploy/deploy.sh" >> "$LOG_FILE" 2>&1 &
echo "ok"
```

保存后复制宝塔生成的 WebHook URL。

## Gitee WebHook

在 Gitee 仓库中进入 `管理 → WebHooks → 添加 WebHook`：

- URL：粘贴宝塔 WebHook URL
- 请求方式：`POST`
- 数据格式：`JSON`
- 触发事件：仅勾选 `Push`
- 分支：`main`
- 密钥：使用强随机字符串

保存后点击测试；成功后每次 `git push origin main` 都会自动构建和发布。

## 排查

```bash
tail -f /www/wwwlogs/fortress-frontier-deploy.log
git -C /www/wwwroot/fortress-frontier log -1 --oneline
```

如果 Git 提示 `dubious ownership`，执行：

```bash
git config --global --add safe.directory /www/wwwroot/fortress-frontier
```
