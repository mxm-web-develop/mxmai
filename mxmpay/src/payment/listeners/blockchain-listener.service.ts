/**
 * 本地区块链监听服务
 * 用于监听 Ethereum (ERC20-USDT)、Arbitrum (USDT)、Polygon (USDT) 和 Tron (TRC20-USDT) 的转账事件
 * 
 * 使用公共 RPC 节点或自建节点进行轮询
 */

import { ethers } from 'ethers';
import TronWeb from 'tronweb';
import axios from 'axios';
import { env } from '../../config/env';
import { IBlockchainListener } from './listener.interface';

// USDT 标准合约地址
const USDT_ERC20_CONTRACT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDT_TRC20_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDT_ARBITRUM_CONTRACT = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
const USDT_POLYGON_CONTRACT = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';

// ERC20 Transfer 事件签名
const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

interface PaymentOrder {
  id: string;
  orderId: string;
  userId: string;
  assetCode: string;
  amount: string;
  toAddress: string;
}

export class LocalBlockchainListenerService implements IBlockchainListener {
  private ethProvider: ethers.JsonRpcProvider | null = null;
  private arbitrumProvider: ethers.JsonRpcProvider | null = null;
  private polygonProvider: ethers.JsonRpcProvider | null = null;
  private tronWeb: TronWeb | null = null;
  private ethContract: ethers.Contract | null = null;
  private arbitrumContract: ethers.Contract | null = null;
  private polygonContract: ethers.Contract | null = null;
  private isRunning = false;
  private lastEthBlock = 0;
  private lastArbitrumBlock = 0;
  private lastPolygonBlock = 0;
  private lastTronBlock = 0;
  private webhookUrl: string;
  private receiveAddresses: {
    erc20: string;
    arbitrum: string;
    polygon: string;
    trc20: string;
  };

  constructor() {
    // 从环境变量读取配置
    const ethRpcUrl = process.env.ETH_RPC_URL || 'https://eth.llamarpc.com';
    const arbitrumRpcUrl = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
    const polygonRpcUrl = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';
    const tronRpcUrl = process.env.TRON_RPC_URL || 'https://api.trongrid.io';
    this.webhookUrl = process.env.WEBHOOK_URL || 'http://localhost:3001/payment/webhook/crypto';

    // 初始化 Ethereum provider
    try {
      this.ethProvider = new ethers.JsonRpcProvider(ethRpcUrl);
      console.log('✅ Ethereum provider 初始化成功');
    } catch (error) {
      console.error('❌ Ethereum provider 初始化失败:', error);
    }

    // 初始化 Arbitrum provider
    try {
      this.arbitrumProvider = new ethers.JsonRpcProvider(arbitrumRpcUrl);
      console.log('✅ Arbitrum provider 初始化成功');
    } catch (error) {
      console.error('❌ Arbitrum provider 初始化失败:', error);
    }

    // 初始化 Polygon provider
    try {
      this.polygonProvider = new ethers.JsonRpcProvider(polygonRpcUrl);
      console.log('✅ Polygon provider 初始化成功');
    } catch (error) {
      console.error('❌ Polygon provider 初始化失败:', error);
    }

    // 初始化 Tron provider
    try {
      this.tronWeb = new TronWeb({
        fullHost: tronRpcUrl,
      });
      console.log('✅ Tron provider 初始化成功');
    } catch (error) {
      console.error('❌ Tron provider 初始化失败:', error);
    }

    // 获取收款地址
    const cryptoWallets = env.receivers.crypto;
    this.receiveAddresses = {
      erc20: cryptoWallets?.eth?.erc20?.usdt || process.env.CRYPTO_ERC20_USDT_ADDRESS || '',
      arbitrum: cryptoWallets?.arbitrum?.erc20?.usdt || process.env.CRYPTO_ARBITRUM_USDT_ADDRESS || '',
      polygon: cryptoWallets?.polygon?.erc20?.usdt || process.env.CRYPTO_POLYGON_USDT_ADDRESS || '',
      trc20: cryptoWallets?.tron?.trc20?.usdt || process.env.CRYPTO_TRC20_USDT_ADDRESS || '',
    };

    if (!this.receiveAddresses.erc20) {
      console.warn('⚠️  未配置 ERC20-USDT 收款地址');
    }
    if (!this.receiveAddresses.arbitrum) {
      console.warn('⚠️  未配置 Arbitrum-USDT 收款地址');
    }
    if (!this.receiveAddresses.polygon) {
      console.warn('⚠️  未配置 Polygon-USDT 收款地址');
    }
    if (!this.receiveAddresses.trc20) {
      console.warn('⚠️  未配置 TRC20-USDT 收款地址');
    }

    // 初始化 ERC20 合约（Ethereum）
    if (this.ethProvider && this.receiveAddresses.erc20) {
      this.ethContract = new ethers.Contract(
        USDT_ERC20_CONTRACT,
        [
          'event Transfer(address indexed from, address indexed to, uint256 value)',
          'function decimals() view returns (uint8)',
        ],
        this.ethProvider
      );
    }

    // 初始化 ERC20 合约（Arbitrum）
    if (this.arbitrumProvider && this.receiveAddresses.arbitrum) {
      this.arbitrumContract = new ethers.Contract(
        USDT_ARBITRUM_CONTRACT,
        [
          'event Transfer(address indexed from, address indexed to, uint256 value)',
          'function decimals() view returns (uint8)',
        ],
        this.arbitrumProvider
      );
    }

    // 初始化 ERC20 合约（Polygon）
    if (this.polygonProvider && this.receiveAddresses.polygon) {
      this.polygonContract = new ethers.Contract(
        USDT_POLYGON_CONTRACT,
        [
          'event Transfer(address indexed from, address indexed to, uint256 value)',
          'function decimals() view returns (uint8)',
        ],
        this.polygonProvider
      );
    }
  }

