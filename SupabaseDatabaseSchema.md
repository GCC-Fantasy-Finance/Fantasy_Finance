## Supabase Database Schema

### Chat Conversations

- created_at: timestamptz
- title: text
- conversation_id: int8
- user_id: uuid

### Chat Messages

- message_id: int8
- created_at: timestamptz
- is_ai_message: bool
- message_text: text
- conversation_id: int8
- context_portfolio_names: text[] (nullable)

### Draft Picks

- draft_pick_id: int8
- created_at: timestamptz
- portfolio_id: int8
- draft_id: int8
- transaction_id: int8
- round_number: int8
- pick_number: int8
- stock_id: int8

### Drafts

- league_id: int8
- current_round: int8
- current_pick: int8
- current_portfolio_id: int8
- is_snaking_forward: bool
- timer_start_time: timestamptz
- is_started: bool
- is_ended: bool
- total_rounds: int8

### Friend Requests

- friend_request_id: int8
- created_at: timestamptz
- user_sent: uuid
- user_receive: uuid
- status: varchar

### Friendships

- friendship_id: int8
- created_at: timestamptz
- user_1_id: uuid
- user_2_id: uuid

### Leagues

- league_id: int8
- created_at: timestamptz
- name: text
- start_time: timestamp
- finish_time: timestamp
- has_trading: bool
- has_drafting: bool
- sectors: text
- owner_id: uuid

### Portfolio Histories

- portfolio_history_id: int8
- time: timestamptz
- portfolio_id: int8
- value: float8

### Portfolio Holdings

- portfolio_holding_id: int8
- created_at: timestamptz
- portfolio_id: int8
- stock_id: int8
- quantity: float8
- average_buy_price: float8

### Portfolios

- portfolio_id: int8
- created_at: timestamptz
- league_id: int8
- previous_close_value: float8
- reserve_value: float8
- last_recalculated: timestamp
- user_id: uuid
- is_solo: bool
- previous_close_value: float8

### Profiles

- id: uuid
- created_at: timestamptz
- email: text
- username: text
- avatar_url: text
- badge: text

### Stocks

- stock_id: int8
- stock_symbol: varchar
- name: text
- current_price: float8
- last_updated: timestamp
- sector: text

### Transactions

- transaction_id: int8
- created_at: timestamptz
- stock_id: int8
- portfolio_id: int8
- transaction_total: float8
- quantity: float8
- price_per_share: float8
- transaction_type: varchar

### Wishlist Items

- wishlist_item_id: int8
- created_at: timestamptz
- portfolio_id: int8
- stock_id:int8
