# mxmpay - 支付业务模块

## 一、核心功能

- **订单管理**：统一的订单创建、查询、状态管理
- **多支付网关**：支持微信、支付宝、PayPal、Visa等支付方式
- **支付回调**：处理各支付平台的Webhook回调
- **订单状态流转**：pending → paid/failed/cancelled/refunded
- **订单查询**：支持按用户、状态、时间等条件查询
- **支付统计**：订单统计和分析

---

## 二、数据库表设计

```sql
-- 支付订单表（核心表，所有支付都基于订单）
CREATE TABLE payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, -- 不设置外键，避免跨服务依赖
  order_no VARCHAR(64) UNIQUE NOT NULL, -- 业务订单号，如：PAY20240115123456
  order_type VARCHAR(20) NOT NULL, -- recharge(充值), subscription(订阅), purchase(购买)
  
  -- 订单金额信息
  amount DECIMAL(18, 6) NOT NULL, -- 订单金额（支持小数，如0.01）
  currency VARCHAR(10) DEFAULT 'CNY', -- 货币类型：CNY, USD, EUR等
  
  -- 支付方式信息
  payment_channel VARCHAR(20) NOT NULL, -- alipay, wechat, paypal, card, crypto等
  payment_method VARCHAR(50), -- 具体支付方式，如：alipay_app, wechat_h5, paypal_express, visa等
  
  -- 订单状态
  status VARCHAR(20) DEFAULT 'pending', -- pending, paid, failed, cancelled, refunded, expired
  expires_at TIMESTAMP NOT NULL, -- 订单过期时间
  
  -- 第三方支付信息
  third_party_order_id VARCHAR(255), -- 第三方支付平台的订单ID
  third_party_transaction_id VARCHAR(255), -- 第三方交易ID
  
  -- 支付链接和二维码
  payment_url TEXT, -- 支付链接（网页支付）
  qr_code_data_url TEXT, -- 二维码数据URL（扫码支付）
  payment_params JSONB, -- 移动端支付参数（如Apple Pay、Google Pay）
  
  -- 订单描述和元数据
  description TEXT, -- 订单描述
  metadata JSONB, -- 扩展元数据，如：{ membership_type: 'pro', duration_months: 12 }
  
  -- 回调信息
  callback_data JSONB, -- 支付回调的原始数据
  callback_received_at TIMESTAMP, -- 回调接收时间
  
  -- 时间戳
  paid_at TIMESTAMP, -- 支付完成时间
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_payment_orders_user_id ON payment_orders(user_id);
CREATE INDEX idx_payment_orders_order_no ON payment_orders(order_no);
CREATE INDEX idx_payment_orders_status ON payment_orders(status);
CREATE INDEX idx_payment_orders_created_at ON payment_orders(created_at DESC);
CREATE INDEX idx_payment_orders_third_party_order_id ON payment_orders(third_party_order_id);

-- 支付记录表（记录支付成功后的操作，如充值、订阅等）
CREATE TABLE payment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL, -- 关联支付订单
  user_id UUID NOT NULL,
  record_type VARCHAR(20) NOT NULL, -- recharge, subscription, purchase
  
  -- 记录详情（根据类型不同，字段含义不同）
  amount DECIMAL(18, 6) NOT NULL,
  details JSONB, -- 详细信息，如：{ balance_before: 100, balance_after: 200 } 或 { membership_type: 'pro', expires_at: '2024-12-31' }
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_payment_records_order_id ON payment_records(order_id);
CREATE INDEX idx_payment_records_user_id ON payment_records(user_id);
CREATE INDEX idx_payment_records_type ON payment_records(record_type);

-- 退款记录表
CREATE TABLE refund_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL, -- 原支付订单ID
  refund_no VARCHAR(64) UNIQUE NOT NULL, -- 退款单号
  refund_amount DECIMAL(18, 6) NOT NULL, -- 退款金额
  refund_reason TEXT, -- 退款原因
  status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
  third_party_refund_id VARCHAR(255), -- 第三方退款ID
  refunded_at TIMESTAMP, -- 退款完成时间
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_refund_records_order_id ON refund_records(order_id);
CREATE INDEX idx_refund_records_refund_no ON refund_records(refund_no);
```

---

## 三、支付网关支持

**支持的支付方式：**

| 支付渠道 | 支付方式 | 适用场景 | 说明 |
|---------|---------|---------|------|
| **alipay** | alipay_app, alipay_h5, alipay_web | 中国用户 | 支付宝App、H5、网页支付 |
| **wechat** | wechat_app, wechat_h5, wechat_mp | 中国用户 | 微信App、H5、小程序支付 |
| **paypal** | paypal_express, paypal_standard | 国际用户 | PayPal快速支付、标准支付 |
| **card** | visa, mastercard, amex, unionpay | 国际/国内 | 信用卡支付（通过Stripe等） |
| **crypto** | btc, eth, usdt | 加密货币 | 比特币、以太坊、USDT等 |
| **mobile** | apple_pay, google_pay | 移动端 | Apple Pay、Google Pay |

---

## 四、API 接口规范

