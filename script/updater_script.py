import time
import yfinance as yf
from supabase import create_client, Client
import os
from dotenv import load_dotenv
from datetime import datetime, timezone, time as dt_time, timedelta
import pytz
import plotly.graph_objs as go
from zoneinfo import ZoneInfo

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

eastern = pytz.timezone("US/Eastern")

MARKET_OPEN = dt_time(9, 30)
MARKET_CLOSE = dt_time(16, 0)

# gets the current price of a given stock
def get_current_price(ticker):
    stock = yf.Ticker(ticker)

    price = stock.fast_info.get("lastPrice")
    if price is None:
        data = stock.history(period="1d")
        if not data.empty:
            price = float(data["Close"].iloc[-1])
    return price

# updates the Stocks.current_price for every stock using yf.download (batch)
def update_all_stock_prices():

    # -----------------------------
    # 1. Get tickers from DB
    # -----------------------------
    resp = supabase.table("Stocks").select("stock_id, stock_symbol").execute()
    rows = resp.data or []

    if not rows:
        print("No stocks found in database.")
        return

    ticker_map = {r["stock_symbol"]: r["stock_id"] for r in rows}
    ticker_list = list(ticker_map.keys())

    print(f"Fetching prices for {len(ticker_list)} tickers...")

    # -----------------------------
    # 2. Fetch all tickers in parallel
    # -----------------------------
    try:
        data = yf.download(
            tickers=ticker_list,
            period="1d",
            group_by="ticker",
            threads=True,
            progress=False
        )
    except Exception as e:
        print("Error fetching data:", e)
        return

    now_iso = datetime.now(timezone.utc).isoformat()

    # -----------------------------
    # 3. Update each stock
    # -----------------------------
    updated_count = 0

    for symbol, stock_id in ticker_map.items():
        try:
            price = None

            # Single ticker case
            if len(ticker_list) == 1:
                if not data.empty:
                    price = float(data["Close"].iloc[-1])
            else:
                if symbol in data and not data[symbol].empty:
                    price = float(data[symbol]["Close"].iloc[-1])

            if price is None:
                print(f"Failed: {symbol}")
                continue

            supabase.table("Stocks").update({
                "current_price": price,
                "last_updated": now_iso
            }).eq("stock_id", stock_id).execute()

            updated_count += 1

        except Exception as e:
            print(f"{symbol} error: {e}")

    print(f"Updated {updated_count} stocks.")

# returns the number of seconds until the next market open
def seconds_until_next_market_open():
    now = datetime.now(eastern)

    today_open = eastern.localize(datetime.combine(now.date(), MARKET_OPEN))
    today_close = eastern.localize(datetime.combine(now.date(), MARKET_CLOSE))

    # If before open today → sleep until open
    if now < today_open and now.weekday() < 5:
        return (today_open - now).total_seconds()

    # If market already open today → no sleep
    if today_open <= now < today_close and now.weekday() < 5:
        return 0

    # Otherwise move to next weekday at 9:30
    next_day = now + timedelta(days=1)
    while next_day.weekday() >= 5:  # skip Sat/Sun
        next_day += timedelta(days=1)

    next_open = eastern.localize(datetime.combine(next_day.date(), MARKET_OPEN))
    return (next_open - now).total_seconds()

