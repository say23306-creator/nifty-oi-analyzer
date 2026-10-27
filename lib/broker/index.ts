// =============================================================================
// lib/broker/index.ts — Factory: returns the active BrokerAdapter
// =============================================================================
// Official 100% Free DhanHQ API v2 Adapter
// =============================================================================

import { DhanAdapter } from './dhan';
import type { BrokerAdapter } from './types';

let _adapter: BrokerAdapter | null = null;

export function getBrokerAdapter(): BrokerAdapter {
  if (!_adapter) {
    _adapter = new DhanAdapter();
  }
  return _adapter;
}
