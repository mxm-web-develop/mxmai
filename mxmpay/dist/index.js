// src/app.ts
import express from "express";
import cors from "cors";
import { RepositoryFactory as RepositoryFactory2, loadDataConfig } from "@mxmai/mxmdata";

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

// src/config/env.ts
import { loadMonorepoEnv } from "@mxmai/mxmdata";
loadMonorepoEnv({ service: "mxmpay", warnLegacy: false });
function parseJSONSafe(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
var env = {
  port: Number(process.env.MXMPAY_PORT || process.env.PORT || 4002),
  payment: {
    expireMinutes: Number(process.env.PAYMENT_EXPIRE_MINUTES || 15)
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
      arbitrum: {
        erc20: {
          usdt: process.env.CRYPTO_ARBITRUM_USDT_ADDRESS || ""
        }
      },
      polygon: {
        erc20: {
          usdt: process.env.CRYPTO_POLYGON_USDT_ADDRESS || ""
        }
      },
      sol: {
        spl: {
          usdc: process.env.CRYPTO_SOL_USDC_ADDRESS || ""
        }
      }
    })
  },
  blockchain: {
    // 监听服务类型: local | alchemy | infura
    listenerType: (process.env.LISTENER_TYPE || "local").toLowerCase(),
    // Ethereum RPC 节点（本地监听使用）
    ethRpcUrl: process.env.ETH_RPC_URL || "https://eth.llamarpc.com",
    // Arbitrum RPC 节点（本地监听使用）
    arbitrumRpcUrl: process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
    // Polygon RPC 节点（本地监听使用）
    polygonRpcUrl: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
    // Tron RPC 节点（本地监听使用）
    tronRpcUrl: process.env.TRON_RPC_URL || "https://api.trongrid.io",
    // Webhook 回调地址
    webhookUrl: process.env.WEBHOOK_URL || "http://localhost:3001/payment/webhook/crypto",
    // 轮询间隔（毫秒，本地监听使用）
    pollInterval: Number(process.env.POLL_INTERVAL || 1e4),
    // Alchemy 配置
    alchemy: {
      apiKey: process.env.ALCHEMY_API_KEY || ""
    },
    // Infura 配置
    infura: {
      projectId: process.env.INFURA_PROJECT_ID || "",
      projectSecret: process.env.INFURA_PROJECT_SECRET || ""
    }
  }
};

// src/payment/providers/crypto.gateway.ts
var USDT_ERC20_CONTRACT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
var USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
var USDT_ARBITRUM_CONTRACT = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9";
var USDT_POLYGON_CONTRACT = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
var CryptoGateway = class {
  constructor() {
    this.name = "crypto";
  }
  /**
   * 获取收款地址
   */
  getReceiveAddress(assetCode) {
    const cryptoWallets = env.receivers.crypto;
    if (assetCode === "USDT-ERC20") {
      return cryptoWallets?.eth?.erc20?.usdt || process.env.CRYPTO_ERC20_USDT_ADDRESS || "";
    } else if (assetCode === "USDT-TRC20") {
      return cryptoWallets?.tron?.trc20?.usdt || process.env.CRYPTO_TRC20_USDT_ADDRESS || "";
    } else if (assetCode === "USDT-ARBITRUM") {
      return cryptoWallets?.arbitrum?.erc20?.usdt || process.env.CRYPTO_ARBITRUM_USDT_ADDRESS || "";
    } else if (assetCode === "USDT-POLYGON") {
      return cryptoWallets?.polygon?.erc20?.usdt || process.env.CRYPTO_POLYGON_USDT_ADDRESS || "";
    }
    throw new Error(`\u4E0D\u652F\u6301\u7684\u8D44\u4EA7\u4EE3\u7801: ${assetCode}`);
  }
  /**
   * 获取合约地址
   */
  getContractAddress(assetCode) {
    if (assetCode === "USDT-ERC20") {
      return USDT_ERC20_CONTRACT;
    } else if (assetCode === "USDT-TRC20") {
      return USDT_TRC20_CONTRACT;
    } else if (assetCode === "USDT-ARBITRUM") {
      return USDT_ARBITRUM_CONTRACT;
    } else if (assetCode === "USDT-POLYGON") {
      return USDT_POLYGON_CONTRACT;
    }
    throw new Error(`\u4E0D\u652F\u6301\u7684\u8D44\u4EA7\u4EE3\u7801: ${assetCode}`);
  }
  /**
   * 将金额转换为最小单位（6位小数）
   */
  amountToSmallestUnit(amount) {
    return Math.floor(amount * 1e6).toString();
  }
  /**
   * 生成支付二维码内容
   */
  generateQrCodeContent(assetCode, receiveAddress, amount) {
    const amountInSmallestUnit = this.amountToSmallestUnit(amount);
    if (assetCode === "USDT-ERC20") {
      const contractAddress = this.getContractAddress(assetCode);
      return `ethereum:${receiveAddress}@1/transfer?address=${contractAddress}&uint256=${amountInSmallestUnit}`;
    } else if (assetCode === "USDT-TRC20") {
      const contractAddress = this.getContractAddress(assetCode);
      return `tron:${contractAddress}?amount=${amountInSmallestUnit}`;
    } else if (assetCode === "USDT-ARBITRUM") {
      const contractAddress = this.getContractAddress(assetCode);
      return `ethereum:${receiveAddress}@42161/transfer?address=${contractAddress}&uint256=${amountInSmallestUnit}`;
    } else if (assetCode === "USDT-POLYGON") {
      const contractAddress = this.getContractAddress(assetCode);
      return `ethereum:${receiveAddress}@137/transfer?address=${contractAddress}&uint256=${amountInSmallestUnit}`;
    }
    throw new Error(`\u4E0D\u652F\u6301\u7684\u8D44\u4EA7\u4EE3\u7801: ${assetCode}`);
  }
  /**
   * 生成区块链浏览器链接
   */
  generateExplorerUrl(assetCode, txHash) {
    if (assetCode === "USDT-ERC20") {
      return txHash ? `https://etherscan.io/tx/${txHash}` : "https://etherscan.io";
    } else if (assetCode === "USDT-TRC20") {
      return txHash ? `https://tronscan.org/#/transaction/${txHash}` : "https://tronscan.org";
    } else if (assetCode === "USDT-ARBITRUM") {
      return txHash ? `https://arbiscan.io/tx/${txHash}` : "https://arbiscan.io";
    } else if (assetCode === "USDT-POLYGON") {
      return txHash ? `https://polygonscan.com/tx/${txHash}` : "https://polygonscan.com";
    }
    return "";
  }
  async create(params) {
    const assetCode = params.metadata?.assetCode;
    const supportedAssets = ["USDT-ERC20", "USDT-TRC20", "USDT-ARBITRUM", "USDT-POLYGON"];
    if (!assetCode || !supportedAssets.includes(assetCode)) {
      throw new Error(`crypto \u6E20\u9053\u9700\u8981\u63D0\u4F9B assetCode (${supportedAssets.join(", ")})`);
    }
    const receiveAddress = this.getReceiveAddress(assetCode);
    if (!receiveAddress) {
      throw new Error(`\u672A\u914D\u7F6E ${assetCode} \u6536\u6B3E\u5730\u5740`);
    }
    const qrCodeContent = this.generateQrCodeContent(assetCode, receiveAddress, params.amount);
    const explorerUrl = this.generateExplorerUrl(assetCode);
    return {
      orderId: params.orderId,
      status: "pending",
      paymentUrl: explorerUrl,
      qrCodeUrl: qrCodeContent,
      raw: {
        assetCode,
        receiveAddress,
        contractAddress: this.getContractAddress(assetCode),
        amount: params.amount,
        amountInSmallestUnit: this.amountToSmallestUnit(params.amount)
      }
    };
  }
  async query(orderId) {
    return { orderId, status: "processing", raw: { mocked: true } };
  }
  async refund(params) {
    return { orderId: params.orderId, status: "failed", raw: { message: "\u533A\u5757\u94FE\u652F\u4ED8\u4E0D\u652F\u6301\u9000\u6B3E" } };
  }
  async handleWebhook(headers, body3) {
    const orderId = body3?.orderId || body3?.out_trade_no || "unknown";
    const txHash = body3?.txHash || body3?.hash || body3?.transactionHash;
    const blockNumber = body3?.blockNumber || body3?.block_number;
    const fromAddress = body3?.fromAddress || body3?.from;
    const toAddress = body3?.toAddress || body3?.to;
    const amount = body3?.amount || body3?.value;
    const contractAddress = body3?.contractAddress || body3?.contract_address;
    const assetCode = body3?.assetCode || body3?.asset_code;
    if (!txHash) {
      throw new Error("webhook \u7F3A\u5C11\u4EA4\u6613\u54C8\u5E0C (txHash)");
    }
    if (!toAddress) {
      throw new Error("webhook \u7F3A\u5C11\u6536\u6B3E\u5730\u5740 (toAddress)");
    }
    if (!amount) {
      throw new Error("webhook \u7F3A\u5C11\u91D1\u989D (amount)");
    }
    if (assetCode === "USDT-ERC20" && contractAddress?.toLowerCase() !== USDT_ERC20_CONTRACT.toLowerCase()) {
      throw new Error(`ERC20-USDT \u5408\u7EA6\u5730\u5740\u4E0D\u5339\u914D: ${contractAddress}`);
    }
    if (assetCode === "USDT-TRC20" && contractAddress !== USDT_TRC20_CONTRACT) {
      throw new Error(`TRC20-USDT \u5408\u7EA6\u5730\u5740\u4E0D\u5339\u914D: ${contractAddress}`);
    }
    if (assetCode === "USDT-ARBITRUM" && contractAddress?.toLowerCase() !== USDT_ARBITRUM_CONTRACT.toLowerCase()) {
      throw new Error(`Arbitrum-USDT \u5408\u7EA6\u5730\u5740\u4E0D\u5339\u914D: ${contractAddress}`);
    }
    if (assetCode === "USDT-POLYGON" && contractAddress?.toLowerCase() !== USDT_POLYGON_CONTRACT.toLowerCase()) {
      throw new Error(`Polygon-USDT \u5408\u7EA6\u5730\u5740\u4E0D\u5339\u914D: ${contractAddress}`);
    }
    return {
      orderId,
      status: "success",
      raw: {
        txHash,
        blockNumber,
        fromAddress,
        toAddress,
        amount,
        contractAddress,
        assetCode,
        headers,
        body: body3
      }
    };
  }
};

// src/payment/providers/voucher.gateway.ts
var VoucherGateway = class {
  constructor() {
    this.name = "voucher";
  }
  async create(params) {
    return {
      orderId: params.orderId,
      status: "pending",
      paymentUrl: "",
      qrCodeUrl: "",
      raw: {
        assetCode: params.metadata?.assetCode || "VOUCHER-CNY",
        amount: params.amount
      }
    };
  }
  async query(orderId) {
    return {
      orderId,
      status: "processing",
      raw: { mocked: true }
    };
  }
  async refund(params) {
    return {
      orderId: params.orderId,
      status: "failed",
      raw: { message: "\u4EE3\u91D1\u5238\u652F\u4ED8\u4E0D\u652F\u6301\u9000\u6B3E" }
    };
  }
  async handleWebhook(headers, body3) {
    return {
      orderId: body3?.orderId || "unknown",
      status: "success",
      raw: body3
    };
  }
};