# updates the Portfolios.previous_close column for portfolios in active leagues
def update_portfolio_previous_close():

    # -----------------------------
    # 1. Get current stock prices
    # -----------------------------
    stocks_resp = supabase.table("Stocks").select("stock_id, current_price").execute()
    stocks = {s["stock_id"]: float(s["current_price"]) for s in (stocks_resp.data or [])}

    if not stocks:
        print("No stock prices found.")
        return

    # -----------------------------
    # 2. Get active leagues
    # -----------------------------
    leagues_resp = supabase.table("Leagues") \
        .select("league_id, finish_time") \
        .gt("finish_time", datetime.now(timezone.utc).isoformat()) \
        .execute()

    active_leagues = leagues_resp.data or []
    league_ids = [l["league_id"] for l in active_leagues]

    print(f"Found {len(league_ids)} active leagues")

    # -----------------------------
    # 3. Get relevant portfolios
    #    (active leagues + solo)
    # -----------------------------
    if league_ids:
        league_filter = f"league_id.in.({','.join(map(str, league_ids))}),league_id.is.null"
    else:
        league_filter = "league_id.is.null"

    portfolios_resp = supabase.table("Portfolios") \
        .select("portfolio_id, league_id, reserve_value") \
        .or_(league_filter) \
        .execute()

    portfolios = portfolios_resp.data or []
    if not portfolios:
        print("No eligible portfolios found.")
        return

    print(f"Found {len(portfolios)} eligible portfolios (active + solo)")

    # -----------------------------
    # 4. Get holdings for those portfolios
    # -----------------------------
    portfolio_ids = [p["portfolio_id"] for p in portfolios]

    holdings_resp = supabase.table("Portfolio Holdings") \
        .select("portfolio_id, stock_id, quantity") \
        .in_("portfolio_id", portfolio_ids) \
        .execute()

    holdings = holdings_resp.data or []

    holdings_by_portfolio = {}
    for h in holdings:
        holdings_by_portfolio.setdefault(h["portfolio_id"], []).append(h)

    # -----------------------------
    # 5. Recalculate portfolio values
    # -----------------------------
    history_rows = []
    now_iso = datetime.now(timezone.utc).isoformat()

    for portfolio in portfolios:
        pid = portfolio["portfolio_id"]

        # Start with reserve cash
        reserve_value = float(portfolio.get("reserve_value") or 0)
        total_value = reserve_value

        # Add stock holdings value
        for h in holdings_by_portfolio.get(pid, []):
            stock_id = h["stock_id"]
            qty = float(h["quantity"])
            price = stocks.get(stock_id)

            if price is None:
                continue

            total_value += qty * price

        # Update ONLY these eligible portfolios
        supabase.table("Portfolios").update({
            "previous_close_value": total_value,
            "last_recalculated": now_iso
        }).eq("portfolio_id", pid).execute()

