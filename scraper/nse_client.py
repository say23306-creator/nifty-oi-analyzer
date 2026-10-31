"""
NSE India Option Chain Client (v3 Architecture)
================================================
Fetches real-time Nifty 50 option chain data with session warming,
Akamai anti-bot fingerprint bypass, and automatic retry handling.
"""

import time
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger("nse_client")

try:
    from curl_cffi import requests as cffi_requests
    HAS_CURL_CFFI = True
except ImportError:
    import requests
    HAS_CURL_CFFI = False

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "*/*",
    "Referer": "https://www.nseindia.com/option-chain",
    "Connection": "keep-alive",
}

class NSEClient:
    def __init__(self, session_ttl: int = 300):
        self.session_ttl = session_ttl
        self.last_warmed_at = 0.0
        self.session = None
        self._init_session()

    def _init_session(self):
        """Creates a new browser-impersonated session and warms cookies."""
        logger.info("[nse_client] Initializing fresh NSE session...")
        if HAS_CURL_CFFI:
            self.session = cffi_requests.Session(impersonate="chrome120")
        else:
            self.session = requests.Session()

        self.session.headers.update(BROWSER_HEADERS)
        try:
            # Step 1: Hit homepage to generate initial Akamai tracking cookies
            self.session.get("https://www.nseindia.com", timeout=12)
            time.sleep(0.8)
            # Step 2: Hit option chain landing page to validate referrer session
            self.session.get("https://www.nseindia.com/option-chain", timeout=12)
            time.sleep(0.5)
            self.last_warmed_at = time.time()
            logger.info("[nse_client] NSE session successfully warmed and ready.")
        except Exception as e:
            logger.warning(f"[nse_client] Session warming warning: {e}")

    def _ensure_session(self):
        """Refreshes the session if expired."""
        if self.session is None or (time.time() - self.last_warmed_at) > self.session_ttl:
            self._init_session()

    def fetch_contract_info(self, symbol: str = "NIFTY") -> Dict[str, Any]:
        """Fetches active contracts and all upcoming weekly/monthly expiry dates."""
        self._ensure_session()
        sym = symbol.upper()
        url = f"https://www.nseindia.com/api/option-chain-contract-info?symbol={sym}"
        headers = {"Referer": "https://www.nseindia.com/option-chain"}

        for attempt in range(3):
            try:
                resp = self.session.get(url, headers=headers, timeout=12)
                if resp.status_code in (401, 403):
                    logger.info(f"[nse_client] HTTP {resp.status_code} received. Refreshing session...")
                    self._init_session()
                    continue
                if resp.status_code == 200:
                    return resp.json()
            except Exception as e:
                logger.warning(f"[nse_client] Attempt {attempt+1} failed: {e}")
                time.sleep(1.5)
                self._init_session()

        raise RuntimeError(f"Failed to fetch contract info for {symbol} after retries")

    def fetch_option_chain_v3(
        self, symbol: str = "NIFTY", expiry: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Fetches the complete option chain for a specific expiry date.
        If expiry is None, automatically resolves the nearest active weekly expiry.
        """
        info = self.fetch_contract_info(symbol)
        expiries = info.get("expiryDates", [])
        if not expiries:
            raise RuntimeError(f"No active expiries returned for {symbol}")

        target_expiry = expiry if (expiry and expiry in expiries) else expiries[0]
        sym = symbol.upper()
        url = f"https://www.nseindia.com/api/option-chain-v3?type=Indices&symbol={sym}&expiry={target_expiry}"
        headers = {"Referer": "https://www.nseindia.com/option-chain"}

        for attempt in range(3):
            try:
                resp = self.session.get(url, headers=headers, timeout=12)
                if resp.status_code in (401, 403):
                    self._init_session()
                    continue
                if resp.status_code == 200:
                    payload = resp.json()
                    if "records" in payload:
                        payload["records"]["expiryDates"] = expiries
                        payload["records"]["selectedExpiry"] = target_expiry
                    return payload
            except Exception as e:
                logger.warning(f"[nse_client] Chain fetch attempt {attempt+1} error: {e}")
                time.sleep(1.5)
                self._init_session()

        raise RuntimeError(f"Failed to fetch option chain v3 for {symbol} (expiry: {target_expiry})")

