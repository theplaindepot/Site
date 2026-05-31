# Shippo Tracking Sync

This Edge Function refreshes `plain_depot_orders` tracking fields from Shippo.
It is called by the tracking page through `listPlainDepotAccountShipments()`.

Required Supabase secrets:

```sh
supabase secrets set SHIPPO_API_TOKEN=shippo_test_or_live_token
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Deploy:

```sh
supabase functions deploy shippo-sync-tracking
```

For Shippo test mode, save an order with:

- `tracking_carrier`: `shippo`
- `tracking_number`: `SHIPPO_TRANSIT`, `SHIPPO_DELIVERED`, `SHIPPO_PRE_TRANSIT`,
  `SHIPPO_RETURNED`, `SHIPPO_FAILURE`, or `SHIPPO_UNKNOWN`

For live carrier tracking, use a live Shippo token and the carrier token Shippo
expects, such as `usps`, `ups`, `fedex`, or `dhl_express`.
