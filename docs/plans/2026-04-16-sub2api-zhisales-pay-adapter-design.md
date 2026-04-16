# sub2api 支付适配 zhisales-pay-service 设计

日期：2026-04-16

## 目标

在保留 `sub2api` 现有支付入口、订单展示、用户体验的前提下，将实际支付执行适配到现有 `zhisales-pay-service`，避免同时维护两套支付前端和两套商品中心。

本方案明确采用：

- `sub2api` 是订单真源
- `sub2api` 持有商品目录、SKU、价格和发货规则
- `zhisales-pay-service` 作为支付执行器，复用其现有支付宝下单、查单、签名和落库能力
- 支付结果以 `sub2api` 状态为准
- 成功通知采用“回调为主，主动查单补偿”为辅

## 为什么选“适配现有接口能力”而不是重写

`zhisales-pay-service` 已经具备以下现成能力：

- 创建支付宝支付单
- 查询支付状态（`order_query`）
- 本地落支付流水表 `payment_orders`
- 已实现用户鉴权、订单查询、订单状态检查
- 已具备与 `sub2api` 的 admin API 交互能力
- 已具备 referral rewards 成功回调能力

现状问题不是“没有能力”，而是接口形态偏向“独立购买页系统”：

- `POST /pay-api/orders` 目前自己读 `catalog.json` 决定卖什么
- `POST /pay-api/orders/:merchantOrderId/check` 目前查单成功后自己直接发货
- 订单主账本目前更偏向 `zhisales-pay-service`

因此最合适的路线是：**尽量复用现有内部函数和支付执行能力，新增/改造少量 internal 接口，把订单主脑切回 `sub2api`。**

## 系统边界

### sub2api 负责

- 商品目录、套餐、SKU、金额
- 用户支付入口
- 订单创建与订单状态主账本
- 用户可见订单查询
- 支付成功后的业务发货
  - 开通/续期订阅
  - 充值余额
- 幂等、补偿和最终一致性

### zhisales-pay-service 负责

- 支付通道适配（当前先支付宝）
- 生成支付页面/表单/二维码等支付执行结果
- 查询第三方支付状态
- 保留支付侧流水和原始响应
- 将支付成功结果回调给 `sub2api`

### 明确不再让 zhisales-pay-service 负责

- 商品目录决策
- 用户最终订单状态解释权
- 默认直接发货

## 现有接口盘点

`zhisales-pay-service` 当前已有接口：

- `GET /health`
- `GET /purchase`
- `GET /purchase/return`
- `GET /pay-api/session`
- `GET /pay-api/catalog`
- `POST /pay-api/orders`
- `GET /pay-api/orders/:merchantOrderId`
- `POST /pay-api/orders/:merchantOrderId/check`

### 可复用能力

#### 1. 创建支付单能力

来源：`POST /pay-api/orders` 内部逻辑

可复用内容：

- `generateMerchantOrderId()`
- `createTradingOrder(...)`
- 支付宝签名与请求封装
- `payment_orders` 落库逻辑

需改造点：

- 不再从 `catalog.json` 决定 SKU 和价格
- 改为接受 `sub2api` 传入的订单参数

#### 2. 查单能力

来源：`POST /pay-api/orders/:merchantOrderId/check`

可复用内容：

- `queryTrade(order)`
- 状态归一化 `normalizeTradingStatus(...)`
- 查询结果写回本地支付流水

需改造点：

- 查单接口不再直接默认发货
- 查单结果返回给 `sub2api`，由 `sub2api` 决定如何推进业务订单

#### 3. 与 sub2api 通信能力

来源：

- `sub2apiJson(...)`
- `sub2apiAdminJson(...)`
- 现有 admin fulfillment 调用逻辑

需改造点：

- 从“直接调用 admin assign/extend/balance”切换为“回调 `sub2api` internal notify 接口”

## 目标接口设计

## 一、sub2api -> zhisales-pay-service

### 1. 创建支付单

建议新增：

`POST /internal/payment/orders`

请求体：

```json
{
  "out_trade_no": "S2P20260416XXXX",
  "user_id": 123,
  "user_email": "user@example.com",
  "order_type": "subscription",
  "plan_id": 12,
  "sku_code": "coding-plan-daily-80",
  "amount_cents": 8000,
  "currency": "CNY",
  "payment_type": "alipay",
  "subject": "编码套餐月付",
  "body": "group=xx validity=30d",
  "client_ip": "1.2.3.4",
  "return_url": "https://sub2api.example.com/payment/return?order_no=...",
  "notify_url": "https://sub2api.example.com/internal/payment/orders/notify",
  "metadata": {
    "sub2api_order_id": 456,
    "group_id": 7,
    "validity_days": 30
  }
}
```

返回：

```json
{
  "provider": "alipay",
  "provider_order_id": "20260416xxx",
  "status": "pending",
  "cashier_url": null,
  "qr_code_url": null,
  "form_html": "<form>...</form>",
  "expire_at": "2026-04-16T16:00:00+08:00"
}
```

### 2. 主动查单

建议新增：

- `GET /internal/payment/orders/:outTradeNo`
- 或 `POST /internal/payment/orders/query`

统一返回：

```json
{
  "out_trade_no": "S2P20260416XXXX",
  "provider": "alipay",
  "provider_order_id": "20260416xxx",
  "status": "pending|paid|closed|failed|refunded",
  "paid_amount_cents": 8000,
  "paid_at": null,
  "raw_status": "WAIT_BUYER_PAY"
}
```

## 二、zhisales-pay-service -> sub2api

### 3. 支付结果通知

建议新增 `sub2api` internal 接口：

`POST /internal/payment/orders/notify`

请求体：

