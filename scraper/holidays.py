"""
NSE India Market Hours & Holidays Calendar
===========================================
Defines standard trading hours (09:15 - 15:30 IST) and official NSE holidays.
"""

from datetime import datetime, date, timezone, timedelta
from typing import Tuple

IST = timezone(timedelta(hours=5, minutes=30))

# Official NSE Holidays (2026 - 2027)
NSE_HOLIDAYS_2026 = {
    "2026-01-26",  # Republic Day
    "2026-03-03",  # Mahashivratri
    "2026-03-25",  # Holi
    "2026-04-03",  # Good Friday
    "2026-04-14",  # Dr. Baba Saheb Ambedkar Jayanti
    "2026-05-01",  # Maharashtra Day
    "2026-05-28",  # Bakri Id / Eid-ul-Adha
    "2026-08-15",  # Independence Day
    "2026-10-02",  # Mahatma Gandhi Jayanti
    "2026-10-20",  # Dussehra
    "2026-11-08",  # Diwali Laxmi Pujan (Special Muhurat Trading only)
    "2026-11-10",  # Diwali Balipratipada
    "2026-11-24",  # Gurunanak Jayanti
    "2026-12-25",  # Christmas
}

def get_now_ist() -> datetime:
    return datetime.now(IST)

def is_trading_day(dt: datetime = None) -> bool:
    """Returns True if given date is Monday-Friday and not an NSE holiday."""
    now = dt or get_now_ist()
    # Weekday check: Monday is 0, Friday is 4, Saturday is 5, Sunday is 6
    if now.weekday() >= 5:
        return False
    date_str = now.strftime("%Y-%m-%d")
    if date_str in NSE_HOLIDAYS_2026:
        return False
    return True

def is_market_open(dt: datetime = None) -> bool:
    """Returns True if within 09:15 to 15:30 IST on a valid trading day."""
    now = dt or get_now_ist()
    if not is_trading_day(now):
        return False
    minute_of_day = now.hour * 60 + now.minute
    # 09:15 = 555 minutes; 15:30 = 930 minutes
    return 555 <= minute_of_day <= 930
