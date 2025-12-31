export interface WalletDto {
  id: string;
  userId: string;
  assetCode: string;
  walletType: string;
  availableBalance: string;
  frozenBalance: string;
  status: string;
  updatedAt: Date;
}

export interface WalletTransactionDto {
  id: string;
  walletId: string;
  assetCode: string;
  type: string;
  direction: 'credit' | 'debit';
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  referenceId?: string;
  bizTag?: string;
  createdAt: Date;
}

export interface WalletOperationDto {
  amount: string;
  referenceId?: string;
  metadata?: Record<string, any>;
  bizTag?: string;
}

