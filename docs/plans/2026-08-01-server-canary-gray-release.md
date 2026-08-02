# 服务器灰度测试容器启动方案（本地构建 + 服务器运行）

目标：在服务器上启动一个与生产并行的测试容器（Canary），用于需求变更验证，不影响现网端口。

## 约定

- 本地构建：`docker build`
- 服务器运行：仅 `docker load / docker compose up`
- 使用远端数据库：`DB_HOST=sub2api-postgres`
- 不替代生产服务，不自动改写主路由规则

## 快速启动支付服务 canary

```bash
cd /Users/chauncey/Documents/ZhisalesLLM
cp zhisales-pay-service/.env.canary.example zhisales-pay-service/.env.canary
# 填写 .env.canary 内密码/密钥

export PROD_HOST=18.143.67.94
export PROD_KEY=/secure/path/production.pem   # 你的服务器私钥
export PROD_USER=ubuntu                      # 如需调整
export CANARY_PORT=18195                     # 可选，默认 18195
export CANARY_NETWORK=sub2api-v01104-official_sub2api-network

./zhisales-pay-service/deploy-canary.sh
```

健康检查：

```bash
curl -fsS http://127.0.0.1:18195/health
```

## 快速启动返利服务 canary

```bash
cd /Users/chauncey/Documents/ZhisalesLLM
cp referral-rewards-service/.env.canary.example referral-rewards-service/.env.canary
# 填写 .env.canary 内密码/密钥

export PROD_HOST=18.143.67.94
export PROD_KEY=/secure/path/production.pem
export PROD_USER=ubuntu
export CANARY_PORT=18196
export CANARY_NETWORK=sub2api_sub2api-network
export CATALOG_SOURCE=/Users/chauncey/Documents/ZhisalesLLM/zhisales-pay-service/catalog.json

./referral-rewards-service/deploy-canary.sh
```

健康检查：

```bash
curl -fsS http://127.0.0.1:18196/health
```

## 灰度发布说明

- 该方案只起一个新的端口（18195/18196）灰度容器，用于联调和验收。
- 若要按规则做流量分发，需要在反向代理（如 Caddy）做 header/cookie/percent-based routing；
  当前脚本只负责服务起停，不做流量分流。