// src/payment/providers/apple-iap.gateway.ts
var AppleIapGateway = class {
  constructor() {
    this.name = "apple_iap";
  }
  async create(params) {
    return {
      orderId: params.orderId,
      status: "pending",
      raw: { productId: params.metadata?.productId }
    };
  }
  async query(orderId) {
    return {
      orderId,
      status: "pending",
      raw: { mocked: true }
    };
  }
  async refund(params) {
    return {
      orderId: params.orderId,
      status: "failed",
      raw: { message: "Apple IAP \u9000\u6B3E\u9700\u901A\u8FC7 App Store \u5904\u7406" }
    };
  }
  async handleWebhook(headers, body3) {
    return {
      orderId: body3?.orderId || "unknown",
      status: "pending",
      raw: body3
    };
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
      ["crypto" /* CRYPTO */]: new CryptoGateway(),
      ["voucher" /* VOUCHER */]: new VoucherGateway(),
      ["apple_iap" /* APPLE_IAP */]: new AppleIapGateway()
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

// src/payment/payment.service.ts
var PaymentService = class {
  constructor(paymentRepo, walletTaskService) {
    this.paymentRepo = paymentRepo;
    this.gatewayFactory = new GatewayFactory();
    this.qrService = new QrService();
    this.walletTaskService = walletTaskService;
  }
  async createPayment(createPaymentDto) {
    const orderId = createPaymentDto.orderId || `PAY${Date.now()}`;
    const now = /* @__PURE__ */ new Date();
    const expiresAt = new Date(now.getTime() + env.payment.expireMinutes * 60 * 1e3);
    console.log(`[PaymentService] \u521B\u5EFA\u8BA2\u5355 ${orderId}: now=${now.toISOString()}, expiresAt=${expiresAt.toISOString()}, expireMinutes=${env.payment.expireMinutes}`);
    let actualToAddress = createPaymentDto.toAddress || "";
    if (createPaymentDto.channel === "crypto") {
      if (!createPaymentDto.assetCode) {
        throw new Error("crypto \u6E20\u9053\u5FC5\u987B\u63D0\u4F9B asset_code (USDT-ERC20 \u6216 USDT-TRC20)");
      }
      const cryptoWallets = env.receivers.crypto;
      if (createPaymentDto.assetCode === "USDT-ERC20") {
        actualToAddress = cryptoWallets?.eth?.erc20?.usdt || process.env.CRYPTO_ERC20_USDT_ADDRESS || "";
      } else if (createPaymentDto.assetCode === "USDT-TRC20") {
        actualToAddress = cryptoWallets?.tron?.trc20?.usdt || process.env.CRYPTO_TRC20_USDT_ADDRESS || "";
      }
      if (!actualToAddress) {
        throw new Error(`\u672A\u914D\u7F6E ${createPaymentDto.assetCode} \u6536\u6B3E\u5730\u5740\uFF0C\u8BF7\u5728\u73AF\u5883\u53D8\u91CF\u4E2D\u8BBE\u7F6E CRYPTO_ERC20_USDT_ADDRESS \u6216 CRYPTO_TRC20_USDT_ADDRESS`);
      }
    } else if (createPaymentDto.channel === "voucher") {
      if (!createPaymentDto.assetCode) {
        throw new Error("voucher \u6E20\u9053\u5FC5\u987B\u63D0\u4F9B asset_code (VOUCHER-CNY \u6216 VOUCHER-USD)");
      }
      if (!createPaymentDto.userId) {
        throw new Error("voucher \u6E20\u9053\u5FC5\u987B\u63D0\u4F9B userId");
      }
    } else if (createPaymentDto.channel === "apple_iap") {
      if (!createPaymentDto.assetCode) {
        throw new Error("apple_iap \u6E20\u9053\u5FC5\u987B\u63D0\u4F9B asset_code (\u5982 CNY, CREDITS)");
      }
      if (!createPaymentDto.userId) {
        throw new Error("apple_iap \u6E20\u9053\u5FC5\u987B\u63D0\u4F9B userId");
      }
    }
    const orderType = createPaymentDto.bizType === "subscription" ? "subscription" : createPaymentDto.bizType === "token_purchase" ? "purchase" : "recharge";
    const paymentOrder = await this.paymentRepo.createOrder({
      ...{ order_no: orderId },
      user_id: createPaymentDto.userId || "",
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
        biz_id: createPaymentDto.bizId
      }
    });
    try {
      const gateway = this.gatewayFactory.get(createPaymentDto.channel);
      const gatewayResult = await gateway.create({
        orderId,
        amount: createPaymentDto.amount,
        currency: createPaymentDto.currency,
        description: createPaymentDto.description ?? void 0,
        metadata: {
          assetCode: createPaymentDto.assetCode,
          userId: createPaymentDto.userId,
          bizType: createPaymentDto.bizType,
          bizId: createPaymentDto.bizId
        }
      });
      let finalToAddress = actualToAddress;
      if (createPaymentDto.channel === "crypto" && gatewayResult.raw?.receiveAddress) {
        finalToAddress = gatewayResult.raw.receiveAddress;
      }
      const payLink = gatewayResult.paymentUrl || gatewayResult.qrCodeUrl || "";
      const qr = payLink ? await this.qrService.generateDataUrl(payLink) : void 0;
      let updated = await this.paymentRepo.updateOrder(paymentOrder.id, {
        payment_url: payLink,
        qr_code_data_url: qr || void 0,
        payment_params: {
          to_address: finalToAddress,
          ...gatewayResult.raw
        }
      });
      if (createPaymentDto.channel === "voucher" && this.walletTaskService) {
        const isIssue = createPaymentDto.bizType === "voucher_issue" || createPaymentDto.bizType === "promotion";
        try {
          if (isIssue) {
            await this.walletTaskService.createDepositTaskAndApply({
              userId: createPaymentDto.userId,
              assetCode: createPaymentDto.assetCode,
              amount: createPaymentDto.amount.toString(),
              channel: "voucher",
              bizType: createPaymentDto.bizType || "voucher_issue",
              bizId: createPaymentDto.bizId || orderId,
              paymentId: paymentOrder.id,
              metadata: {
                orderId,
                description: createPaymentDto.description,
                issuedBy: "admin"
              }
            });
            updated = await this.paymentRepo.updateOrder(paymentOrder.id, {
              status: "paid",
              paid_at: /* @__PURE__ */ new Date()
            });
            console.log(`\u2705 \u4EE3\u91D1\u5238\u53D1\u653E\u6210\u529F: \u8BA2\u5355 ${orderId}, \u7528\u6237 ${createPaymentDto.userId}, \u91D1\u989D ${createPaymentDto.amount} ${createPaymentDto.assetCode}`);
          } else {
            await this.walletTaskService.createPaymentTaskAndApply({
              userId: createPaymentDto.userId,
              assetCode: createPaymentDto.assetCode,
              amount: createPaymentDto.amount.toString(),
              channel: "voucher",
              bizType: createPaymentDto.bizType,
              bizId: createPaymentDto.bizId,
              paymentId: paymentOrder.id,
              metadata: {
                orderId,
                description: createPaymentDto.description
              }
            });
            updated = await this.paymentRepo.updateOrder(paymentOrder.id, {
              status: "paid",
              paid_at: /* @__PURE__ */ new Date()
            });
            console.log(`\u2705 \u4EE3\u91D1\u5238\u652F\u4ED8\u6210\u529F: \u8BA2\u5355 ${orderId}, \u7528\u6237 ${createPaymentDto.userId}, \u91D1\u989D ${createPaymentDto.amount} ${createPaymentDto.assetCode}`);
          }
        } catch (error) {
          updated = await this.paymentRepo.updateOrder(paymentOrder.id, {
            status: "failed"
          });
          const action = isIssue ? "\u53D1\u653E" : "\u652F\u4ED8";
          console.error(`\u274C \u4EE3\u91D1\u5238${action}\u5931\u8D25: \u8BA2\u5355 ${orderId}, \u9519\u8BEF: ${error.message}`);
          throw new Error(`\u4EE3\u91D1\u5238${action}\u5931\u8D25: ${error.message}`);
        }
      }
      return await this.mapToDto(updated, orderId, finalToAddress);
    } catch (e) {
      console.error("\u7F51\u5173\u521B\u5EFA\u8BA2\u5355\u5931\u8D25:", e.message);
      return await this.mapToDto(paymentOrder, orderId, actualToAddress);
    }
  }
  async getPaymentOrder(orderIdOrId) {
    let payment = await this.paymentRepo.findOrderById(orderIdOrId);
    if (!payment) {
      payment = await this.paymentRepo.findOrderByOrderNo(orderIdOrId);
    }
    if (!payment) {
      throw new Error(`\u8BA2\u5355 ${orderIdOrId} \u4E0D\u5B58\u5728`);
    }
    return await this.mapToDto(payment);
  }
  async getPaymentOrders(query3, pagination, userId) {
    const page = pagination.page || 1;
    const limit = pagination.limit || 10;
    if (userId) {
      const { orders: orders2, total: total2 } = await this.paymentRepo.findOrdersByUserId(userId, {
        status: query3.status,
        orderType: query3.orderId ? void 0 : void 0,
        limit,
        offset: (page - 1) * limit
      });
      return {
        items: await Promise.all(orders2.map((o) => this.mapToDto(o))),
        total: total2,
        page,
        limit
      };
    }
    const { orders, total } = await this.paymentRepo.findOrdersByUserId("", {
      status: query3.status,
      orderType: query3.orderId ? void 0 : void 0,
      limit,
      offset: (page - 1) * limit
    });
    return {
      items: await Promise.all(orders.map((o) => this.mapToDto(o))),
      total,
      page,
      limit
    };
  }
  /**
   * 管理员：查询所有订单（不限制用户，但可选择性筛选特定用户）
   */
  async getAllPaymentOrders(query3, pagination) {
    const userId = query3.userId || "";
    return this.getPaymentOrders(query3, pagination, userId);
  }
  async confirmPayment(confirmPaymentDto) {
    const payment = await this.paymentRepo.findOrderByOrderNo(confirmPaymentDto.orderId);
    if (!payment) {
      throw new Error(`\u8BA2\u5355 ${confirmPaymentDto.orderId} \u4E0D\u5B58\u5728`);
    }
    const expiresAt = typeof payment.expires_at === "string" ? new Date(payment.expires_at) : payment.expires_at;
    if (expiresAt && expiresAt.getTime() < Date.now()) {
      await this.paymentRepo.updateOrder(payment.id, { status: "expired" });
      throw new Error("\u8BA2\u5355\u5DF2\u8FC7\u671F");
    }
    if (payment.status !== "pending") {
      throw new Error(
        `\u8BA2\u5355\u72B6\u6001\u4E3A ${payment.status}\uFF0C\u65E0\u6CD5\u786E\u8BA4\u652F\u4ED8`
      );
    }
    const updated = await this.paymentRepo.updateOrder(payment.id, {
      status: "paid",
      third_party_transaction_id: confirmPaymentDto.txHash,
      paid_at: /* @__PURE__ */ new Date(),
      callback_data: {
        txHash: confirmPaymentDto.txHash,
        blockNumber: confirmPaymentDto.blockNumber
      }
    });
    return await this.mapToDto(updated);
  }
  async cancelPayment(orderId) {
    const payment = await this.paymentRepo.findOrderByOrderNo(orderId);
    if (!payment) {
      throw new Error(`\u8BA2\u5355 ${orderId} \u4E0D\u5B58\u5728`);
    }
    if (payment.status !== "pending") {
      throw new Error(`\u8BA2\u5355\u72B6\u6001\u4E3A ${payment.status}\uFF0C\u65E0\u6CD5\u53D6\u6D88`);
    }
    const updated = await this.paymentRepo.updateOrder(payment.id, {
      status: "cancelled"
    });
    return await this.mapToDto(updated);
  }
  async getPaymentStats(userId) {
    const { orders } = await this.paymentRepo.findOrdersByUserId(userId || "", {
      limit: 1e4
      // 获取足够多的订单用于统计
    });
    let totalAmount = 0;
    let totalOrders = orders.length;
    let successOrders = 0;
    let failedOrders = 0;
    let pendingOrders = 0;
    let expiredOrders = 0;
    for (const order of orders) {
      if (order.status === "paid" || order.status === "success") {
        totalAmount += Number(order.amount);
        successOrders++;
      } else if (order.status === "failed" || order.status === "cancelled") {
        failedOrders++;
      } else if (order.status === "pending" || order.status === "processing") {
        pendingOrders++;
      } else if (order.status === "expired") {
        expiredOrders++;
      }
    }
    return {
      totalAmount: Number(totalAmount.toFixed(2)),
      totalOrders,
      successOrders,
      failedOrders,
      pendingOrders,
      expiredOrders
    };
  }
  async markPaymentSuccess(orderId, txHash, blockNumber, extra) {
    const payment = await this.paymentRepo.findOrderByOrderNo(orderId);
    if (!payment) {
      throw new Error(`\u8BA2\u5355 ${orderId} \u4E0D\u5B58\u5728`);
    }
    const updateData = {
      status: "paid",
      paid_at: /* @__PURE__ */ new Date()
    };
    if (txHash) {
      updateData.third_party_transaction_id = txHash;
    }
    if (extra) {
      updateData.callback_data = {
        ...payment.callback_data || {},
        ...extra,
        txHash,
        blockNumber
      };
    }
    const updated = await this.paymentRepo.updateOrder(payment.id, updateData);
    if (this.walletTaskService && payment.order_type === "recharge" && payment.user_id) {
      const assetCode = payment.metadata?.asset_code || payment.payment_method;
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
              ...extra
            }
          });
        } catch (e) {
          console.error("\u521B\u5EFA\u5145\u503C\u4EFB\u52A1\u5931\u8D25:", e.message);
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
  async verifyIapReceipt(orderId, receipt, productId) {
    const payment = await this.paymentRepo.findOrderByOrderNo(orderId);
    if (!payment) {
      throw new Error(`\u8BA2\u5355 ${orderId} \u4E0D\u5B58\u5728`);
    }
    if (payment.payment_channel !== "apple_iap") {
      throw new Error(`\u8BA2\u5355 ${orderId} \u4E0D\u662F Apple IAP \u8BA2\u5355`);
    }
    if (payment.status === "paid") {
      return await this.mapToDto(payment);
    }
    if (payment.status !== "pending") {
      throw new Error(`\u8BA2\u5355 ${orderId} \u72B6\u6001\u4E3A ${payment.status}\uFF0C\u65E0\u6CD5\u5B8C\u6210\u6821\u9A8C`);
    }
    if (!receipt || receipt.trim().length === 0) {
      throw new Error("receipt \u4E0D\u80FD\u4E3A\u7A7A");
    }
    return await this.markPaymentSuccess(orderId, void 0, void 0, {
      receipt: receipt.substring(0, 100) + "...",
      productId,
      channel: "apple_iap"
    });
  }
  /**
   * 将 PaymentOrder (mxmdata) 映射为 PaymentOrderDto (mxmpay)
   * 在映射时检查订单是否已过期，如果过期则更新状态
   */
  async mapToDto(order, orderNo, toAddress) {
    const metadata = order.metadata || {};
    const paymentParams = order.payment_params || {};
    let finalStatus = order.status;
    if (order.status === "pending") {
      let expiresAt = null;
      if (order.expires_at) {
        if (typeof order.expires_at === "string") {
          const timeStr = order.expires_at.trim();
          if (!timeStr.endsWith("Z") && !timeStr.match(/[+-]\d{2}:\d{2}$/)) {
            expiresAt = /* @__PURE__ */ new Date(timeStr + "Z");
            console.log(`[PaymentService] \u65F6\u95F4\u5B57\u7B26\u4E32\u65E0\u65F6\u533A\u4FE1\u606F\uFF0C\u6DFB\u52A0Z: ${timeStr} -> ${timeStr}Z`);
          } else {
            expiresAt = new Date(timeStr);
          }
        } else {
          expiresAt = order.expires_at;
        }
      }
      const now = Date.now();
      const expiresAtTime = expiresAt ? expiresAt.getTime() : 0;
      const timeDiff = now - expiresAtTime;
      if (expiresAt && expiresAtTime < now && timeDiff > 1e4) {
        console.log(`[PaymentService] \u8BA2\u5355 ${order.order_no || order.id} \u5DF2\u8FC7\u671F: expiresAt=${expiresAt.toISOString()}, now=${new Date(now).toISOString()}, diff=${(timeDiff / 1e3 / 60).toFixed(2)}\u5206\u949F`);
        this.paymentRepo.updateOrder(order.id, { status: "expired" }).catch((err) => {
          console.error(`\u66F4\u65B0\u8BA2\u5355 ${order.id} \u8FC7\u671F\u72B6\u6001\u5931\u8D25:`, err);
        });
        finalStatus = "expired" /* EXPIRED */;
      } else if (expiresAt) {
        const remainingMinutes = (expiresAtTime - now) / 1e3 / 60;
        if (remainingMinutes < 0 && timeDiff <= 1e4) {
          console.log(`[PaymentService] \u8BA2\u5355 ${order.order_no || order.id} \u65F6\u95F4\u5DEE\u5728\u5BB9\u9519\u8303\u56F4\u5185\uFF0C\u4E0D\u6807\u8BB0\u4E3A\u8FC7\u671F: expiresAt=${expiresAt.toISOString()}, now=${new Date(now).toISOString()}, diff=${(timeDiff / 1e3).toFixed(2)}\u79D2`);
        } else {
          console.log(`[PaymentService] \u8BA2\u5355 ${order.order_no || order.id} \u672A\u8FC7\u671F: expiresAt=${expiresAt.toISOString()}, now=${new Date(now).toISOString()}, \u5269\u4F59=${remainingMinutes.toFixed(2)}\u5206\u949F`);
        }
      }
    }
    return {
      id: order.id,
      amount: order.amount,
      currency: order.payment_method || order.currency,
      channel: order.payment_channel,
      toAddress: toAddress || paymentParams.to_address || metadata.to_address || "",
      status: finalStatus,
      description: order.description || "",
      orderId: orderNo || order.order_no,
      createdAt: typeof order.created_at === "string" ? order.created_at : order.created_at.toISOString(),
      updatedAt: typeof order.updated_at === "string" ? order.updated_at : order.updated_at.toISOString(),
      expiresAt: typeof order.expires_at === "string" ? order.expires_at : order.expires_at.toISOString(),
      paymentUrl: order.payment_url,
      qrCodeDataUrl: order.qr_code_data_url,
      userId: order.user_id,
      assetCode: metadata.asset_code || paymentParams.asset_code,
      bizType: metadata.biz_type,
      bizId: metadata.biz_id,
      extra: order.callback_data ? JSON.stringify(order.callback_data) : void 0
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

// src/common/middleware/admin.middleware.ts
import { RepositoryFactory } from "@mxmai/mxmdata";
function adminMiddleware(req, res, next) {
  (async () => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
      const adminToken = process.env.ADMIN_TOKEN;
      if (adminToken && token === adminToken) {
        req.user = {
          userId: "admin-test-user",
          username: "admin-test"
        };
        return next();
      }
      const userId = req.headers["x-user-id"];
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "User ID is required"
          }
        });
      }
      if (userId === "admin-test-user") {
        req.user = {
          userId: "admin-test-user",
          username: "admin-test"
        };
        return next();
      }
      const userRepo = RepositoryFactory.createUserRepository();
      const user = await userRepo.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "User not found"
          }
        });
      }
      if (user.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Admin access required"
          }
        });
      }
      req.user = {
        userId: user.id,
        username: user.username
      };
      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Admin check failed";
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message
        }
      });
    }
  })();
}