# adds an entry into "Portfolio Histories" for each active portfolio
def insert_portfolio_history():

    now_utc = datetime.now(timezone.utc)

    # -----------------------------------------
    # Determine last US market close (4 PM ET)
    # -----------------------------------------
    now_et = now_utc.astimezone(ZoneInfo("America/New_York"))

    market_close_today = now_et.replace(
        hour=16, minute=0, second=0, microsecond=0
    )

    if now_et >= market_close_today:
        last_market_close_et = market_close_today
    else:
        last_market_close_et = market_close_today - timedelta(days=1)

    last_market_close_utc = last_market_close_et.astimezone(timezone.utc)
    last_market_close_iso = last_market_close_utc.isoformat()


    # -----------------------------
    # 1. Get stock prices from Stock Histories (consistent with day details)
    # Use the most recent historical price for each stock
    # This ensures portfolio values match individual stock P&L calculations
    # -----------------------------
    stock_ids_resp = supabase.table("Stocks").select("stock_id").execute()
    all_stock_ids = [s["stock_id"] for s in (stock_ids_resp.data or [])]

    if not all_stock_ids:
        print("No stocks found.")
        return

    # Get the most recent price from Stock Histories for each stock
    prices_resp = supabase.table("Stock Histories") \
        .select("stock_id, price") \
        .in_("stock_id", all_stock_ids) \
        .order("timestamp_of", desc=True) \
        .execute()

    # Map stock_id to its most recent price (taking first result per stock due to descending order)
    stocks = {}
    seen_stocks = set()
    for p in (prices_resp.data or []):
        stock_id = p["stock_id"]
        if stock_id not in seen_stocks:
            stocks[stock_id] = float(p["price"])
            seen_stocks.add(stock_id)

    # Fallback: for any stocks missing from Stock Histories, use current_price
    # This handles edge cases where Stock Histories might not be fully populated
    if len(stocks) < len(all_stock_ids):
        current_prices_resp = supabase.table("Stocks") \
            .select("stock_id, current_price") \
            .execute()
        
        for stock in (current_prices_resp.data or []):
            stock_id = stock["stock_id"]
            if stock_id not in stocks and stock.get("current_price"):
                stocks[stock_id] = float(stock["current_price"])

    if not stocks:
        print("No stock prices found.")
        return

    # -----------------------------
    # 2. Get active leagues
    # -----------------------------
    leagues_resp = supabase.table("Leagues") \
        .select("league_id, finish_time") \
        .gt("finish_time", now_utc.isoformat()) \
        .execute()

    active_leagues = leagues_resp.data or []
    league_ids = [l["league_id"] for l in active_leagues]

    print(f"Found {len(league_ids)} active leagues")

    # -----------------------------
    # 3. Get relevant portfolios
    #    (active leagues + solo)
    # -----------------------------
    if league_ids:
        league_filter = f"league_id.in.({','.join(map(str, league_ids))}),league_id.is.null"
    else:
        league_filter = "league_id.is.null"

    portfolios_resp = supabase.table("Portfolios") \
        .select("portfolio_id, league_id, reserve_value") \
        .or_(league_filter) \
        .execute()

    portfolios = portfolios_resp.data or []
    if not portfolios:
        print("No eligible portfolios found.")
        return

    print(f"Found {len(portfolios)} eligible portfolios (active + solo)")

    portfolio_ids = [p["portfolio_id"] for p in portfolios]

    # -------------------------------------------------------
    # Check portfolios already updated since last market close
    # -------------------------------------------------------
    existing_histories_resp = supabase.table("Portfolio Histories") \
        .select("portfolio_id") \
        .in_("portfolio_id", portfolio_ids) \
        .gt("timestamp_of", last_market_close_iso) \
        .execute()

    existing_portfolio_ids = {
        row["portfolio_id"] for row in (existing_histories_resp.data or [])
    }

    print(f"{len(existing_portfolio_ids)} portfolios already updated since last close")

    # -----------------------------
    # 4. Get holdings
    # -----------------------------
    holdings_resp = supabase.table("Portfolio Holdings") \
        .select("portfolio_id, stock_id, quantity") \
        .in_("portfolio_id", portfolio_ids) \
        .execute()

    holdings = holdings_resp.data or []

    holdings_by_portfolio = {}
    for h in holdings:
        holdings_by_portfolio.setdefault(h["portfolio_id"], []).append(h)

    # -----------------------------
    # 5. Recalculate portfolio values
    # -----------------------------
    history_rows = []
    now_iso = now_utc.isoformat()

    for portfolio in portfolios:
        pid = portfolio["portfolio_id"]

        # Skip if already inserted since last market close
        if pid in existing_portfolio_ids:
            continue

        reserve_value = float(portfolio.get("reserve_value") or 0)
        total_value = reserve_value

        for h in holdings_by_portfolio.get(pid, []):
            stock_id = h["stock_id"]
            qty = float(h["quantity"])
            price = stocks.get(stock_id)

            if price is None:
                continue

            total_value += qty * price

        history_rows.append({
            "portfolio_id": pid,
            "value": total_value,
            "timestamp_of": now_iso
        })

    # -----------------------------
    # 6. Insert history snapshots
    # -----------------------------
    if history_rows:
        BATCH_SIZE = 500
        for i in range(0, len(history_rows), BATCH_SIZE):
            batch = history_rows[i:i + BATCH_SIZE]
            supabase.table("Portfolio Histories").insert(batch).execute()

    print("Portfolio value update complete.")

# updates the Stocks.previous_close with yesterdays price from Stock Histories
def update_stock_previous_close():
    # Get all stocks
    stocks_resp = supabase.table("Stocks") \
        .select("stock_id") \
        .execute()

    stocks = stocks_resp.data or []
    if not stocks:
        print("No stocks found.")
        return

    stock_ids = [s["stock_id"] for s in stocks]

    # Get the most recent price from Stock Histories for each stock
    prices_resp = supabase.table("Stock Histories") \
        .select("stock_id, price") \
        .in_("stock_id", stock_ids) \
        .order("timestamp_of", desc=True) \
        .execute()

    # Map stock_id to its most recent price
    prices_map = {}
    seen_stocks = set()
    for p in (prices_resp.data or []):
        stock_id = p["stock_id"]
        if stock_id not in seen_stocks:
            prices_map[stock_id] = float(p["price"])
            seen_stocks.add(stock_id)

    if not prices_map:
        print("No prices found in Stock Histories.")
        return

    # Update previous_close for each stock
    updated_count = 0
    for stock_id, price in prices_map.items():
        try:
            supabase.table("Stocks") \
                .update({"previous_close": price}) \
                .eq("stock_id", stock_id) \
                .execute()
            updated_count += 1
        except Exception as e:
            print(f"Error updating stock {stock_id}: {e}")

    print(f"Updated {updated_count} stock previous_close values from Stock Histories.")

