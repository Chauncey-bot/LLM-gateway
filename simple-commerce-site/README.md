# Simple Commerce Site

一个用 Go 开发的简易电商独立站项目骨架，包含：

- 消费者端 H5 页面
- 店铺管理端 Web 页面
- 基础 JSON API
- 内存版商品、订单、购物车示例实现

## 目录结构

```text
cmd/server            入口程序
internal/app          路由与 HTTP 处理
internal/model        业务模型
internal/store        内存数据存储
internal/web          模板和静态资源
```

## 功能范围

- H5 首页、商品列表、商品详情、购物车、下单成功页
- 管理端仪表盘、商品管理、订单管理
- `/api/products`、`/api/orders` 等基础接口

## 运行方式

本环境里没有安装 Go，无法直接在这里编译验证。你可以在本地执行：

```bash
go run ./cmd/server
```

默认监听 `http://localhost:8080`

## 后续建议

如果你希望继续完善，我可以接着帮你补：

1. 数据库接入：MySQL / PostgreSQL
2. 用户登录和权限
3. 支付流程
4. 订单状态流转
5. 前后端分离版 H5 和管理后台

