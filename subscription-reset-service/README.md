# Subscription Quota Reset Service

独立服务：处理用户端和管理员端的订阅额度重置。
用户端 `POST /api/v1/subscriptions/:id/reset-quota`，
并在 `sub2api` 开源后端不支持该用户端接口的场景下完成：

- 校验用户身份
- 校验订阅归属
- 校验订阅剩余有效期至少 24 小时
- 在数据库事务中重置日额度并缩短有效期 24 小时（仅用户端）

管理端 `/api/v1/admin/subscriptions/:id/reset-quota` 和
`/v1/admin/subscriptions/:id/reset-quota` 也经过本服务：使用调用者自身的
Bearer token 请求上游管理员订阅详情接口完成鉴权，再为固定日额度套餐持久化重置操作。
在 PostgreSQL 同一事务中清零选中的日/周/月用量、写入锁后获取的数据库当前时间，并保存已提交记录。
管理员、用户端和零点任务使用同一个订阅 advisory lock，自动任务在锁内重新检查窗口是否仍需重置。
管理员重置不缩短有效期；累计套餐仍转交上游原生重置接口。

自有表 `zhisales_subscription_resets` 在启动时创建，保存操作 ID、上游鉴权请求 ID、状态和结果。
`pending` 操作可在事务失败或重启后执行；用量、窗口和 `applied` 状态原子提交。
已提交操作的补偿只删除 Redis `billing:sub:<user>:<group>` 缓存并发送现有
`subscription:cache:invalidate` 失效消息，绝不重放清零或用户有效期扣减。
后台每 5 秒重试，启动时立即恢复。管理员重置成功返回 `X-Quota-Reset-ID`；待恢复时返回 503 和
`reset_id`、`recovery_pending:true`，应等待自动补偿，避免重复提交新的重置。
健康接口 `recovery` 字段显示待恢复数量和补偿错误。零点任务仍使用北京时间零点作为统计边界。

管理员窗口修复的生产发布使用以下脚本。它先运行全部测试（含独立 PostgreSQL、Redis 回归），
构建 Linux AMD64 镜像，保存源码哈希和基准提交，保留现有生产 `.env`、挂载 catalog 和网络，
只重建重置服务，备份 Compose/Caddy 后为三个已有重置路由增加管理员路径并验证、重载。

```bash
RELEASE_TAG=admin-window-YYYYMMDD-unique PROD_KEY=/secure/path/production.pem \
  bash subscription-reset-service/deploy/release-admin-window.sh
```

回滚资料保存在 `/opt/subscription-reset-service/releases/<RELEASE_TAG>/`。
如发布失败，先检查该目录和实际服务健康，再决定回滚；不重启 Sub2API 或额度控制器。
回滚前须确认 `pending/applied` 数量为 0；重置记录表应保留，不能删除未完成操作。
本地完整测试可单独运行 `bash subscription-reset-service/scripts/test-local.sh`。

## 主要环境变量

- `PORT`（默认 `3000`）
- `SUB2API_BASE_URL`（默认 `http://host.docker.internal:18080`）
  必须指向内部 Sub2API 地址，例如 `http://sub2api:8080`，不能指向已接管重置路由的公网域名，以免循环代理。
- `PAY_SERVICE_BASE_URL`（默认与 `SUB2API_BASE_URL` 一致，用于调用支付服务 `reset-traffic-packs` 管理接口）
- `SUB2API_ADMIN_EMAIL`（获取 admin token 所需）
- `SUB2API_ADMIN_PASSWORD`（获取 admin token 所需）
- `MINIMUM_REMAINING_HOURS`（默认 `24`）
- `DAILY_RESET_TIME_ZONE`（固定日额度窗口时区，默认 `Asia/Shanghai`）
- `DAILY_RESET_POLL_INTERVAL_MS`（补偿扫描间隔，默认 `60000`）
- `DAILY_RESET_BATCH_SIZE`（每轮最多重置的订阅数，默认 `200`）
- `SUB2API_REDIS_URL`（默认 `redis://redis:6379/0`，须与生产 Sub2API 一致）

## 固定零点自动重置

该服务拥有一个独立的订阅日额度任务，不修改开源 `sub2api`：

- 每分钟检查一次北京时间当天 00:00 后仍未翻页的有效多日订阅；
- 逐条提交自有重置操作，原子清零 `daily_usage_usd`、将 `daily_window_start` 写为当天北京时间 00:00，并通过持久化记录投递缓存失效；
- 排除有效期不超过 24 小时的一天临时套餐；
- 使用 PostgreSQL advisory lock，避免多副本重复执行；
- 服务在零点不可用时，恢复后会自动补偿遗漏的订阅。

流量包的到期回收仍由支付服务负责；本任务只重置上游订阅套餐的日用量。

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

## 旧部署脚本（历史参考）

当前生产发布使用上方 `deploy/release-admin-window.sh`，以保留现网配置和不可变镜像版本。

在有 `node` 与 `docker` 的机器上执行：

```bash
cd /path/to/subscription-reset-service
cp .env.example .env
# 编辑 .env，填写 SUB2API_ADMIN_EMAIL / SUB2API_ADMIN_PASSWORD / SUB2API_BASE_URL

export PROD_HOST=52.221.30.93
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
  @resetQuota path /api/v1/subscriptions/*/reset-quota /v1/subscriptions/*/reset-quota /api/v1/admin/subscriptions/*/reset-quota /v1/admin/subscriptions/*/reset-quota
  handle @resetQuota {
    reverse_proxy 127.0.0.1:18192
  }
  # 其它接口继续走原 sub2api，不需要额外变更
  reverse_proxy 127.0.0.1:18080
}
```

如果需要同样代理 `www.zhisales.com`：

```caddy
www.zhisales.com {
  @resetQuota path /api/v1/subscriptions/*/reset-quota /v1/subscriptions/*/reset-quota /api/v1/admin/subscriptions/*/reset-quota /v1/admin/subscriptions/*/reset-quota
  handle @resetQuota {
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
