-- Legacy sample seed data for the old generic schema.
-- Do not run this against your existing Plain Depot dashboard unless you intentionally
-- want to create/use generic categories/products/supplier_routes tables.

insert into public.categories (id, name, description, accent, sku_count, sort_order, is_active)
values
  ('gfci', 'GFCI Outlets', 'Weather-resistant, tamper-resistant, and self-test protection.', '#6d5dfc', 42, 10, true),
  ('switches', 'Switches', 'Single pole, 3-way, dimmer, and commercial-grade controls.', '#22d3ee', 58, 20, true),
  ('duplex', 'Duplex Outlets', 'Residential and spec-grade standard receptacles.', '#a78bfa', 76, 30, true),
  ('plates', 'Wall Plates', 'Decorator, duplex, toggle, blank, and multi-gang plates.', '#f8fafc', 91, 40, true),
  ('connectors', 'Lever Connectors', 'Reusable compact connectors for fast field wiring.', '#38bdf8', 34, 50, true),
  ('commercial', 'Commercial Electrical', 'Contractor packs, job-site stock, and high-volume essentials.', '#818cf8', 28, 60, true),
  ('accessories', 'Electrical Accessories', 'Spacers, labels, testers, screws, pigtails, and finish kits.', '#60a5fa', 63, 70, true)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  accent = excluded.accent,
  sku_count = excluded.sku_count,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

insert into public.products (
  id, name, category_id, price, contractor_price, stock, low_stock_threshold,
  best_selling, created_at, rating, image_type, accent, summary, specs,
  bulk_tiers, shipping, sort_order, is_active
)
values
  (
    'gfci-20a-white', '20A Self-Test GFCI Outlet', 'gfci', 18.95, 15.80, 1240, 180,
    98, '2026-04-14', 4.90, 'gfci', '#6d5dfc',
    'Commercial-grade 20 amp GFCI receptacle with self-test protection and tamper-resistant shutters.',
    '{"Amperage":"20A","Voltage":"125V","Rating":"WR/TR","Material":"Impact-resistant thermoplastic","Certification":"UL listed"}',
    '[{"qty":10,"price":17.25},{"qty":50,"price":16.10},{"qty":250,"price":15.80}]',
    'Ships today from Chicago if ordered before 3 PM CT', 10, true
  ),
  (
    'duplex-15a-white', '15A Duplex Outlet Contractor Pack', 'duplex', 1.18, 0.92, 8420, 1200,
    100, '2026-03-03', 4.80, 'duplex', '#a78bfa',
    'Spec-grade standard duplex receptacle for high-volume residential and property maintenance work.',
    '{"Amperage":"15A","Voltage":"125V","Grade":"Spec grade","Termination":"Side wire and push wire","Pack":"Bulk cartons available"}',
    '[{"qty":100,"price":1.05},{"qty":500,"price":0.98},{"qty":2000,"price":0.92}]',
    'Same-day warehouse pick available', 20, true
  ),
  (
    'decorator-15a-white', '15A Decorator Outlet', 'duplex', 2.42, 1.96, 3175, 500,
    74, '2026-02-20', 4.70, 'decorator', '#c4b5fd',
    'Clean decorator-style receptacle for modern residential and hospitality projects.',
    '{"Amperage":"15A","Voltage":"125V","Face":"Decorator","Finish":"Matte white","Certification":"UL listed"}',
    '[{"qty":50,"price":2.20},{"qty":250,"price":2.05},{"qty":1000,"price":1.96}]',
    'Estimated delivery in 2 business days', 30, true
  ),
  (
    'switch-single-pole', '15A Single Pole Light Switch', 'switches', 1.35, 1.04, 6630, 900,
    95, '2026-04-27', 4.80, 'switch', '#22d3ee',
    'Durable toggle switch for residential, multi-family, and light commercial installs.',
    '{"Amperage":"15A","Voltage":"120/277V","Pole":"Single pole","Color":"White","Certification":"UL listed"}',
    '[{"qty":100,"price":1.22},{"qty":500,"price":1.12},{"qty":2000,"price":1.04}]',
    'Ships today from Chicago', 40, true
  ),
  (
    'plate-decora-1g', '1-Gang Decorator Wall Plate', 'plates', 0.72, 0.55, 12450, 1800,
    91, '2026-01-18', 4.70, 'plate', '#e5e7eb',
    'Smooth screwless-look decorator wall plate for clean finish installations.',
    '{"Gang":"1-gang","Opening":"Decorator","Material":"Thermoplastic","Finish":"White","Pack":"Singles and cartons"}',
    '[{"qty":100,"price":0.64},{"qty":500,"price":0.58},{"qty":2000,"price":0.55}]',
    'Same-day pickup available', 50, true
  ),
  (
    'lever-3port', '3-Port Lever Wire Connector', 'connectors', 0.38, 0.29, 980, 1100,
    88, '2026-05-02', 4.90, 'connector', '#38bdf8',
    'Reusable compact 3-port connector for fast branch wiring, lighting, and service work.',
    '{"Ports":"3","Wire":"12-24 AWG","Rating":"32A / 600V","Housing":"Transparent inspection window","Use":"Solid and stranded copper"}',
    '[{"qty":100,"price":0.34},{"qty":1000,"price":0.31},{"qty":5000,"price":0.29}]',
    'Low stock. Next replenishment in transit', 60, true
  ),
  (
    'accessory-spacer-kit', 'Outlet Spacer and Shim Kit', 'accessories', 6.80, 5.45, 420, 300,
    61, '2026-05-07', 4.60, 'accessory', '#818cf8',
    'Field-ready spacer kit for aligning devices cleanly in tile, paneling, and deep boxes.',
    '{"Pieces":"96","Material":"Non-conductive polymer","Use":"Receptacles and switches","Storage":"Reusable contractor case","Compatibility":"Universal device screws"}',
    '[{"qty":12,"price":6.20},{"qty":48,"price":5.80},{"qty":144,"price":5.45}]',
    'Estimated delivery in 3 business days', 70, true
  ),
  (
    'commercial-job-pack', 'Commercial Trim-Out Job Pack', 'commercial', 298.00, 259.00, 72, 80,
    83, '2026-04-02', 4.90, 'jobpack', '#6d5dfc',
    'Bundled outlets, switches, plates, connectors, and labeling for fast commercial trim-out.',
    '{"Devices":"240 total pieces","Projects":"Office, retail, multifamily","Packaging":"Room-ready cartons","Includes":"Receptacles, switches, plates, connectors","Support":"Quote desk eligible"}',
    '[{"qty":4,"price":282.00},{"qty":12,"price":269.00},{"qty":24,"price":259.00}]',
    'Low stock. Reserve now for Friday pickup', 80, true
  )
