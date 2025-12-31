/**
 * 区块链监听服务接口
 */
export interface IBlockchainListener {
  /**
   * 启动监听服务
   */
  start(): Promise<void>;

  /**
   * 停止监听服务
   */
  stop(): void;

  /**
   * 检查服务是否运行中
   */
  isRunning(): boolean;
}

