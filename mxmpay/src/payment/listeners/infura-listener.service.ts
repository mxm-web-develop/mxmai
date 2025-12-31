/**
 * Infura 区块链监听服务
 * 使用 Infura 的 Webhook 功能监听 Ethereum (ERC20-USDT) 转账事件
 * 
 * 注意：Infura 只支持 Ethereum，Tron 需要配合本地监听或 TronGrid
 */

import axios from 'axios';
import { env } from '../../config/env';
import { IBlockchainListener } from './listener.interface';
import { PaymentService } from '../payment.service';

// USDT 标准合约地址
const USDT_ERC20_CONTRACT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

interface PaymentOrder {
  id: string;
  orderId: string;
  userId: string;
  assetCode: string;
  amount: string;
  toAddress: string;
}

export class InfuraListenerService implements IBlockchainListener {
  private isRunning = false;
  private webhookUrl: string;
  private receiveAddresses: {
    erc20: string;
    trc20: string;
  };
  private infuraProjectId: string;
  private infuraProjectSecret: string;
  private infuraWebhookId: string | null = null;
  private paymentService?: PaymentService;

  constructor(paymentService?: PaymentService) {
    this.paymentService = paymentService;
    this.infuraProjectId = process.env.INFURA_PROJECT_ID || '';
    this.infuraProjectSecret = process.env.INFURA_PROJECT_SECRET || '';
    this.webhookUrl = process.env.WEBHOOK_URL || 'http://localhost:3001/payment/webhook/crypto';

    // 获取收款地址
    const cryptoWallets = env.receivers.crypto;
    this.receiveAddresses = {
      erc20: cryptoWallets?.eth?.erc20?.usdt || process.env.CRYPTO_ERC20_USDT_ADDRESS || '',
      trc20: cryptoWallets?.tron?.trc20?.usdt || process.env.CRYPTO_TRC20_USDT_ADDRESS || '',
    };

    if (!this.infuraProjectId) {
      throw new Error('INFURA_PROJECT_ID 环境变量未配置');
    }

    if (!this.receiveAddresses.erc20) {
      throw new Error('CRYPTO_ERC20_USDT_ADDRESS 环境变量未配置');
    }
  }

  /**
   * 启动监听服务
   * 创建或更新 Infura Webhook
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('Infura 监听服务已在运行');
      return;
    }

    console.log('🚀 启动 Infura 监听服务...');

    try {
      // 检查是否已有 Webhook
      const existingWebhooks = await this.listWebhooks();
      
      // 查找是否已有针对我们收款地址的 Webhook
      const existingWebhook = existingWebhooks.find((wh: any) => 
        wh.url === this.webhookUrl && 
        wh.addresses?.includes(this.receiveAddresses.erc20.toLowerCase())
      );

      if (existingWebhook) {
        this.infuraWebhookId = existingWebhook.id;
        console.log(`✅ 使用现有 Webhook: ${this.infuraWebhookId}`);
      } else {
        // 创建新的 Webhook
        this.infuraWebhookId = await this.createWebhook();
        console.log(`✅ 创建新 Webhook: ${this.infuraWebhookId}`);
      }

      this.isRunning = true;
      console.log('✅ Infura 监听服务已启动');
    } catch (error: any) {
      console.error('❌ Infura 监听服务启动失败:', error.message);
      throw error;
    }
  }

  /**
   * 停止监听服务
   */
  stop(): void {
    this.isRunning = false;
    console.log('🛑 停止 Infura 监听服务');
    // 注意：不删除 Webhook，以便后续继续使用
  }

  /**
   * 检查服务是否运行中
   */
  isRunning(): boolean {
    return this.isRunning;
  }