# inserts into "Stock Histories" table with new day and removes old day
def insert_stock_history():
    print("Starting end-of-day stock history update...")

    # Fetch all stocks
    stocks_resp = supabase.table("Stocks").select("stock_id, stock_symbol").execute()
    stocks = stocks_resp.data or []

    if not stocks:
        print("No stocks found.")
        return

    print(f"Found {len(stocks)} stocks")

    for stock in stocks:
        stock_id = stock["stock_id"]
        symbol = stock["stock_symbol"]

        try:
            # Get most recent stored history row
            latest_resp = (
                supabase
                .table("Stock Histories")
                .select("timestamp_of")
                .eq("stock_id", stock_id)
                .order("timestamp_of", desc=True)
                .limit(1)
                .execute()
            )

            latest_rows = latest_resp.data or []
            latest_date = None

            if latest_rows:
                latest_date = datetime.fromisoformat(
                    latest_rows[0]["timestamp_of"]
                ).date()

            # Fetch latest official daily close
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period="5d")

            if hist.empty:
                print(f"No history returned for {symbol}")
                continue

            newest_date = hist.index[-1]
            newest_close = hist.iloc[-1]["Close"]

            # Convert pandas timestamp → date
            newest_day = newest_date.date()

            # Market close = 4:00 PM Eastern
            market_close_et = datetime(
                newest_day.year,
                newest_day.month,
                newest_day.day,
                16, 0, 0,
                tzinfo=ZoneInfo("America/New_York")
            )

            # Convert to UTC for storage
            newest_dt = market_close_et.astimezone(timezone.utc)
            

            newest_day = newest_dt.date()

            # Skip if already updated today
            if latest_date and newest_day <= latest_date:
                print(f"{symbol} already updated")
                continue

            # Insert newest close
            supabase.table("Stock Histories").insert({
                "stock_id": stock_id,
                "price": float(newest_close),
                "timestamp_of": newest_dt.isoformat(),
            }).execute()

            print(f"Inserted new close for {symbol}")

            # Count rows for this stock
            count_resp = (
                supabase
                .table("Stock Histories")
                .select("stock_id", count="exact")
                .eq("stock_id", stock_id)
                .execute()
            )

            total_rows = count_resp.count or 0

            # Keep only ~252 trading days
            if total_rows > 252:
                oldest_resp = (
                    supabase
                    .table("Stock Histories")
                    .select("timestamp_of")
                    .eq("stock_id", stock_id)
                    .order("timestamp_of", desc=False)
                    .limit(1)
                    .execute()
                )

                if oldest_resp.data:
                    oldest_ts = oldest_resp.data[0]["timestamp_of"]

                    supabase.table("Stock Histories") \
                        .delete() \
                        .eq("stock_id", stock_id) \
                        .eq("timestamp_of", oldest_ts) \
                        .execute()

                    print(f"Deleted oldest row for {symbol}")

            time.sleep(0.25)  # rate limit safety

        except Exception as e:
            print(f"Error updating {symbol}: {e}")

    print("End-of-day stock history update complete.")

MARKET_OPEN_HOUR = 9
MARKET_OPEN_MINUTE = 30
MARKET_CLOSE_HOUR = 16
MARKET_CLOSE_MINUTE = 0

# returns true if the market is open, otherwise false.
def is_market_open():
    now_et = datetime.now(ZoneInfo("America/New_York"))

    # Skip weekends
    if now_et.weekday() >= 5:
        return False

    market_open = now_et.replace(
        hour=MARKET_OPEN_HOUR,
        minute=MARKET_OPEN_MINUTE,
        second=0,
        microsecond=0
    )

    market_close = now_et.replace(
        hour=MARKET_CLOSE_HOUR,
        minute=MARKET_CLOSE_MINUTE,
        second=0,
        microsecond=0
    )

    return market_open <= now_et < market_close

# returns the datetime of the last market close
def get_last_market_close_utc():
    now_utc = datetime.now(timezone.utc)
    now_et = now_utc.astimezone(ZoneInfo("America/New_York"))

    market_close_today = now_et.replace(
        hour=16, minute=0, second=0, microsecond=0
    )

    if now_et >= market_close_today:
        last_market_close_et = market_close_today
    else:
        last_market_close_et = market_close_today - timedelta(days=1)

    # Skip weekends
    while last_market_close_et.weekday() >= 5:
        last_market_close_et -= timedelta(days=1)

    return last_market_close_et.astimezone(timezone.utc)

