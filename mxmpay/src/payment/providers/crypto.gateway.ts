import {
  PaymentGateway,
  GatewayCreateParams,
  GatewayCreateResult,
  GatewayQueryResult,
  GatewayRefundParams,
  GatewayRefundResult,
} from './payment-gateway.interface';
import { env } from '../../config/env';

// USDT 标准合约地址
const USDT_ERC20_CONTRACT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDT_TRC20_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDT_ARBITRUM_CONTRACT = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
const USDT_POLYGON_CONTRACT = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';

export class CryptoGateway implements PaymentGateway {
  readonly name = 'crypto';

  /**
   * 获取收款地址
   */
  private getReceiveAddress(assetCode: string): string {
    const cryptoWallets = env.receivers.crypto;

    // 根据 assetCode 选择收款地址
    if (assetCode === 'USDT-ERC20') {
      return (
        cryptoWallets?.eth?.erc20?.usdt ||
        process.env.CRYPTO_ERC20_USDT_ADDRESS ||
        ''
      );
    } else if (assetCode === 'USDT-TRC20') {
      return (
        cryptoWallets?.tron?.trc20?.usdt ||
        process.env.CRYPTO_TRC20_USDT_ADDRESS ||
        ''
      );
    } else if (assetCode === 'USDT-ARBITRUM') {
      return (
        cryptoWallets?.arbitrum?.erc20?.usdt ||
        process.env.CRYPTO_ARBITRUM_USDT_ADDRESS ||
        ''
      );
    } else if (assetCode === 'USDT-POLYGON') {
      return (
        cryptoWallets?.polygon?.erc20?.usdt ||
        process.env.CRYPTO_POLYGON_USDT_ADDRESS ||
        ''
      );
    }

    throw new Error(`不支持的资产代码: ${assetCode}`);
  }

  /**
   * 获取合约地址
   */
  private getContractAddress(assetCode: string): string {
    if (assetCode === 'USDT-ERC20') {
      return USDT_ERC20_CONTRACT;
    } else if (assetCode === 'USDT-TRC20') {
      return USDT_TRC20_CONTRACT;
    } else if (assetCode === 'USDT-ARBITRUM') {
      return USDT_ARBITRUM_CONTRACT;
    } else if (assetCode === 'USDT-POLYGON') {
      return USDT_POLYGON_CONTRACT;
    }
    throw new Error(`不支持的资产代码: ${assetCode}`);
  }

  /**
   * 将金额转换为最小单位（6位小数）
   */
  private amountToSmallestUnit(amount: number): string {
    return Math.floor(amount * 1000000).toString();
  }

  /**
   * 生成支付二维码内容
   */
  private generateQrCodeContent(
    assetCode: string,
    receiveAddress: string,
    amount: number
  ): string {
    const amountInSmallestUnit = this.amountToSmallestUnit(amount);

    if (assetCode === 'USDT-ERC20') {
      // Ethereum ERC20 格式
      const contractAddress = this.getContractAddress(assetCode);
      return `ethereum:${receiveAddress}@1/transfer?address=${contractAddress}&uint256=${amountInSmallestUnit}`;
    } else if (assetCode === 'USDT-TRC20') {
      // Tron TRC20 格式
      const contractAddress = this.getContractAddress(assetCode);
      return `tron:${contractAddress}?amount=${amountInSmallestUnit}`;
    } else if (assetCode === 'USDT-ARBITRUM') {
      // Arbitrum ERC20 格式（与 Ethereum 相同，但使用 Arbitrum 链 ID）
      const contractAddress = this.getContractAddress(assetCode);
      return `ethereum:${receiveAddress}@42161/transfer?address=${contractAddress}&uint256=${amountInSmallestUnit}`;
    } else if (assetCode === 'USDT-POLYGON') {
      // Polygon ERC20 格式（与 Ethereum 相同，但使用 Polygon 链 ID）
      const contractAddress = this.getContractAddress(assetCode);
      return `ethereum:${receiveAddress}@137/transfer?address=${contractAddress}&uint256=${amountInSmallestUnit}`;
    }

    throw new Error(`不支持的资产代码: ${assetCode}`);
  }

  /**
   * 生成区块链浏览器链接
   */
  private generateExplorerUrl(assetCode: string, txHash?: string): string {
    if (assetCode === 'USDT-ERC20') {
      return txHash
        ? `https://etherscan.io/tx/${txHash}`
        : 'https://etherscan.io';
    } else if (assetCode === 'USDT-TRC20') {
      return txHash
        ? `https://tronscan.org/#/transaction/${txHash}`
        : 'https://tronscan.org';
    } else if (assetCode === 'USDT-ARBITRUM') {
      return txHash
        ? `https://arbiscan.io/tx/${txHash}`
        : 'https://arbiscan.io';
    } else if (assetCode === 'USDT-POLYGON') {
      return txHash
        ? `https://polygonscan.com/tx/${txHash}`
        : 'https://polygonscan.com';
    }
    return '';
  }