on conflict (id) do update set
  name = excluded.name,
  category_id = excluded.category_id,
  price = excluded.price,
  contractor_price = excluded.contractor_price,
  stock = excluded.stock,
  low_stock_threshold = excluded.low_stock_threshold,
  best_selling = excluded.best_selling,
  created_at = excluded.created_at,
  rating = excluded.rating,
  image_type = excluded.image_type,
  accent = excluded.accent,
  summary = excluded.summary,
  specs = excluded.specs,
  bulk_tiers = excluded.bulk_tiers,
  shipping = excluded.shipping,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

insert into public.supplier_routes (
  id, origin, current_location, destination, eta_label, reference_code,
  status, progress, sort_order, is_active
)
values
  (
    'supplier-hub-chicago', 'Supplier Partner Hub', 'Intermodal Logistics Corridor',
    'Chicago Warehouse', 'May 23, 2026', 'TPD-SUP-884210',
    'Inbound freight in transit', 62, 10, true
  ),
  (
    'regional-distribution-chicago', 'Regional Distribution Partner', 'Rail Transfer Yard',
    'Chicago Warehouse', 'May 21, 2026', 'TPD-SUP-884355',
    'Rail transfer scheduled', 78, 20, true
  )
on conflict (id) do update set
  origin = excluded.origin,
  current_location = excluded.current_location,
  destination = excluded.destination,
  eta_label = excluded.eta_label,
  reference_code = excluded.reference_code,
  status = excluded.status,
  progress = excluded.progress,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;
