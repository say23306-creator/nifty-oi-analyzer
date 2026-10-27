#!/usr/bin/env python
"""
Convenience CLI runner for NSE Option Chain Scraper.
Run:
    python scraper/scrape.py
    python scraper/scrape.py --symbol BANKNIFTY
    python scraper/scrape.py --symbol NIFTY --save nifty.json
"""
from nse_scraper import main

if __name__ == "__main__":
    main()