  async create(params: GatewayCreateParams): Promise<GatewayCreateResult> {
    // 从 metadata 中获取 assetCode
    const assetCode = (params.metadata as any)?.assetCode;
    const supportedAssets = ['USDT-ERC20', 'USDT-TRC20', 'USDT-ARBITRUM', 'USDT-POLYGON'];
    if (!assetCode || !supportedAssets.includes(assetCode)) {
      throw new Error(`crypto 渠道需要提供 assetCode (${supportedAssets.join(', ')})`);
    }

    const receiveAddress = this.getReceiveAddress(assetCode);
    if (!receiveAddress) {
      throw new Error(`未配置 ${assetCode} 收款地址`);
    }

    const qrCodeContent = this.generateQrCodeContent(assetCode, receiveAddress, params.amount);
    const explorerUrl = this.generateExplorerUrl(assetCode);

    return {
      orderId: params.orderId,
      status: 'pending',
      paymentUrl: explorerUrl,
      qrCodeUrl: qrCodeContent,
      raw: {
        assetCode,
        receiveAddress,
        contractAddress: this.getContractAddress(assetCode),
        amount: params.amount,
        amountInSmallestUnit: this.amountToSmallestUnit(params.amount),
      },
    };
  }

  async query(orderId: string): Promise<GatewayQueryResult> {
    // 查询功能需要接入区块链 RPC 或第三方 API，当前返回占位
    return { orderId, status: 'processing', raw: { mocked: true } };
  }

  async refund(params: GatewayRefundParams): Promise<GatewayRefundResult> {
    // 区块链支付不支持退款，只能反向转账
    return { orderId: params.orderId, status: 'failed', raw: { message: '区块链支付不支持退款' } };
  }

  async handleWebhook(headers: Record<string, any>, body: any): Promise<GatewayQueryResult> {
    // 解析 webhook 数据
    // 预期格式（来自 Alchemy/Infura/TronGrid）：
    // {
    //   orderId: string,
    //   txHash: string,
    //   blockNumber: number,
    //   fromAddress: string,
    //   toAddress: string,
    //   amount: string,
    //   contractAddress: string,
    //   assetCode: string
    // }

    const orderId = body?.orderId || body?.out_trade_no || 'unknown';
    const txHash = body?.txHash || body?.hash || body?.transactionHash;
    const blockNumber = body?.blockNumber || body?.block_number;
    const fromAddress = body?.fromAddress || body?.from;
    const toAddress = body?.toAddress || body?.to;
    const amount = body?.amount || body?.value;
    const contractAddress = body?.contractAddress || body?.contract_address;
    const assetCode = body?.assetCode || body?.asset_code;

    if (!txHash) {
      throw new Error('webhook 缺少交易哈希 (txHash)');
    }

    if (!toAddress) {
      throw new Error('webhook 缺少收款地址 (toAddress)');
    }

    if (!amount) {
      throw new Error('webhook 缺少金额 (amount)');
    }

    // 验证合约地址
    if (assetCode === 'USDT-ERC20' && contractAddress?.toLowerCase() !== USDT_ERC20_CONTRACT.toLowerCase()) {
      throw new Error(`ERC20-USDT 合约地址不匹配: ${contractAddress}`);
    }
    if (assetCode === 'USDT-TRC20' && contractAddress !== USDT_TRC20_CONTRACT) {
      throw new Error(`TRC20-USDT 合约地址不匹配: ${contractAddress}`);
    }
    if (assetCode === 'USDT-ARBITRUM' && contractAddress?.toLowerCase() !== USDT_ARBITRUM_CONTRACT.toLowerCase()) {
      throw new Error(`Arbitrum-USDT 合约地址不匹配: ${contractAddress}`);
    }
    if (assetCode === 'USDT-POLYGON' && contractAddress?.toLowerCase() !== USDT_POLYGON_CONTRACT.toLowerCase()) {
      throw new Error(`Polygon-USDT 合约地址不匹配: ${contractAddress}`);
    }

    return {
      orderId,
      status: 'success',
      raw: {
        txHash,
        blockNumber,
        fromAddress,
        toAddress,
        amount,
        contractAddress,
        assetCode,
        headers,
        body,
      },
    };
  }
}

