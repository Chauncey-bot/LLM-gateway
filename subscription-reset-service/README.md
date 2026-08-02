# Subscription Quota Reset Service

独立服务：只处理用户端 `POST /api/v1/subscriptions/:id/reset-quota`，
并在 `sub2api` 开源后端不支持该用户端接口的场景下完成：

- 校验用户身份
- 校验订阅归属
- 校验订阅剩余有效期至少 24 小时
- 调用 `sub2api` admin 接口重置日/周/月额度
- 自动调用 `extend -1` 缩短订阅有效期 24 小时（仅用户端）

管理端 `/api/v1/admin/subscriptions/:id/reset-quota` 不会经过这个服务。

## 主要环境变量

- `PORT`（默认 `3000`）
- `SUB2API_BASE_URL`（默认 `http://host.docker.internal:18080`）
- `PAY_SERVICE_BASE_URL`（默认与 `SUB2API_BASE_URL` 一致，用于调用支付服务 `reset-traffic-packs` 管理接口）
- `SUB2API_ADMIN_EMAIL`（获取 admin token 所需）
- `SUB2API_ADMIN_PASSWORD`（获取 admin token 所需）
- `MINIMUM_REMAINING_HOURS`（默认 `24`）

## 启动

```bash
cp .env.example .env
# 填写 SUB2API_ADMIN_* 凭据
# 生产建议把 SUB2API_BASE_URL 改为子网内服务名，例如：
# SUB2API_BASE_URL=http://sub2api:18080
docker compose up -d --build
```

如果你的环境提示 `unknown command: docker compose`，请改用：
```bash
docker-compose up -d --build
```

## 本地编译并发布到生产（推荐）

在有 `node` 与 `docker` 的机器上执行：

```bash
cd /path/to/subscription-reset-service
cp .env.example .env
# 编辑 .env，填写 SUB2API_ADMIN_EMAIL / SUB2API_ADMIN_PASSWORD / SUB2API_BASE_URL

export PROD_HOST=18.143.67.94
export PROD_KEY=/private/tmp/zhisales-key/sg.pem
export PROD_USER=ubuntu
export PROD_DEPLOY_DIR=/opt/subscription-reset-service

./deploy/build-and-deploy.sh
```

脚本会按顺序执行：
- 本地镜像构建（`docker build`）
- 镜像打包并上传（`docker save` + `scp`）
- 远端加载镜像并 `docker compose up -d --force-recreate`（或 `docker-compose up -d --force-recreate`）
- 远端健康检查（`/health`）

如果你只想先编译验收不发布：

```bash
docker build -t subscription-reset-service:latest .
docker run --rm -p 18192:3000 --env-file .env subscription-reset-service:latest
```

## 健康检查

```bash
curl -s http://127.0.0.1:18192/health
```

## 生产接入（仅路由）

将反向代理（Caddy/Nginx）对 `*/api/v1/subscriptions/*/reset-quota`
和 `*/v1/subscriptions/*/reset-quota` 指向该服务；其他 `/api/v1/*`
保持原有 `sub2api` 路由不变。

## 生产接入示例（Caddy，独立接入，不改开源服务）

在原 Caddy server block 中加入前置高优先 `handle_path`（示例域名可按实际替换）：

```caddy
ai.zhisales.com {
  handle_path /api/v1/subscriptions/*/reset-quota /v1/subscriptions/*/reset-quota {
    reverse_proxy 127.0.0.1:18192
  }
  # 其它接口继续走原 sub2api，不需要额外变更
  reverse_proxy 127.0.0.1:18080
}
```

如果需要同样代理 `www.zhisales.com`：

```caddy
www.zhisales.com {
  handle_path /api/v1/subscriptions/*/reset-quota /v1/subscriptions/*/reset-quota {
    reverse_proxy 127.0.0.1:18192
  }
  reverse_proxy 127.0.0.1:18080
}
```

完整可复用片段文件：`subscription-reset-service/deploy/caddy-reset-route.caddy`

执行后重载 Caddy，并确认服务监听正常后，再走接口验证。

## 一键核验（接口尚未开放常见问题排查）

1) 先看服务健康：

```bash
curl -s http://127.0.0.1:18192/health
```

2) 走独立服务（绕过网关）：

```bash
curl -i -X POST http://127.0.0.1:18192/api/v1/subscriptions/1/reset-quota \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <USER_TOKEN>" \
  -d '{"daily":true}'
```

3) 走公网域名（网关层）：

```bash
curl -i -X POST https://ai.zhisales.com/api/v1/subscriptions/1/reset-quota \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <USER_TOKEN>" \
  -d '{"daily":true}'
```

如果第 3 步返回 `404`，说明网关并未按优先路由接管该路径，请检查 Caddy 配置生效、是否重载成功，以及该片段位于 `/api/*` 路由之前。

## 快速自测

```bash
RESET_SERVICE_BASE_URL=http://127.0.0.1:18192 \
USER_ACCESS_TOKEN=<your_user_token> \
SUBSCRIPTION_ID=<subscription_id> \
node ./scripts/smoke-test.mjs
```

> `scripts/smoke-test.mjs` 目前会进行基本健康检查并在提供 token/id 时做一条重置请求。

## 生产部署文件

- `subscription-reset-service/docker-compose.yml`
- `subscription-reset-service/deploy/caddy-reset-route.caddy`
- `subscription-reset-service/deploy/build-and-deploy.sh`
