import { Wallet } from 'ethers';
import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { RiskLimits, WalletConfig, WalletState, TradeRecord } from '../types';
import { logger } from '../reporting/logs';

type ApiCreds = { key: string; secret: string; passphrase: string };

export class PolymarketWallet {
  private state: WalletState;
  private readonly trades: TradeRecord[] = [];
  private displayName: string = '';
  private walletAddress?: string;
  private privateKey?: string;
  private apiCreds?: ApiCreds;

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
    this.apiCreds = undefined;
  }

  getLiveCredentialStatus(): {
    walletAddressConfigured: boolean;
    privateKeyConfigured: boolean;
    l2HeadersConfigured: boolean;
    l2DerivableWithPrivateKey: boolean;
  } {
    const privateKeyConfigured = Boolean(this.privateKey || process.env.POLYMARKET_PRIVATE_KEY);
    return {
      walletAddressConfigured: Boolean(this.walletAddress),
      privateKeyConfigured,
      l2HeadersConfigured: hasL2CredentialsFromEnv() || Boolean(this.apiCreds),
      l2DerivableWithPrivateKey: privateKeyConfigured,
    };
  }

  async placeOrder(request: {
    marketId: string;
    outcome: 'YES' | 'NO';
    side: 'BUY' | 'SELL';
    price: number;
    size: number;
  }): Promise<void> {
    const privateKey = this.privateKey || process.env.POLYMARKET_PRIVATE_KEY;
    const walletAddress = this.walletAddress || process.env.POLY_FUNDER_ADDRESS;

    if (!privateKey) {
      logger.warn({ walletId: this.state.walletId }, 'POLYMARKET_PRIVATE_KEY not set (or wallet private key missing); refusing LIVE order');
      return;
    }

    if (!walletAddress) {
      logger.warn({ walletId: this.state.walletId }, 'Wallet/proxy (funder) address missing; set wallet address in UI or POLY_FUNDER_ADDRESS');
      return;
    }

    try {
      const signer = new Wallet(privateKey);
      const chainId = Number(process.env.POLY_CHAIN_ID || 137) as 137 | 80002;
      const signatureType = Number(process.env.POLY_SIGNATURE_TYPE || 1);
      const apiCreds = await this.getOrCreateApiCreds(signer, chainId);
      const client = new ClobClient(
        process.env.POLY_CLOB_API || 'https://clob.polymarket.com',
        chainId,
        signer,
        apiCreds,
        signatureType,
        walletAddress,
      );

      const tokenID = await this.resolveTokenId(request.marketId, request.outcome);
      const tickSize = await client.getTickSize(tokenID);
      const negRisk = await client.getNegRisk(tokenID);

      const response = await client.createAndPostOrder(
        {
          tokenID,
          price: request.price,
          side: request.side === 'BUY' ? Side.BUY : Side.SELL,
          size: request.size,
        },
        { tickSize, negRisk },
        OrderType.GTC,
      );

      const cost = request.price * request.size;
      this.state.availableBalance -= cost;
      this.trades.push({
        orderId: response?.orderID || `live_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
          tokenID,
          orderId: response?.orderID,
          status: response?.status,
          txHashes: response?.transactionsHashes,
        },
        'LIVE order posted to Polymarket CLOB',
      );
    } catch (error) {
      logger.error({ walletId: this.state.walletId, marketId: request.marketId, error }, 'LIVE order failed to post to Polymarket CLOB');
    }
  }

  private async getOrCreateApiCreds(signer: Wallet, chainId: 137 | 80002): Promise<ApiCreds> {
    if (this.apiCreds) return this.apiCreds;

    const envCreds = readL2CredentialsFromEnv();
    if (envCreds) {
      this.apiCreds = envCreds;
      return envCreds;
    }

    const bootstrap = new ClobClient(process.env.POLY_CLOB_API || 'https://clob.polymarket.com', chainId, signer);
    const derived = await bootstrap.createOrDeriveApiKey();
    this.apiCreds = derived;
    logger.info({ walletId: this.state.walletId }, 'Derived CLOB API credentials from private key (L1)');
    return derived;
  }

  private async resolveTokenId(marketId: string, outcome: 'YES' | 'NO'): Promise<string> {
    const gammaApi = process.env.POLY_GAMMA_API || 'https://gamma-api.polymarket.com';
    const response = await fetch(`${gammaApi}/markets/${encodeURIComponent(marketId)}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch market ${marketId} from Gamma (${response.status})`);
    }

    const market = await response.json() as { clobTokenIds?: string; outcomes?: string };
    const tokenIds = JSON.parse(market.clobTokenIds ?? '[]') as string[];
    const outcomes = JSON.parse(market.outcomes ?? '[]') as string[];
    const index = outcome === 'YES' ? 0 : 1;

    const tokenID = tokenIds[index];
    if (!tokenID) {
      throw new Error(`Token id not found for market ${marketId} outcome ${outcome}; outcomes=${JSON.stringify(outcomes)}`);
    }

    return tokenID;
  }
}

function readL2CredentialsFromEnv(): ApiCreds | undefined {
  const key = process.env.POLY_API_KEY;
  const secret = process.env.POLY_SECRET;
  const passphrase = process.env.POLY_PASSPHRASE;
  if (!key || !secret || !passphrase) return undefined;
  return { key, secret, passphrase };
}

function hasL2CredentialsFromEnv(): boolean {
  return Boolean(readL2CredentialsFromEnv());
}