// src/api/payment.routes.ts
function createPaymentRoutes(paymentService) {
  const router = Router();
  router.post(
    "/create",
    [
      body("amount").isFloat({ min: 0.01 }).withMessage("\u91D1\u989D\u5FC5\u987B\u5927\u4E8E\u7B49\u4E8E 0.01"),
      body("currency").custom((value, { req }) => {
        const channel = req.body.channel;
        if (channel === "voucher" /* VOUCHER */ || channel === "apple_iap" /* APPLE_IAP */) {
          if (value !== "cny" /* CNY */ && value !== "usd" /* USD */) {
            throw new Error(`${channel} \u6E20\u9053\u7684 currency \u5FC5\u987B\u662F cny \u6216 usd`);
          }
          return true;
        }
        const validCurrencies = ["eth" /* ETH */, "usdt" /* USDT */, "usdc" /* USDC */, "btc" /* BTC */];
        if (!validCurrencies.includes(value)) {
          throw new Error("\u65E0\u6548\u7684\u652F\u4ED8\u8D27\u5E01");
        }
        return true;
      }),
      body("channel").isIn(["alipay" /* ALIPAY */, "wechat" /* WECHAT */, "paypal" /* PAYPAL */, "card" /* CARD */, "crypto" /* CRYPTO */, "voucher" /* VOUCHER */, "apple_iap" /* APPLE_IAP */]).withMessage("\u65E0\u6548\u7684\u652F\u4ED8\u901A\u9053"),
      // 对于 crypto 渠道，toAddress 是可选的（会从环境变量获取）
      // 对于其他渠道，toAddress 是必需的
      body("toAddress").optional().custom((value, { req }) => {
        const channel = req.body.channel;
        if (channel === "crypto" /* CRYPTO */ || channel === "voucher" /* VOUCHER */ || channel === "apple_iap" /* APPLE_IAP */) {
          return true;
        }
        if (!value || value.trim().length === 0) {
          throw new Error("\u6536\u6B3E\u5730\u5740\u4E0D\u80FD\u4E3A\u7A7A");
        }
        return true;
      }),
      body("description").optional().isString(),
      body("orderId").optional().isString(),
      body("userId").optional().isString(),
      body("asset_code").optional().isString(),
      body("biz_type").optional().isString(),
      body("biz_id").optional().isString(),
      validate
    ],
    async (req, res) => {
      try {
        const userId = req.headers["x-user-id"] || req.body.userId;
        const createDto = {
          ...req.body,
          userId,
          assetCode: req.body.asset_code
        };
        const order = await paymentService.createPayment(createDto);
        res.status(201).json(ApiResponseDto.success(order, "\u652F\u4ED8\u8BA2\u5355\u521B\u5EFA\u6210\u529F"));
      } catch (error) {
        res.status(400).json(ApiResponseDto.error(error.message || "\u521B\u5EFA\u8BA2\u5355\u5931\u8D25", 400));
      }
    }
  );
  router.post(
    "/iap/verify",
    [
      body("orderId").isString().notEmpty().withMessage("orderId \u4E0D\u80FD\u4E3A\u7A7A"),
      body("receipt").isString().notEmpty().withMessage("receipt \u4E0D\u80FD\u4E3A\u7A7A"),
      body("productId").optional().isString(),
      validate
    ],
    async (req, res) => {
      try {
        const userId = req.headers["x-user-id"] || req.body.userId;
        if (!userId) {
          return res.status(401).json(ApiResponseDto.error("\u7F3A\u5C11 x-user-id \u6216 userId", 401));
        }
        const order = await paymentService.verifyIapReceipt(
          req.body.orderId,
          req.body.receipt,
          req.body.productId
        );
        res.json(ApiResponseDto.success(order, "IAP \u6821\u9A8C\u6210\u529F\uFF0C\u5DF2\u5165\u8D26"));
      } catch (error) {
        res.status(400).json(ApiResponseDto.error(error.message || "IAP \u6821\u9A8C\u5931\u8D25", 400));
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
      query("channel").optional().isIn(["alipay" /* ALIPAY */, "wechat" /* WECHAT */, "paypal" /* PAYPAL */, "card" /* CARD */, "crypto" /* CRYPTO */, "voucher" /* VOUCHER */]),
      query("orderId").optional().isString(),
      query("page").optional().isInt({ min: 1 }).withMessage("\u9875\u7801\u5FC5\u987B\u5927\u4E8E\u7B49\u4E8E 1"),
      query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("\u6BCF\u9875\u6570\u91CF\u5FC5\u987B\u5728 1-100 \u4E4B\u95F4"),
      validate
    ],
    async (req, res) => {
      try {
        const userId = req.headers["x-user-id"];
        const { items, total, page, limit } = await paymentService.getPaymentOrders(
          req.query,
          { page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 10 },
          userId
          // 只查询当前用户的订单
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
  router.get(
    "/admin/orders",
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
      query("channel").optional().isIn(["alipay" /* ALIPAY */, "wechat" /* WECHAT */, "paypal" /* PAYPAL */, "card" /* CARD */, "crypto" /* CRYPTO */, "voucher" /* VOUCHER */]),
      query("orderId").optional().isString(),
      query("userId").optional().isString(),
      query("page").optional().isInt({ min: 1 }).withMessage("\u9875\u7801\u5FC5\u987B\u5927\u4E8E\u7B49\u4E8E 1"),
      query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("\u6BCF\u9875\u6570\u91CF\u5FC5\u987B\u5728 1-100 \u4E4B\u95F4"),
      validate,
      adminMiddleware
    ],
    async (req, res) => {
      try {
        const queryParams = req.query;
        const userId = queryParams.userId || void 0;
        const { items, total, page, limit } = await paymentService.getAllPaymentOrders(
          queryParams,
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
          "\u67E5\u8BE2\u6240\u6709\u8BA2\u5355\u6210\u529F"
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
      const userId = req.headers["x-user-id"];
      const stats = await paymentService.getPaymentStats(userId);
      res.json(ApiResponseDto.success(stats, "\u83B7\u53D6\u7EDF\u8BA1\u4FE1\u606F\u6210\u529F"));
    } catch (error) {
      res.status(400).json(ApiResponseDto.error(error.message || "\u83B7\u53D6\u7EDF\u8BA1\u4FE1\u606F\u5931\u8D25", 400));
    }
  });
  router.post(
    "/admin/voucher/issue",
    [
      body("userId").isString().notEmpty().withMessage("\u7528\u6237ID\u4E0D\u80FD\u4E3A\u7A7A"),
      body("amount").isFloat({ min: 0.01 }).withMessage("\u91D1\u989D\u5FC5\u987B\u5927\u4E8E0"),
      body("assetCode").isIn(["VOUCHER-CNY", "VOUCHER-USD"]).withMessage("\u8D44\u4EA7\u4EE3\u7801\u5FC5\u987B\u662F VOUCHER-CNY \u6216 VOUCHER-USD"),
      body("description").optional().isString(),
      body("bizType").optional().isString(),
      body("bizId").optional().isString(),
      validate,
      adminMiddleware
    ],
    async (req, res) => {
      try {
        const { userId, amount, assetCode, description, bizType, bizId } = req.body;
        const orderId = `VOUCHER${Date.now()}`;
        const currency = assetCode === "VOUCHER-CNY" ? "cny" /* CNY */ : "usd" /* USD */;
        const paymentOrder = await paymentService.createPayment({
          amount,
          currency,
          channel: "voucher" /* VOUCHER */,
          toAddress: "",
          description: description || "\u4EE3\u91D1\u5238\u53D1\u653E",
          orderId,
          userId,
          assetCode,
          bizType: bizType || "voucher_issue",
          bizId: bizId || orderId
        });
        res.status(201).json(ApiResponseDto.success(paymentOrder, "\u4EE3\u91D1\u5238\u53D1\u653E\u6210\u529F"));
      } catch (error) {
        res.status(400).json(ApiResponseDto.error(error.message || "\u4EE3\u91D1\u5238\u53D1\u653E\u5931\u8D25", 400));
      }
    }
  );
  return router;
}

// src/api/webhook.routes.ts
import { Router as Router2 } from "express";
import { param as param2 } from "express-validator";

// src/payment/listeners/blockchain-listener.service.ts
import { ethers } from "ethers";
import TronWeb from "tronweb";
import axios from "axios";
var USDT_ERC20_CONTRACT2 = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
var USDT_TRC20_CONTRACT2 = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
var USDT_ARBITRUM_CONTRACT2 = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9";
var USDT_POLYGON_CONTRACT2 = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
var LocalBlockchainListenerService = class {
  constructor() {
    this.ethProvider = null;
    this.arbitrumProvider = null;
    this.polygonProvider = null;
    this.tronWeb = null;
    this.ethContract = null;
    this.arbitrumContract = null;
    this.polygonContract = null;
    this.isRunning = false;
    this.lastEthBlock = 0;
    this.lastArbitrumBlock = 0;
    this.lastPolygonBlock = 0;
    this.lastTronBlock = 0;
    const ethRpcUrl = process.env.ETH_RPC_URL || "https://eth.llamarpc.com";
    const arbitrumRpcUrl = process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc";
    const polygonRpcUrl = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
    const tronRpcUrl = process.env.TRON_RPC_URL || "https://api.trongrid.io";
    this.webhookUrl = process.env.WEBHOOK_URL || "http://localhost:3001/payment/webhook/crypto";
    try {
      this.ethProvider = new ethers.JsonRpcProvider(ethRpcUrl);
      console.log("\u2705 Ethereum provider \u521D\u59CB\u5316\u6210\u529F");
    } catch (error) {
      console.error("\u274C Ethereum provider \u521D\u59CB\u5316\u5931\u8D25:", error);
    }
    try {
      this.arbitrumProvider = new ethers.JsonRpcProvider(arbitrumRpcUrl);
      console.log("\u2705 Arbitrum provider \u521D\u59CB\u5316\u6210\u529F");
    } catch (error) {
      console.error("\u274C Arbitrum provider \u521D\u59CB\u5316\u5931\u8D25:", error);
    }
    try {
      this.polygonProvider = new ethers.JsonRpcProvider(polygonRpcUrl);
      console.log("\u2705 Polygon provider \u521D\u59CB\u5316\u6210\u529F");
    } catch (error) {
      console.error("\u274C Polygon provider \u521D\u59CB\u5316\u5931\u8D25:", error);
    }
    try {
      this.tronWeb = new TronWeb({
        fullHost: tronRpcUrl
      });
      console.log("\u2705 Tron provider \u521D\u59CB\u5316\u6210\u529F");
    } catch (error) {
      console.error("\u274C Tron provider \u521D\u59CB\u5316\u5931\u8D25:", error);
    }
    const cryptoWallets = env.receivers.crypto;
    this.receiveAddresses = {
      erc20: cryptoWallets?.eth?.erc20?.usdt || process.env.CRYPTO_ERC20_USDT_ADDRESS || "",
      arbitrum: cryptoWallets?.arbitrum?.erc20?.usdt || process.env.CRYPTO_ARBITRUM_USDT_ADDRESS || "",
      polygon: cryptoWallets?.polygon?.erc20?.usdt || process.env.CRYPTO_POLYGON_USDT_ADDRESS || "",
      trc20: cryptoWallets?.tron?.trc20?.usdt || process.env.CRYPTO_TRC20_USDT_ADDRESS || ""
    };
    if (!this.receiveAddresses.erc20) {
      console.warn("\u26A0\uFE0F  \u672A\u914D\u7F6E ERC20-USDT \u6536\u6B3E\u5730\u5740");
    }
    if (!this.receiveAddresses.arbitrum) {
      console.warn("\u26A0\uFE0F  \u672A\u914D\u7F6E Arbitrum-USDT \u6536\u6B3E\u5730\u5740");
    }
    if (!this.receiveAddresses.polygon) {
      console.warn("\u26A0\uFE0F  \u672A\u914D\u7F6E Polygon-USDT \u6536\u6B3E\u5730\u5740");
    }
    if (!this.receiveAddresses.trc20) {
      console.warn("\u26A0\uFE0F  \u672A\u914D\u7F6E TRC20-USDT \u6536\u6B3E\u5730\u5740");
    }
    if (this.ethProvider && this.receiveAddresses.erc20) {
      this.ethContract = new ethers.Contract(
        USDT_ERC20_CONTRACT2,
        [
          "event Transfer(address indexed from, address indexed to, uint256 value)",
          "function decimals() view returns (uint8)"
        ],
        this.ethProvider
      );
    }
    if (this.arbitrumProvider && this.receiveAddresses.arbitrum) {
      this.arbitrumContract = new ethers.Contract(
        USDT_ARBITRUM_CONTRACT2,
        [
          "event Transfer(address indexed from, address indexed to, uint256 value)",
          "function decimals() view returns (uint8)"
        ],
        this.arbitrumProvider
      );
    }
    if (this.polygonProvider && this.receiveAddresses.polygon) {
      this.polygonContract = new ethers.Contract(
        USDT_POLYGON_CONTRACT2,
        [
          "event Transfer(address indexed from, address indexed to, uint256 value)",
          "function decimals() view returns (uint8)"
        ],
        this.polygonProvider
      );
    }
  }
  /**
   * 启动监听服务
   */
  async start() {
    if (this.isRunning) {
      console.warn("\u76D1\u542C\u670D\u52A1\u5DF2\u5728\u8FD0\u884C");
      return;
    }
    this.isRunning = true;
    console.log("\u{1F680} \u542F\u52A8\u533A\u5757\u94FE\u76D1\u542C\u670D\u52A1...");
    if (this.ethProvider) {
      try {
        const block = await this.ethProvider.getBlockNumber();
        this.lastEthBlock = block;
        console.log(`\u{1F4E6} Ethereum \u5F53\u524D\u533A\u5757: ${block}`);
      } catch (error) {
        console.error("\u83B7\u53D6 Ethereum \u533A\u5757\u9AD8\u5EA6\u5931\u8D25:", error);
      }
    }
    if (this.tronWeb) {
      try {
        const block = await this.tronWeb.trx.getCurrentBlock();
        this.lastTronBlock = block.block_header.raw_data.number;
        console.log(`\u{1F4E6} Tron \u5F53\u524D\u533A\u5757: ${this.lastTronBlock}`);
      } catch (error) {
        console.error("\u83B7\u53D6 Tron \u533A\u5757\u9AD8\u5EA6\u5931\u8D25:", error);
      }
    }
    this.startPolling();
  }
  /**
   * 停止监听服务
   */
  stop() {
    this.isRunning = false;
    console.log("\u{1F6D1} \u505C\u6B62\u533A\u5757\u94FE\u76D1\u542C\u670D\u52A1");
  }
  /**
   * 启动轮询
   */
  startPolling() {
    const pollInterval = Number(process.env.POLL_INTERVAL) || 1e4;
    const poll = async () => {
      if (!this.isRunning) return;
      try {
        if (this.ethProvider && this.ethContract && this.receiveAddresses.erc20) {
          await this.pollEthereum();
        }
        if (this.arbitrumProvider && this.arbitrumContract && this.receiveAddresses.arbitrum) {
          await this.pollArbitrum();
        }
        if (this.polygonProvider && this.polygonContract && this.receiveAddresses.polygon) {
          await this.pollPolygon();
        }
        if (this.tronWeb && this.receiveAddresses.trc20) {
          await this.pollTron();
        }
      } catch (error) {
        console.error("\u8F6E\u8BE2\u9519\u8BEF:", error);
      }
      setTimeout(poll, pollInterval);
    };
    poll();
  }
  /**
   * 轮询 Ethereum 链
   */
  async pollEthereum() {
    if (!this.ethProvider || !this.ethContract) return;
    try {
      const currentBlock = await this.ethProvider.getBlockNumber();
      if (currentBlock <= this.lastEthBlock) {
        return;
      }
      const fromBlock = this.lastEthBlock + 1;
      const toBlock = currentBlock;
      console.log(`\u{1F50D} \u626B\u63CF Ethereum \u533A\u5757 ${fromBlock} - ${toBlock}`);
      const filter = this.ethContract.filters.Transfer(
        null,
        // from (任意地址)
        this.receiveAddresses.erc20.toLowerCase()
        // to (我们的收款地址)
      );
      const events = await this.ethContract.queryFilter(filter, fromBlock, toBlock);
      for (const event of events) {
        await this.handleEVMTransfer(event, this.ethProvider, this.ethContract, this.receiveAddresses.erc20, "USDT-ERC20", USDT_ERC20_CONTRACT2);
      }
      this.lastEthBlock = currentBlock;
    } catch (error) {
      console.error("Ethereum \u8F6E\u8BE2\u9519\u8BEF:", error);
    }
  }
  /**
   * 处理 EVM 兼容链的 Transfer 事件（通用方法）
   */
  async handleEVMTransfer(event, provider, contract, receiveAddress, assetCode, contractAddress) {
    try {
      const parsedLog = contract.interface.parseLog({
        topics: event.topics,
        data: event.data
      });
      if (!parsedLog || parsedLog.name !== "Transfer") {
        return;
      }
      const from = parsedLog.args[0];
      const to = parsedLog.args[1];
      const value = parsedLog.args[2];
      const receipt = await provider.getTransactionReceipt(event.transactionHash);
      const amount = value.toString();
      const amountInUSDT = Number(amount) / 1e6;
      const chainName = assetCode.includes("ARBITRUM") ? "Arbitrum" : assetCode.includes("POLYGON") ? "Polygon" : "Ethereum";
      console.log(`\u{1F4B0} \u68C0\u6D4B\u5230 ${chainName}-USDT \u8F6C\u8D26: ${from} -> ${to}, \u91D1\u989D: ${amountInUSDT} USDT`);
      const order = await this.findPaymentOrder(receiveAddress, amountInUSDT.toString());
      if (order) {
        await this.sendWebhook({
          orderId: order.orderId,
          txHash: event.transactionHash,
          blockNumber: receipt.blockNumber,
          fromAddress: from,
          toAddress: to,
          amount: amountInUSDT.toString(),
          contractAddress,
          assetCode
        });
      } else {
        console.warn(`\u26A0\uFE0F  \u672A\u627E\u5230\u5BF9\u5E94\u7684\u652F\u4ED8\u8BA2\u5355: ${to}, ${amountInUSDT} USDT`);
      }
    } catch (error) {
      console.error(`\u5904\u7406 ${assetCode} \u4EA4\u6613\u5931\u8D25:`, error);
    }
  }
  /**
   * 轮询 Tron 链
   */
  async pollTron() {
    if (!this.tronWeb) return;
    try {
      const currentBlock = await this.tronWeb.trx.getCurrentBlock();
      const currentBlockNumber = currentBlock.block_header.raw_data.number;
      if (currentBlockNumber <= this.lastTronBlock) {
        return;
      }
      const fromBlock = this.lastTronBlock + 1;
      const toBlock = currentBlockNumber;
      console.log(`\u{1F50D} \u626B\u63CF Tron \u533A\u5757 ${fromBlock} - ${toBlock}`);
      for (let blockNum = fromBlock; blockNum <= toBlock; blockNum++) {
        const block = await this.tronWeb.trx.getBlockByNumber(blockNum);
        if (block && block.transactions) {
          for (const tx of block.transactions) {
            await this.handleTronTransaction(tx);
          }
        }
      }
      this.lastTronBlock = currentBlockNumber;
    } catch (error) {
      console.error("Tron \u8F6E\u8BE2\u9519\u8BEF:", error);
    }
  }
  /**
   * 处理 Tron 交易
   */
  async handleTronTransaction(tx) {
    try {
      if (!tx.raw_data || !tx.raw_data.contract) {
        return;
      }
      for (const contract of tx.raw_data.contract) {
        if (contract.type !== "TriggerSmartContract") {
          continue;
        }
        const parameter = contract.parameter?.value;
        if (!parameter) {
          continue;
        }
        const contractAddress = this.tronWeb.address.fromHex(parameter.contract_address);
        if (contractAddress !== USDT_TRC20_CONTRACT2) {
          continue;
        }
        const data = parameter.data;
        if (!data || data.substring(0, 10) !== "a9059cbb") {
          continue;
        }
        const toAddressHex = "41" + data.substring(34, 74);
        const toAddress = this.tronWeb.address.fromHex(toAddressHex);
        const amountHex = data.substring(74, 138);
        const amount = BigInt("0x" + amountHex).toString();
        if (toAddress.toLowerCase() !== this.receiveAddresses.trc20.toLowerCase()) {
          continue;
        }
        const amountInUSDT = Number(amount) / 1e6;
        console.log(`\u{1F4B0} \u68C0\u6D4B\u5230 TRC20-USDT \u8F6C\u8D26: ${toAddress}, \u91D1\u989D: ${amountInUSDT} USDT`);
        const order = await this.findPaymentOrder(this.receiveAddresses.trc20, amountInUSDT.toString());
        if (order) {
          await this.sendWebhook({
            orderId: order.orderId,
            txHash: tx.txID,
            blockNumber: tx.blockNumber || 0,
            fromAddress: this.tronWeb.address.fromHex(parameter.owner_address),
            toAddress,
            amount,
            contractAddress: USDT_TRC20_CONTRACT2,
            assetCode: "USDT-TRC20"
          });
        } else {
          console.warn(`\u26A0\uFE0F  \u672A\u627E\u5230\u5BF9\u5E94\u7684\u652F\u4ED8\u8BA2\u5355: ${toAddress}, ${amountInUSDT} USDT`);
        }
      }
    } catch (error) {
      console.error("\u5904\u7406 Tron \u4EA4\u6613\u5931\u8D25:", error);
    }
  }
  /**
   * 查找支付订单（通过收款地址和金额匹配）
   * 注意：这里需要连接数据库查询，实际实现需要注入 PaymentService
   * 
   * 可以通过 HTTP 请求查询订单，或者直接注入 PaymentService
   */
  async findPaymentOrder(toAddress, amount) {
    try {
      const apiUrl = process.env.MXMPAY_API_URL || "http://localhost:3001";
      const response = await axios.get(`${apiUrl}/payment`, {
        params: {
          status: "pending",
          channel: "crypto"
        },
        timeout: 5e3
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
                userId: order.userId || "",
                assetCode: order.assetCode || "",
                amount: order.amount,
                toAddress: order.toAddress
              };
            }
          }
        }
      }
      return null;
    } catch (error) {
      console.error("\u67E5\u8BE2\u652F\u4ED8\u8BA2\u5355\u5931\u8D25:", error);
      return null;
    }
  }
  /**
   * 发送 Webhook 通知
   */
  async sendWebhook(data) {
    try {
      const response = await axios.post(this.webhookUrl, data, {
        headers: {
          "Content-Type": "application/json"
        },
        timeout: 1e4
      });
      console.log(`\u2705 Webhook \u53D1\u9001\u6210\u529F: ${data.orderId}, txHash: ${data.txHash}`);
    } catch (error) {
      console.error(`\u274C Webhook \u53D1\u9001\u5931\u8D25: ${error.message}`, error.response?.data);
    }
  }
};

// src/payment/listeners/alchemy-listener.service.ts
import axios2 from "axios";
var USDT_ERC20_CONTRACT3 = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
var AlchemyListenerService = class {
  constructor(paymentService) {
    this.isRunning = false;
    this.alchemyWebhookId = null;
    this.paymentService = paymentService;
    this.alchemyApiKey = process.env.ALCHEMY_API_KEY || "";
    this.webhookUrl = process.env.WEBHOOK_URL || "http://localhost:3001/payment/webhook/crypto";
    const cryptoWallets = env.receivers.crypto;
    this.receiveAddresses = {
      erc20: cryptoWallets?.eth?.erc20?.usdt || process.env.CRYPTO_ERC20_USDT_ADDRESS || "",
      trc20: cryptoWallets?.tron?.trc20?.usdt || process.env.CRYPTO_TRC20_USDT_ADDRESS || ""
    };
    if (!this.alchemyApiKey) {
      throw new Error("ALCHEMY_API_KEY \u73AF\u5883\u53D8\u91CF\u672A\u914D\u7F6E");
    }
    if (!this.receiveAddresses.erc20) {
      throw new Error("CRYPTO_ERC20_USDT_ADDRESS \u73AF\u5883\u53D8\u91CF\u672A\u914D\u7F6E");
    }
  }
  /**
   * 启动监听服务
   * 创建或更新 Alchemy Webhook
   */
  async start() {
    if (this.isRunning) {
      console.warn("Alchemy \u76D1\u542C\u670D\u52A1\u5DF2\u5728\u8FD0\u884C");
      return;
    }
    console.log("\u{1F680} \u542F\u52A8 Alchemy \u76D1\u542C\u670D\u52A1...");
    try {
      const existingWebhooks = await this.listWebhooks();
      const existingWebhook = existingWebhooks.find(
        (wh) => wh.url === this.webhookUrl && wh.addresses?.includes(this.receiveAddresses.erc20.toLowerCase())
      );
      if (existingWebhook) {
        this.alchemyWebhookId = existingWebhook.id;
        console.log(`\u2705 \u4F7F\u7528\u73B0\u6709 Webhook: ${this.alchemyWebhookId}`);
      } else {
        this.alchemyWebhookId = await this.createWebhook();
        console.log(`\u2705 \u521B\u5EFA\u65B0 Webhook: ${this.alchemyWebhookId}`);
      }
      this.isRunning = true;
      console.log("\u2705 Alchemy \u76D1\u542C\u670D\u52A1\u5DF2\u542F\u52A8");
    } catch (error) {
      console.error("\u274C Alchemy \u76D1\u542C\u670D\u52A1\u542F\u52A8\u5931\u8D25:", error.message);
      throw error;
    }
  }
  /**
   * 停止监听服务
   */
  stop() {
    this.isRunning = false;
    console.log("\u{1F6D1} \u505C\u6B62 Alchemy \u76D1\u542C\u670D\u52A1");
  }
  /**
   * 检查服务是否运行中
   */
  isRunning() {
    return this.isRunning;
  }
  /**
   * 创建 Alchemy Webhook
   */
  async createWebhook() {
    const url = `https://dashboard.alchemy.com/api/create-webhook`;
    const payload = {
      webhook_type: "ADDRESS_ACTIVITY",
      app_id: this.alchemyApiKey,
      webhook_url: this.webhookUrl,
      addresses: [this.receiveAddresses.erc20.toLowerCase()],
      network: "ETH_MAINNET"
    };
    try {
      const response = await axios2.post(url, payload, {
        headers: {
          "Content-Type": "application/json"
        }
      });
      return response.data.data.id;
    } catch (error) {
      throw new Error(`\u521B\u5EFA Alchemy Webhook \u5931\u8D25: ${error.message}`);
    }
  }
  /**
   * 列出所有 Webhook
   */
  async listWebhooks() {
    const url = `https://dashboard.alchemy.com/api/webhooks?app_id=${this.alchemyApiKey}`;
    try {
      const response = await axios2.get(url);
      return response.data.data || [];
    } catch (error) {
      console.error("\u5217\u51FA Alchemy Webhook \u5931\u8D25:", error.message);
      return [];
    }
  }
  /**
   * 处理 Alchemy Webhook 回调
   * 这个方法应该被 webhook 路由调用
   */
  async handleWebhook(body3) {
    if (body3.type !== "ADDRESS_ACTIVITY") {
      return;
    }
    const activities = body3.event?.activity || [];
    for (const activity of activities) {
      if (activity.category !== "token" || activity.asset !== USDT_ERC20_CONTRACT3) {
        continue;
      }
      if (activity.toAddress?.toLowerCase() !== this.receiveAddresses.erc20.toLowerCase()) {
        continue;
      }
      const amount = activity.value || "0";
      const amountInUSDT = Number(amount) / 1e6;
      console.log(`\u{1F4B0} Alchemy \u68C0\u6D4B\u5230 ERC20-USDT \u8F6C\u8D26: ${activity.fromAddress} -> ${activity.toAddress}, \u91D1\u989D: ${amountInUSDT} USDT`);
      const order = await this.findPaymentOrder(this.receiveAddresses.erc20, amountInUSDT.toString());
      if (order) {
        if (this.paymentService) {
          try {
            await this.paymentService.markPaymentSuccess(order.id, {
              txHash: activity.hash,
              blockNumber: parseInt(activity.blockNum, 16),
              fromAddress: activity.fromAddress,
              toAddress: activity.toAddress,
              amount,
              contractAddress: USDT_ERC20_CONTRACT3,
              assetCode: "USDT-ERC20"
            });
            console.log(`\u2705 \u652F\u4ED8\u8BA2\u5355\u5DF2\u66F4\u65B0: ${order.orderId}`);
          } catch (error) {
            console.error(`\u274C \u66F4\u65B0\u652F\u4ED8\u8BA2\u5355\u5931\u8D25: ${error.message}`);
          }
        } else {
          await this.sendWebhook({
            orderId: order.orderId,
            txHash: activity.hash,
            blockNumber: parseInt(activity.blockNum, 16),
            fromAddress: activity.fromAddress,
            toAddress: activity.toAddress,
            amount,
            contractAddress: USDT_ERC20_CONTRACT3,
            assetCode: "USDT-ERC20"
          });
        }
      } else {
        console.warn(`\u26A0\uFE0F  \u672A\u627E\u5230\u5BF9\u5E94\u7684\u652F\u4ED8\u8BA2\u5355: ${activity.toAddress}, ${amountInUSDT} USDT`);
      }
    }
  }
  /**
   * 查找支付订单
   */
  async findPaymentOrder(toAddress, amount) {
    try {
      const apiUrl = process.env.MXMPAY_API_URL || "http://localhost:3001";
      const response = await axios2.get(`${apiUrl}/payment`, {
        params: {
          status: "pending",
          channel: "crypto"
        },
        timeout: 5e3
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
                userId: order.userId || "",
                assetCode: order.assetCode || "",
                amount: order.amount,
                toAddress: order.toAddress
              };
            }
          }
        }
      }
      return null;
    } catch (error) {
      console.error("\u67E5\u8BE2\u652F\u4ED8\u8BA2\u5355\u5931\u8D25:", error);
      return null;
    }
  }
  /**
   * 发送 Webhook 通知
   */
  async sendWebhook(data) {
    try {
      const response = await axios2.post(this.webhookUrl, data, {
        headers: {
          "Content-Type": "application/json"
        },
        timeout: 1e4
      });
      console.log(`\u2705 Webhook \u53D1\u9001\u6210\u529F: ${data.orderId}, txHash: ${data.txHash}`);
    } catch (error) {
      console.error(`\u274C Webhook \u53D1\u9001\u5931\u8D25: ${error.message}`, error.response?.data);
    }
  }
};

