import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const trackingSelect =
  "id, order_items, tracking_carrier, tracking_number, tracking_status, tracking_updated_at";

type PlainDepotOrder = {
  id: string;
  order_items?: Record<string, unknown> | null;
  tracking_carrier?: string | null;
  tracking_number?: string | null;
};

type ShippoLocation = {
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
};

type ShippoTrackingStatus = {
  status?: string | null;
  status_details?: string | null;
  status_date?: string | null;
  location?: ShippoLocation | string | null;
};

type ShippoTrackingResponse = {
  carrier?: string | null;
  tracking_number?: string | null;
  tracking_url_provider?: string | null;
  eta?: string | null;
  tracking_status?: ShippoTrackingStatus | null;
  tracking_history?: ShippoTrackingStatus[] | null;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function textValue(...values: unknown[]) {
  return values.find((value) => String(value || "").trim())?.toString().trim() || "";
}

function nestedRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeCarrierToken(carrier: string, trackingNumber: string) {
  const normalized = carrier
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalized && trackingNumber.toUpperCase().startsWith("SHIPPO_")) return "shippo";
  if (["fed_ex", "fedex", "federal_express"].includes(normalized)) return "fedex";
  if (["u_s_p_s", "us_postal_service", "postal_service"].includes(normalized)) return "usps";
  if (["u_p_s"].includes(normalized)) return "ups";
  if (["dhl", "dhl_express"].includes(normalized)) return "dhl_express";
  return normalized;
}

function formatLocation(location: ShippoLocation | string | null | undefined) {
  if (!location) return "";
  if (typeof location === "string") return location;

  return [location.city, location.state, location.zip, location.country]
    .filter(Boolean)
    .join(", ");
}

function readableStatus(status?: string | null, details?: string | null) {
  const cleanDetails = String(details || "").trim();
  const normalized = String(status || "").trim().toUpperCase();

  if (cleanDetails && !["UNKNOWN", "PRE_TRANSIT", "TRANSIT", "DELIVERED", "RETURNED", "FAILURE"].includes(normalized)) {
    return cleanDetails;
  }

  if (normalized === "DELIVERED") return "Delivered";
  if (normalized === "TRANSIT") {
    return /out for delivery/i.test(cleanDetails) ? "Out for delivery" : "In transit";
  }
  if (normalized === "PRE_TRANSIT") return "Label created";
  if (normalized === "RETURNED") return "Returned";
  if (normalized === "FAILURE") return "Needs attention";
  return cleanDetails || "Tracking unavailable";
}

function extractShipment(order: PlainDepotOrder) {
  const orderItems = nestedRecord(order.order_items);
  const shipment = nestedRecord(
    orderItems.shipment || orderItems.shipping || orderItems.tracking,
  );

  const trackingNumber = textValue(
    order.tracking_number,
    shipment.trackingNumber,
    shipment.tracking_number,
    shipment.number,
    orderItems.trackingNumber,
    orderItems.tracking_number,
  );
  const carrier = textValue(
    order.tracking_carrier,
    shipment.carrier,
    shipment.carrierCode,
    orderItems.trackingCarrier,
  );

  return {
    trackingNumber,
    carrierToken: normalizeCarrierToken(carrier, trackingNumber),
    carrierLabel: carrier,
  };
}

function mapShippoResponse(payload: ShippoTrackingResponse, fallbackCarrier: string) {
  const currentStatus = payload.tracking_status || {};
  const history = Array.isArray(payload.tracking_history) ? payload.tracking_history : [];

  return {
    tracking_carrier: textValue(payload.carrier, fallbackCarrier),
    tracking_status: readableStatus(currentStatus.status, currentStatus.status_details),
    tracking_eta: payload.eta || null,
    tracking_location: formatLocation(currentStatus.location),
    tracking_url: payload.tracking_url_provider || null,
    tracking_events: history.map((event, index) => ({
      id: `shippo-${index}-${event.status_date || index}`,
      status: readableStatus(event.status, event.status_details),
      location: formatLocation(event.location),
      time: event.status_date || "",
    })),
    tracking_updated_at: new Date().toISOString(),
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const shippoApiToken = Deno.env.get("SHIPPO_API_TOKEN");
  const authorization = request.headers.get("Authorization") || "";

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !shippoApiToken) {
    return jsonResponse({ error: "Missing Supabase or Shippo server environment variables." }, 500);
  }

  if (!authorization) {
    return jsonResponse({ error: "Missing authorization header." }, 401);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse({ error: "Sign in is required to sync tracking." }, 401);
  }

  const body = await request.json().catch(() => ({}));
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";

  let query = userClient
    .from("plain_depot_orders")
    .select(trackingSelect)
    .not("tracking_number", "is", null)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (orderId) query = query.eq("id", orderId);

  const { data: orders, error: orderError } = await query;

  if (orderError) {
    return jsonResponse({ error: orderError.message }, 400);
  }

  const updated: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const order of (orders || []) as PlainDepotOrder[]) {
    const { trackingNumber, carrierToken, carrierLabel } = extractShipment(order);

    if (!trackingNumber) {
      skipped.push({ id: order.id, reason: "missing tracking number" });
      continue;
    }

    if (!carrierToken) {
      skipped.push({ id: order.id, reason: "missing carrier" });
      continue;
    }

    const shippoUrl = `https://api.goshippo.com/tracks/${encodeURIComponent(
      carrierToken,
    )}/${encodeURIComponent(trackingNumber)}`;
    const shippoResponse = await fetch(shippoUrl, {
      headers: {
        Authorization: `ShippoToken ${shippoApiToken}`,
        Accept: "application/json",
      },
    });

    if (!shippoResponse.ok) {
      const errorText = await shippoResponse.text();
      failed.push({
        id: order.id,
        error: `Shippo ${shippoResponse.status}: ${errorText.slice(0, 240)}`,
      });
      continue;
    }

    const payload = (await shippoResponse.json()) as ShippoTrackingResponse;
    const updates = mapShippoResponse(payload, carrierLabel || carrierToken);
    const { error: updateError } = await adminClient
      .from("plain_depot_orders")
      .update(updates)
      .eq("id", order.id);

    if (updateError) {
      failed.push({ id: order.id, error: updateError.message });
      continue;
    }

    updated.push(order.id);
  }

  return jsonResponse({
    status: "synced",
    updated,
    skipped,
    failed,
  });
});
