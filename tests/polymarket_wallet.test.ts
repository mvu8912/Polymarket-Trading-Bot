import { describe, it, expect } from 'vitest';
import { PolymarketWallet } from '../src/wallets/polymarket_wallet';

describe('PolymarketWallet', () => {
  it('allows live stub order with only private key configured', async () => {
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

    const trades = wallet.getTradeHistory();
    expect(trades).toHaveLength(1);
    expect(trades[0].cost).toBe(5);
    expect(wallet.getState().availableBalance).toBe(995);
    expect(wallet.getLiveCredentialStatus().privateKeyConfigured).toBe(true);
  });
});