// src/payment/listeners/infura-listener.service.ts
import axios3 from "axios";
var USDT_ERC20_CONTRACT4 = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
var InfuraListenerService = class {
  constructor(paymentService) {
    this.isRunning = false;
    this.infuraWebhookId = null;
    this.paymentService = paymentService;
    this.infuraProjectId = process.env.INFURA_PROJECT_ID || "";
    this.infuraProjectSecret = process.env.INFURA_PROJECT_SECRET || "";
    this.webhookUrl = process.env.WEBHOOK_URL || "http://localhost:3001/payment/webhook/crypto";
    const cryptoWallets = env.receivers.crypto;
    this.receiveAddresses = {
      erc20: cryptoWallets?.eth?.erc20?.usdt || process.env.CRYPTO_ERC20_USDT_ADDRESS || "",
      trc20: cryptoWallets?.tron?.trc20?.usdt || process.env.CRYPTO_TRC20_USDT_ADDRESS || ""
    };
    if (!this.infuraProjectId) {
      throw new Error("INFURA_PROJECT_ID \u73AF\u5883\u53D8\u91CF\u672A\u914D\u7F6E");
    }
    if (!this.receiveAddresses.erc20) {
      throw new Error("CRYPTO_ERC20_USDT_ADDRESS \u73AF\u5883\u53D8\u91CF\u672A\u914D\u7F6E");
    }
  }
  /**
   * 启动监听服务
   * 创建或更新 Infura Webhook
   */
  async start() {
    if (this.isRunning) {
      console.warn("Infura \u76D1\u542C\u670D\u52A1\u5DF2\u5728\u8FD0\u884C");
      return;
    }
    console.log("\u{1F680} \u542F\u52A8 Infura \u76D1\u542C\u670D\u52A1...");
    try {
      const existingWebhooks = await this.listWebhooks();
      const existingWebhook = existingWebhooks.find(
        (wh) => wh.url === this.webhookUrl && wh.addresses?.includes(this.receiveAddresses.erc20.toLowerCase())
      );
      if (existingWebhook) {
        this.infuraWebhookId = existingWebhook.id;
        console.log(`\u2705 \u4F7F\u7528\u73B0\u6709 Webhook: ${this.infuraWebhookId}`);
      } else {
        this.infuraWebhookId = await this.createWebhook();
        console.log(`\u2705 \u521B\u5EFA\u65B0 Webhook: ${this.infuraWebhookId}`);
      }
      this.isRunning = true;
      console.log("\u2705 Infura \u76D1\u542C\u670D\u52A1\u5DF2\u542F\u52A8");
    } catch (error) {
      console.error("\u274C Infura \u76D1\u542C\u670D\u52A1\u542F\u52A8\u5931\u8D25:", error.message);
      throw error;
    }
  }
  /**
   * 停止监听服务
   */
  stop() {
    this.isRunning = false;
    console.log("\u{1F6D1} \u505C\u6B62 Infura \u76D1\u542C\u670D\u52A1");
  }
  /**
   * 检查服务是否运行中
   */
  isRunning() {
    return this.isRunning;
  }
  /**
   * 创建 Infura Webhook
   */
  async createWebhook() {
    const url = `https://api.infura.io/v3/webhooks`;
    const auth = Buffer.from(`${this.infuraProjectId}:${this.infuraProjectSecret}`).toString("base64");
    const payload = {
      type: "addressActivity",
      url: this.webhookUrl,
      addresses: [this.receiveAddresses.erc20.toLowerCase()],
      network: "mainnet"
    };
    try {
      const response = await axios3.post(url, payload, {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${auth}`
        }
      });
      return response.data.data.id;
    } catch (error) {
      throw new Error(`\u521B\u5EFA Infura Webhook \u5931\u8D25: ${error.message}`);
    }
  }
  /**
   * 列出所有 Webhook
   */
  async listWebhooks() {
    const url = `https://api.infura.io/v3/webhooks`;
    const auth = Buffer.from(`${this.infuraProjectId}:${this.infuraProjectSecret}`).toString("base64");
    try {
      const response = await axios3.get(url, {
        headers: {
          "Authorization": `Basic ${auth}`
        }
      });
      return response.data.data || [];
    } catch (error) {
      console.error("\u5217\u51FA Infura Webhook \u5931\u8D25:", error.message);
      return [];
    }
  }
  /**
   * 处理 Infura Webhook 回调
   * 这个方法应该被 webhook 路由调用
   */
  async handleWebhook(body3) {
    if (body3.type !== "addressActivity") {
      return;
    }
    const activities = body3.data?.activity || [];
    for (const activity of activities) {
      if (!activity.contractAddress || activity.contractAddress.toLowerCase() !== USDT_ERC20_CONTRACT4.toLowerCase()) {
        continue;
      }
      if (activity.to?.toLowerCase() !== this.receiveAddresses.erc20.toLowerCase()) {
        continue;
      }
      const amount = activity.value || "0";
      const amountInUSDT = Number(amount) / 1e6;
      console.log(`\u{1F4B0} Infura \u68C0\u6D4B\u5230 ERC20-USDT \u8F6C\u8D26: ${activity.from} -> ${activity.to}, \u91D1\u989D: ${amountInUSDT} USDT`);
      const order = await this.findPaymentOrder(this.receiveAddresses.erc20, amountInUSDT.toString());
      if (order) {
        if (this.paymentService) {
          try {
            await this.paymentService.markPaymentSuccess(order.id, {
              txHash: activity.transactionHash,
              blockNumber: parseInt(activity.blockNumber, 10),
              fromAddress: activity.from,
              toAddress: activity.to,
              amount,
              contractAddress: USDT_ERC20_CONTRACT4,
              assetCode: "USDT-ERC20"
            });
            console.log(`\u2705 \u652F\u4ED8\u8BA2\u5355\u5DF2\u66F4\u65B0: ${order.orderId}`);
          } catch (error) {
            console.error(`\u274C \u66F4\u65B0\u652F\u4ED8\u8BA2\u5355\u5931\u8D25: ${error.message}`);
          }
        } else {
          await this.sendWebhook({
            orderId: order.orderId,
            txHash: activity.transactionHash,
            blockNumber: parseInt(activity.blockNumber, 10),
            fromAddress: activity.from,
            toAddress: activity.to,
            amount,
            contractAddress: USDT_ERC20_CONTRACT4,
            assetCode: "USDT-ERC20"
          });
        }
      } else {
        console.warn(`\u26A0\uFE0F  \u672A\u627E\u5230\u5BF9\u5E94\u7684\u652F\u4ED8\u8BA2\u5355: ${activity.to}, ${amountInUSDT} USDT`);
      }
    }
  }
  /**
   * 查找支付订单
   */
  async findPaymentOrder(toAddress, amount) {
    try {
      const apiUrl = process.env.MXMPAY_API_URL || "http://localhost:3001";
      const response = await axios3.get(`${apiUrl}/payment`, {
        params: {
          status: "pending",
          channel: "crypto"
        },
        timeout: 5e3
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
                userId: order.userId || "",
                assetCode: order.assetCode || "",
                amount: order.amount,
                toAddress: order.toAddress
              };
            }
          }
        }
      }
      return null;
    } catch (error) {
      console.error("\u67E5\u8BE2\u652F\u4ED8\u8BA2\u5355\u5931\u8D25:", error);
      return null;
    }
  }
  /**
   * 发送 Webhook 通知
   */
  async sendWebhook(data) {
    try {
      const response = await axios3.post(this.webhookUrl, data, {
        headers: {
          "Content-Type": "application/json"
        },
        timeout: 1e4
      });
      console.log(`\u2705 Webhook \u53D1\u9001\u6210\u529F: ${data.orderId}, txHash: ${data.txHash}`);
    } catch (error) {
      console.error(`\u274C Webhook \u53D1\u9001\u5931\u8D25: ${error.message}`, error.response?.data);
    }
  }
};