```json
{
  "event_id": "paynotify:alipay:S2P20260416XXXX:TRADE_SUCCESS",
  "out_trade_no": "S2P20260416XXXX",
  "provider": "alipay",
  "provider_order_id": "20260416xxx",
  "trade_status": "paid",
  "paid_amount_cents": 8000,
  "paid_at": "2026-04-16T15:30:00+08:00",
  "buyer_id": "2088xxxx",
  "raw_payload_digest": "sha256:..."
}
```

请求头建议：

- `X-Internal-Key`
- `X-Timestamp`
- `X-Signature`

## 订单状态机

`sub2api` 建议统一成以下状态：

- `created`
- `pending_payment`
- `paid`
- `fulfilling`
- `fulfilled`
- `failed`
- `closed`
- `refunded`

关键规则：

- 支付成功不等于发货成功
- `pending_payment -> paid -> fulfilling -> fulfilled`
- 发货失败时保留在 `paid` 或 `fulfilling`，由补偿任务重试

## 幂等策略

至少三层：

### 1. 订单创建幂等

- `sub2api.out_trade_no` 全局唯一
- 重复创建时返回原支付会话或原订单

### 2. 支付通知幂等

- 用 `event_id` 去重
- 或 `(provider, provider_order_id, trade_status)` 去重

### 3. 发货动作幂等

- 订阅开通/续期要记录由哪个支付订单触发
- 余额充值要记录 `fulfilled_by_order_id`
- 重放通知不能重复加余额或重复延长订阅

## 补偿策略

采用 `C3`：回调为主，主动查单为补偿。

### 主链路

- `zhisales-pay-service` 支付成功后主动通知 `sub2api`

### 补偿链路

- 用户 return 页触发 `sub2api` 查单
- `sub2api` 定时任务扫描 `pending_payment` 超时订单
- 调用 `zhisales-pay-service` internal query 接口确认状态

## 具体改造建议

## sub2api 改造

### 保留不动的部分

- `/api/v1/payment/config`
- `/api/v1/payment/plans`
- `/api/v1/payment/channels`
- `/api/v1/payment/orders`
- `/api/v1/payment/orders/verify`
- `/api/v1/payment/orders/my`

前端仍然只跟 `sub2api` 通信。

### 新增

1. `ExternalPaymentBridge`
   - 负责调用 `zhisales-pay-service` internal create/query
   - 处理 internal 签名、超时、错误翻译

2. `POST /internal/payment/orders/notify`
   - 专供 `zhisales-pay-service` 回调
   - 做验签、金额校验、幂等推进、发货

3. 后台补偿任务
   - 扫描 `pending_payment` 订单
   - 调 bridge 查单并推进状态

### 调整

- `PaymentService.CreateOrder`
  - 保留本地下单、金额校验、订单主记录创建
  - 支付执行改为调用 bridge

- `VerifyOrderByOutTradeNo`
  - 优先通过 bridge 查单
  - 状态推进仍由 `sub2api` 决定

## zhisales-pay-service 改造

### 保留

- 支付宝创建单逻辑
- 支付宝查单逻辑
- 本地 `payment_orders` 流水表
- `/health`

### 新增

1. `POST /internal/payment/orders`
   - 接收 `sub2api` 传来的主订单参数
   - 不再依赖本地 catalog 决定商品

2. `GET /internal/payment/orders/:outTradeNo`
   - 返回统一支付状态

3. 回调 `sub2api /internal/payment/orders/notify`
   - 作为主链路成功通知

### 降级/边缘化

- `/purchase`
- `/purchase/return`
- `/pay-api/catalog`
- `/pay-api/orders` 中“由本地 catalog 决定商品”的逻辑
- `fulfillOrder(...)` 直接调 `sub2api` admin fulfillment 的默认行为

迁移期可以临时保留旧路径，但不再作为主链路。

## 最小可落地版本（MVP）

建议第一阶段只做：

- 支付方式：支付宝
- 订单类型：subscription
- 创建支付单 internal API
- 支付成功回调 internal notify
- `/verify` 主动查单
- 不先动退款
- 不先动 balance 充值
- 不先下线旧 `/purchase`

这样能最快验证：

1. `sub2api` 创建主订单
2. `zhisales-pay-service` 发起支付
3. 支付成功通知 `sub2api`
4. `sub2api` 发货成功
5. 订单状态在 `sub2api` 闭环

## 风险点

### 1. 双发货

来源：回调和主动查单并发触发。

应对：

- `sub2api` 发货动作必须幂等
- 使用 fulfillment ledger 或唯一业务锁

### 2. 金额或商品被支付侧篡改

来源：支付服务自己重新按 catalog 决定商品。

应对：

- internal create 接口必须以 `sub2api` 传入并签名的参数为准
- 支付侧不再重新决定业务商品

### 3. 过渡期两条链路并存导致串单

来源：旧 `/purchase` + 新 internal API 同时存在。

应对：

- 明确新链路才是正式路径
- 测试环境先关闭旧路径暴露
- 旧路径仅保留回溯用途

## 实施顺序

1. 在 `zhisales-pay-service` 新增 internal create/query 接口
2. 在 `sub2api` 新增 `ExternalPaymentBridge`
3. 打通 `sub2api /api/v1/payment/orders -> bridge -> zhisales-pay-service`
4. 在 `sub2api` 新增 `/internal/payment/orders/notify`
5. 让 `zhisales-pay-service` 支付成功后回调 `sub2api`
6. 补 `/verify` 与后台扫单补偿
7. 逐步下线 `zhisales-pay-service` 的旧 catalog/直接发货逻辑

## 建议结论

最终建议不是“重写支付服务”，而是：

**以 `sub2api` 为订单主脑，适配并收编 `zhisales-pay-service` 现有支付执行能力。**

这条路线改动最少、风险最低，也最符合当前代码现状。