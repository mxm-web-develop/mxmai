/**
 * 区块链监听服务工厂
 * 根据 LISTENER_TYPE 环境变量创建对应的监听服务
 */

import { IBlockchainListener } from './listener.interface';
import { LocalBlockchainListenerService } from './blockchain-listener.service';
import { AlchemyListenerService } from './alchemy-listener.service';
import { InfuraListenerService } from './infura-listener.service';
import { PaymentService } from '../payment.service';

export type ListenerType = 'local' | 'alchemy' | 'infura';

export class ListenerFactory {
  /**
   * 创建监听服务实例
   */
  static create(paymentService?: PaymentService): IBlockchainListener {
    const listenerType = (process.env.LISTENER_TYPE || 'local').toLowerCase() as ListenerType;

    switch (listenerType) {
      case 'alchemy':
        console.log('📡 使用 Alchemy 监听服务');
        return new AlchemyListenerService(paymentService);

      case 'infura':
        console.log('📡 使用 Infura 监听服务');
        return new InfuraListenerService(paymentService);

      case 'local':
      default:
        console.log('📡 使用本地监听服务');
        return new LocalBlockchainListenerService();
    }
  }

  /**
   * 获取当前监听类型
   */
  static getType(): ListenerType {
    return (process.env.LISTENER_TYPE || 'local').toLowerCase() as ListenerType;
  }
}

