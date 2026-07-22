# 新增订阅套餐 Skill（按可复用逻辑）

用于每次新增“订阅套餐组（subscription）”时的标准化流程，避免新增后仍无可用账号导致 `openai.account_select_failed`。

## 适用目标
- 新增订阅分组（`subscription_type=subscription`）
- 自动完成“上游账号映射”与“订阅分配/可见性”关键步骤
- 重点避免新组无 `account_groups` 映射造成 503

## 输入参数
- `name`: 分组名称，例如 `coding-plan-daily-1600`（可选，不填自动按 daily_usd 生成）
- `platform`: 推荐 `openai`（默认 `openai`）
- `subscription_type`: `subscription`
- `daily_limit_usd`: 每日额度（美元）（**必填**）
- `price_cny`: 月付价格（人民币）（**必填**）
- `rate_multiplier`: 计费倍率（默认 `2.1`，按既有套餐可按需调整）
- `copyFromGroupId`: 复制账号映射来源组 ID（默认 `18`）
- `description`: 套餐说明（默认 `"{price_cny} RMB per month, {daily_limit_usd} USD daily limit."`）
- `assign_user_id`: 可选，是否给目标用户分配订阅（默认不分配）
- `validity_days`: 可选，分配时长度，默认 30

## 步骤一：在 admin 后台创建分组
- 路径：`/admin/groups`
- 关键字段：
  - `名称`: `${name}`
  - `平台`: `${platform}`
  - `订阅类型`: `subscription`
  - `独占`: `true`（建议）
  - `平台默认映射模型`: `gpt-5.4`（若适用）
  - `日限额/周限额/月限额`: 根据需要填写（日常建议只填日限额）
  - `复制账号`: 选择 `copyFromGroupId`（例如 `17`）
- 点击提交，拿到 `group_id`

## 步骤二：校验账号绑定
- 查询：
  - `SELECT * FROM account_groups WHERE group_id = ${newGroupId} ORDER BY account_id;`
- 必须至少有一条且应包含状态正常可用的 `account_id`

- 快速排错：
  - 如果为空：说明复制失败或该来源组也无映射
  - 如果出现不可用账号（非 active / schedulable=false）需清理后重放

## 步骤三：绑定用户权限（分配订阅链路关键）
- 给目标用户创建/更新订阅（如只有该用户）：
  - `/admin/subscriptions` 或后端接口 `POST /admin/users/{user_id}/subscriptions`
  - `group_id = ${newGroupId}`
- 若该用户已有旧订阅：考虑「续期」而非重复新建
- 若有白名单/可见性模型：确认该 `group_id` 在分配上下文可见

## 推荐 API 调用方式（可直接复用）

### 1) 创建分组（UI 同步逻辑）
```json
POST /api/v1/admin/groups
Content-Type: application/json

{
  "name": "coding-plan-daily-2000",
  "description": "5000 RMB per month, 2000 USD daily limit.",
  "platform": "openai",
  "rate_multiplier": 2.1,
  "is_exclusive": true,
  "subscription_type": "subscription",
  "daily_limit_usd": 2000,
  "weekly_limit_usd": null,
  "monthly_limit_usd": null,
  "copy_accounts_from_group_ids": [18],
  "default_mapped_model": "gpt-5.4",
  "allow_messages_dispatch": false,
  "mcp_xml_inject": true
}
```

### 2) 分配订阅给用户（示例）
```json
POST /api/v1/admin/users/{user_id}/subscriptions
Content-Type: application/json

{
  "group_id": ${newGroupId},
  "days": 30,
  "status": "active"
}
```

> 接口字段可能随版本变化，请以你当前 `admin/users` 详情页实际提交参数为准。

## 参数化脚本（推荐）

可直接执行参数化脚本：

```bash
ADMIN_EMAIL=admin@zhisales.com ADMIN_PASSWORD='你的密码' \
  bash docs/plans/add-subscription-plan.sh \
  --price-cny 5000 \
  --daily-usd 2000 \
  --name coding-plan-daily-2000 \
  --copy-from 18 \
  --assign-user-id 22 \
  --validity-days 30
```

脚本自动完成：
1. 登录管理员账号
2. 创建 `subscription` 分组
3. 可选给指定用户分配订阅

## 发布后验证（强制）
1. 发起一次 `POST /responses` 样本请求
2. 查看日志不再出现
   - `openai.account_select_failed`
   - `no available accounts`
3. 观察 5xx/503 恢复率：至少连续 10 次请求无 `503`

## 速记验收清单
- [ ] 分组已创建且 `status=active`
- [ ] `account_groups` 已有映射（复制来源成功）
- [ ] 目标用户订阅落在新 `group_id`
- [ ] 关键日志无 `no available accounts`
- [ ] 该组可在分配/列表页看到