// src/payment/listeners/listener.factory.ts
var ListenerFactory = class {
  /**
   * 创建监听服务实例
   */
  static create(paymentService) {
    const listenerType = (process.env.LISTENER_TYPE || "local").toLowerCase();
    switch (listenerType) {
      case "alchemy":
        console.log("\u{1F4E1} \u4F7F\u7528 Alchemy \u76D1\u542C\u670D\u52A1");
        return new AlchemyListenerService(paymentService);
      case "infura":
        console.log("\u{1F4E1} \u4F7F\u7528 Infura \u76D1\u542C\u670D\u52A1");
        return new InfuraListenerService(paymentService);
      case "local":
      default:
        console.log("\u{1F4E1} \u4F7F\u7528\u672C\u5730\u76D1\u542C\u670D\u52A1");
        return new LocalBlockchainListenerService();
    }
  }
  /**
   * 获取当前监听类型
   */
  static getType() {
    return (process.env.LISTENER_TYPE || "local").toLowerCase();
  }
};

// src/api/webhook.routes.ts
function createWebhookRoutes(gatewayFactory, paymentService) {
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
        if (channel === "crypto" /* CRYPTO */) {
          const listenerType = ListenerFactory.getType();
          if (listenerType === "alchemy" || listenerType === "infura") {
            let listener;
            if (listenerType === "alchemy") {
              listener = new AlchemyListenerService(paymentService);
              await listener.handleWebhook(req.body);
            } else {
              listener = new InfuraListenerService(paymentService);
              await listener.handleWebhook(req.body);
            }
            return res.json(ApiResponseDto.success({ processed: true }, "\u56DE\u8C03\u5904\u7406\u6210\u529F"));
          }
        }
        const gateway = gatewayFactory.get(channel);
        const result = await gateway.handleWebhook(req.headers, req.body);
        if (channel === "crypto" /* CRYPTO */ && result.status === "success") {
          const orderId = result.orderId;
          if (orderId && orderId !== "unknown") {
            try {
              const payment = await paymentService.getPaymentOrder(orderId);
              await paymentService.markPaymentSuccess(payment.id, result.raw || {});
            } catch (error) {
              console.error(`\u66F4\u65B0\u652F\u4ED8\u8BA2\u5355\u72B6\u6001\u5931\u8D25: ${error.message}`, error);
            }
          }
        }
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
  },
  {
    assetCode: "USDT-ARBITRUM",
    displayName: "USDT (Arbitrum)",
    type: "crypto",
    precision: 6,
    metadata: {
      chain: "arbitrum",
      contractAddress: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"
    }
  },
  {
    assetCode: "USDT-POLYGON",
    displayName: "USDT (Polygon)",
    type: "crypto",
    precision: 6,
    metadata: {
      chain: "polygon",
      contractAddress: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F"
    }
  },
  {
    assetCode: "VOUCHER-CNY",
    displayName: "\u4EE3\u91D1\u5238 (\u4EBA\u6C11\u5E01)",
    type: "other",
    precision: 2,
    metadata: {
      type: "voucher",
      currency: "CNY"
    }
  },
  {
    assetCode: "VOUCHER-USD",
    displayName: "\u4EE3\u91D1\u5238 (\u7F8E\u5143)",
    type: "other",
    precision: 2,
    metadata: {
      type: "voucher",
      currency: "USD"
    }
  }
];

