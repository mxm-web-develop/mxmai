import type { IPaymentRepository, PaymentOrder } from '@mxmai/mxmdata';
import {
  CreatePaymentDto,
  PaymentOrderDto,
  ConfirmPaymentDto,
  QueryPaymentDto,
  PaymentStatus,
  PaymentMethod,
  PaymentChannel,
} from '../common/dto/payment.dto';
import { PaginationDto } from '../common/dto/common.dto';
import { GatewayFactory } from './providers/gateway.factory';
import { QrService } from '../common/qr.service';
import { env } from '../config/env';
import { WalletTaskService } from '../wallet/wallet-task.service';

export class PaymentService {
  private paymentRepo: IPaymentRepository;
  private gatewayFactory: GatewayFactory;
  private qrService: QrService;
  private walletTaskService?: WalletTaskService;

  constructor(paymentRepo: IPaymentRepository, walletTaskService?: WalletTaskService) {
    this.paymentRepo = paymentRepo;
    this.gatewayFactory = new GatewayFactory();
    this.qrService = new QrService();
    this.walletTaskService = walletTaskService;
  }

  async createPayment(
    createPaymentDto: CreatePaymentDto,
  ): Promise<PaymentOrderDto> {
    const orderId = createPaymentDto.orderId || `PAY${Date.now()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + env.payment.expireMinutes * 60 * 1000);
    console.log(`[PaymentService] 创建订单 ${orderId}: now=${now.toISOString()}, expiresAt=${expiresAt.toISOString()}, expireMinutes=${env.payment.expireMinutes}`);
    
    // 对于 crypto 渠道，从环境变量获取收款地址，忽略用户传入的 toAddress
    // 对于 voucher 渠道，不需要 toAddress，直接从钱包扣除
    // 对于其他渠道，使用用户传入的 toAddress
    let actualToAddress = createPaymentDto.toAddress || '';
    if (createPaymentDto.channel === 'crypto') {
      // crypto 渠道必须提供 assetCode
      if (!createPaymentDto.assetCode) {
        throw new Error('crypto 渠道必须提供 asset_code (USDT-ERC20 或 USDT-TRC20)');
      }
      const cryptoWallets = env.receivers.crypto;
      if (createPaymentDto.assetCode === 'USDT-ERC20') {
        actualToAddress = cryptoWallets?.eth?.erc20?.usdt || process.env.CRYPTO_ERC20_USDT_ADDRESS || '';
      } else if (createPaymentDto.assetCode === 'USDT-TRC20') {
        actualToAddress = cryptoWallets?.tron?.trc20?.usdt || process.env.CRYPTO_TRC20_USDT_ADDRESS || '';
      }
      if (!actualToAddress) {
        throw new Error(`未配置 ${createPaymentDto.assetCode} 收款地址，请在环境变量中设置 CRYPTO_ERC20_USDT_ADDRESS 或 CRYPTO_TRC20_USDT_ADDRESS`);
      }
    } else if (createPaymentDto.channel === 'voucher') {
      // 代金券渠道必须提供 assetCode（如 VOUCHER-CNY, VOUCHER-USD）
      if (!createPaymentDto.assetCode) {
        throw new Error('voucher 渠道必须提供 asset_code (VOUCHER-CNY 或 VOUCHER-USD)');
      }
      if (!createPaymentDto.userId) {
        throw new Error('voucher 渠道必须提供 userId');
      }
      // 代金券支付直接从钱包扣除，不需要外部支付流程
      // 这里先创建订单，然后在后面直接处理支付
    } else if (createPaymentDto.channel === 'apple_iap') {
      // Apple IAP 必须提供 assetCode（如 CNY, CREDITS）和 userId
      if (!createPaymentDto.assetCode) {
        throw new Error('apple_iap 渠道必须提供 asset_code (如 CNY, CREDITS)');
      }
      if (!createPaymentDto.userId) {
        throw new Error('apple_iap 渠道必须提供 userId');
      }
      // IAP 由客户端完成 StoreKit 购买后调用 iap/verify 入账
    }

    // 确定 order_type
    const orderType = createPaymentDto.bizType === 'subscription' ? 'subscription' :
                     createPaymentDto.bizType === 'token_purchase' ? 'purchase' : 'recharge';

    // 创建支付订单（order_no 需与 orderId 一致，供 iap/verify 等查找）
    const paymentOrder = await this.paymentRepo.createOrder({
      ...({ order_no: orderId } as any),
      user_id: createPaymentDto.userId || '',
      order_type: orderType,
      amount: createPaymentDto.amount,
      currency: createPaymentDto.currency,
      payment_channel: createPaymentDto.channel,
      payment_method: createPaymentDto.currency,
      expires_at: expiresAt,
      description: createPaymentDto.description,
      metadata: {
        order_no: orderId,
        to_address: actualToAddress,
        asset_code: createPaymentDto.assetCode,
        biz_type: createPaymentDto.bizType,
        biz_id: createPaymentDto.bizId,
      },
    });

    // 调用对应网关创建订单
    try {
      const gateway = this.gatewayFactory.get(createPaymentDto.channel);
      const gatewayResult = await gateway.create({
        orderId: orderId,
        amount: createPaymentDto.amount,
        currency: createPaymentDto.currency,
        description: createPaymentDto.description ?? undefined,
        metadata: {
          assetCode: createPaymentDto.assetCode,
          userId: createPaymentDto.userId,
          bizType: createPaymentDto.bizType,
          bizId: createPaymentDto.bizId,
        },
      });
      
      // 确保 toAddress 使用实际的收款地址（从网关返回）
      let finalToAddress = actualToAddress;
      if (createPaymentDto.channel === 'crypto' && gatewayResult.raw?.receiveAddress) {
        finalToAddress = gatewayResult.raw.receiveAddress;
      }
      
      const payLink = gatewayResult.paymentUrl || gatewayResult.qrCodeUrl || '';
      const qr = payLink ? await this.qrService.generateDataUrl(payLink) : undefined;
      
      // 更新订单信息
      let updated = await this.paymentRepo.updateOrder(paymentOrder.id, {
        payment_url: payLink,
        qr_code_data_url: qr || undefined,
        payment_params: {
          to_address: finalToAddress,
          ...gatewayResult.raw,
        },
      });

      // 如果是代金券渠道
      if (createPaymentDto.channel === 'voucher' && this.walletTaskService) {
        // 判断是发放（充值）还是使用（支付）
        const isIssue = createPaymentDto.bizType === 'voucher_issue' || createPaymentDto.bizType === 'promotion';
        
        try {
          if (isIssue) {
            // 代金券发放：充值到用户钱包
            await this.walletTaskService.createDepositTaskAndApply({
              userId: createPaymentDto.userId!,
              assetCode: createPaymentDto.assetCode!,
              amount: createPaymentDto.amount.toString(),
              channel: 'voucher',
              bizType: createPaymentDto.bizType || 'voucher_issue',
              bizId: createPaymentDto.bizId || orderId,
              paymentId: paymentOrder.id,
              metadata: {
                orderId: orderId,
                description: createPaymentDto.description,
                issuedBy: 'admin',
              },
            });

            // 更新订单状态为成功
            updated = await this.paymentRepo.updateOrder(paymentOrder.id, {
              status: 'paid',
              paid_at: new Date(),
            });

            console.log(`✅ 代金券发放成功: 订单 ${orderId}, 用户 ${createPaymentDto.userId}, 金额 ${createPaymentDto.amount} ${createPaymentDto.assetCode}`);
          } else {
            // 代金券使用：从钱包扣除
            await this.walletTaskService.createPaymentTaskAndApply({
              userId: createPaymentDto.userId!,
              assetCode: createPaymentDto.assetCode!,
              amount: createPaymentDto.amount.toString(),
              channel: 'voucher',
              bizType: createPaymentDto.bizType,
              bizId: createPaymentDto.bizId,
              paymentId: paymentOrder.id,
              metadata: {
                orderId: orderId,
                description: createPaymentDto.description,
              },
            });

            // 更新订单状态为成功
            updated = await this.paymentRepo.updateOrder(paymentOrder.id, {
              status: 'paid',
              paid_at: new Date(),
            });

            console.log(`✅ 代金券支付成功: 订单 ${orderId}, 用户 ${createPaymentDto.userId}, 金额 ${createPaymentDto.amount} ${createPaymentDto.assetCode}`);
          }
        } catch (error: any) {
          // 钱包操作失败，更新订单状态为失败
          updated = await this.paymentRepo.updateOrder(paymentOrder.id, {
            status: 'failed',
          });
          const action = isIssue ? '发放' : '支付';
          console.error(`❌ 代金券${action}失败: 订单 ${orderId}, 错误: ${error.message}`);
          throw new Error(`代金券${action}失败: ${error.message}`);
        }
      }

      return await this.mapToDto(updated, orderId, finalToAddress);
    } catch (e: any) {
      // 网关创建失败不影响本地记录创建，可根据需要回滚或标记失败
      console.error('网关创建订单失败:', e.message);
      return await this.mapToDto(paymentOrder, orderId, actualToAddress);
    }
  }

  async getPaymentOrder(orderIdOrId: string): Promise<PaymentOrderDto> {
    // 尝试先通过 id (UUID) 查找，如果没找到则通过 order_no 查找
    let payment = await this.paymentRepo.findOrderById(orderIdOrId);
    if (!payment) {
      payment = await this.paymentRepo.findOrderByOrderNo(orderIdOrId);
    }
    if (!payment) {
      throw new Error(`订单 ${orderIdOrId} 不存在`);
    }
    return await this.mapToDto(payment);
  }

  async getPaymentOrders(
    query: QueryPaymentDto,
    pagination: PaginationDto,
    userId?: string,
  ): Promise<{
    items: PaymentOrderDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = pagination.page || 1;
    const limit = pagination.limit || 10;

    // 如果提供了 userId，只查询该用户的订单
    if (userId) {
      const { orders, total } = await this.paymentRepo.findOrdersByUserId(userId, {
        status: query.status,
        orderType: query.orderId ? undefined : undefined,
        limit,
        offset: (page - 1) * limit,
      });

      return {
        items: await Promise.all(orders.map((o) => this.mapToDto(o))),
        total,
        page,
        limit,
      };
    }

    // 如果没有 userId，查询所有订单（需要 admin 权限，由中间件控制）
    // 注意：这里使用空字符串作为 userId，实际上会查询所有订单
    // 更好的方式是扩展 IPaymentRepository 接口，但为了快速实现，暂时这样处理
    const { orders, total } = await this.paymentRepo.findOrdersByUserId('', {
      status: query.status,
      orderType: query.orderId ? undefined : undefined,
      limit,
      offset: (page - 1) * limit,
    });

    return {
      items: await Promise.all(orders.map((o) => this.mapToDto(o))),
      total,
      page,
      limit,
    };
  }

  /**
   * 管理员：查询所有订单（不限制用户，但可选择性筛选特定用户）
   */
  async getAllPaymentOrders(
    query: QueryPaymentDto & { userId?: string },
    pagination: PaginationDto,
  ): Promise<{
    items: PaymentOrderDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    // 如果提供了 userId，查询该用户的订单；否则查询所有订单
    const userId = query.userId || '';
    return this.getPaymentOrders(query, pagination, userId);
  }

  async confirmPayment(
    confirmPaymentDto: ConfirmPaymentDto,
  ): Promise<PaymentOrderDto> {
    const payment = await this.paymentRepo.findOrderByOrderNo(confirmPaymentDto.orderId);
    if (!payment) {
      throw new Error(`订单 ${confirmPaymentDto.orderId} 不存在`);
    }
    
    const expiresAt = typeof payment.expires_at === 'string' ? new Date(payment.expires_at) : payment.expires_at;
    if (expiresAt && expiresAt.getTime() < Date.now()) {
      await this.paymentRepo.updateOrder(payment.id, { status: 'expired' });
      throw new Error('订单已过期');
    }
    
    if (payment.status !== 'pending') {
      throw new Error(
        `订单状态为 ${payment.status}，无法确认支付`,
      );
    }
    
    const updated = await this.paymentRepo.updateOrder(payment.id, {
      status: 'paid',
      third_party_transaction_id: confirmPaymentDto.txHash,
      paid_at: new Date(),
      callback_data: {
        txHash: confirmPaymentDto.txHash,
        blockNumber: confirmPaymentDto.blockNumber,
      },
    });
    
    return await this.mapToDto(updated);
  }

  async cancelPayment(orderId: string): Promise<PaymentOrderDto> {
    const payment = await this.paymentRepo.findOrderByOrderNo(orderId);
    if (!payment) {
      throw new Error(`订单 ${orderId} 不存在`);
    }
    
    if (payment.status !== 'pending') {
      throw new Error(`订单状态为 ${payment.status}，无法取消`);
    }
    
    const updated = await this.paymentRepo.updateOrder(payment.id, {
      status: 'cancelled',
    });
    
    return await this.mapToDto(updated);
  }

  async getPaymentStats(userId?: string): Promise<{
    totalAmount: number;
    totalOrders: number;
    successOrders: number;
    failedOrders: number;
    pendingOrders: number;
    expiredOrders: number;
  }> {
    // 查询所有订单（如果提供了 userId，只查询该用户的订单）
    const { orders } = await this.paymentRepo.findOrdersByUserId(userId || '', {
      limit: 10000, // 获取足够多的订单用于统计
    });

    // 计算统计数据
    let totalAmount = 0;
    let totalOrders = orders.length;
    let successOrders = 0;
    let failedOrders = 0;
    let pendingOrders = 0;
    let expiredOrders = 0;

    for (const order of orders) {
      // 累加总金额（只统计成功支付的订单）
      if (order.status === 'paid' || order.status === 'success') {
        totalAmount += Number(order.amount);
        successOrders++;
      } else if (order.status === 'failed' || order.status === 'cancelled') {
        failedOrders++;
      } else if (order.status === 'pending' || order.status === 'processing') {
        pendingOrders++;
      } else if (order.status === 'expired') {
        expiredOrders++;
      }
    }

    return {
      totalAmount: Number(totalAmount.toFixed(2)),
      totalOrders,
      successOrders,
      failedOrders,
      pendingOrders,
      expiredOrders,
    };
  }

  async markPaymentSuccess(
    orderId: string,
    txHash?: string,
    blockNumber?: number,
    extra?: Record<string, any>,
  ): Promise<PaymentOrderDto> {
    const payment = await this.paymentRepo.findOrderByOrderNo(orderId);
    if (!payment) {
      throw new Error(`订单 ${orderId} 不存在`);
    }

    const updateData: any = {
      status: 'paid',
      paid_at: new Date(),
    };

    if (txHash) {
      updateData.third_party_transaction_id = txHash;
    }

    if (extra) {
      updateData.callback_data = {
        ...(payment.callback_data || {}),
        ...extra,
        txHash,
        blockNumber,
      };
    }

    const updated = await this.paymentRepo.updateOrder(payment.id, updateData);

    // 如果是充值订单，触发钱包入账
    if (this.walletTaskService && payment.order_type === 'recharge' && payment.user_id) {
      const assetCode = (payment.metadata as any)?.asset_code || payment.payment_method;
      if (assetCode) {
        try {
          await this.walletTaskService.createDepositTaskAndApply({
            userId: payment.user_id,
            paymentId: payment.id,
            assetCode,
            amount: String(payment.amount),
            channel: payment.payment_channel,
            metadata: {
              orderId: payment.order_no,
              txHash,
              blockNumber,
              ...extra,
            },
          });
        } catch (e: any) {
          console.error('创建充值任务失败:', e.message);
        }
      }
    }

    return await this.mapToDto(updated);
  }

  /**
   * Apple IAP 收据校验与入账
   * 客户端完成 StoreKit 购买后调用此接口
   * TODO: 接入 Apple verifyReceipt API 进行真实校验
   */
  async verifyIapReceipt(
    orderId: string,
    receipt: string,
    productId?: string,
  ): Promise<PaymentOrderDto> {
    const payment = await this.paymentRepo.findOrderByOrderNo(orderId);
    if (!payment) {
      throw new Error(`订单 ${orderId} 不存在`);
    }
    if (payment.payment_channel !== 'apple_iap') {
      throw new Error(`订单 ${orderId} 不是 Apple IAP 订单`);
    }
    if (payment.status === 'paid') {
      return await this.mapToDto(payment);
    }
    if (payment.status !== 'pending') {
      throw new Error(`订单 ${orderId} 状态为 ${payment.status}，无法完成校验`);
    }

    // TODO: 调用 Apple 服务器校验收据 (verifyReceipt)
    // 当前为占位实现，后续需接入 https://buy.itunes.apple.com/verifyReceipt
    if (!receipt || receipt.trim().length === 0) {
      throw new Error('receipt 不能为空');
    }

    return await this.markPaymentSuccess(orderId, undefined, undefined, {
      receipt: receipt.substring(0, 100) + '...',
      productId,
      channel: 'apple_iap',
    });
  }

  /**
   * 将 PaymentOrder (mxmdata) 映射为 PaymentOrderDto (mxmpay)
   * 在映射时检查订单是否已过期，如果过期则更新状态
   */
  private async mapToDto(order: PaymentOrder, orderNo?: string, toAddress?: string): Promise<PaymentOrderDto> {
    const metadata = order.metadata || {};
    const paymentParams = order.payment_params || {};
    
    // 检查订单是否已过期（仅对 pending 状态的订单进行检查）
    let finalStatus = order.status as PaymentStatus;
    if (order.status === 'pending') {
      // 处理时间字符串，确保正确解析 UTC 时间
      let expiresAt: Date | null = null;
      if (order.expires_at) {
        if (typeof order.expires_at === 'string') {
          // 如果字符串没有时区信息（没有 Z 或 +/-），假设它是 UTC 时间
          const timeStr = order.expires_at.trim();
          // 检查是否已经有完整的时区信息
          if (!timeStr.endsWith('Z') && !timeStr.match(/[+-]\d{2}:\d{2}$/)) {
            // 没有时区信息，添加 Z 表示 UTC
            // 注意：PostgreSQL TIMESTAMP 类型存储的是 UTC 时间，但返回时可能没有 Z 后缀
            expiresAt = new Date(timeStr + 'Z');
            console.log(`[PaymentService] 时间字符串无时区信息，添加Z: ${timeStr} -> ${timeStr}Z`);
          } else {
            expiresAt = new Date(timeStr);
          }
        } else {
          expiresAt = order.expires_at;
        }
      }
      
      const now = Date.now();
      const expiresAtTime = expiresAt ? expiresAt.getTime() : 0;
      
      // 添加容错：如果时间差小于 10 秒，认为是时间解析问题或时钟偏差，不标记为过期
      // 这样可以避免因为时区解析问题导致的误判
      const timeDiff = now - expiresAtTime;
      if (expiresAt && expiresAtTime < now && timeDiff > 10000) {
        // 只有时间差大于 10 秒才认为是真正过期
        console.log(`[PaymentService] 订单 ${order.order_no || order.id} 已过期: expiresAt=${expiresAt.toISOString()}, now=${new Date(now).toISOString()}, diff=${(timeDiff / 1000 / 60).toFixed(2)}分钟`);
        // 异步更新订单状态为过期（不等待完成，避免阻塞查询）
        this.paymentRepo.updateOrder(order.id, { status: 'expired' }).catch((err) => {
          console.error(`更新订单 ${order.id} 过期状态失败:`, err);
        });
        finalStatus = PaymentStatus.EXPIRED;
      } else if (expiresAt) {
        const remainingMinutes = (expiresAtTime - now) / 1000 / 60;
        if (remainingMinutes < 0 && timeDiff <= 10000) {
          // 时间差在容错范围内（小于 10 秒），可能是时间解析问题，不标记为过期
          console.log(`[PaymentService] 订单 ${order.order_no || order.id} 时间差在容错范围内，不标记为过期: expiresAt=${expiresAt.toISOString()}, now=${new Date(now).toISOString()}, diff=${(timeDiff / 1000).toFixed(2)}秒`);
        } else {
          console.log(`[PaymentService] 订单 ${order.order_no || order.id} 未过期: expiresAt=${expiresAt.toISOString()}, now=${new Date(now).toISOString()}, 剩余=${remainingMinutes.toFixed(2)}分钟`);
        }
      }
    }
    
    return {
      id: order.id,
      amount: order.amount,
      currency: order.payment_method as PaymentMethod || order.currency as PaymentMethod,
      channel: order.payment_channel as PaymentChannel,
      toAddress: toAddress || paymentParams.to_address || metadata.to_address || '',
      status: finalStatus,
      description: order.description || '',
      orderId: orderNo || order.order_no,
      createdAt: typeof order.created_at === 'string' ? order.created_at : order.created_at.toISOString(),
      updatedAt: typeof order.updated_at === 'string' ? order.updated_at : order.updated_at.toISOString(),
      expiresAt: typeof order.expires_at === 'string' ? order.expires_at : order.expires_at.toISOString(),
      paymentUrl: order.payment_url,
      qrCodeDataUrl: order.qr_code_data_url,
      userId: order.user_id,
      assetCode: metadata.asset_code || paymentParams.asset_code,
      bizType: metadata.biz_type,
      bizId: metadata.biz_id,
      extra: order.callback_data ? JSON.stringify(order.callback_data) : undefined,
    };
  }
}