# returns true if the history tables need to be updated
def needs_daily_refresh():
    last_close_utc = get_last_market_close_utc()
    last_close_iso = last_close_utc.isoformat()

    # -----------------------------
    # Check Stock Histories
    # -----------------------------
    stock_history_resp = supabase.table("Stock Histories") \
        .select("timestamp_of") \
        .order("timestamp_of", desc=True) \
        .limit(1) \
        .execute()

    stock_history_data = stock_history_resp.data or []

    stock_history_fresh = False
    if stock_history_data:
        latest_stock_timestamp = stock_history_data[0]["timestamp_of"]
        stock_history_fresh = latest_stock_timestamp > last_close_iso

    # -----------------------------
    # Check Portfolio Histories
    # -----------------------------
    portfolio_history_resp = supabase.table("Portfolio Histories") \
        .select("timestamp_of") \
        .order("timestamp_of", desc=True) \
        .limit(1) \
        .execute()

    portfolio_history_data = portfolio_history_resp.data or []

    portfolio_history_fresh = False
    if portfolio_history_data:
        latest_portfolio_timestamp = portfolio_history_data[0]["timestamp_of"]
        portfolio_history_fresh = latest_portfolio_timestamp > last_close_iso

    return not stock_history_fresh and not portfolio_history_fresh

# returns true if the previous close needs to be updated in portfolios and stocks.
def needs_start_of_day_update():
    now_et = datetime.now(ZoneInfo("America/New_York"))

    # Only weekdays
    if now_et.weekday() >= 5:
        return False

    market_open = now_et.replace(
        hour=9, minute=30, second=0, microsecond=0
    )

    # Only after market open
    if now_et < market_open:
        return False

    market_open_utc = market_open.astimezone(timezone.utc)
    market_open_iso = market_open_utc.isoformat()

    # Check if any stock previous_close was updated after today's open
    resp = supabase.table("Stocks") \
        .select("last_updated") \
        .order("last_updated", desc=True) \
        .limit(1) \
        .execute()

    data = resp.data or []

    if not data:
        return True

    latest_update = data[0]["last_updated"]

    # If nothing updated since today's open → we need to run it
    return latest_update < market_open_iso

# inserts a snapshot into "Stock Intraday" for every stock
def insert_stock_intraday_snapshot(now_iso: str):
    stocks_resp = supabase.table("Stocks") \
        .select("stock_id, current_price") \
        .execute()

    stocks = stocks_resp.data or []

    if not stocks:
        print("No stocks found for intraday insert.")
        return

    rows_to_insert = []

    for stock in stocks:
        price = stock.get("current_price")

        if price is None:
            continue

        rows_to_insert.append({
            "stock_id": stock["stock_id"],
            "price": float(price),
            "timestamp_of": now_iso
        })

    if not rows_to_insert:
        return

    # batch insert
    BATCH_SIZE = 500
    for i in range(0, len(rows_to_insert), BATCH_SIZE):
        batch = rows_to_insert[i:i + BATCH_SIZE]
        supabase.table("Stock Intraday").insert(batch).execute()

    print(f"Inserted {len(rows_to_insert)} intraday rows.")

# clears all rows from "Stock Intraday"
def clear_stock_intraday_table():

    try:
        supabase.table("Stock Intraday").delete().neq("stock_id", 0).execute()
        print("Stock Intraday table cleared.")
    except Exception as e:
        print("Error clearing Stock Intraday:", e)

