# 代理商子域名方案（简化版）

日期：2026-09-25
状态：MVP 方案

## 1. 目标

不创建新的账号系统，不创建独立的代理商用户表。直接复用现有账号体系：

- 代理商就是现有用户账号
- 每个代理商分配一个子域名
- 通过访问的子域名识别邀请人账号 ID
- 新用户注册后绑定该邀请人
- 购买完成后继续复用现有返利/积分逻辑

示例：

```text
代理商 A：a123.example.com
代理商 B：b456.example.com
```

## 2. 最小数据结构

只新增一张子域名映射表：

### `agent_subdomains`

- `subdomain` varchar primary key
- `user_id` bigint not null
- `status` `active/disabled`
- `created_at` timestamptz
- `updated_at` timestamptz

现有的以下数据继续使用，不重复建设：

- 用户账号和登录：现有用户系统
- 邀请码：`referral_profiles`
- 邀请关系：`referral_relationships`
- 积分账户和流水：`points_accounts`、`points_ledger`
- 订单完成回调：现有 `order-fulfilled` 事件

如果现有邀请码已经唯一，也可以直接把邀请码作为子域名，甚至不需要新增映射表：

```text
https://{referral_code}.example.com
```

如果不希望暴露邀请码，则保留映射表，把短子域名映射到 `user_id`。

## 3. 访问和归因流程

### 3.1 访问站点

1. 配置 DNS：`*.example.com` 指向同一个站点入口。
2. 用户访问 `a123.example.com`。
3. 网关读取 `Host` 中的 `a123`。
4. 查询 `agent_subdomains`，得到代理商 `user_id=1001`。
5. 将 `inviter_user_id=1001` 注入页面初始化数据或服务端请求上下文。

网关解析出的 `user_id` 必须由后端保存和传递，不能信任浏览器自行提交的邀请人 ID。

### 3.2 注册绑定

1. 访客在代理商子域名下注册。
2. 注册成功后，注册后端根据当前站点上下文调用现有绑定接口：

```http
POST /api/referral/bind-registration
{
  "referred_user_id": 2001,
  "referrer_user_id": 1001,
  "source": "subdomain:a123"
}
```

3. 服务校验：
   - 代理商账号存在且子域名启用
   - 不能自邀
   - 被邀请用户尚未绑定其他邀请人
4. 写入现有 `referral_relationships`。

### 3.3 购买返利

购买流程和现有站点保持一致：

1. 用户正常下单和支付。
2. 支付服务完成发货后发送现有 `order-fulfilled` 事件。
3. 返利服务根据买家的 `referral_relationships` 找到代理商。
4. 按现有规则给代理商增加积分。

不需要在订单系统中新增租户字段；邀请关系已经能确定收益归属。

## 4. 站点实现

所有代理商共用一套前端页面，只根据子域名显示少量差异：

- 站点标题
- 代理商名称或联系方式（可选）
- 当前代理商可展示的邀请入口

第一版不做：

- 独立登录
- 独立数据库
- 独立商品目录
- 代理商自定义价格
- 自定义域名
- 现金提现
- 多级代理

## 5. 最小接口

新增：

- `GET /api/site/context`：根据 Host 返回 `subdomain` 和 `inviter_user_id`
- `POST /admin/agent-subdomains`：管理员为账号分配子域名
- `DELETE /admin/agent-subdomains/:subdomain`：停用子域名

复用：

- `POST /api/referral/bind-registration`
- `GET /api/referral/me`
- `POST /internal/events/order-fulfilled`
- 现有用户注册、登录、支付和订阅接口

## 6. 必须保留的规则

- 一个用户只能绑定一个邀请人。
- 代理商不能邀请自己。
- 子域名停用后不能继续注册归因或创建新订单。
- 订单完成回调必须幂等，不能重复发放积分。
- 退款需要产生反向积分流水。
- 子域名只允许由管理员创建和修改。

## 7. 实施顺序

1. 增加 `agent_subdomains` 表和 Host 解析中间件。
2. 在注册流程中把解析到的 `user_id` 传给现有邀请绑定接口。
3. 打通现有订单完成事件和邀请返积分逻辑。
4. 增加管理员分配/停用子域名页面。
5. 配置通配 DNS 和 HTTPS 证书。

最终链路：

```text
子域名 → 代理商账号 ID → 注册绑定邀请关系 → 订单完成返利
```
