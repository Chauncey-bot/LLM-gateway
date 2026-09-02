# 外置 API 兼容网关

该服务在不修改 Sub2API 源码、镜像或数据库结构的前提下转发 API 请求。在线请求路径不再冻结额度，也不会根据本地日额度返回 429；每日额度允许出现并发超用。流量包由支付服务创建独立的 Sub2API 原生订阅额度桶，正常请求仍先使用套餐分组，只有收到 Sub2API 明确的 `DAILY_LIMIT_EXCEEDED` 后才切换当前 Key 并重试一次。

## 边界

- 只读 Sub2API 的 `api_keys` 以验证 API Key；请求本身仍由 Sub2API 处理。
- 普通成功请求不读取或写入额度账本；只有明确的原生日额度 429 才读取 `traffic_pack_runtime_states` 并记录 `traffic_pack_key_switches`。
- 支付服务是套餐基线、购买、过期和手动重置的唯一授权来源。
- 流量包到期或手动重置后，支付服务会恢复所有已切换 Key 的原分组，并撤销本次运行时订阅。
- `traffic_pack_quota_holds` 仅作为历史兼容表保留，不再创建新的 pending hold。
- 过期 hold 清理器仅用于回收上线前遗留的冻结额度。

## 运行方式

复制 `.env.example` 为 `.env` 并配置两个数据库连接及 `SUB2API_ADMIN_EMAIL`、`SUB2API_ADMIN_PASSWORD`。`QUOTA_DB_*` 指向 `zhisales_pay`，`SUB2API_DB_*` 指向 Sub2API 数据库；两个数据库账号都应遵循最小权限原则，其中后者仅需 `api_keys` 的 `SELECT` 权限。管理员凭据只用于通过官方 API 切换 Key 分组。

```bash
npm install
npm test
npm start
```

历史过期 hold 的清理：

```bash
QUOTA_GATEWAY_EXPIRED_HOLD_CLEANUP_BATCH_SIZE=500 \
QUOTA_GATEWAY_EXPIRED_HOLD_REAPER_MAX_CYCLES=200 \
npm run reap-expired-holds
```

服务本身也会在启动时按 `QUOTA_GATEWAY_EXPIRED_HOLD_CLEANUP_INTERVAL_MS` 周期性清理历史过期 hold（默认 60s）。新请求不会再产生 hold。

将 `deploy/caddy-quota-route.caddy` 放在 Caddy 的 `/responses/compact` 和通用 `/api/*`、`/v1/*` 反向代理规则之前。可使用 `deploy/install-caddy-route.sh` 在生产的 `ai.zhisales.com`、`www.zhisales.com` 两个站点安装，脚本会先备份并校验 Caddy 配置后再 reload。

## 上游配置迁移

套餐分组继续保留 Sub2API 原生日额度。支付服务复制当前套餐分组的路由配置并为流量包创建独立原生订阅；多次购买只增加同一代额度桶上限，不重置已用量。手动重置后再次购买会创建新一代额度桶，避免继承已取消流量包的用量。
