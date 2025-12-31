var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};

// src/index.ts
import "reflect-metadata";

// src/app.ts
import "reflect-metadata";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// src/database/data-source.ts
import { DataSource } from "typeorm";

// src/payment/payment.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";
var PaymentEntity = class {
};
__decorateClass([
  PrimaryGeneratedColumn("uuid")
], PaymentEntity.prototype, "id", 2);
__decorateClass([
  Column("decimal", { precision: 18, scale: 6 })
], PaymentEntity.prototype, "amount", 2);
__decorateClass([
  Column({ type: "varchar", length: 16 })
], PaymentEntity.prototype, "currency", 2);
__decorateClass([
  Column({ type: "varchar", length: 16 })
], PaymentEntity.prototype, "channel", 2);
__decorateClass([
  Column({ type: "varchar", length: 64 })
], PaymentEntity.prototype, "orderId", 2);
__decorateClass([
  Column({ type: "varchar", length: 64 })
], PaymentEntity.prototype, "toAddress", 2);
__decorateClass([
  Column({ type: "varchar", length: 32, default: "pending" /* PENDING */ })
], PaymentEntity.prototype, "status", 2);
__decorateClass([
  Column({ type: "varchar", length: 255, nullable: true })
], PaymentEntity.prototype, "description", 2);
__decorateClass([
  CreateDateColumn({ type: "timestamptz" })
], PaymentEntity.prototype, "createdAt", 2);
__decorateClass([
  UpdateDateColumn({ type: "timestamptz" })
], PaymentEntity.prototype, "updatedAt", 2);
__decorateClass([
  Column({ type: "timestamptz" })
], PaymentEntity.prototype, "expiresAt", 2);
__decorateClass([
  Column({ type: "text", nullable: true })
], PaymentEntity.prototype, "paymentUrl", 2);
__decorateClass([
  Column({ type: "text", nullable: true })
], PaymentEntity.prototype, "qrCodeDataUrl", 2);
PaymentEntity = __decorateClass([
  Entity("payments")
], PaymentEntity);

// src/wallet/asset.entity.ts
import { Column as Column4, CreateDateColumn as CreateDateColumn4, Entity as Entity4, OneToMany as OneToMany2, PrimaryColumn, UpdateDateColumn as UpdateDateColumn3 } from "typeorm";

// src/wallet/wallet.entity.ts
import {
  Column as Column3,
  CreateDateColumn as CreateDateColumn3,
  Entity as Entity3,
  JoinColumn as JoinColumn2,
  ManyToOne as ManyToOne2,
  OneToMany,
  PrimaryGeneratedColumn as PrimaryGeneratedColumn3,
  Unique,
  UpdateDateColumn as UpdateDateColumn2
} from "typeorm";

// src/wallet/wallet-transaction.entity.ts
import {
  Column as Column2,
  CreateDateColumn as CreateDateColumn2,
  Entity as Entity2,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn as PrimaryGeneratedColumn2
} from "typeorm";
var WalletTransactionEntity = class {
};
__decorateClass([
  PrimaryGeneratedColumn2("uuid")
], WalletTransactionEntity.prototype, "id", 2);
__decorateClass([
  Column2({ name: "wallet_id", type: "uuid" })
], WalletTransactionEntity.prototype, "walletId", 2);
__decorateClass([
  ManyToOne(() => WalletEntity, (wallet) => wallet.transactions),
  JoinColumn({ name: "wallet_id" })
], WalletTransactionEntity.prototype, "wallet", 2);
__decorateClass([
  Column2({ name: "asset_code", type: "varchar", length: 64 })
], WalletTransactionEntity.prototype, "assetCode", 2);
__decorateClass([
  Column2({ type: "varchar", length: 32 })
], WalletTransactionEntity.prototype, "type", 2);
__decorateClass([
  Column2({ type: "varchar", length: 16 })
], WalletTransactionEntity.prototype, "direction", 2);
__decorateClass([
  Column2({ type: "decimal", precision: 36, scale: 18 })
], WalletTransactionEntity.prototype, "amount", 2);
__decorateClass([
  Column2({ name: "balance_before", type: "decimal", precision: 36, scale: 18 })
], WalletTransactionEntity.prototype, "balanceBefore", 2);
__decorateClass([
  Column2({ name: "balance_after", type: "decimal", precision: 36, scale: 18 })
], WalletTransactionEntity.prototype, "balanceAfter", 2);
__decorateClass([
  Column2({ name: "reference_id", type: "varchar", length: 128, nullable: true })
], WalletTransactionEntity.prototype, "referenceId", 2);
__decorateClass([
  Column2({ name: "biz_tag", type: "varchar", length: 64, nullable: true })
], WalletTransactionEntity.prototype, "bizTag", 2);
__decorateClass([
  Column2({ type: "json", nullable: true })
], WalletTransactionEntity.prototype, "metadata", 2);
__decorateClass([
  CreateDateColumn2({ name: "created_at" })
], WalletTransactionEntity.prototype, "createdAt", 2);
WalletTransactionEntity = __decorateClass([
  Entity2("wallet_transactions")
], WalletTransactionEntity);