# updates the Stocks.market_cap and Stocks.volume at end of day
def update_stock_marketcap_volume():
    print("Updating stock market cap and volume...")

    # Fetch all stocks
    stocks_resp = supabase.table("Stocks").select("stock_id, stock_symbol").execute()
    stocks = stocks_resp.data or []

    if not stocks:
        print("No stocks found.")
        return

    for stock in stocks:
        stock_id = stock["stock_id"]
        symbol = stock["stock_symbol"]

        try:
            ticker = yf.Ticker(symbol)
            info = ticker.fast_info

            market_cap = info.get("marketCap")
            volume = info.get("volume")

            if market_cap is None and volume is None:
                # fallback: try history for volume if fast_info missing
                hist = ticker.history(period="1d")
                if not hist.empty:
                    volume = int(hist["Volume"].iloc[-1])

            update_data = {}
            if market_cap is not None:
                update_data["market_cap"] = int(market_cap)
            if volume is not None:
                update_data["volume"] = int(volume)

            if update_data:
                supabase.table("Stocks").update(update_data).eq("stock_id", stock_id).execute()
            else:
                print(f"{symbol}: no market cap/volume data available")

            time.sleep(0.25)  # rate-limit safety

        except Exception as e:
            print(f"Error updating {symbol}: {e}")

    print("Stock market cap & volume update complete.")

# updates Leagues.is_ended to true for any league past its finish_time
def update_league_is_ended():
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        # Get leagues that should be ended
        resp = supabase.table("Leagues") \
            .select("league_id, name") \
            .lt("finish_time", now_iso) \
            .eq("is_ended", False) \
            .execute()

        leagues = resp.data or []

        if not leagues:
            print("No leagues need to be ended.")
            return

        league_ids = [l["league_id"] for l in leagues]
        league_name_map = {l["league_id"]: l["name"] for l in leagues}

        # Update them
        supabase.table("Leagues") \
            .update({"is_ended": True}) \
            .in_("league_id", league_ids) \
            .execute()

        print(f"Updated {len(league_ids)} leagues to is_ended = true.")

        # Get all portfolios in these leagues to find user_ids
        portfolios_resp = supabase.table("Portfolios") \
            .select("user_id, league_id") \
            .in_("league_id", league_ids) \
            .execute()

        portfolios = portfolios_resp.data or []

        # Build notifications for each user in each ended league
        notifications_to_insert = []
        for portfolio in portfolios:
            user_id = portfolio.get("user_id")
            league_id = portfolio.get("league_id")
            league_name = league_name_map.get(league_id, "Unknown League")

            notifications_to_insert.append({
                "user_id": user_id,
                "category": "League Completed",
                "league_id": league_id,
                "message": f"The league {league_name} has completed! Click to see what place you finished in!",
                "created_at": now_iso,
                "was_viewed": False
            })

        if notifications_to_insert:
            BATCH_SIZE = 500
            for i in range(0, len(notifications_to_insert), BATCH_SIZE):
                batch = notifications_to_insert[i:i + BATCH_SIZE]
                supabase.table("Notifications").insert(batch).execute()

            print(f"Inserted {len(notifications_to_insert)} league-completed notifications.")

    except Exception as e:
        print("Error updating leagues:", e)

