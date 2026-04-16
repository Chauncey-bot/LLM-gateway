# LLM Gateway Platform

一个面向 AI 网关业务的工作区仓库，当前主要承载三块能力：

- `codex-proxy`：模型/API 中转与账号池能力
- `zhisales-pay-service`：独立支付页与支付宝支付执行能力
- `referral-rewards-service`：邀请返利与积分兑换能力

这个仓库目前更像一个**集成工作区**，而不是单一应用：它同时保存了现网相关服务源码快照、补丁、交接文档，以及后续支付整合设计稿。

---

## 当前状态

当前已明确的整合方向是：

- 保留 `sub2api` 现有支付入口与用户体验
- 让 `sub2api` 成为订单真源与商品/SKU/价格持有方
- 复用 `zhisales-pay-service` 的现有支付宝下单、查单、签名和支付流水能力
- 将 `referral-rewards-service` 保持为独立奖励/兑换服务

对应设计文档：

- `docs/plans/2026-04-16-sub2api-zhisales-pay-adapter-design.md`

> 注意：`sub2api` 源码当前**不在本仓库内**；现阶段它作为外部上游/本地相邻仓库参与联调。

---

## 仓库结构

```text
.
├── codex-proxy/                # API gateway / proxy / desktop + web 管理端
├── referral-rewards-service/   # 邀请返利与积分兑换服务
├── zhisales-pay-service/       # 支付页 + 支付执行器（当前为支付宝）
├── docs/
│   ├── handoff/                # 交接记录、现网路径、运维信息
│   └── plans/                  # 设计方案、集成计划、运行文档
├── patches/                    # 历史补丁与测试文件
└── IMPORT_NOTES.md             # 导入来源与边界说明
```

---

## 各目录说明

### `codex-proxy/`

模型中转服务，核心职责包括：

- 将上游能力以统一 API 对外暴露
- 维护账号池、认证、配额与路由逻辑
- 提供 Web / Desktop 管理入口

更多细节见：

- `codex-proxy/README.md`
- `docs/handoff/HANDOFF.md`

### `zhisales-pay-service/`

当前独立支付服务，主要提供：

- `/purchase` 外部购买页
- 支付宝下单
- 支付状态查询
- 支付流水落库
- 与 `sub2api`、返利服务的衔接能力

更多细节见：

- `zhisales-pay-service/README.md`
- `docs/plans/2026-04-16-sub2api-zhisales-pay-adapter-design.md`

### `referral-rewards-service/`

独立返利与积分系统，主要提供：

- 邀请码/邀请关系维护
- 订单完成后的积分奖励
- 积分兑换订阅
- 后台规则管理与事件审计

更多细节见：

- `referral-rewards-service/README.md`

---

## 文档入口

### 核心设计

- `docs/plans/2026-04-16-sub2api-zhisales-pay-adapter-design.md`

### 返利系统相关

- `docs/plans/2026-04-13-referral-rewards-service-design.md`
- `docs/plans/2026-04-13-referral-rewards-frontend-integration.md`
- `docs/plans/2026-04-13-referral-rewards-runbook.md`
- `docs/plans/2026-04-13-referral-rewards-command-pack.md`
- `docs/plans/2026-04-13-referral-rewards-mvp-usage.md`

### 交接与现网信息

- `docs/handoff/HANDOFF.md`
- `IMPORT_NOTES.md`

---

## 开发说明

### 1. 先看边界，再动代码

当前仓库包含多块来源不同的代码与快照，开始开发前建议先确认：

- 这次改动发生在哪个服务里
- 是否需要联动 `sub2api`
- 是否只是本仓文档/补丁整理，而不是业务实现

### 2. 环境文件不入库

仓库根 `.gitignore` 已统一忽略：

- `.env`
- `node_modules/`
- 构建产物
- 日志/缓存/临时文件

如需本地启动，请参考各服务目录中的：

- `.env.example`
- `README.md`
- `docker-compose.yml`

### 3. 当前仓库不是完整生产镜像

这个仓库保存的是**当前工作区的源码与文档基线**，但不等于完整线上部署状态。尤其：

- 线上路由、Caddy、静态站点和部署路径见 `docs/handoff/HANDOFF.md`
- `sub2api` 代码目前不在本仓
- 生产密钥、证书、私有文件均未纳入版本库

---

## 推荐阅读顺序

如果你是第一次接手这个仓库，建议按这个顺序读：

1. `README.md`
2. `IMPORT_NOTES.md`
3. `docs/handoff/HANDOFF.md`
4. `docs/plans/2026-04-16-sub2api-zhisales-pay-adapter-design.md`
5. 目标服务自己的 `README.md`

---

## 后续建议

当前最值得继续推进的主线是：

1. 在 `zhisales-pay-service` 增加 internal create/query 接口
2. 在 `sub2api` 中新增 `ExternalPaymentBridge`
3. 将支付成功后的状态推进与发货主逻辑收回 `sub2api`
4. 让返利系统继续消费“订单已完成”事件，而不是反向主导支付流程

---

## 备注

本仓库最初由多个用户提供的代码包、交接资料和后续整理内容组成；
当前已经开始收敛为一个可持续维护的 Git 仓库，但仓库边界仍在逐步明确中。