**基础路径**: `/api/v1/payment`

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/create` | 创建支付订单 | ✅ |
| GET | `/:orderId` | 获取订单详情 | ✅ |
| GET | `/` | 查询订单列表 | ✅ |
| POST | `/confirm` | 确认支付（轮询查询） | ✅ |
| POST | `/:orderId/cancel` | 取消订单 | ✅ |
| POST | `/webhook/:channel` | 支付回调（Webhook） | ❌ |
| POST | `/refund` | 申请退款 | ✅ |
| GET | `/stats/overview` | 获取支付统计 | ✅ |

### 请求/响应示例

```typescript
// POST /api/v1/payment/create
Request: {
  order_type: 'recharge' | 'subscription' | 'purchase';
  amount: number; // 订单金额
  currency?: string; // 货币类型，默认CNY
  payment_channel: 'alipay' | 'wechat' | 'paypal' | 'card' | 'crypto' | 'mobile';
  payment_method?: string; // 具体支付方式，如：alipay_app, wechat_h5, paypal_express, visa, apple_pay
  description?: string; // 订单描述
  metadata?: { // 扩展信息，根据订单类型不同
    // 充值订单
    // 订阅订单
    membership_type?: 'pro' | 'premium';
    duration_months?: number;
    auto_renew?: boolean;
    // 购买订单
    product_id?: string;
    product_type?: string;
  };
}

Response: {
  code: 200;
  data: {
    id: string; // 订单UUID
    order_no: string; // 业务订单号
    order_type: string;
    amount: number;
    currency: string;
    payment_channel: string;
    payment_method: string;
    status: 'pending';
    expires_at: string; // 订单过期时间
    payment_url?: string; // 网页支付URL（H5支付）
    qr_code_data_url?: string; // 二维码数据URL（扫码支付）
    payment_params?: { // 移动端支付参数
      // Apple Pay
      apple_pay_token?: string;
      // Google Pay
      google_pay_token?: string;
      // 其他移动支付参数
    };
  };
}

// GET /api/v1/payment/:orderId
Response: {
  code: 200;
  data: {
    id: string;
    order_no: string;
    order_type: string;
    amount: number;
    currency: string;
    payment_channel: string;
    payment_method: string;
    status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded' | 'expired';
    expires_at: string;
    payment_url?: string;
    qr_code_data_url?: string;
    third_party_order_id?: string;
    third_party_transaction_id?: string;
    paid_at?: string;
    created_at: string;
    updated_at: string;
  };
}

// GET /api/v1/payment
Query: {
  page?: number;
  page_size?: number;
  order_type?: 'recharge' | 'subscription' | 'purchase';
  payment_channel?: 'alipay' | 'wechat' | 'paypal' | 'card' | 'crypto' | 'mobile';
  status?: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded' | 'expired';
  start_date?: string; // 开始日期
  end_date?: string; // 结束日期
}

Response: {
  code: 200;
  data: {
    list: Array<{
      id: string;
      order_no: string;
      order_type: string;
      amount: number;
      currency: string;
      payment_channel: string;
      status: string;
      created_at: string;
      paid_at?: string;
    }>;
    total: number;
    page: number;
    page_size: number;
  };
}

// POST /api/v1/payment/confirm
Request: {
  order_id: string; // 订单ID或订单号
}

Response: {
  code: 200;
  data: {
    order_id: string;
    status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired';
    paid_at?: string;
  };
}

// POST /api/v1/payment/refund
Request: {
  order_id: string; // 原订单ID
  refund_amount?: number; // 退款金额（不填则全额退款）
  refund_reason: string; // 退款原因
}

Response: {
  code: 200;
  data: {
    refund_id: string;
    refund_no: string;
    order_id: string;
    refund_amount: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
  };
}

// POST /api/v1/payment/webhook/:channel
// channel: alipay, wechat, paypal, stripe等
// 各支付平台的Webhook回调，由支付平台主动调用
Request: {
  // 根据不同的支付平台，回调数据格式不同
  // 需要在对应的Gateway中解析
}
```

---

## 五、支付网关架构

**网关工厂模式：**

```typescript
// 支付网关接口
interface PaymentGateway {
  create(order: CreateOrderDto): Promise<GatewayResult>;
  query(orderId: string): Promise<OrderStatus>;
  refund(refundDto: RefundDto): Promise<RefundResult>;
  handleWebhook(data: any): Promise<WebhookResult>;
}

// 支持的网关实现
- AlipayGateway: 支付宝网关
- WechatGateway: 微信支付网关
- PaypalGateway: PayPal网关
- StripeGateway: Stripe网关（支持Visa、Mastercard等）
- CryptoGateway: 加密货币网关
- ApplePayGateway: Apple Pay网关
- GooglePayGateway: Google Pay网关
```

**订单状态流转：**

```
pending (待支付)
  ↓
paid (已支付) / failed (支付失败) / cancelled (已取消) / expired (已过期)
  ↓
refunded (已退款)
```

---

## 六、异步任务通知

当支付订单状态变更时，通过消息队列发送通知事件：

```typescript
// 支付订单状态变更
{
  event_type: 'async_task.status_changed',
  module_type: 'mxmpay',
  task_id: 'order-123456', // 订单ID
  user_id: 'user-123',
  task_status: 'paid', // pending, paid, failed, refunded
  task_status_message: '支付成功',
  metadata: {
    order_no: 'PAY20240115123456',
    amount: 100.00,
    currency: 'CNY',
    payment_channel: 'alipay',
  },
  notification_config: {
    notification_type: 'system',
    action_url: '/payment/orders/order-123456',
    send_push: true,
  }
}
```

详细通知机制参见 [MXMNOTIFY.md](./MXMNOTIFY.md)

