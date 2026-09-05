# 套餐额度模式与独立有效期

本地实现仅涉及自有支付服务、额度网关和重置服务；不修改 Sub2API 源码、镜像、数据库结构或开源前端。自有 `/purchase` 页面显示新模式，商品 API 提供 `quotaMode`、`dailyLimitUsd`、`totalQuotaUsd`、`validityDays`。旧 `quotaDurationType` 仅保留为客户端兼容字段，不能用于判断重置行为。

| 模式 | 额度参数 | 有效期 | 重置 |
| --- | --- | --- | --- |
| daily_fixed | daily_limit_usd | validity_days | 北京时间每天零点恢复日额度 |
| cumulative | total_quota_usd | validity_days | 总额度有效期内累计，不按日/月重置 |

一天指从订阅生效时间起 24 小时。例如当日 12:00 生效，次日 12:00 到期，零点不清空累计用量。显式有效期优先于历史 daily/monthly 标签。

原月度日额度套餐为 daily_fixed；分组 23/24 的一天临时套餐、分组 25/26 的 30 天总额套餐为 cumulative。停用商品保留停用状态。新临时套餐不再额外发放通用余额。

累计请求按当前 Key 所属分组定位有效订阅，以 subscription_id + user_id 汇总 usage_logs.actual_cost（与现有订阅实际扣费口径一致），包括所有 Key 和全部日期。框架月窗口归零不影响这个总和。用量达到总额返回 TOTAL_QUOTA_EXCEEDED；无有效订阅拒绝访问。数据库故障会阻止转发，不放过无法校验的累计请求。累计模式不触发流量包自动切组。

零点任务根据 daily_fixed 分组筛选，包含一天有效期及尚未初始化日窗口的日固定套餐，跳过未开始/已过期的订阅。累计套餐不支持扣一天有效期的手动重置；固定套餐只允许重置日额度。累计套餐不参与流量包的日额度基线计算。

## 本地验证

- 支付服务：`cd zhisales-pay-service && npm ci && npm test`
- 重置服务：`cd subscription-reset-service && npm ci && npm test`
- 网关：`cd quota-gateway && npm ci && npm test`

网关测试使用开发依赖 PGlite 执行真实 PostgreSQL SQL，并启动回环 HTTP 服务。覆盖跨零点、跨月窗口、有效期延长、不同 Key 合计、不同订阅隔离、精确额度边界、到期拒绝及真实零点筛选 SQL。

## 上线前的配套配置（本次未执行）

三个服务必须使用同一份 catalog.json。网关/重置镜像从仓库根目录构建，将目录内置，避免单独部署时丢失相邻目录。更改商品额度后需同步发布三个服务。全部计费请求必须经过网关；直连 Sub2API 会绕过累计总额度校验。

执行 `node zhisales-pay-service/scripts/print-plan-group-updates.mjs` 仅打印官方管理 API 的配置建议，不连接任何服务。累计分组需关闭 daily/weekly 限额，将 monthly 限额配置为总额作为额外保护；monthly 字段不是业务总额度的统计来源。支付服务在累计订单创建/发放前检查原生分组，配置不一致会拒绝，避免假发放成功。分组改动可能影响现有订阅，上线时必须核对当前存量和起止时间，不应直接批量执行所有建议。

## 明确的行为边界

- 续费沿用现有延长有效期语义，不自动增加或重置累计总额度。需要将购买变成额度叠加时，应另行定义订单额度权益规则。
- 当前通过原生请求记录计量，必须保留有效累计订阅自生效以来的全部 usage_logs；不能在其有效期内清理或归档这些记录后不提供查询支持。
- 不冻结额度，按已落库用量检查；并发及日志落库延迟允许小幅超用，符合现有非严格限额要求。
- 此次没有迁移生产存量、部署、推送 GitHub，也没有更新开源前端的套餐展示；新字段已由自有商品 API 和自有购买页使用。

## 2026-09-05 生产发布记录

上述“本次未执行”描述对应本地开发阶段。用户随后授权生产发布，已部署版本 `quota-modes-20260905-2118`，约北京时间 21:29–21:31 完成三个自有服务切换。

- 发布目录：`/home/ubuntu/zhisales-release-quota-modes-20260905-2118`。
- 该目录的 `backup/` 保留原目录、Compose 配置、分组 API 快照、订阅及支付数据库备份。旧镜像均保留 `before-quota-modes-20260905` 标签。
- 保留生产全部 15 个订阅 SKU、分组 ID、价格、有效期、标题及启停状态。仅官方 API 更新原分组 23、24：daily=0、weekly=0、monthly=100。其他 13 个分组校验无额度差异。未批量修改用户订阅记录、余额或用量。
- 生产流量包原本已停用，本次仍保留停用，不因本地历史配置而重新上架。
- 部署镜像复用旧镜像依赖，离线 COPY 本次自有应用代码；没有重建或重启 Sub2API/CLIProxyAPI。
- 支付服务使用发布目录的新 catalog 只读挂载，原 `/opt/zhisales-pay-service/catalog.json` 保留作回滚基线。网关和重置服务内置相同目录。
- 各服务通过原 Compose 文件加 `scripts/quota-modes-release/{pay,gateway,reset}.override.yml` 部署。后续运维必须带上对应 override 文件，不能直接用旧 Compose 单独重新创建容器，否则会回到旧镜像/配置。
- 健康接口、公开商品目录、公网无效 Key 鉴权已验证。公开列表仍为 6 个在售订阅（保留现有隐藏 SKU 规则），临时套餐返回 cumulative/100/1。

### 回滚次序

如需回滚，先在当前发布目录环境运行 `scripts/release-quota-modes.mjs rollback-groups`，通过官方 API 恢复 23/24 的原限额，再使用备份对应的原 Compose 文件和旧镜像恢复三个服务。脚本需在容器内挂载发布目录为 `/release` 并使用原支付服务 env-file，不能把管理员密钥写进命令文本。不要整体回灌数据库覆盖发布之后新增的支付或用量数据。