// src/wallet/wallet.service.ts
Decimal.set({ precision: 36, rounding: Decimal.ROUND_DOWN });
var WalletService = class {
  constructor(walletRepo) {
    this.walletRepo = walletRepo;
  }
  /**
   * 初始化默认资产配置
   */
  async ensureDefaultAssets() {
    for (const asset of DEFAULT_ASSETS) {
      const exists = await this.walletRepo.findAssetByCode(asset.assetCode);
      if (!exists) {
        await this.walletRepo.createAsset({
          code: asset.assetCode,
          name: asset.displayName,
          symbol: asset.assetCode,
          type: asset.type === "crypto" ? "crypto" : "fiat",
          decimals: asset.precision,
          enabled: true
        });
      }
    }
  }
  async listAssets() {
    return this.walletRepo.findAllAssets();
  }
  /**
   * 获取用户全部钱包，懒创建：若没有任何钱包则自动创建默认 CNY 钱包
   */
  async getWallets(userId) {
    const wallets = await this.walletRepo.findWalletsByUserId(userId);
    if (wallets.length === 0) {
      const defaultAsset = (await this.walletRepo.findAllAssets()).find((a) => a.code === "CNY") || { code: "CNY" };
      const created = await this.getOrCreateWallet(userId, defaultAsset.code);
      return [created];
    }
    return wallets;
  }
  /**
   * 获取单个资产钱包，懒创建：若不存在则自动创建
   */
  async getWallet(userId, assetCode) {
    const wallet = await this.walletRepo.findWalletByUserAndAsset(userId, assetCode);
    if (wallet) return wallet;
    const asset = await this.walletRepo.findAssetByCode(assetCode);
    if (!asset) return null;
    return this.getOrCreateWallet(userId, assetCode);
  }
  async getOrCreateWallet(userId, assetCode) {
    let wallet = await this.walletRepo.findWalletByUserAndAsset(userId, assetCode);
    if (!wallet) {
      wallet = await this.walletRepo.createWallet({
        user_id: userId,
        asset_code: assetCode,
        available_balance: "0",
        frozen_balance: "0"
      });
    }
    return wallet;
  }
  async getTransactions(userId, assetCode, limit = 20) {
    return this.walletRepo.findTransactionsByUserAndAsset(userId, assetCode, limit);
  }
  async deposit(userId, assetCode, amount, options2 = {}) {
    return this.adjustBalance(userId, assetCode, amount, "deposit", options2);
  }
  async withdraw(userId, assetCode, amount, options2 = {}) {
    return this.adjustBalance(userId, assetCode, amount, "withdraw", options2);
  }
  async adjustBalance(userId, assetCode, rawAmount, type, options2) {
    const amount = new Decimal(rawAmount);
    if (amount.lte(0)) {
      throw new Error("\u91D1\u989D\u5FC5\u987B\u5927\u4E8E 0");
    }
    const wallet = await this.getOrCreateWallet(userId, assetCode);
    const asset = await this.walletRepo.findAssetByCode(assetCode);
    if (!asset) {
      throw new Error(`\u8D44\u4EA7 ${assetCode} \u672A\u914D\u7F6E`);
    }
    const currentBalance = new Decimal(wallet.available_balance || "0");
    let nextBalance;
    if (type === "deposit") {
      nextBalance = currentBalance.add(amount);
    } else {
      nextBalance = currentBalance.minus(amount);
      if (nextBalance.lt(0)) {
        throw new Error("\u4F59\u989D\u4E0D\u8DB3");
      }
    }
    const updatedWallet = await this.walletRepo.updateWalletBalance(wallet.id, {
      available_balance: nextBalance.toFixed(asset.decimals)
    });
    await this.walletRepo.createTransaction({
      wallet_id: wallet.id,
      user_id: userId,
      asset_code: assetCode,
      type,
      amount: amount.toFixed(asset.decimals),
      balance_before: currentBalance.toFixed(asset.decimals),
      balance_after: nextBalance.toFixed(asset.decimals),
      reference_id: options2.referenceId,
      metadata: {
        ...options2.metadata,
        bizTag: options2.bizTag
      }
    });
    return updatedWallet;
  }
};

