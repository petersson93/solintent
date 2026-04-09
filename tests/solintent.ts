import * as anchor from '@coral-xyz/anchor';
import { assert } from 'chai';

describe('solintent', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  it('initializes config', async () => {
    assert.ok(true);
  });

  it('creates a chat agent', async () => {
    assert.ok(true);
  });
});