  /**
   * 启动监听服务
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('监听服务已在运行');
      return;
    }

    this.isRunning = true;
    console.log('🚀 启动区块链监听服务...');

    // 获取当前区块高度
    if (this.ethProvider) {
      try {
        const block = await this.ethProvider.getBlockNumber();
        this.lastEthBlock = block;
        console.log(`📦 Ethereum 当前区块: ${block}`);
      } catch (error) {
        console.error('获取 Ethereum 区块高度失败:', error);
      }
    }

    if (this.tronWeb) {
      try {
        const block = await this.tronWeb.trx.getCurrentBlock();
        this.lastTronBlock = block.block_header.raw_data.number;
        console.log(`📦 Tron 当前区块: ${this.lastTronBlock}`);
      } catch (error) {
        console.error('获取 Tron 区块高度失败:', error);
      }
    }

    // 启动定时轮询
    this.startPolling();
  }

  /**
   * 停止监听服务
   */
  stop(): void {
    this.isRunning = false;
    console.log('🛑 停止区块链监听服务');
  }

  /**
   * 启动轮询
   */
  private startPolling(): void {
    const pollInterval = Number(process.env.POLL_INTERVAL) || 10000; // 默认 10 秒

    const poll = async () => {
      if (!this.isRunning) return;

      try {
        // 监听 Ethereum
        if (this.ethProvider && this.ethContract && this.receiveAddresses.erc20) {
          await this.pollEthereum();
        }

        // 监听 Arbitrum
        if (this.arbitrumProvider && this.arbitrumContract && this.receiveAddresses.arbitrum) {
          await this.pollArbitrum();
        }

        // 监听 Polygon
        if (this.polygonProvider && this.polygonContract && this.receiveAddresses.polygon) {
          await this.pollPolygon();
        }

        // 监听 Tron
        if (this.tronWeb && this.receiveAddresses.trc20) {
          await this.pollTron();
        }
      } catch (error) {
        console.error('轮询错误:', error);
      }

      // 继续下一次轮询
      setTimeout(poll, pollInterval);
    };

    poll();
  }

  /**
   * 轮询 Ethereum 链
   */
  private async pollEthereum(): Promise<void> {
    if (!this.ethProvider || !this.ethContract) return;

    try {
      const currentBlock = await this.ethProvider.getBlockNumber();
      
      if (currentBlock <= this.lastEthBlock) {
        return; // 没有新区块
      }

      // 查询从 lastEthBlock + 1 到 currentBlock 的所有 Transfer 事件
      const fromBlock = this.lastEthBlock + 1;
      const toBlock = currentBlock;

      console.log(`🔍 扫描 Ethereum 区块 ${fromBlock} - ${toBlock}`);

      const filter = this.ethContract.filters.Transfer(
        null, // from (任意地址)
        this.receiveAddresses.erc20.toLowerCase() // to (我们的收款地址)
      );

      const events = await this.ethContract.queryFilter(filter, fromBlock, toBlock);

      for (const event of events) {
        await this.handleEVMTransfer(event, this.ethProvider, this.ethContract, this.receiveAddresses.erc20, 'USDT-ERC20', USDT_ERC20_CONTRACT);
      }

      this.lastEthBlock = currentBlock;
    } catch (error) {
      console.error('Ethereum 轮询错误:', error);
    }
  }