// src/wallet/wallet-task.service.ts
var WalletTaskService = class {
  constructor(walletRepo, walletService) {
    this.walletRepo = walletRepo;
    this.walletService = walletService;
  }
  /**
   * 创建充值任务并执行入账
   */
  async createDepositTaskAndApply(options2) {
    const task = await this.walletRepo.createTask({
      user_id: options2.userId,
      payment_id: options2.paymentId,
      type: "deposit",
      asset_code: options2.assetCode,
      amount: options2.amount,
      channel: options2.channel,
      status: "pending",
      biz_type: options2.bizType,
      biz_id: options2.bizId,
      metadata: options2.metadata || {}
    });
    try {
      await this.walletService.deposit(
        options2.userId,
        options2.assetCode,
        options2.amount,
        {
          referenceId: task.id,
          metadata: options2.metadata,
          bizTag: options2.bizType
        }
      );
      const updatedTask = await this.walletRepo.updateTask(task.id, {
        status: "success"
      });
      return updatedTask;
    } catch (error) {
      const errorMetadata = options2.metadata || {};
      errorMetadata.error = error.message;
      await this.walletRepo.updateTask(task.id, {
        status: "failed",
        metadata: errorMetadata
      });
      throw error;
    }
  }
  /**
   * 创建支付任务并执行扣款
   */
  async createPaymentTaskAndApply(options2) {
    const task = await this.walletRepo.createTask({
      user_id: options2.userId,
      payment_id: void 0,
      type: "payment",
      asset_code: options2.assetCode,
      amount: options2.amount,
      channel: "crypto",
      // 默认使用 crypto，实际应该从业务层传入
      status: "pending",
      biz_type: options2.bizType,
      biz_id: options2.bizId,
      metadata: options2.metadata || {}
    });
    try {
      await this.walletService.withdraw(
        options2.userId,
        options2.assetCode,
        options2.amount,
        {
          referenceId: task.id,
          metadata: options2.metadata,
          bizTag: options2.bizType
        }
      );
      const updatedTask = await this.walletRepo.updateTask(task.id, {
        status: "success"
      });
      return updatedTask;
    } catch (error) {
      const errorMetadata = options2.metadata || {};
      errorMetadata.error = error.message;
      await this.walletRepo.updateTask(task.id, {
        status: "failed",
        metadata: errorMetadata
      });
      throw error;
    }
  }
  /**
   * 查询任务列表
   */
  async listTasks(userId, filters, pagination) {
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 20;
    const { tasks, total } = await this.walletRepo.findTasksByUserId(userId, {
      type: filters?.type,
      status: filters?.status,
      limit,
      offset: (page - 1) * limit
    });
    let filteredTasks = tasks;
    if (filters?.assetCode) {
      filteredTasks = filteredTasks.filter((t) => t.asset_code === filters.assetCode);
    }
    if (filters?.channel) {
      filteredTasks = filteredTasks.filter((t) => t.channel === filters.channel);
    }
    return {
      items: filteredTasks,
      total,
      page,
      limit
    };
  }
};