// src/wallet/wallet.entity.ts
var WalletEntity = class {
};
__decorateClass([
  PrimaryGeneratedColumn3("uuid")
], WalletEntity.prototype, "id", 2);
__decorateClass([
  Column3({ name: "user_id", type: "varchar", length: 64 })
], WalletEntity.prototype, "userId", 2);
__decorateClass([
  Column3({ name: "wallet_type", type: "varchar", length: 32, default: "primary" })
], WalletEntity.prototype, "walletType", 2);
__decorateClass([
  Column3({ name: "asset_code", type: "varchar", length: 64 })
], WalletEntity.prototype, "assetCode", 2);
__decorateClass([
  ManyToOne2(() => AssetEntity, (asset) => asset.wallets),
  JoinColumn2({ name: "asset_code", referencedColumnName: "assetCode" })
], WalletEntity.prototype, "asset", 2);
__decorateClass([
  Column3({ name: "available_balance", type: "decimal", precision: 36, scale: 18, default: 0 })
], WalletEntity.prototype, "availableBalance", 2);
__decorateClass([
  Column3({ name: "frozen_balance", type: "decimal", precision: 36, scale: 18, default: 0 })
], WalletEntity.prototype, "frozenBalance", 2);
__decorateClass([
  Column3({ type: "varchar", length: 20, default: "active" })
], WalletEntity.prototype, "status", 2);
__decorateClass([
  Column3({ type: "json", nullable: true })
], WalletEntity.prototype, "metadata", 2);
__decorateClass([
  CreateDateColumn3({ name: "created_at" })
], WalletEntity.prototype, "createdAt", 2);
__decorateClass([
  UpdateDateColumn2({ name: "updated_at" })
], WalletEntity.prototype, "updatedAt", 2);
__decorateClass([
  OneToMany(() => WalletTransactionEntity, (tx) => tx.wallet)
], WalletEntity.prototype, "transactions", 2);
WalletEntity = __decorateClass([
  Entity3("wallets"),
  Unique(["userId", "assetCode", "walletType"])
], WalletEntity);

// src/wallet/asset.entity.ts
var AssetEntity = class {
};
__decorateClass([
  PrimaryColumn({ name: "asset_code", type: "varchar", length: 64 })
], AssetEntity.prototype, "assetCode", 2);
__decorateClass([
  Column4({ name: "display_name", type: "varchar", length: 100 })
], AssetEntity.prototype, "displayName", 2);
__decorateClass([
  Column4({ type: "varchar", length: 20, default: "fiat" })
], AssetEntity.prototype, "type", 2);
__decorateClass([
  Column4({ type: "int", default: 2 })
], AssetEntity.prototype, "precision", 2);
__decorateClass([
  Column4({ type: "json", nullable: true })
], AssetEntity.prototype, "metadata", 2);
__decorateClass([
  Column4({ name: "is_active", type: "boolean", default: true })
], AssetEntity.prototype, "isActive", 2);
__decorateClass([
  CreateDateColumn4({ name: "created_at" })
], AssetEntity.prototype, "createdAt", 2);
__decorateClass([
  UpdateDateColumn3({ name: "updated_at" })
], AssetEntity.prototype, "updatedAt", 2);
__decorateClass([
  OneToMany2(() => WalletEntity, (wallet) => wallet.asset)
], AssetEntity.prototype, "wallets", 2);
AssetEntity = __decorateClass([
  Entity4("assets")
], AssetEntity);

// src/database/data-source.ts
var AppDataSource = new DataSource({
  type: "sqlite",
  database: process.env.SQLITE_DB_PATH || "mxmpay.sqlite",
  synchronize: true,
  entities: [PaymentEntity, AssetEntity, WalletEntity, WalletTransactionEntity],
  logging: process.env.NODE_ENV === "development"
});

// src/payment/payment.service.ts
import { Like } from "typeorm";

// src/payment/providers/alipay.gateway.ts
var AlipayGateway = class {
  constructor() {
    this.name = "alipay";
  }
  async create(params) {
    return {
      orderId: params.orderId,
      status: "pending",
      paymentUrl: `https://mapi.alipay.com/gateway.do?orderId=${encodeURIComponent(
        params.orderId
      )}`,
      raw: { mocked: true }
    };
  }
  async query(orderId) {
    return { orderId, status: "processing", raw: { mocked: true } };
  }
  async refund(params) {
    return { orderId: params.orderId, status: "success", raw: { mocked: true } };
  }
  async handleWebhook(headers, body3) {
    return { orderId: body3?.out_trade_no ?? "unknown", status: "success", raw: { headers, body: body3 } };
  }
};

// src/payment/providers/wechat.gateway.ts
var WechatGateway = class {
  constructor() {
    this.name = "wechat";
  }
  async create(params) {
    return {
      orderId: params.orderId,
      status: "pending",
      qrCodeUrl: `weixin://wxpay/bizpayurl?pr=${encodeURIComponent(params.orderId)}`,
      raw: { mocked: true }
    };
  }
  async query(orderId) {
    return { orderId, status: "processing", raw: { mocked: true } };
  }
  async refund(params) {
    return { orderId: params.orderId, status: "success", raw: { mocked: true } };
  }
  async handleWebhook(headers, body3) {
    return { orderId: body3?.out_trade_no ?? "unknown", status: "success", raw: { headers, body: body3 } };
  }
};

// src/payment/providers/paypal.gateway.ts
var PaypalGateway = class {
  constructor() {
    this.name = "paypal";
  }
  async create(params) {
    return {
      orderId: params.orderId,
      status: "pending",
      paymentUrl: `https://www.paypal.com/checkoutnow?token=${encodeURIComponent(
        params.orderId
      )}`,
      raw: { mocked: true }
    };
  }
  async query(orderId) {
    return { orderId, status: "processing", raw: { mocked: true } };
  }
  async refund(params) {
    return { orderId: params.orderId, status: "success", raw: { mocked: true } };
  }
  async handleWebhook(headers, body3) {
    return { orderId: body3?.resource?.id ?? "unknown", status: "success", raw: { headers, body: body3 } };
  }
};

