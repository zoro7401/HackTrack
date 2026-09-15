-- 20260103000000_add_discovered_details.sql
-- What: Add location, entry_fee and prize_money to discovered_hackathons.
-- Why:  The Discover page only showed name/platform/deadline. These three are
--       what actually decide whether a listing is worth opening, and the
--       scrapers can read them straight off the listing APIs/pages.
--       Free text, like round_dates on the hackathons table: formats vary too
--       much across five platforms ("Free", "₹500", "Bengaluru", "Online",
--       "$5,000 in prizes") to force into a typed column, and a wrong guess at
--       structure is worse than a plain string.

alter table discovered_hackathons
  add column if not exists location     text,
  add column if not exists entry_fee    text,
  add column if not exists prize_money  text;
