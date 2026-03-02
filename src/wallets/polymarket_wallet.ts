import { RiskLimits, WalletConfig, WalletState, TradeRecord } from '../types';
import { logger } from '../reporting/logs';

export class PolymarketWallet {
  private state: WalletState;
  private readonly trades: TradeRecord[] = [];
  private displayName: string = '';
  private walletAddress?: string;
  private privateKey?: string;

  constructor(config: WalletConfig, assignedStrategy: string) {
    this.displayName = config.id;
    this.walletAddress = config.walletAddress?.trim();
    this.privateKey = config.privateKey?.trim();
    this.state = {
      walletId: config.id,
      mode: 'LIVE',
      assignedStrategy,
      capitalAllocated: config.capital,
      availableBalance: config.capital,
      openPositions: [],
      realizedPnl: 0,
      riskLimits: {
        maxPositionSize: config.riskLimits?.maxPositionSize ?? 100,
        maxExposurePerMarket: config.riskLimits?.maxExposurePerMarket ?? 200,
        maxDailyLoss: config.riskLimits?.maxDailyLoss ?? 100,
        maxOpenTrades: config.riskLimits?.maxOpenTrades ?? 5,
        maxDrawdown: config.riskLimits?.maxDrawdown ?? 0.2,
      },
    };
  }

  getState(): WalletState {
    return { ...this.state, openPositions: [...this.state.openPositions] };
  }

  getTradeHistory(): TradeRecord[] {
    return [...this.trades];
  }

  updateBalance(delta: number): void {
    this.state.availableBalance += delta;
  }

  getDisplayName(): string {
    return this.displayName;
  }

  setDisplayName(name: string): void {
    this.displayName = name.trim() || this.state.walletId;
  }

  updateRiskLimits(limits: Partial<RiskLimits>): void {
    if (limits.maxPositionSize !== undefined) this.state.riskLimits.maxPositionSize = limits.maxPositionSize;
    if (limits.maxExposurePerMarket !== undefined) this.state.riskLimits.maxExposurePerMarket = limits.maxExposurePerMarket;
    if (limits.maxDailyLoss !== undefined) this.state.riskLimits.maxDailyLoss = limits.maxDailyLoss;
    if (limits.maxOpenTrades !== undefined) this.state.riskLimits.maxOpenTrades = limits.maxOpenTrades;
    if (limits.maxDrawdown !== undefined) this.state.riskLimits.maxDrawdown = limits.maxDrawdown;
    logger.info({ walletId: this.state.walletId, riskLimits: this.state.riskLimits }, 'Risk limits updated');
  }

  setLiveCredentials(walletAddress?: string, privateKey?: string): void {
    this.walletAddress = walletAddress?.trim();
    this.privateKey = privateKey?.trim();
  }

  getLiveCredentialStatus(): { walletAddressConfigured: boolean; privateKeyConfigured: boolean; apiKeyConfigured: boolean } {
    return {
      walletAddressConfigured: Boolean(this.walletAddress),
      privateKeyConfigured: Boolean(this.privateKey || process.env.POLYMARKET_PRIVATE_KEY),
      apiKeyConfigured: Boolean(process.env.POLYMARKET_API_KEY),
    };
  }

  async placeOrder(request: {
    marketId: string;
    outcome: 'YES' | 'NO';
    side: 'BUY' | 'SELL';
    price: number;
    size: number;
  }): Promise<void> {
    const apiKey = process.env.POLYMARKET_API_KEY;
    const privateKey = this.privateKey || process.env.POLYMARKET_PRIVATE_KEY;
    const walletAddress = this.walletAddress;

    if (!walletAddress) {
      logger.warn({ walletId: this.state.walletId }, 'LIVE wallet address not set; refusing LIVE order');
      return;
    }

    if (!privateKey) {
      logger.warn({ walletId: this.state.walletId }, 'POLYMARKET_PRIVATE_KEY not set (or wallet private key missing); refusing LIVE order');
      return;
    }

    if (!apiKey) {
      logger.warn('POLYMARKET_API_KEY not set; refusing LIVE order');
      return;
    }

    const cost = request.price * request.size;
    this.state.availableBalance -= cost;
    this.trades.push({
      orderId: `live_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      walletId: this.state.walletId,
      marketId: request.marketId,
      outcome: request.outcome,
      side: request.side,
      price: request.price,
      size: request.size,
      cost,
      realizedPnl: 0,
      cumulativePnl: this.state.realizedPnl,
      balanceAfter: this.state.availableBalance,
      timestamp: Date.now(),
    });

    logger.info(
      {
        walletId: this.state.walletId,
        walletAddress,
        marketId: request.marketId,
        price: request.price,
        size: request.size,
      },
      `LIVE order submitted (stub executor) ${request.side} ${request.outcome} market=${request.marketId} price=${request.price} size=${request.size}`,
    );
  }
}