  /**
   * 创建 Infura Webhook
   */
  private async createWebhook(): Promise<string> {
    const url = `https://api.infura.io/v3/webhooks`;
    
    const auth = Buffer.from(`${this.infuraProjectId}:${this.infuraProjectSecret}`).toString('base64');

    const payload = {
      type: 'addressActivity',
      url: this.webhookUrl,
      addresses: [this.receiveAddresses.erc20.toLowerCase()],
      network: 'mainnet',
    };

    try {
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`,
        },
      });

      return response.data.data.id;
    } catch (error: any) {
      throw new Error(`创建 Infura Webhook 失败: ${error.message}`);
    }
  }

  /**
   * 列出所有 Webhook
   */
  private async listWebhooks(): Promise<any[]> {
    const url = `https://api.infura.io/v3/webhooks`;
    const auth = Buffer.from(`${this.infuraProjectId}:${this.infuraProjectSecret}`).toString('base64');

    try {
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Basic ${auth}`,
        },
      });
      return response.data.data || [];
    } catch (error: any) {
      console.error('列出 Infura Webhook 失败:', error.message);
      return [];
    }
  }

  /**
   * 处理 Infura Webhook 回调
   * 这个方法应该被 webhook 路由调用
   */
  async handleWebhook(body: any): Promise<void> {
    // Infura Webhook 格式：
    // {
    //   id: string,
    //   type: 'addressActivity',
    //   data: {
    //     activity: [{
    //       from: string,
    //       to: string,
    //       value: string,
    //       contractAddress: string,
    //       transactionHash: string,
    //       blockNumber: string,
    //       ...
    //     }]
    //   }
    // }

    if (body.type !== 'addressActivity') {
      return;
    }

    const activities = body.data?.activity || [];
    
    for (const activity of activities) {
      // 只处理 ERC20 代币转账
      if (!activity.contractAddress || 
          activity.contractAddress.toLowerCase() !== USDT_ERC20_CONTRACT.toLowerCase()) {
        continue;
      }

      // 检查是否发送到我们的收款地址
      if (activity.to?.toLowerCase() !== this.receiveAddresses.erc20.toLowerCase()) {
        continue;
      }

      const amount = activity.value || '0';
      const amountInUSDT = Number(amount) / 1e6;

      console.log(`💰 Infura 检测到 ERC20-USDT 转账: ${activity.from} -> ${activity.to}, 金额: ${amountInUSDT} USDT`);

      // 查找对应的支付订单
      const order = await this.findPaymentOrder(this.receiveAddresses.erc20, amountInUSDT.toString());

      if (order) {
        // 如果有 paymentService，直接调用 markPaymentSuccess
        if (this.paymentService) {
          try {
            await this.paymentService.markPaymentSuccess(order.id, {
              txHash: activity.transactionHash,
              blockNumber: parseInt(activity.blockNumber, 10),
              fromAddress: activity.from,
              toAddress: activity.to,
              amount: amount,
              contractAddress: USDT_ERC20_CONTRACT,
              assetCode: 'USDT-ERC20',
            });
            console.log(`✅ 支付订单已更新: ${order.orderId}`);
          } catch (error: any) {
            console.error(`❌ 更新支付订单失败: ${error.message}`);
          }
        } else {
          // 否则发送 webhook
          await this.sendWebhook({
            orderId: order.orderId,
            txHash: activity.transactionHash,
            blockNumber: parseInt(activity.blockNumber, 10),
            fromAddress: activity.from,
            toAddress: activity.to,
            amount: amount,
            contractAddress: USDT_ERC20_CONTRACT,
            assetCode: 'USDT-ERC20',
          });
        }
      } else {
        console.warn(`⚠️  未找到对应的支付订单: ${activity.to}, ${amountInUSDT} USDT`);
      }
    }
  }

  /**
   * 查找支付订单
   */
  private async findPaymentOrder(toAddress: string, amount: string): Promise<PaymentOrder | null> {
    try {
      const apiUrl = process.env.MXMPAY_API_URL || 'http://localhost:3001';
      const response = await axios.get(`${apiUrl}/payment`, {
        params: {
          status: 'pending',
          channel: 'crypto',
        },
        timeout: 5000,
      });

      if (response.data && response.data.data && response.data.data.items) {
        const orders = response.data.data.items;
        
        const targetAmount = parseFloat(amount);
        const tolerance = 0.01;

        for (const order of orders) {
          if (order.toAddress && order.toAddress.toLowerCase() === toAddress.toLowerCase()) {
            const orderAmount = parseFloat(order.amount);
            const diff = Math.abs(orderAmount - targetAmount) / targetAmount;
            
            if (diff <= tolerance) {
              return {
                id: order.id,
                orderId: order.orderId,
                userId: order.userId || '',
                assetCode: order.assetCode || '',
                amount: order.amount,
                toAddress: order.toAddress,
              };
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.error('查询支付订单失败:', error);
      return null;
    }
  }

  /**
   * 发送 Webhook 通知
   */
  private async sendWebhook(data: {
    orderId: string;
    txHash: string;
    blockNumber: number;
    fromAddress: string;
    toAddress: string;
    amount: string;
    contractAddress: string;
    assetCode: string;
  }): Promise<void> {
    try {
      const response = await axios.post(this.webhookUrl, data, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      console.log(`✅ Webhook 发送成功: ${data.orderId}, txHash: ${data.txHash}`);
    } catch (error: any) {
      console.error(`❌ Webhook 发送失败: ${error.message}`, error.response?.data);
    }
  }
}

