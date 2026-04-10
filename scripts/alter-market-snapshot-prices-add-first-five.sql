alter table public.market_snapshot_prices
  drop constraint if exists market_snapshot_prices_market_type_check;

alter table public.market_snapshot_prices
  add constraint market_snapshot_prices_market_type_check
  check (market_type in (
    'moneyline',
    'spread',
    'spread_q1',
    'spread_q3',
    'total',
    'first_five_moneyline',
    'first_five_total'
  ));
