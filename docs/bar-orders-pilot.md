# Bar orders pilot

Waiters sign in on their phone and send orders from `/orders`. Owners and managers see open orders live on `/dashboard` and move them New → Ready → Served. Orders are not payments: close-of-day and sales reporting are unchanged.

## Setup (staging first)

1. In the Supabase SQL editor, run `supabase/bar-orders-pilot.sql` after the existing scripts (`rls-multitenancy.sql`, `role-permissions-rls.sql`, `rpc-atomic-workflows.sql`, `membership-invites-and-bar-switching.sql`). It is safe to re-run.
2. Set `ZENTRA_INVITE_REDIRECT_URL` to `https://<your-domain>/accept-invite` in Vercel and add that URL to Supabase Auth → URL configuration → Redirect URLs.
3. Invite each waiter from Staff as a login user with the `staff` role. They open the email link, set a password (12+ characters) and land on `/orders`. Their phone keeps them signed in.

## Behaviour

- Waiters see only active products for their bar, and only their own orders. They cannot see reports, stock or other bars.
- Prices are taken from the products table when the order is saved, not from the phone.
- Retrying an unconfirmed order reuses the same request ID, so a weak connection cannot create duplicates.
- The dashboard queue listens for live changes and also refreshes every 10 seconds, on focus and when the connection returns.
