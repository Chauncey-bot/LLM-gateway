# 外置流量包额度网关

该服务在不修改 Sub2API 源码、镜像或数据库结构的前提下，对 API 请求执行账户级的日额度控制。

## 边界

- 只读 Sub2API 的 `api_keys`（识别用户）和 `usage_logs`（结算实际消费）。
- 只写支付库 `zhisales_pay` 内的 `traffic_pack_quota_states`、`traffic_pack_quota_holds`。
- 支付服务是套餐基线、购买、过期和手动重置的唯一授权来源。
- 网关会覆盖转发给上游的 `X-Request-ID`，再用该 ID 从只读 `usage_logs` 找到实际消费金额。

## 运行方式

复制 `.env.example` 为 `.env` 并配置两个数据库连接。`QUOTA_DB_*` 指向 `zhisales_pay`，`SUB2API_DB_*` 指向 Sub2API 数据库；两个账号都应遵循最小权限原则，其中后者仅授予 `api_keys` 和 `usage_logs` 的 `SELECT` 权限。

```bash
npm install
npm test
npm start
```

将 `deploy/caddy-quota-route.caddy` 放在 Caddy 的通用 `/api/*`、`/v1/*` 反向代理规则之前。该网关必须以失败关闭（fail closed）方式发布：额度账本或只读身份查询不可用时，不得绕过到上游。

## 上游配置迁移

对由网关托管的套餐分组，将 Sub2API 的订阅日额度设置为不限额；否则上游仍可能在网关放行后按旧分组额度拒绝请求。该调整是运营配置，不改变 Sub2API 代码或表结构。

切换顺序：先建支付账本并启动网关，再切换 Caddy 路由，最后调整目标套餐分组。回滚时先恢复分组限额，再撤销 Caddy 路由，避免绕过额度控制。