# Distributes dividends to all eligible portfolios at market open.
def distribute_dividends():    
    print("Starting dividend distribution...")
    
    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()
    
    # -----------------------------------------------
    # 1. Get all stocks with dividend history
    # -----------------------------------------------
    stocks_resp = supabase.table("Stocks") \
        .select("stock_id, stock_symbol, dividend_last_paid, name") \
        .execute()
    
    stocks = stocks_resp.data or []
    if not stocks:
        print("No stocks found.")
        return
    
    # Create stock name map
    stock_names = {s["stock_id"]: s["name"] for s in stocks}
    
    # Fetch dividend data for all stocks
    dividends_to_process = []
    
    for stock in stocks:
        stock_id = stock["stock_id"]
        symbol = stock["stock_symbol"]
        last_paid = stock.get("dividend_last_paid")
        
        try:
            ticker = yf.Ticker(symbol)
            dividends = ticker.dividends
            
            if dividends.empty:
                continue
            
            # Filter dividends after last_paid date
            if last_paid:
                last_paid_dt = datetime.fromisoformat(last_paid)
                dividends = dividends[dividends.index > last_paid_dt]
            
            # Get most recent unpaid dividend
            if not dividends.empty:
                ex_div_date = dividends.index[-1]
                dividend_amount = float(dividends.iloc[-1])
                
                dividends_to_process.append({
                    "stock_id": stock_id,
                    "symbol": symbol,
                    "ex_dividend_date": ex_div_date,
                    "amount_per_share": dividend_amount
                })
        
        except Exception as e:
            print(f"Error fetching dividends for {symbol}: {e}")
    
    if not dividends_to_process:
        print("No dividends to process.")
        return
    
    print(f"Found {len(dividends_to_process)} stocks with dividends to distribute")
    
    # -----------------------------------------------
    # 2. Get active leagues & eligible portfolios
    # -----------------------------------------------
    leagues_resp = supabase.table("Leagues") \
        .select("league_id, finish_time, name") \
        .gt("finish_time", now_iso) \
        .execute()
    
    active_leagues = leagues_resp.data or []
    league_ids = [l["league_id"] for l in active_leagues]
    
    # Create league name map
    league_names = {l["league_id"]: l["name"] for l in active_leagues}
    
    if league_ids:
        league_filter = f"league_id.in.({','.join(map(str, league_ids))}),league_id.is.null"
    else:
        league_filter = "league_id.is.null"
    
    portfolios_resp = supabase.table("Portfolios") \
        .select("portfolio_id, league_id, reserve_value, user_id") \
        .or_(league_filter) \
        .execute()
    
    portfolios = portfolios_resp.data or []
    if not portfolios:
        print("No eligible portfolios found.")
        return
    
    portfolio_ids = [p["portfolio_id"] for p in portfolios]
    
    # -----------------------------------------------
    # 3. Get transactions for dividend-paying stocks
    #    up to their ex-dividend dates
    # -----------------------------------------------
    dividend_stock_ids = [d["stock_id"] for d in dividends_to_process]
    
    transactions_resp = supabase.table("Transactions") \
        .select("portfolio_id, stock_id, quantity, transaction_type, created_at") \
        .in_("portfolio_id", portfolio_ids) \
        .in_("stock_id", dividend_stock_ids) \
        .execute()
    
    transactions = transactions_resp.data or []
    
    # -----------------------------------------------
    # 4. Calculate holdings & dividend payments
    # -----------------------------------------------
    # Structure: {portfolio_id: {stock_id: dividend_amount}}
    dividend_updates = {}
    
    for div in dividends_to_process:
        stock_id = div["stock_id"]
        symbol = div["symbol"]
        ex_div_date = div["ex_dividend_date"]
        amount_per_share = div["amount_per_share"]
        
        # Filter transactions for this stock up to ex-dividend date
        relevant_txns = [
            t for t in transactions
            if t["stock_id"] == stock_id 
            and datetime.fromisoformat(t["created_at"]) <= ex_div_date
        ]
        
        # Calculate holdings per portfolio as of ex-dividend date
        holdings_as_of_ex_div = {}
        
        for txn in relevant_txns:
            pid = txn["portfolio_id"]
            qty = float(txn["quantity"])
            txn_type = txn["transaction_type"].upper()
            
            if txn_type == "BUY":
                holdings_as_of_ex_div[pid] = holdings_as_of_ex_div.get(pid, 0) + qty
            elif txn_type == "SELL":
                holdings_as_of_ex_div[pid] = holdings_as_of_ex_div.get(pid, 0) - qty
        
        # Add dividend payment for portfolios with positive holdings
        for pid, quantity in holdings_as_of_ex_div.items():
            if quantity > 0:
                dividend_payment = quantity * amount_per_share
                
                if pid not in dividend_updates:
                    dividend_updates[pid] = {}
                
                dividend_updates[pid][stock_id] = {
                    "amount": dividend_payment,
                    "symbol": symbol
                }
    
    # -----------------------------------------------
    # 5. Update portfolio reserve values & create notifications
    # -----------------------------------------------
    if not dividend_updates:
        print("No portfolios with qualifying holdings.")
        return
    
    portfolio_map = {p["portfolio_id"]: p for p in portfolios}
    notifications_to_insert = []
    
    for pid, stocks_dividends in dividend_updates.items():
        portfolio = portfolio_map[pid]
        user_id = portfolio.get("user_id")
        league_id = portfolio.get("league_id")
        
        # Calculate total dividend for this portfolio
        total_dividend = sum(d["amount"] for d in stocks_dividends.values())
        
        # Update portfolio reserve value
        new_reserve = float(portfolio.get("reserve_value", 0)) + total_dividend
        
        supabase.table("Portfolios") \
            .update({"reserve_value": new_reserve}) \
            .eq("portfolio_id", pid) \
            .execute()
        
        # -----------------------------------------------
        # Create a notification for EACH stock that paid
        # -----------------------------------------------
        for stock_id, dividend_info in stocks_dividends.items():
            amount = dividend_info["amount"]
            stock_name = stock_names.get(stock_id, "Unknown Stock")
            
            # Build portfolio location reference
            if league_id:
                league_name = league_names.get(league_id, "Unknown League")
                message = f"Your portfolio in {league_name} has received ${amount:.2f} in dividends from {stock_name}."
            else:
                message = f"Your Solo portfolio has received ${amount:.2f} in dividends from {stock_name}."
            
            notifications_to_insert.append({
                "user_id": user_id,
                "category": "Dividend",
                "league_id": league_id,
                "message": message,
                "created_at": now_iso,
                "was_viewed": False
            })
    
    # -----------------------------------------------
    # 6. Insert all notifications
    # -----------------------------------------------
    if notifications_to_insert:
        BATCH_SIZE = 500
        for i in range(0, len(notifications_to_insert), BATCH_SIZE):
            batch = notifications_to_insert[i:i + BATCH_SIZE]
            supabase.table("Notifications").insert(batch).execute()
        
        print(f"Inserted {len(notifications_to_insert)} notifications")
    
    # -----------------------------------------------
    # 7. Mark dividends as paid
    # -----------------------------------------------
    for div in dividends_to_process:
        ex_div_date_iso = div["ex_dividend_date"].isoformat()
        
        supabase.table("Stocks") \
            .update({"dividend_last_paid": ex_div_date_iso}) \
            .eq("stock_id", div["stock_id"]) \
            .execute()
    
    print(f"Distributed dividends to {len(dividend_updates)} portfolios")

