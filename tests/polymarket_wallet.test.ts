import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@polymarket/clob-client', () => {
  class ClobClient {
    async createOrDeriveApiKey() {
      return { key: 'k', secret: 's', passphrase: 'p' };
    }
    async getTickSize() {
      return { minimum_tick_size: '0.01' };
    }
    async getNegRisk() {
      return false;
    }
    async createAndPostOrder() {
      return { orderID: 'oid_1', status: 'matched', transactionsHashes: ['0xtx'] };
    }
  }
  return {
    ClobClient,
    Side: { BUY: 'BUY', SELL: 'SELL' },
    OrderType: { GTC: 'GTC' },
  };
});

import { PolymarketWallet } from '../src/wallets/polymarket_wallet';

describe('PolymarketWallet', () => {
  beforeEach(() => {
    delete process.env.POLY_API_KEY;
    delete process.env.POLY_PASSPHRASE;
    delete process.env.POLY_SECRET;
    vi.restoreAllMocks();
  });

  it('shows L2 as derivable when only private key is configured', () => {
    const wallet = new PolymarketWallet(
      {
        id: 'live_wallet_1',
        mode: 'LIVE',
        strategy: 'momentum',
        capital: 1000,
        privateKey: '0x1111111111111111111111111111111111111111111111111111111111111111',
      },
      'momentum',
    );

    const status = wallet.getLiveCredentialStatus();
    expect(status.privateKeyConfigured).toBe(true);
    expect(status.l2HeadersConfigured).toBe(false);
    expect(status.l2DerivableWithPrivateKey).toBe(true);
  });

  it('posts a live order by deriving L2 creds from private key when env creds are absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ({
          ok: true,
          json: async () => ({ clobTokenIds: '["token_yes","token_no"]', outcomes: '["Yes","No"]' }),
        }) as unknown as Response,
      ),
    );

    const wallet = new PolymarketWallet(
      {
        id: 'live_wallet_2',
        mode: 'LIVE',
        strategy: 'momentum',
        capital: 1000,
        privateKey: '0x1111111111111111111111111111111111111111111111111111111111111111',
        walletAddress: '0x1111111111111111111111111111111111111111',
      },
      'momentum',
    );

    await wallet.placeOrder({
      marketId: 'market-2',
      outcome: 'YES',
      side: 'BUY',
      price: 0.5,
      size: 10,
    });

    expect(wallet.getTradeHistory()).toHaveLength(1);
    expect(wallet.getState().availableBalance).toBe(995);
    expect(wallet.getLiveCredentialStatus().l2HeadersConfigured).toBe(true);
  });
});
