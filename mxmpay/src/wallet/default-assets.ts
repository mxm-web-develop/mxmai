export interface DefaultAssetConfig {
  assetCode: string;
  displayName: string;
  type: 'fiat' | 'crypto' | 'other';
  precision: number;
  metadata?: Record<string, any>;
}

export const DEFAULT_ASSETS: DefaultAssetConfig[] = [
  {
    assetCode: 'CNY',
    displayName: '人民币',
    type: 'fiat',
    precision: 2,
  },
  {
    assetCode: 'USD',
    displayName: '美元',
    type: 'fiat',
    precision: 2,
  },
  {
    assetCode: 'USDT-ERC20',
    displayName: 'USDT (Ethereum)',
    type: 'crypto',
    precision: 6,
    metadata: {
      chain: 'ethereum',
      contractAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    },
  },
  {
    assetCode: 'USDT-TRC20',
    displayName: 'USDT (Tron)',
    type: 'crypto',
    precision: 6,
    metadata: {
      chain: 'tron',
      contractAddress: 'Tether USD',
    },
  },
  {
    assetCode: 'USDT-ARBITRUM',
    displayName: 'USDT (Arbitrum)',
    type: 'crypto',
    precision: 6,
    metadata: {
      chain: 'arbitrum',
      contractAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    },
  },
  {
    assetCode: 'USDT-POLYGON',
    displayName: 'USDT (Polygon)',
    type: 'crypto',
    precision: 6,
    metadata: {
      chain: 'polygon',
      contractAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    },
  },
  {
    assetCode: 'VOUCHER-CNY',
    displayName: '代金券 (人民币)',
    type: 'other',
    precision: 2,
    metadata: {
      type: 'voucher',
      currency: 'CNY',
    },
  },
  {
    assetCode: 'VOUCHER-USD',
    displayName: '代金券 (美元)',
    type: 'other',
    precision: 2,
    metadata: {
      type: 'voucher',
      currency: 'USD',
    },
  },
];

