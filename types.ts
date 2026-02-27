//
//
// ATTENTION:
//
// OUTDATED, some variables missing/updated
//
//

export interface Chat_Conversations {
  created_at: string;
  title?: string | null;
  conversation_id: number;
  user_id: string;
}

export interface Chat_Messages {
  message_id: number;
  created_at: string;
  is_ai_message?: boolean | null;
  message_text?: string | null;
  conversation_id: number;
}

export interface Draft_Picks {
  draft_pick_id: number;
  created_at: string;
  portfolio_id: number;
  draft_id: number;
  transaction_id?: number | null;
  round_number: number;
  pick_number: number;
  stock_id: number;
}

export interface Drafts {
  league_id: number;
  current_round?: number | null;
  current_pick?: number | null;
  current_portfolio_id?: number | null;
  is_snaking_forward?: boolean | null;
  timer_start_time?: string | null;
  is_started?: boolean | null;
  is_ended?: boolean | null;
  total_rounds?: number | null;
}

export interface Friend_Requests {
  friend_request_id: number;
  created_at: string;
  user_sent: string;
  user_receive: string;
  status: string;
}

export interface Friendships {
  friendship_id: number;
  created_at: string;
  user_1_id: string;
  user_2_id: string;
}

export interface Leagues {
  league_id: number;
  created_at: string;
  name: string;
  start_time: string;
  finish_time: string;
  has_trading: boolean;
  has_drafting: boolean;
  sectors: any;
  owner_id: string;
}

export interface Portfolio_Histories {
  portfolio_history_id: number;
  time: string;
  portfolio_id: number;
  value: number;
}

export interface Portfolio_Holdings {
  portfolio_holding_id: number;
  created_at: string;
  portfolio_id: number;
  stock_id: number;
  quantity: number;
  average_buy_price: number;
}

export interface Portfolios {
  portfolio_id: number;
  created_at: string;
  league_id?: number | null;
  previous_close_value: number;
  reserve_value: number;
  last_recalculated: string;
  user_id: string;
  is_solo: boolean;
}

export interface Profiles {
  id: string;
  created_at: string;
  email: string;
  username: string;
  avatar_url?: string | null;
  badge?: string | null;
}

export interface Stocks {
  stock_id: number;
  stock_symbol: string;
  name: string;
  current_price: number;
  last_updated: string;
  sector?: string | null;
}

export interface Transactions {
  transaction_id: number;
  created_at: string;
  stock_id: number;
  portfolio_id: number;
  transaction_total: number;
  quantity: number;
  price_per_share: number;
  transaction_type: string;
}

export interface Wishlist_Items {
  wishlist_item_id: number;
  created_at: string;
  portfolio_id: number;
  stock_id: number;
}