// src/api/wallet.routes.ts
import { Router as Router3 } from "express";
import { body as body2, param as param3, query as query2 } from "express-validator";
function resolveUserId(req) {
  return req.headers["x-user-id"] || req.query.userId || req.body?.userId || null;
}
function createWalletRoutes(walletService, walletTaskService) {
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
      adminMiddleware,
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
  router.post(
    "/payment",
    [
      body2("asset_code").isString().notEmpty().withMessage("\u8D44\u4EA7\u4EE3\u7801\u4E0D\u80FD\u4E3A\u7A7A"),
      body2("price").isString().notEmpty().withMessage("\u4EF7\u683C\u4E0D\u80FD\u4E3A\u7A7A"),
      body2("biz_type").optional().isString(),
      body2("biz_id").optional().isString(),
      body2("description").optional().isString(),
      body2("userId").optional().isString(),
      validate
    ],
    async (req, res) => {
      try {
        const userId = resolveUserId(req);
        if (!userId) {
          return res.status(400).json(ApiResponseDto.error("\u7F3A\u5C11\u7528\u6237\u6807\u8BC6", 400));
        }
        const task = await walletTaskService.createPaymentTaskAndApply({
          userId,
          assetCode: req.body.asset_code,
          amount: req.body.price,
          bizType: req.body.biz_type,
          bizId: req.body.biz_id,
          metadata: req.body.description ? { description: req.body.description } : void 0
        });
        const wallet = await walletService.getWallet(userId, req.body.asset_code);
        res.status(201).json(ApiResponseDto.success(
          {
            task,
            wallet
          },
          "\u652F\u4ED8\u6210\u529F"
        ));
      } catch (error) {
        const status = error.message.includes("\u4F59\u989D\u4E0D\u8DB3") ? 422 : 400;
        res.status(status).json(ApiResponseDto.error(error.message || "\u652F\u4ED8\u5931\u8D25", status));
      }
    }
  );
  router.get(
    "/tasks",
    [
      query2("userId").optional().isString(),
      query2("type").optional().isIn(["deposit", "payment"]),
      query2("status").optional().isIn(["pending", "success", "failed"]),
      query2("asset_code").optional().isString(),
      query2("channel").optional().isString(),
      query2("page").optional().isInt({ min: 1 }),
      query2("limit").optional().isInt({ min: 1, max: 100 }),
      validate
    ],
    async (req, res) => {
      try {
        const userId = resolveUserId(req);
        if (!userId) {
          return res.status(400).json(ApiResponseDto.error("\u7F3A\u5C11\u7528\u6237\u6807\u8BC6", 400));
        }
        const result = await walletTaskService.listTasks(
          userId,
          {
            type: req.query.type,
            status: req.query.status,
            assetCode: req.query.asset_code,
            channel: req.query.channel
          },
          {
            page: Number(req.query.page) || 1,
            limit: Number(req.query.limit) || 20
          }
        );
        res.json(ApiResponseDto.success(result, "\u83B7\u53D6\u4EFB\u52A1\u5217\u8868\u6210\u529F"));
      } catch (error) {
        res.status(400).json(ApiResponseDto.error(error.message || "\u67E5\u8BE2\u5931\u8D25", 400));
      }
    }
  );
  router.get(
    "/admin/:targetUserId/:assetCode",
    [adminMiddleware, param3("targetUserId").isString().notEmpty(), param3("assetCode").isString().notEmpty(), validate],
    async (req, res) => {
      const wallet = await walletService.getWallet(req.params.targetUserId, req.params.assetCode);
      if (!wallet) {
        return res.status(404).json(ApiResponseDto.error("\u94B1\u5305\u4E0D\u5B58\u5728", 404));
      }
      res.json(ApiResponseDto.success(wallet, "\u83B7\u53D6\u7528\u6237\u94B1\u5305\u6210\u529F"));
    }
  );
  router.get(
    "/admin/:targetUserId",
    [adminMiddleware, param3("targetUserId").isString().notEmpty(), validate],
    async (req, res) => {
      const wallets = await walletService.getWallets(req.params.targetUserId);
      res.json(ApiResponseDto.success(wallets, "\u83B7\u53D6\u7528\u6237\u94B1\u5305\u5217\u8868\u6210\u529F"));
    }
  );
  router.post(
    "/admin/:targetUserId/:assetCode/deposit",
    [
      adminMiddleware,
      param3("targetUserId").isString().notEmpty(),
      param3("assetCode").isString().notEmpty(),
      body2("amount").isString().notEmpty().withMessage("amount \u4E0D\u80FD\u4E3A\u7A7A"),
      body2("referenceId").optional().isString(),
      body2("metadata").optional().isObject(),
      validate
    ],
    async (req, res) => {
      try {
        const wallet = await walletService.deposit(
          req.params.targetUserId,
          req.params.assetCode,
          req.body.amount,
          req.body
        );
        res.status(201).json(ApiResponseDto.success(wallet, "\u5145\u503C\u6210\u529F"));
      } catch (error) {
        res.status(400).json(ApiResponseDto.error(error.message || "\u5145\u503C\u5931\u8D25", 400));
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
var PaymentExpirationScheduler = class {
  constructor(paymentRepo) {
    this.task = null;
    this.paymentRepo = paymentRepo;
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
    const now = /* @__PURE__ */ new Date();
    const { orders } = await this.paymentRepo.findOrdersByUserId("", {
      status: "pending",
      limit: 1e3
      // 限制每次处理的数量
    });
    const toExpire = orders.filter((order) => {
      let expiresAt = null;
      if (order.expires_at) {
        if (typeof order.expires_at === "string") {
          const timeStr = order.expires_at.trim();
          if (!timeStr.endsWith("Z") && !timeStr.match(/[+-]\d{2}:\d{2}$/)) {
            expiresAt = /* @__PURE__ */ new Date(timeStr + "Z");
          } else {
            expiresAt = new Date(timeStr);
          }
        } else {
          expiresAt = order.expires_at;
        }
      }
      if (!expiresAt) return false;
      const timeDiff = now.getTime() - expiresAt.getTime();
      return timeDiff > 1e4;
    });
    if (toExpire.length === 0) return 0;
    for (const order of toExpire) {
      try {
        await this.paymentRepo.updateOrder(order.id, { status: "expired" });
        console.log(`\u23F0 \u8BA2\u5355 ${order.order_no || order.id} \u5DF2\u6807\u8BB0\u4E3A\u8FC7\u671F`);
      } catch (error) {
        console.error(`\u66F4\u65B0\u8BA2\u5355 ${order.id} \u72B6\u6001\u5931\u8D25:`, error);
      }
    }
    console.log(`\u23F0 \u8FC7\u671F\u8BA2\u5355\u6570\u91CF: ${toExpire.length}`);
    return toExpire.length;
  }
};

// src/app.ts
async function createApp() {
  try {
    const config = loadDataConfig();
    RepositoryFactory2.init(config);
    console.log("\u2705 mxmdata \u521D\u59CB\u5316\u6210\u529F");
  } catch (error) {
    console.error("\u274C mxmdata \u521D\u59CB\u5316\u5931\u8D25:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
  const paymentRepo = RepositoryFactory2.createPaymentRepository();
  const walletRepo = RepositoryFactory2.createWalletRepository();
  const walletService = new WalletService(walletRepo);
  const walletTaskService = new WalletTaskService(walletRepo, walletService);
  const paymentService = new PaymentService(paymentRepo, walletTaskService);
  const gatewayFactory = new GatewayFactory();
  const app = express();
  app.use(cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
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
  try {
    await walletService.ensureDefaultAssets();
    console.log("\u2705 \u9ED8\u8BA4\u8D44\u4EA7\u68C0\u67E5\u5B8C\u6210");
  } catch (error) {
    console.error("\u26A0\uFE0F  \u9ED8\u8BA4\u8D44\u4EA7\u68C0\u67E5\u5931\u8D25\uFF08\u5E94\u7528\u5C06\u7EE7\u7EED\u8FD0\u884C\uFF09:", error instanceof Error ? error.message : error);
  }
  const paymentRouter = createPaymentRoutes(paymentService);
  const webhookRouter = createWebhookRoutes(gatewayFactory, paymentService);
  const walletRouter = createWalletRoutes(walletService, walletTaskService);
  app.use("/payment", paymentRouter);
  paymentRouter.use("/webhook", webhookRouter);
  app.use("/wallets", walletRouter);
  const scheduler = new PaymentExpirationScheduler(paymentRepo);
  scheduler.start();
  if (process.env.ENABLE_BLOCKCHAIN_LISTENER === "true") {
    try {
      const listener = ListenerFactory.create(paymentService);
      await listener.start();
      console.log(`\u2705 \u533A\u5757\u94FE\u76D1\u542C\u670D\u52A1\u5DF2\u542F\u52A8 (\u7C7B\u578B: ${ListenerFactory.getType()})`);
    } catch (error) {
      console.error(`\u274C \u533A\u5757\u94FE\u76D1\u542C\u670D\u52A1\u542F\u52A8\u5931\u8D25: ${error.message}`, error);
    }
  }
  return app;
}

// src/index.ts
async function bootstrap() {
  try {
    const app = await createApp();
    const port = env.port;
    app.listen(port, "127.0.0.1", () => {
      console.log(`[mxmpay] \u{1F680} Listening on port ${port}`);
    });
  } catch (error) {
    console.error("[mxmpay] \u274C \u542F\u52A8\u5931\u8D25:", error);
    process.exit(1);
  }
}
bootstrap();
//# sourceMappingURL=index.js.map