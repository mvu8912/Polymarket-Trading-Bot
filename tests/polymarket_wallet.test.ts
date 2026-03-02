import { describe, it, expect, beforeEach } from 'vitest';
import { PolymarketWallet } from '../src/wallets/polymarket_wallet';

describe('PolymarketWallet', () => {
  beforeEach(() => {
    delete process.env.POLY_API_KEY;
    delete process.env.POLY_PASSPHRASE;
    delete process.env.POLY_SECRET;
  });

  it('refuses live stub order when L2 credentials are missing', async () => {
    const wallet = new PolymarketWallet(
      {
        id: 'live_wallet_1',
        mode: 'LIVE',
        strategy: 'momentum',
        capital: 1000,
        privateKey: '0xabc123',
      },
      'momentum',
    );

    await wallet.placeOrder({
      marketId: 'market-1',
      outcome: 'YES',
      side: 'BUY',
      price: 0.5,
      size: 10,
    });

    expect(wallet.getTradeHistory()).toHaveLength(0);
    expect(wallet.getLiveCredentialStatus().privateKeyConfigured).toBe(true);
    expect(wallet.getLiveCredentialStatus().l2HeadersConfigured).toBe(false);
  });

  it('allows live stub order with private key and L2 credentials configured', async () => {
    process.env.POLY_API_KEY = 'api-key';
    process.env.POLY_PASSPHRASE = 'passphrase';
    process.env.POLY_SECRET = 'secret';

    const wallet = new PolymarketWallet(
      {
        id: 'live_wallet_2',
        mode: 'LIVE',
        strategy: 'momentum',
        capital: 1000,
        privateKey: '0xabc123',
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