# returns true if the pre-market (9 AM) start-of-day tasks need to run
def needs_premarketopen_update():
    now_et = datetime.now(ZoneInfo("America/New_York"))

    # Only weekdays
    if now_et.weekday() >= 5:
        return False

    premarketopen = now_et.replace(
        hour=9, minute=0, second=0, microsecond=0
    )

    # Only on or after 9 AM
    if now_et < premarketopen:
        return False

    premarketopen_utc = premarketopen.astimezone(timezone.utc)
    premarketopen_iso = premarketopen_utc.isoformat()

    # Check if Stock Intraday was cleared after today's 9 AM ET.
    # We check the oldest timestamp in the table — if it's from before
    # 9 AM today, the table hasn't been cleared yet (pre-market hasn't run).
    resp = supabase.table("Stock Intraday") \
        .select("timestamp_of") \
        .order("timestamp_of", desc=False) \
        .limit(1) \
        .execute()

    data = resp.data or []

    # If table is empty, pre-market tasks already ran (table was cleared)
    if not data:
        return False

    oldest_timestamp = data[0]["timestamp_of"]

    # If the oldest row is from before 9 AM today, the table hasn't been
    # cleared yet meaning pre-market tasks haven't run
    return oldest_timestamp < premarketopen_iso

if __name__ == "__main__":
    try:
        now = datetime.now()
        now_iso = datetime.now(timezone.utc).isoformat()
        print("")
        print(f"Cron triggered at {now}")

        # -----------------------------------
        # 1. PRE-MARKET (9 AM) — START OF DAY
        # -----------------------------------
        if needs_premarketopen_update():
            print("Pre-market update running...")
            update_stock_previous_close()
            update_portfolio_previous_close()
            clear_stock_intraday_table()
            try:
                distribute_dividends()
            except Exception as e:
                print(f"Error in dividend distribution: {e}")

        # -----------------------------------
        # 2. MARKET OPEN (9:30 AM - 4 PM) — LIVE PRICES
        # -----------------------------------
        if is_market_open():
            print("Market open — updating live prices.")
            update_all_stock_prices()
            insert_stock_intraday_snapshot(now_iso)

        # -----------------------------------
        # 3. MARKET CLOSED (after 4 PM) — DAILY SNAPSHOT
        # -----------------------------------
        else:
            if needs_daily_refresh():
                print("Market closed — performing last price update.")
                update_all_stock_prices()
                insert_stock_intraday_snapshot(now_iso)
                print("Updating histories and marketcap.")
                insert_stock_history()
                insert_portfolio_history()
                update_stock_marketcap_volume()
                update_league_is_ended()

    except Exception as e:
        print("Fatal error in cron job:", e)

    print(f"Finshed running in {(datetime.now() - now)} seconds.")
