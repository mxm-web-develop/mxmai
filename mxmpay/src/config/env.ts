function parseJSONSafe<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const env = {
  port: Number(process.env.PORT ?? 4002),
  payment: {
    expireMinutes: Number(process.env.PAYMENT_EXPIRE_MINUTES || 15),
  },
  pg: {
    host: process.env.PG_HOST || 'localhost',
    port: Number(process.env.PG_PORT || 5432),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'password',
    database: process.env.PG_DB || 'postgres',
  },
  alipay: {
    appId: process.env.ALIPAY_APP_ID || '',
    privateKey: process.env.ALIPAY_PRIVATE_KEY || '',
    alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY || '',
    // 收款账户
    sellerId: process.env.ALIPAY_SELLER_ID || '',
    sellerLogonId: process.env.ALIPAY_SELLER_LOGON_ID || '',
  },
  wechat: {
    mchId: process.env.WECHAT_MCH_ID || '',
    certSerialNo: process.env.WECHAT_CERT_SERIAL_NO || '',
    apiV3Key: process.env.WECHAT_API_V3_KEY || '',
    // 收款账户（服务商/直连商户）
    receiverMchId: process.env.WECHAT_RECEIVER_MCH_ID || '',
    receiverAppId: process.env.WECHAT_RECEIVER_APPID || '',
  },
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
    mode: process.env.PAYPAL_MODE || 'sandbox',
    // 收款账户
    merchantId: process.env.PAYPAL_MERCHANT_ID || '',
  },
  card: {
    stripeKey: process.env.STRIPE_SECRET_KEY || '',
    // 收款账户（连接账户/标准账户）
    stripeAccountId: process.env.STRIPE_ACCOUNT_ID || '',
  },
  receivers: {
    // 多链钱包地址（JSON 优先，后备单变量）
    crypto: parseJSONSafe<Record<string, any>>(process.env.CRYPTO_WALLETS, {
      eth: {
        native: process.env.CRYPTO_ETH_ADDRESS || '',
        erc20: {
          usdt: process.env.CRYPTO_ERC20_USDT_ADDRESS || '',
          usdc: process.env.CRYPTO_ERC20_USDC_ADDRESS || '',
        },
      },
      tron: {
        trc20: {
          usdt: process.env.CRYPTO_TRON_TRC20_USDT_ADDRESS || '',
        },
      },
      btc: {
        native: process.env.CRYPTO_BTC_ADDRESS || '',
      },
      bsc: {
        bep20: {
          usdt: process.env.CRYPTO_BSC_USDT_ADDRESS || '',
        },
      },
      arbitrum: {
        erc20: {
          usdt: process.env.CRYPTO_ARBITRUM_USDT_ADDRESS || '',
        },
      },
      polygon: {
        erc20: {
          usdt: process.env.CRYPTO_POLYGON_USDT_ADDRESS || '',
        },
      },
      sol: {
        spl: {
          usdc: process.env.CRYPTO_SOL_USDC_ADDRESS || '',
        },
      },
    }),
  },
  blockchain: {
    // 监听服务类型: local | alchemy | infura
    listenerType: (process.env.LISTENER_TYPE || 'local').toLowerCase() as 'local' | 'alchemy' | 'infura',
    // Ethereum RPC 节点（本地监听使用）
    ethRpcUrl: process.env.ETH_RPC_URL || 'https://eth.llamarpc.com',
    // Arbitrum RPC 节点（本地监听使用）
    arbitrumRpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    // Polygon RPC 节点（本地监听使用）
    polygonRpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    // Tron RPC 节点（本地监听使用）
    tronRpcUrl: process.env.TRON_RPC_URL || 'https://api.trongrid.io',
    // Webhook 回调地址
    webhookUrl: process.env.WEBHOOK_URL || 'http://localhost:3001/payment/webhook/crypto',
    // 轮询间隔（毫秒，本地监听使用）
    pollInterval: Number(process.env.POLL_INTERVAL || 10000),
    // Alchemy 配置
    alchemy: {
      apiKey: process.env.ALCHEMY_API_KEY || '',
    },
    // Infura 配置
    infura: {
      projectId: process.env.INFURA_PROJECT_ID || '',
      projectSecret: process.env.INFURA_PROJECT_SECRET || '',
    },
  },
};

