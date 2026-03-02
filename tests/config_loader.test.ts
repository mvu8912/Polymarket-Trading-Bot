import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadConfig } from '../src/core/config_loader';

describe('config_loader', () => {
  it('maps live wallet credentials from yaml fields', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-config-'));
    const cfgPath = path.join(tmpDir, 'config.yaml');
    fs.writeFileSync(
      cfgPath,
      [
        'environment:',
        '  enable_live_trading: true',
        'wallets:',
        '  - id: live_wallet_1',
        '    mode: LIVE',
        '    strategy: momentum',
        '    capital: 1000',
        '    wallet_address: 0xwallet',
        '    private_key: 0xprivate',
      ].join('\n'),
      'utf8',
    );

    process.env.ENABLE_LIVE_TRADING = 'true';
    const config = loadConfig(cfgPath);

    expect(config.wallets).toHaveLength(1);
    expect(config.wallets[0].walletAddress).toBe('0xwallet');
    expect(config.wallets[0].privateKey).toBe('0xprivate');
  });
});


  it('enables live trading when env var is true even if yaml flag is false', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-config-env-'));
    const cfgPath = path.join(tmpDir, 'config.yaml');
    fs.writeFileSync(
      cfgPath,
      [
        'environment:',
        '  enable_live_trading: false',
        'wallets: []',
      ].join('\n'),
      'utf8',
    );

    process.env.ENABLE_LIVE_TRADING = 'true';
    const config = loadConfig(cfgPath);
    expect(config.environment.enableLiveTrading).toBe(true);
  });
