# Period Market Coverage Audit — 2026-04-24

- Owner: Magoo
- Goal: bounded proof for quarter/half/F5 historical market availability.
- Source checked: `goose_market_candidates` exact market types.

## NBA 2024 Oct preseason/start

- first_quarter_spread: total 262, with_line 0, line_rate 0
- third_quarter_spread: total 168, with_line 0, line_rate 0
- first_quarter_total: total 0, with_line 0, line_rate 0
- first_half_spread: total 0, with_line 0, line_rate 0
- first_half_total: total 0, with_line 0, line_rate 0

Samples:
- 2024-10-31 third_quarter_spread/3rd Quarter Spread home line=null odds=-115 Warriors
- 2024-10-31 third_quarter_spread/3rd Quarter Spread away line=null odds=100 Trail Blazers
- 2024-10-31 third_quarter_spread/3rd Quarter Spread home line=null odds=-115 Thunder
- 2024-10-31 third_quarter_spread/3rd Quarter Spread away line=null odds=-115 Spurs
- 2024-10-31 third_quarter_spread/3rd Quarter Spread away line=null odds=-115 Pelicans
- 2024-10-31 third_quarter_spread/3rd Quarter Spread away line=null odds=-105 Nets

## NBA current Apr 2026

- first_quarter_spread: total 1074, with_line 84, line_rate 0.0782
- third_quarter_spread: total 1074, with_line 84, line_rate 0.0782
- first_quarter_total: total 0, with_line 0, line_rate 0
- first_half_spread: total 0, with_line 0, line_rate 0
- first_half_total: total 0, with_line 0, line_rate 0

Samples:
- 2026-04-21 third_quarter_spread/— New York Knicks line=-3.5 odds=131 
- 2026-04-21 third_quarter_spread/— Atlanta Hawks line=3.5 odds=-157 
- 2026-04-21 third_quarter_spread/— Denver Nuggets line=-4 odds=141 
- 2026-04-21 third_quarter_spread/— Minnesota Timberwolves line=4 odds=-171 
- 2026-04-21 third_quarter_spread/— New York Knicks line=-3.5 odds=131 
- 2026-04-21 third_quarter_spread/— Atlanta Hawks line=3.5 odds=-157 

## MLB 2024 Apr

- first_five_total: total 0, with_line 0, line_rate 0
- first_five_side: total 0, with_line 0, line_rate 0
- first_five_spread: total 0, with_line 0, line_rate 0
- first_five_moneyline: total 0, with_line 0, line_rate 0

Samples:
- none

## MLB current Apr 2026

- first_five_total: total 286, with_line 286, line_rate 1
- first_five_side: total 0, with_line 0, line_rate 0
- first_five_spread: total 0, with_line 0, line_rate 0
- first_five_moneyline: total 0, with_line 0, line_rate 0

Samples:
- 2026-04-21 first_five_total/— Under line=5 odds=-199 
- 2026-04-21 first_five_total/— Over line=7.5 odds=134 
- 2026-04-21 first_five_total/— Over line=5 odds=170 
- 2026-04-21 first_five_total/— Over line=5 odds=170 
- 2026-04-21 first_five_total/— Over line=5.5 odds=158 
- 2026-04-21 first_five_total/— Under line=5.5 odds=-185 

## Conclusion

- Quarter/F5 data exists in lower-level historical candidates only where exact market keys appear; it is not yet a general Ask Goose serving layer.
- NBA quarter spread is the strongest confirmed path for Mattys 1Q/3Q Chase.
- MLB F5 needs additional source-key investigation if exact `first_five_*` market_type counts are low/zero in this table, because current system records show F5 context exists elsewhere.
- First-half NBA was not confirmed in this bounded audit.