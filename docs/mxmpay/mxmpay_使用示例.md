## 使用示例

#### 示例 1：启动支付服务
此示例展示如何启动 mxmpay 支付服务，这是使用本项目的最基础方式。

```typescript
// 文件名：start-server.ts
import app from './app'; // 导入 Express 应用实例
import { loadEnv } from './config/env'; // 导入环境变量加载器

// 1. 加载环境变量
loadEnv();

// 2. 定义服务运行的端口
const PORT = process.env.PORT || 3000;

// 3. 启动 Express 服务器
app.listen(PORT, () => {
  console.log(`mxmpay 支付服务已启动，正在监听端口 ${PORT}`);
  console.log(`API 文档地址：http://localhost:${PORT}/api-docs`);
});

// 运行命令：npx ts-node start-server.ts
```
**运行效果说明**：执行后，终端会显示服务启动成功的日志，并打印出 API 文档的访问地址。一个基础的支付服务后端开始运行，可以处理后续的支付请求。

#### 示例 2：创建加密货币支付订单
此示例展示如何调用服务 API，创建一个接受以太坊（ETH）支付的订单。

```typescript
// 文件名：create-crypto-payment.ts
import axios from 'axios';

// 1. 定义请求的端点（假设服务运行在本地 3000 端口）
const API_BASE_URL = 'http://localhost:3000/api';

async function createCryptoPayment() {
  try {
    // 2. 构造创建支付订单的请求数据
    const paymentData = {
      amount: '0.05', // 支付金额
      currency: 'ETH', // 加密货币类型
      orderId: 'ORDER_123456', // 商户系统内的订单号
      description: '购买高级会员服务', // 订单描述
      returnUrl: 'https://your-shop.com/payment/success' // 支付成功后跳转的地址
    };

    // 3. 发送 POST 请求到支付订单创建接口
    const response = await axios.post(`${API_BASE_URL}/payments`, paymentData);
    
    // 4. 打印响应结果
    console.log('支付订单创建成功！');
    console.log('订单详情：', response.data);
    console.log('请向以下地址支付：', response.data.paymentAddress);
    console.log('二维码数据（Base64）：', response.data.qrCode);

  } catch (error) {
    // 5. 错误处理
    console.error('创建支付订单失败：', error.response?.data || error.message);
  }
}

// 执行函数
createCryptoPayment();
```
**运行效果说明**：成功调用后，控制台会输出新创建的支付订单详情，包括一个用于收款的区块链地址和一个二维码的 Base64 字符串，商户可将其展示给用户进行支付。

#### 示例 3：轮询查询订单状态与处理 Webhook
此示例模拟商户服务器在发起支付后，轮询查询订单状态，并配置一个模拟的 Webhook 端点来接收支付回调。

```typescript
// 文件名：poll-and-webhook.ts
import axios from 'axios';
import express from 'express';

const API_BASE_URL = 'http://localhost:3000/api';
const MERCHANT_PORT = 4000; // 商户模拟服务器的端口

// --- 第一部分：模拟商户的 Webhook 端点 ---
const app = express();
app.use(express.json());

app.post('/merchant/webhook', (req, res) => {
  console.log('[Webhook 收到通知]');
  console.log('订单 ID:', req.body.orderId);
  console.log('支付状态:', req.body.status);
  console.log('交易哈希:', req.body.txHash);
  // 在实际业务中，此处应更新自己数据库的订单状态
  res.status(200).send({ received: true });
});

app.listen(MERCHANT_PORT, () => {
  console.log(`商户模拟服务器运行在 http://localhost:${MERCHANT_PORT}`);
});

// --- 第二部分：轮询查询支付状态 ---
async function pollPaymentStatus(paymentId: string, maxAttempts = 10) {
  for (let i = 1; i <= maxAttempts; i++) {
    console.log(`第 ${i} 次查询订单 ${paymentId}...`);
    try {
      const response = await axios.get(`${API_BASE_URL}/payments/${paymentId}`);
      const status = response.data.status;
      
      if (status === 'completed') {
        console.log(`订单 ${paymentId} 支付成功！`);
        return;
      } else if (status === 'expired' || status === 'failed') {
        console.log(`订单 ${paymentId} 状态为 ${status}，支付未完成。`);
        return;
      }
      // 如果状态是 pending，等待 3 秒后继续查询
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      console.error('查询失败：', error.message);
      break;
    }
  }
  console.log(`轮询结束，订单 ${paymentId} 可能仍在处理中。`);
}

// 假设这是之前创建的支付订单ID
const testPaymentId = 'pay_abc123xyz';
// 开始轮询
pollPaymentStatus(testPaymentId);
```
**运行效果说明**：此示例启动了一个简易的 Express 服务器来接收支付成功的回调（Webhook）。同时，它会每隔 3 秒查询一次指定订单的状态，直到订单完成、失败或达到最大查询次数。这模拟了商户后端主动查询和被动接收通知两种典型的订单状态同步方式。

#### 示例 4：使用工厂创建支付网关并执行支付
此示例展示如何直接使用项目内部的支付网关工厂和接口，以编程方式创建特定网关并执行支付逻辑。

```typescript
// 文件名：use-gateway-factory.ts
import { GatewayFactory } from './payment/providers/gateway.factory';
import { PaymentRequest } from './payment/payment.interface'; // 假设有此类型定义

async function processPaymentWithGateway() {
  // 1. 定义支付请求参数
  const paymentRequest: PaymentRequest = {
    gatewayType: 'wechat', // 指定使用微信支付网关
    amount: '100.00',
    currency: 'CNY',
    orderId: 'WX_ORDER_20231001',
    description: '测试商品',
    userIp: '127.0.0.1'
  };

  // 2. 通过工厂获取对应的支付网关实例
  const paymentGateway = GatewayFactory.createGateway(paymentRequest.gatewayType);
  
  // 3. 调用网关的创建支付方法
  const createResult = await paymentGateway.createPayment(paymentRequest);
  console.log('网关返回的支付信息：', createResult);
  
  // 4. 模拟支付成功后，调用网关的验证方法（例如验证微信回调的签名）
  const mockCallbackData = {
    // 这里是模拟的微信支付回调数据
    transaction_id: '1217752501201407033233368018',
    out_trade_no: paymentRequest.orderId,
    total_fee: 10000,
    // ... 其他字段
  };
  const isValid = await paymentGateway.verifyPayment(mockCallbackData);
  console.log('支付回调验证结果：', isValid);
}

// 执行支付处理
processPaymentWithGateway().catch(console.error);
```
**运行效果说明**：此示例跳过了 HTTP API 层，直接调用核心的网关工厂和业务逻辑。它首先创建了一个微信支付网关实例，然后模拟了创建支付订单和验证支付回调两个关键步骤，展示了支付流程的内部实现片段。