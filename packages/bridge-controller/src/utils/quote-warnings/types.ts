export type QuoteWarning =
  | 'low_return'
  | 'no_quotes'
  | 'insufficient_gas_balance'
  | 'insufficient_gas_for_selected_quote'
  | 'insufficient_balance'
  | 'market_closed'
  | 'price_impact'
  | 'quote_expired'
  | 'tx_alert';