// src/payment/providers/card.gateway.ts
var CardGateway = class {
  constructor() {
    this.name = "card";
  }
  async create(params) {
    return {
      orderId: params.orderId,
      status: "pending",
      clientSecret: `mock_client_secret_${params.orderId}`,
      raw: { mocked: true }
    };
  }
  async query(orderId) {
    return { orderId, status: "processing", raw: { mocked: true } };
  }
  async refund(params) {
    return { orderId: params.orderId, status: "success", raw: { mocked: true } };
  }
  async handleWebhook(headers, body3) {
    return { orderId: body3?.data?.object?.id ?? "unknown", status: "success", raw: { headers, body: body3 } };
  }
};

// src/payment/providers/crypto.gateway.ts
var CryptoGateway = class {
  constructor() {
    this.name = "crypto";
  }
  async create(params) {
    return {
      orderId: params.orderId,
      status: "pending",
      qrCodeUrl: `crypto:pay?orderId=${encodeURIComponent(params.orderId)}`,
      raw: { mocked: true }
    };
  }
  async query(orderId) {
    return { orderId, status: "processing", raw: { mocked: true } };
  }
  async refund(params) {
    return { orderId: params.orderId, status: "failed", raw: { mocked: true } };
  }
  async handleWebhook(headers, body3) {
    return { orderId: body3?.orderId ?? "unknown", status: "success", raw: { headers, body: body3 } };
  }
};

// src/payment/providers/gateway.factory.ts
var GatewayFactory = class {
  constructor() {
    this.gateways = {
      ["alipay" /* ALIPAY */]: new AlipayGateway(),
      ["wechat" /* WECHAT */]: new WechatGateway(),
      ["paypal" /* PAYPAL */]: new PaypalGateway(),
      ["card" /* CARD */]: new CardGateway(),
      ["crypto" /* CRYPTO */]: new CryptoGateway()
    };
  }
  get(channel) {
    const gw = this.gateways[channel];
    if (!gw) {
      throw new Error(`Unsupported payment channel: ${channel}`);
    }
    return gw;
  }
};

// src/common/qr.service.ts
import * as QRCode from "qrcode";
var QrService = class {
  async generateDataUrl(text, size = 256) {
    return await QRCode.toDataURL(text, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M"
    });
  }
};

// src/config/env.ts
function parseJSONSafe(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
var env = {
  port: Number(process.env.PORT ?? 3001),
  payment: {
    expireMinutes: Number(process.env.PAYMENT_EXPIRE_MINUTES || 20)
  },
  pg: {
    host: process.env.PG_HOST || "localhost",
    port: Number(process.env.PG_PORT || 5432),
    user: process.env.PG_USER || "postgres",
    password: process.env.PG_PASSWORD || "password",
    database: process.env.PG_DB || "postgres"
  },
  alipay: {
    appId: process.env.ALIPAY_APP_ID || "",
    privateKey: process.env.ALIPAY_PRIVATE_KEY || "",
    alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY || "",
    // 收款账户
    sellerId: process.env.ALIPAY_SELLER_ID || "",
    sellerLogonId: process.env.ALIPAY_SELLER_LOGON_ID || ""
  },
  wechat: {
    mchId: process.env.WECHAT_MCH_ID || "",
    certSerialNo: process.env.WECHAT_CERT_SERIAL_NO || "",
    apiV3Key: process.env.WECHAT_API_V3_KEY || "",
    // 收款账户（服务商/直连商户）
    receiverMchId: process.env.WECHAT_RECEIVER_MCH_ID || "",
    receiverAppId: process.env.WECHAT_RECEIVER_APPID || ""
  },
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID || "",
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || "",
    mode: process.env.PAYPAL_MODE || "sandbox",
    // 收款账户
    merchantId: process.env.PAYPAL_MERCHANT_ID || ""
  },
  card: {
    stripeKey: process.env.STRIPE_SECRET_KEY || "",
    // 收款账户（连接账户/标准账户）
    stripeAccountId: process.env.STRIPE_ACCOUNT_ID || ""
  },
  receivers: {
    // 多链钱包地址（JSON 优先，后备单变量）
    crypto: parseJSONSafe(process.env.CRYPTO_WALLETS, {
      eth: {
        native: process.env.CRYPTO_ETH_ADDRESS || "",
        erc20: {
          usdt: process.env.CRYPTO_ERC20_USDT_ADDRESS || "",
          usdc: process.env.CRYPTO_ERC20_USDC_ADDRESS || ""
        }
      },
      tron: {
        trc20: {
          usdt: process.env.CRYPTO_TRON_TRC20_USDT_ADDRESS || ""
        }
      },
      btc: {
        native: process.env.CRYPTO_BTC_ADDRESS || ""
      },
      bsc: {
        bep20: {
          usdt: process.env.CRYPTO_BSC_USDT_ADDRESS || ""
        }
      },
      sol: {
        spl: {
          usdc: process.env.CRYPTO_SOL_USDC_ADDRESS || ""
        }
      }
    })
  }
};