  /**
   * 处理 EVM 兼容链的 Transfer 事件（通用方法）
   */
  private async handleEVMTransfer(
    event: ethers.Log,
    provider: ethers.JsonRpcProvider,
    contract: ethers.Contract,
    receiveAddress: string,
    assetCode: string,
    contractAddress: string
  ): Promise<void> {
    try {
      const parsedLog = contract.interface.parseLog({
        topics: event.topics as string[],
        data: event.data,
      });

      if (!parsedLog || parsedLog.name !== 'Transfer') {
        return;
      }

      const from = parsedLog.args[0];
      const to = parsedLog.args[1];
      const value = parsedLog.args[2];

      // 获取交易详情
      const receipt = await provider.getTransactionReceipt(event.transactionHash);

      // USDT 有 6 位小数
      const amount = value.toString();
      const amountInUSDT = Number(amount) / 1e6;

      const chainName = assetCode.includes('ARBITRUM') ? 'Arbitrum' : assetCode.includes('POLYGON') ? 'Polygon' : 'Ethereum';
      console.log(`💰 检测到 ${chainName}-USDT 转账: ${from} -> ${to}, 金额: ${amountInUSDT} USDT`);

      // 查找对应的支付订单
      const order = await this.findPaymentOrder(receiveAddress, amountInUSDT.toString());

      if (order) {
        await this.sendWebhook({
          orderId: order.orderId,
          txHash: event.transactionHash,
          blockNumber: receipt.blockNumber,
          fromAddress: from,
          toAddress: to,
          amount: amountInUSDT.toString(),
          contractAddress: contractAddress,
          assetCode: assetCode,
        });
      } else {
        console.warn(`⚠️  未找到对应的支付订单: ${to}, ${amountInUSDT} USDT`);
      }
    } catch (error) {
      console.error(`处理 ${assetCode} 交易失败:`, error);
    }
  }

  /**
   * 轮询 Tron 链
   */
  private async pollTron(): Promise<void> {
    if (!this.tronWeb) return;

    try {
      const currentBlock = await this.tronWeb.trx.getCurrentBlock();
      const currentBlockNumber = currentBlock.block_header.raw_data.number;

      if (currentBlockNumber <= this.lastTronBlock) {
        return; // 没有新区块
      }

      // 查询从 lastTronBlock + 1 到 currentBlockNumber 的交易
      const fromBlock = this.lastTronBlock + 1;
      const toBlock = currentBlockNumber;

      console.log(`🔍 扫描 Tron 区块 ${fromBlock} - ${toBlock}`);

      // 获取区块中的交易
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
      console.error('Tron 轮询错误:', error);
    }
  }

  /**
   * 处理 Tron 交易
   */
  private async handleTronTransaction(tx: any): Promise<void> {
    try {
      // 检查是否是 TRC20 转账
      if (!tx.raw_data || !tx.raw_data.contract) {
        return;
      }

      for (const contract of tx.raw_data.contract) {
        if (contract.type !== 'TriggerSmartContract') {
          continue;
        }

        const parameter = contract.parameter?.value;
        if (!parameter) {
          continue;
        }

        const contractAddress = this.tronWeb!.address.fromHex(parameter.contract_address);
        
        // 检查是否是 USDT 合约
        if (contractAddress !== USDT_TRC20_CONTRACT) {
          continue;
        }

        // 解析 Transfer 事件
        const data = parameter.data;
        if (!data || data.substring(0, 10) !== 'a9059cbb') {
          continue; // 不是 transfer 函数调用
        }

        // 解析参数: transfer(address to, uint256 amount)
        const toAddressHex = '41' + data.substring(34, 74); // 添加 Tron 地址前缀
        const toAddress = this.tronWeb!.address.fromHex(toAddressHex);
        const amountHex = data.substring(74, 138);
        const amount = BigInt('0x' + amountHex).toString();

        // 检查是否发送到我们的收款地址
        if (toAddress.toLowerCase() !== this.receiveAddresses.trc20.toLowerCase()) {
          continue;
        }

        const amountInUSDT = Number(amount) / 1e6;

        console.log(`💰 检测到 TRC20-USDT 转账: ${toAddress}, 金额: ${amountInUSDT} USDT`);

        // 查找对应的支付订单
        const order = await this.findPaymentOrder(this.receiveAddresses.trc20, amountInUSDT.toString());

        if (order) {
          await this.sendWebhook({
            orderId: order.orderId,
            txHash: tx.txID,
            blockNumber: tx.blockNumber || 0,
            fromAddress: this.tronWeb!.address.fromHex(parameter.owner_address),
            toAddress: toAddress,
            amount: amount,
            contractAddress: USDT_TRC20_CONTRACT,
            assetCode: 'USDT-TRC20',
          });
        } else {
          console.warn(`⚠️  未找到对应的支付订单: ${toAddress}, ${amountInUSDT} USDT`);
        }
      }
    } catch (error) {
      console.error('处理 Tron 交易失败:', error);
    }
  }

  /**
   * 查找支付订单（通过收款地址和金额匹配）
   * 注意：这里需要连接数据库查询，实际实现需要注入 PaymentService
   * 
   * 可以通过 HTTP 请求查询订单，或者直接注入 PaymentService
   */
  private async findPaymentOrder(toAddress: string, amount: string): Promise<PaymentOrder | null> {
    try {
      // 方式 1：通过 HTTP 请求查询（如果监听服务是独立进程）
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
        
        // 匹配订单：收款地址和金额（允许 ±1% 误差）
        const targetAmount = parseFloat(amount);
        const tolerance = 0.01; // 1% 误差

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

