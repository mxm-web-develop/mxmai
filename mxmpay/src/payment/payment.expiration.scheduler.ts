import * as cron from 'node-cron';
import type { IPaymentRepository } from '@mxmai/mxmdata';
import { PaymentStatus } from '../common/dto/payment.dto';

export class PaymentExpirationScheduler {
  private task: cron.ScheduledTask | null = null;
  private paymentRepo: IPaymentRepository;

  constructor(paymentRepo: IPaymentRepository) {
    this.paymentRepo = paymentRepo;
  }

  start(): void {
    // 每分钟执行一次
    this.task = cron.schedule('* * * * *', async () => {
      try {
        await this.sweepExpired();
      } catch (error) {
        console.error('定时任务执行失败:', error);
      }
    });
    console.log('✅ 支付过期检查定时任务已启动');
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('⏹️ 支付过期检查定时任务已停止');
    }
  }

  private async sweepExpired(): Promise<number> {
    const now = new Date();
    // 查询所有待支付的订单
    const { orders } = await this.paymentRepo.findOrdersByUserId('', {
      status: 'pending',
      limit: 1000, // 限制每次处理的数量
    });

    // 过滤出已过期的订单
    const toExpire = orders.filter((order) => {
      // 处理时间字符串，确保正确解析 UTC 时间
      let expiresAt: Date | null = null;
      if (order.expires_at) {
        if (typeof order.expires_at === 'string') {
          // 如果字符串没有时区信息（没有 Z 或 +/-），假设它是 UTC 时间
          const timeStr = order.expires_at.trim();
          if (!timeStr.endsWith('Z') && !timeStr.match(/[+-]\d{2}:\d{2}$/)) {
            // 没有时区信息，添加 Z 表示 UTC
            expiresAt = new Date(timeStr + 'Z');
          } else {
            expiresAt = new Date(timeStr);
          }
        } else {
          expiresAt = order.expires_at;
        }
      }
      
      if (!expiresAt) return false;
      
      // 添加容错：如果时间差小于 10 秒，认为是时间解析问题或时钟偏差，不标记为过期
      const timeDiff = now.getTime() - expiresAt.getTime();
      return timeDiff > 10000; // 只有时间差大于 10 秒才认为是真正过期
    });

    if (toExpire.length === 0) return 0;

    // 批量更新过期订单
    for (const order of toExpire) {
      try {
        await this.paymentRepo.updateOrder(order.id, { status: 'expired' });
        console.log(`⏰ 订单 ${order.order_no || order.id} 已标记为过期`);
      } catch (error) {
        console.error(`更新订单 ${order.id} 状态失败:`, error);
      }
    }

    console.log(`⏰ 过期订单数量: ${toExpire.length}`);
    return toExpire.length;
  }
}