// src/payment/payment.service.ts
var PaymentService = class {
  constructor(dataSource) {
    this.paymentRepo = dataSource.getRepository(PaymentEntity);
    this.gatewayFactory = new GatewayFactory();
    this.qrService = new QrService();
  }
  async createPayment(createPaymentDto) {
    const orderId = createPaymentDto.orderId || `PAY${Date.now()}`;
    const now = /* @__PURE__ */ new Date();
    const expiresAt = new Date(now.getTime() + env.payment.expireMinutes * 60 * 1e3);
    const entity = this.paymentRepo.create({
      amount: createPaymentDto.amount,
      currency: createPaymentDto.currency,
      channel: createPaymentDto.channel,
      toAddress: createPaymentDto.toAddress,
      description: createPaymentDto.description ?? null,
      orderId,
      status: "pending" /* PENDING */,
      expiresAt
    });
    const saved = await this.paymentRepo.save(entity);
    try {
      const gateway = this.gatewayFactory.get(createPaymentDto.channel);
      const gatewayResult = await gateway.create({
        orderId: saved.orderId,
        amount: Number(saved.amount),
        currency: saved.currency,
        description: saved.description ?? void 0
      });
      const payLink = gatewayResult.paymentUrl || gatewayResult.qrCodeUrl || "";
      const qr = payLink ? await this.qrService.generateDataUrl(payLink) : void 0;
      saved.paymentUrl = payLink || null;
      saved.qrCodeDataUrl = qr || null;
      await this.paymentRepo.save(saved);
      const dto = this.mapEntityToDto(saved);
      return dto;
    } catch (e) {
      const dto = this.mapEntityToDto(saved);
      return dto;
    }
  }
  async getPaymentOrder(orderIdOrId) {
    let payment = await this.paymentRepo.findOne({ where: { id: orderIdOrId } });
    if (!payment) {
      payment = await this.paymentRepo.findOne({ where: { orderId: orderIdOrId } });
    }
    if (!payment) {
      throw new Error(`\u8BA2\u5355 ${orderIdOrId} \u4E0D\u5B58\u5728`);
    }
    return this.mapEntityToDto(payment);
  }
  async getPaymentOrders(query3, pagination) {
    const page = pagination.page || 1;
    const limit = pagination.limit || 10;
    const where = {};
    if (query3.status) where.status = query3.status;
    if (query3.currency) where.currency = query3.currency;
    if (query3.channel) where.channel = query3.channel;
    if (query3.orderId) where.orderId = Like(`%${query3.orderId}%`);
    const [rows, total] = await this.paymentRepo.findAndCount({
      where,
      order: { createdAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit
    });
    return {
      items: rows.map((r) => this.mapEntityToDto(r)),
      total,
      page,
      limit
    };
  }
  async confirmPayment(confirmPaymentDto) {
    const payment = await this.paymentRepo.findOne({
      where: { orderId: confirmPaymentDto.orderId }
    });
    if (!payment) {
      throw new Error(`\u8BA2\u5355 ${confirmPaymentDto.orderId} \u4E0D\u5B58\u5728`);
    }
    if (payment.expiresAt && payment.expiresAt.getTime() < Date.now()) {
      payment.status = "expired" /* EXPIRED */;
      await this.paymentRepo.save(payment);
      throw new Error("\u8BA2\u5355\u5DF2\u8FC7\u671F");
    }
    if (payment.status !== "pending" /* PENDING */) {
      throw new Error(
        `\u8BA2\u5355\u72B6\u6001\u4E3A ${payment.status}\uFF0C\u65E0\u6CD5\u786E\u8BA4\u652F\u4ED8`
      );
    }
    payment.status = "success" /* SUCCESS */;
    const saved = await this.paymentRepo.save(payment);
    return this.mapEntityToDto(saved);
  }
  async cancelPayment(orderIdOrId) {
    let payment = await this.paymentRepo.findOne({ where: { id: orderIdOrId } });
    if (!payment) {
      payment = await this.paymentRepo.findOne({ where: { orderId: orderIdOrId } });
    }
    if (!payment) {
      throw new Error(`\u8BA2\u5355 ${orderIdOrId} \u4E0D\u5B58\u5728`);
    }
    if (payment.status !== "pending" /* PENDING */) {
      throw new Error(`\u8BA2\u5355\u72B6\u6001\u4E3A ${payment.status}\uFF0C\u65E0\u6CD5\u53D6\u6D88`);
    }
    payment.status = "cancelled" /* CANCELLED */;
    const saved = await this.paymentRepo.save(payment);
    return this.mapEntityToDto(saved);
  }
  async getPaymentStats() {
    const totalOrders = await this.paymentRepo.count();
    const successOrders = await this.paymentRepo.count({
      where: { status: "success" /* SUCCESS */ }
    });
    const totalAmountRaw = await this.paymentRepo.createQueryBuilder("p").select("COALESCE(SUM(p.amount), 0)", "sum").where("p.status = :status", { status: "success" /* SUCCESS */ }).getRawOne();
    return {
      totalOrders,
      totalAmount: Number(totalAmountRaw?.sum || 0),
      successRate: totalOrders > 0 ? Number((successOrders / totalOrders * 100).toFixed(2)) : 0
    };
  }
  mapEntityToDto(e) {
    return {
      id: e.id,
      amount: Number(e.amount),
      currency: e.currency,
      channel: e.channel,
      toAddress: e.toAddress,
      status: e.status,
      description: e.description ?? "",
      orderId: e.orderId,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      expiresAt: e.expiresAt.toISOString(),
      paymentUrl: e.paymentUrl ?? void 0,
      qrCodeDataUrl: e.qrCodeDataUrl ?? void 0
    };
  }
};

// src/api/payment.routes.ts
import { Router } from "express";
import { body, query, param } from "express-validator";

// src/common/dto/common.dto.ts
var ApiResponseDto = class _ApiResponseDto {
  constructor(code, message, data = null) {
    this.code = code;
    this.message = message;
    this.data = data;
    this.timestamp = (/* @__PURE__ */ new Date()).toISOString();
  }
  /**
   * 成功响应
   * @param data 响应数据
   * @param message 成功消息
   * @returns ApiResponseDto
   */
  static success(data, message = "\u64CD\u4F5C\u6210\u529F") {
    return new _ApiResponseDto(200, message, data);
  }
  /**
   * 错误响应
   * @param message 错误消息
   * @param code 错误码
   * @returns ApiResponseDto
   */
  static error(message, code = 400) {
    return new _ApiResponseDto(code, message, null);
  }
};

// src/common/middleware/validation.middleware.ts
import { validationResult } from "express-validator";
var validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 400,
      message: "\u8BF7\u6C42\u53C2\u6570\u9A8C\u8BC1\u5931\u8D25",
      data: errors.array(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  next();
};

// src/api/payment.routes.ts
function createPaymentRoutes(paymentService) {
  const router = Router();
  router.post(
    "/create",
    [
      body("amount").isFloat({ min: 0.01 }).withMessage("\u91D1\u989D\u5FC5\u987B\u5927\u4E8E\u7B49\u4E8E 0.01"),
      body("currency").isIn(["eth" /* ETH */, "usdt" /* USDT */, "usdc" /* USDC */, "btc" /* BTC */]).withMessage("\u65E0\u6548\u7684\u652F\u4ED8\u8D27\u5E01"),
      body("channel").isIn(["alipay" /* ALIPAY */, "wechat" /* WECHAT */, "paypal" /* PAYPAL */, "card" /* CARD */, "crypto" /* CRYPTO */]).withMessage("\u65E0\u6548\u7684\u652F\u4ED8\u901A\u9053"),
      body("toAddress").isString().isLength({ min: 1 }).withMessage("\u6536\u6B3E\u5730\u5740\u4E0D\u80FD\u4E3A\u7A7A"),
      body("description").optional().isString(),
      body("orderId").optional().isString(),
      validate
    ],
    async (req, res) => {
      try {
        const order = await paymentService.createPayment(req.body);
        res.status(201).json(ApiResponseDto.success(order, "\u652F\u4ED8\u8BA2\u5355\u521B\u5EFA\u6210\u529F"));
      } catch (error) {
        res.status(400).json(ApiResponseDto.error(error.message || "\u521B\u5EFA\u8BA2\u5355\u5931\u8D25", 400));
      }
    }
  );
  router.get(
    "/:orderId",
    [
      param("orderId").isString().notEmpty().withMessage("\u8BA2\u5355ID\u4E0D\u80FD\u4E3A\u7A7A"),
      validate
    ],
    async (req, res) => {
      try {
        const order = await paymentService.getPaymentOrder(req.params.orderId);
        res.json(ApiResponseDto.success(order, "\u83B7\u53D6\u8BA2\u5355\u6210\u529F"));
      } catch (error) {
        res.status(404).json(ApiResponseDto.error(error.message || "\u8BA2\u5355\u4E0D\u5B58\u5728", 404));
      }
    }
  );
  router.get(
    "/",
    [
      query("status").optional().isIn([
        "pending" /* PENDING */,
        "processing" /* PROCESSING */,
        "success" /* SUCCESS */,
        "failed" /* FAILED */,
        "cancelled" /* CANCELLED */,
        "expired" /* EXPIRED */
      ]),
      query("currency").optional().isIn(["eth" /* ETH */, "usdt" /* USDT */, "usdc" /* USDC */, "btc" /* BTC */]),
      query("channel").optional().isIn(["alipay" /* ALIPAY */, "wechat" /* WECHAT */, "paypal" /* PAYPAL */, "card" /* CARD */, "crypto" /* CRYPTO */]),
      query("orderId").optional().isString(),
      query("page").optional().isInt({ min: 1 }).withMessage("\u9875\u7801\u5FC5\u987B\u5927\u4E8E\u7B49\u4E8E 1"),
      query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("\u6BCF\u9875\u6570\u91CF\u5FC5\u987B\u5728 1-100 \u4E4B\u95F4"),
      validate
    ],
    async (req, res) => {
      try {
        const { items, total, page, limit } = await paymentService.getPaymentOrders(
          req.query,
          { page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 10 }
        );
        res.json(ApiResponseDto.success(
          {
            items,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
          },
          "\u67E5\u8BE2\u8BA2\u5355\u5217\u8868\u6210\u529F"
        ));
      } catch (error) {
        res.status(400).json(ApiResponseDto.error(error.message || "\u67E5\u8BE2\u5931\u8D25", 400));
      }
    }
  );
  router.post(
    "/confirm",
    [
      body("orderId").isString().notEmpty().withMessage("\u8BA2\u5355ID\u4E0D\u80FD\u4E3A\u7A7A"),
      body("txHash").isString().notEmpty().withMessage("\u4EA4\u6613\u54C8\u5E0C\u4E0D\u80FD\u4E3A\u7A7A"),
      body("blockNumber").optional().isInt({ min: 0 }),
      validate
    ],
    async (req, res) => {
      try {
        const order = await paymentService.confirmPayment(req.body);
        res.json(ApiResponseDto.success(order, "\u652F\u4ED8\u786E\u8BA4\u6210\u529F"));
      } catch (error) {
        const status = error.message.includes("\u4E0D\u5B58\u5728") ? 404 : 400;
        res.status(status).json(ApiResponseDto.error(error.message || "\u786E\u8BA4\u652F\u4ED8\u5931\u8D25", status));
      }
    }
  );
  router.post(
    "/:orderId/cancel",
    [
      param("orderId").isString().notEmpty().withMessage("\u8BA2\u5355ID\u4E0D\u80FD\u4E3A\u7A7A"),
      validate
    ],
    async (req, res) => {
      try {
        const order = await paymentService.cancelPayment(req.params.orderId);
        res.json(ApiResponseDto.success(order, "\u8BA2\u5355\u53D6\u6D88\u6210\u529F"));
      } catch (error) {
        const status = error.message.includes("\u4E0D\u5B58\u5728") ? 404 : 400;
        res.status(status).json(ApiResponseDto.error(error.message || "\u53D6\u6D88\u8BA2\u5355\u5931\u8D25", status));
      }
    }
  );
  router.get("/stats/overview", async (req, res) => {
    try {
      const stats = await paymentService.getPaymentStats();
      res.json(ApiResponseDto.success(stats, "\u83B7\u53D6\u7EDF\u8BA1\u4FE1\u606F\u6210\u529F"));
    } catch (error) {
      res.status(400).json(ApiResponseDto.error(error.message || "\u83B7\u53D6\u7EDF\u8BA1\u4FE1\u606F\u5931\u8D25", 400));
    }
  });
  return router;
}

// src/api/webhook.routes.ts
import { Router as Router2 } from "express";
import { param as param2 } from "express-validator";
function createWebhookRoutes(gatewayFactory) {
  const router = Router2({ mergeParams: true });
  router.post(
    "/:channel",
    [
      param2("channel").isIn([
        "alipay" /* ALIPAY */,
        "wechat" /* WECHAT */,
        "paypal" /* PAYPAL */,
        "card" /* CARD */,
        "crypto" /* CRYPTO */
      ]).withMessage("\u65E0\u6548\u7684\u652F\u4ED8\u901A\u9053"),
      validate
    ],
    async (req, res) => {
      try {
        const channel = req.params.channel;
        const gateway = gatewayFactory.get(channel);
        const result = await gateway.handleWebhook(req.headers, req.body);
        res.json(ApiResponseDto.success(result, "\u56DE\u8C03\u5904\u7406\u6210\u529F"));
      } catch (error) {
        res.status(400).json(ApiResponseDto.error(error.message || "\u56DE\u8C03\u5904\u7406\u5931\u8D25", 400));
      }
    }
  );
  return router;
}

// src/wallet/wallet.service.ts
import Decimal from "decimal.js";

// src/wallet/default-assets.ts
var DEFAULT_ASSETS = [
  {
    assetCode: "CNY",
    displayName: "\u4EBA\u6C11\u5E01",
    type: "fiat",
    precision: 2
  },
  {
    assetCode: "USD",
    displayName: "\u7F8E\u5143",
    type: "fiat",
    precision: 2
  },
  {
    assetCode: "USDT-ERC20",
    displayName: "USDT (Ethereum)",
    type: "crypto",
    precision: 6,
    metadata: {
      chain: "ethereum",
      contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7"
    }
  },
  {
    assetCode: "USDT-TRC20",
    displayName: "USDT (Tron)",
    type: "crypto",
    precision: 6,
    metadata: {
      chain: "tron",
      contractAddress: "Tether USD"
    }
  }
];

// src/wallet/wallet.service.ts
Decimal.set({ precision: 36, rounding: Decimal.ROUND_DOWN });
var WalletService = class {
  constructor(dataSource) {
    this.dataSource = dataSource;
    this.assetRepository = dataSource.getRepository(AssetEntity);
    this.walletRepository = dataSource.getRepository(WalletEntity);
    this.txRepository = dataSource.getRepository(WalletTransactionEntity);
  }
  /**
   * 初始化默认资产配置
   */
  async ensureDefaultAssets() {
    for (const asset of DEFAULT_ASSETS) {
      const exists = await this.assetRepository.findOne({
        where: { assetCode: asset.assetCode }
      });
      if (!exists) {
        const entity = this.assetRepository.create({
          assetCode: asset.assetCode,
          displayName: asset.displayName,
          type: asset.type,
          precision: asset.precision,
          metadata: asset.metadata
        });
        await this.assetRepository.save(entity);
      }
    }
  }
  async listAssets() {
    return this.assetRepository.find({ where: { isActive: true } });
  }
  async getWallets(userId) {
    return this.walletRepository.find({
      where: { userId },
      order: { assetCode: "ASC" }
    });
  }
  async getWallet(userId, assetCode) {
    return this.walletRepository.findOne({
      where: { userId, assetCode }
    });
  }
  async getTransactions(userId, assetCode, limit = 20) {
    const wallet = await this.getWallet(userId, assetCode);
    if (!wallet) {
      return [];
    }
    return this.txRepository.find({
      where: { walletId: wallet.id },
      order: { createdAt: "DESC" },
      take: limit
    });
  }
  async deposit(userId, assetCode, amount, options2 = {}) {
    return this.adjustBalance(userId, assetCode, amount, "deposit", "credit", options2);
  }
  async withdraw(userId, assetCode, amount, options2 = {}) {
    return this.adjustBalance(userId, assetCode, amount, "withdraw", "debit", options2);
  }
  async adjustBalance(userId, assetCode, rawAmount, type, direction, options2) {
    const amount = new Decimal(rawAmount);
    if (amount.lte(0)) {
      throw new Error("\u91D1\u989D\u5FC5\u987B\u5927\u4E8E 0");
    }
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const walletRepo = queryRunner.manager.getRepository(WalletEntity);
      const txRepo = queryRunner.manager.getRepository(WalletTransactionEntity);
      let wallet = await walletRepo.findOne({
        where: { userId, assetCode },
        lock: { mode: "pessimistic_write" }
      });
      if (!wallet) {
        wallet = walletRepo.create({
          userId,
          assetCode,
          availableBalance: "0",
          frozenBalance: "0",
          walletType: "primary",
          status: "active"
        });
        wallet = await walletRepo.save(wallet);
      }
      const asset = await this.assetRepository.findOne({ where: { assetCode } });
      if (!asset) {
        throw new Error(`\u8D44\u4EA7 ${assetCode} \u672A\u914D\u7F6E`);
      }
      const currentBalance = new Decimal(wallet.availableBalance || "0");
      const nextBalance = direction === "credit" ? currentBalance.add(amount) : currentBalance.minus(amount);
      if (nextBalance.lt(0)) {
        throw new Error("\u4F59\u989D\u4E0D\u8DB3");
      }
      wallet.availableBalance = nextBalance.toFixed(asset.precision);
      wallet = await walletRepo.save(wallet);
      const tx = txRepo.create({
        walletId: wallet.id,
        assetCode,
        type,
        direction,
        amount: amount.toFixed(asset.precision),
        balanceBefore: currentBalance.toFixed(asset.precision),
        balanceAfter: nextBalance.toFixed(asset.precision),
        referenceId: options2.referenceId,
        metadata: options2.metadata,
        bizTag: options2.bizTag
      });
      await txRepo.save(tx);
      await queryRunner.commitTransaction();
      return wallet;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
};

// src/api/wallet.routes.ts
import { Router as Router3 } from "express";
import { body as body2, param as param3, query as query2 } from "express-validator";
function resolveUserId(req) {
  return req.headers["x-user-id"] || req.query.userId || req.body?.userId || null;
}
function createWalletRoutes(walletService) {
  const router = Router3();
  router.get("/assets", async (_req, res) => {
    const assets = await walletService.listAssets();
    res.json(ApiResponseDto.success(assets, "\u83B7\u53D6\u8D44\u4EA7\u914D\u7F6E\u6210\u529F"));
  });
  router.get(
    "/",
    [
      query2("userId").optional().isString(),
      validate
    ],
    async (req, res) => {
      const userId = resolveUserId(req);
      if (!userId) {
        return res.status(400).json(ApiResponseDto.error("\u7F3A\u5C11\u7528\u6237\u6807\u8BC6 (userId \u6216 x-user-id)", 400));
      }
      const wallets = await walletService.getWallets(userId);
      res.json(ApiResponseDto.success(wallets, "\u83B7\u53D6\u94B1\u5305\u5217\u8868\u6210\u529F"));
    }
  );
  router.get(
    "/:assetCode",
    [
      param3("assetCode").isString().notEmpty(),
      query2("userId").optional().isString(),
      validate
    ],
    async (req, res) => {
      const userId = resolveUserId(req);
      if (!userId) {
        return res.status(400).json(ApiResponseDto.error("\u7F3A\u5C11\u7528\u6237\u6807\u8BC6", 400));
      }
      const wallet = await walletService.getWallet(userId, req.params.assetCode);
      if (!wallet) {
        return res.status(404).json(ApiResponseDto.error("\u94B1\u5305\u4E0D\u5B58\u5728", 404));
      }
      res.json(ApiResponseDto.success(wallet, "\u83B7\u53D6\u94B1\u5305\u8BE6\u60C5\u6210\u529F"));
    }
  );
  router.get(
    "/:assetCode/transactions",
    [
      param3("assetCode").isString().notEmpty(),
      query2("limit").optional().isInt({ min: 1, max: 100 }),
      query2("userId").optional().isString(),
      validate
    ],
    async (req, res) => {
      const userId = resolveUserId(req);
      if (!userId) {
        return res.status(400).json(ApiResponseDto.error("\u7F3A\u5C11\u7528\u6237\u6807\u8BC6", 400));
      }
      const limit = Number(req.query.limit) || 20;
      const txs = await walletService.getTransactions(userId, req.params.assetCode, limit);
      res.json(ApiResponseDto.success(txs, "\u83B7\u53D6\u4EA4\u6613\u8BB0\u5F55\u6210\u529F"));
    }
  );
  router.post(
    "/:assetCode/deposit",
    [
      param3("assetCode").isString().notEmpty(),
      body2("amount").isString().notEmpty().withMessage("amount \u4E0D\u80FD\u4E3A\u7A7A"),
      body2("referenceId").optional().isString(),
      body2("metadata").optional().isObject(),
      body2("bizTag").optional().isString(),
      body2("userId").optional().isString(),
      validate
    ],
    async (req, res) => {
      try {
        const userId = resolveUserId(req);
        if (!userId) {
          return res.status(400).json(ApiResponseDto.error("\u7F3A\u5C11\u7528\u6237\u6807\u8BC6", 400));
        }
        const wallet = await walletService.deposit(userId, req.params.assetCode, req.body.amount, req.body);
        res.status(201).json(ApiResponseDto.success(wallet, "\u5145\u503C\u6210\u529F"));
      } catch (error) {
        res.status(400).json(ApiResponseDto.error(error.message || "\u5145\u503C\u5931\u8D25", 400));
      }
    }
  );
  router.post(
    "/:assetCode/withdraw",
    [
      param3("assetCode").isString().notEmpty(),
      body2("amount").isString().notEmpty(),
      body2("referenceId").optional().isString(),
      body2("metadata").optional().isObject(),
      body2("bizTag").optional().isString(),
      body2("userId").optional().isString(),
      validate
    ],
    async (req, res) => {
      try {
        const userId = resolveUserId(req);
        if (!userId) {
          return res.status(400).json(ApiResponseDto.error("\u7F3A\u5C11\u7528\u6237\u6807\u8BC6", 400));
        }
        const wallet = await walletService.withdraw(userId, req.params.assetCode, req.body.amount, req.body);
        res.json(ApiResponseDto.success(wallet, "\u6263\u6B3E\u6210\u529F"));
      } catch (error) {
        const status = error.message.includes("\u4F59\u989D\u4E0D\u8DB3") ? 422 : 400;
        res.status(status).json(ApiResponseDto.error(error.message || "\u6263\u6B3E\u5931\u8D25", status));
      }
    }
  );
  return router;
}

// src/common/middleware/idempotency.middleware.ts
var IdempotencyMiddleware = class {
  constructor() {
    this.store = /* @__PURE__ */ new Map();
    this.ttlMs = 5 * 60 * 1e3;
  }
  // 5 分钟
  middleware() {
    return (req, res, next) => {
      const key = req.headers["idempotency-key"] || req.headers["Idempotency-Key"];
      if (!key) {
        return next();
      }
      const now = Date.now();
      for (const [k, v] of this.store) {
        if (now - v.timestamp > this.ttlMs) {
          this.store.delete(k);
        }
      }
      const hit = this.store.get(key);
      if (hit) {
        res.statusCode = hit.statusCode;
        return res.json(hit.body);
      }
      const originalJson = res.json.bind(res);
      res.json = (body3) => {
        const status = res.statusCode ?? 200;
        this.store.set(key, { statusCode: status, body: body3, timestamp: Date.now() });
        return originalJson(body3);
      };
      next();
    };
  }
};

// src/config/swagger.ts
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
var options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Web3 \u652F\u4ED8\u7CFB\u7EDF API",
      version: "1.0.0",
      description: "\u57FA\u4E8E Express \u6784\u5EFA\u7684 Web3 \u652F\u4ED8\u7CFB\u7EDF\u540E\u7AEF API \u6587\u6863"
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3001}`,
        description: "\u672C\u5730\u5F00\u53D1\u670D\u52A1\u5668"
      }
    ],
    tags: [
      { name: "\u652F\u4ED8", description: "\u652F\u4ED8\u76F8\u5173\u63A5\u53E3" }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT"
        }
      }
    }
  },
  apis: ["./src/api/**/*.ts"]
  // 从路由文件中读取 Swagger 注释
};
function setupSwagger(app) {
  const specs = swaggerJsdoc(options);
  app.use("/api", swaggerUi.serve, swaggerUi.setup(specs, {
    swaggerOptions: {
      persistAuthorization: true
    },
    customSiteTitle: "Web3 \u652F\u4ED8\u7CFB\u7EDF API \u6587\u6863"
  }));
}

// src/payment/payment.expiration.scheduler.ts
import * as cron from "node-cron";
import { LessThan } from "typeorm";
var PaymentExpirationScheduler = class {
  constructor(dataSource) {
    this.task = null;
    this.dataSource = dataSource;
  }
  start() {
    this.task = cron.schedule("* * * * *", async () => {
      try {
        await this.sweepExpired();
      } catch (error) {
        console.error("\u5B9A\u65F6\u4EFB\u52A1\u6267\u884C\u5931\u8D25:", error);
      }
    });
    console.log("\u2705 \u652F\u4ED8\u8FC7\u671F\u68C0\u67E5\u5B9A\u65F6\u4EFB\u52A1\u5DF2\u542F\u52A8");
  }
  stop() {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log("\u23F9\uFE0F \u652F\u4ED8\u8FC7\u671F\u68C0\u67E5\u5B9A\u65F6\u4EFB\u52A1\u5DF2\u505C\u6B62");
    }
  }
  async sweepExpired() {
    const paymentRepo = this.dataSource.getRepository(PaymentEntity);
    const now = /* @__PURE__ */ new Date();
    const toExpire = await paymentRepo.find({
      where: {
        status: "pending" /* PENDING */,
        expiresAt: LessThan(now)
      }
    });
    if (toExpire.length === 0) return 0;
    for (const p of toExpire) {
      p.status = "expired" /* EXPIRED */;
    }
    await paymentRepo.save(toExpire);
    console.log(`\u23F0 \u8FC7\u671F\u8BA2\u5355\u6570\u91CF: ${toExpire.length}`);
    return toExpire.length;
  }
};

// src/app.ts
dotenv.config();
async function createApp() {
  await AppDataSource.initialize();
  console.log("\u2705 \u6570\u636E\u5E93\u8FDE\u63A5\u5DF2\u5EFA\u7ACB");
  const paymentService = new PaymentService(AppDataSource);
  const walletService = new WalletService(AppDataSource);
  const gatewayFactory = new GatewayFactory();
  const app = express();
  app.use(cors({
    origin: true,
    credentials: true
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  const idempotencyMiddleware = new IdempotencyMiddleware();
  app.use(idempotencyMiddleware.middleware());
  setupSwagger(app);
  app.get("/", (req, res) => {
    res.json({
      message: "Web3 \u652F\u4ED8\u7CFB\u7EDF API",
      version: "1.0.0",
      docs: "/api"
    });
  });
  await walletService.ensureDefaultAssets();
  const paymentRouter = createPaymentRoutes(paymentService);
  const webhookRouter = createWebhookRoutes(gatewayFactory);
  const walletRouter = createWalletRoutes(walletService);
  app.use("/payment", paymentRouter);
  paymentRouter.use("/webhook", webhookRouter);
  app.use("/wallets", walletRouter);
  const scheduler = new PaymentExpirationScheduler(AppDataSource);
  scheduler.start();
  return app;
}

// src/index.ts
async function bootstrap() {
  try {
    const app = await createApp();
    const port = env.port;
    app.listen(port, () => {
      console.log(`\u{1F680} \u5E94\u7528\u5DF2\u542F\u52A8: http://localhost:${port}`);
      console.log(`\u{1F4DA} Swagger \u6587\u6863: http://localhost:${port}/api`);
    });
  } catch (error) {
    console.error("\u274C \u5E94\u7528\u542F\u52A8\u5931\u8D25:", error);
    process.exit(1);
  }
}
bootstrap();
//# sourceMappingURL=index.js.map