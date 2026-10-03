# 自动部署

生产入口：[http://47.82.79.170](http://47.82.79.170)。项目目录为 `/opt/jsonsage`，主分支为 `main`。

每次推送到 `main`，GitHub Actions 先执行无用代码检查、功能测试和生产构建，再通过专用 SSH 密钥让服务器构建并更新 Docker Compose 容器。拉取请求只运行检查，不发布。服务器只接受当前 `origin/main` 的完整提交 SHA，过期流水线跳过发布。

## 配置

GitHub 的 `production` 环境只需要两项密钥：

| 密钥 | 用途 |
| --- | --- |
| `SSH_PRIVATE_KEY` | JsonSage 专用部署密钥 |
| `SSH_KNOWN_HOSTS` | 已验证的服务器 SSH 主机公钥 |

非敏感环境变量为 `SSH_HOST=47.82.79.170`、`SSH_PORT=22`、`SSH_USER=root`。使用公开仓库，不需要 GitHub 密码、仓库访问令牌或镜像仓库密钥。

服务器 `.env` 仅保存 `APP_PORT=8088` 和 `PUBLIC_HOST=47.82.79.170`。容器只监听 `127.0.0.1:8088`，主机 Nginx 通过独立的 `/etc/nginx/conf.d/jsonsage.conf` 转发 IP 地址请求。其他项目的配置不需要修改。

部署密钥在服务器 `authorized_keys` 中使用 `restrict` 和强制命令，只允许 `deploy <提交 SHA>`；不能通过该密钥打开交互式 Shell 或转发端口。入口脚本放在 `.ops/ssh-entrypoint.sh`，运行记录和发布锁也放在 `.ops/`，不进入 Git。

## 发布和检查

提交并推送到 `main` 即自动发布；也可在 GitHub Actions 中手动运行 **CI and Deploy**。访问 `/healthz` 检查服务，访问 `/version.json` 查看线上提交。流水线会自动验证这两个公网入口。

构建期间继续运行原容器。新镜像使用提交 SHA 标记，启动后须通过容器健康检查及版本检查；失败时自动恢复上一镜像，并让流水线报告失败。构建失败不会替换运行中的容器。历史镜像用于回滚，不执行影响其他项目的全局镜像清理。

管理员在服务器上可检查：

```sh
cd /opt/jsonsage
export APP_REVISION=$(cat .ops/deployed-revision)
export JSONSAGE_IMAGE=jsonsage:$APP_REVISION
docker compose ps
docker compose logs --tail 100 app
curl -fsS http://127.0.0.1:8088/version.json
```

运行镜像仅包含静态资源及 Nginx，以非 root 用户运行，根文件系统只读，临时文件限制在 `/tmp`；容器有内存、进程数及日志大小限制。JSON 解析和转换仍在浏览器本地完成，服务器不接收输入内容。

当前按要求使用 HTTP IP 入口。浏览器的 PWA 安装、离线缓存及部分剪贴板 API 需要 HTTPS 或 localhost；后续接入域名及 HTTPS 后即可启用这些浏览器能力。

实现依据：[Docker 多阶段构建](https://docs.docker.com/build/building/multi-stage/)、[Compose 健康等待](https://docs.docker.com/reference/cli/docker/compose/up/)、[GitHub Actions 密钥](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions)、[Nginx 静态资源路由](https://nginx.org/en/docs/http/ngx_http_core_module.html#try_files)。
