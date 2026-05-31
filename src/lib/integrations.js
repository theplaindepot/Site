import { createClient } from "@supabase/supabase-js";
import { loadStripe } from "@stripe/stripe-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const orderShipmentBaseSelect =
  "id, status, total, order_items, updated_at, order_date, order_time, customer_email, customer_company";
const orderShipmentTrackingSelect = `${orderShipmentBaseSelect}, tracking_carrier, tracking_number, tracking_status, tracking_eta, tracking_location, tracking_url, tracking_events, tracking_updated_at`;

export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export const stripePromise = stripePublishableKey
  ? loadStripe(stripePublishableKey)
  : Promise.resolve(null);

export const integrationStatus = {
  supabase: Boolean(supabase),
  stripe: Boolean(stripePublishableKey),
  applePay: "Ready through Stripe Payment Request API",
  googlePay: "Ready through Stripe Payment Request API",
};

function publicProfileSnapshot(profile) {
  const { confirmPassword, password, ...safeProfile } = profile;
  return safeProfile;
}

function buildMobileProfileSnapshot(user, profile = null) {
  return {
    user_id: user?.id ?? null,
    email: profile?.email || user?.email || "",
    name: profile?.name || user?.user_metadata?.name || user?.user_metadata?.full_name || "",
    company: profile?.company || user?.user_metadata?.company || "",
    phone: profile?.phone || user?.user_metadata?.phone || "",
    trade: profile?.trade || user?.user_metadata?.trade || "Electrical",
    project_type: profile?.project_type || "",
    default_zip: profile?.default_zip || profile?.defaultZip || "",
    status: profile?.status || "active",
    updated_at: new Date().toISOString(),
  };
}

function toOrderLineItem(item) {
  const quantity = Number(item.quantity || 0);
  const unitPrice = Number(item.price || 0);
  const lineTotal = Number((unitPrice * quantity).toFixed(2));
  return {
    sku: item.id,
    name: item.name,
    category: item.categoryName,
    qty: quantity,
    quantity,
    price: unitPrice,
    unit_price: unitPrice,
    contractor_price: item.contractorPrice,
    total: lineTotal,
    line_total: lineTotal,
  };
}

function createPlainDepotOrderId() {
  return `TPD-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
}

function currentDateParts() {
  const now = new Date();
  return {
    date: now.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    }),
    time: now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

function firstTextValue(...values) {
  return values.find((value) => String(value || "").trim()) || "";
}

function normalizeTrackingEvents(...eventSources) {
  const source = eventSources.find(Array.isArray) || [];
  return source
    .map((event, index) => ({
      id: event.id || event.eventId || `event-${index}`,
      status: firstTextValue(
        event.status,
        event.eventDescription,
        event.description,
        event.scanEvent,
        event.type,
      ),
      location: firstTextValue(
        event.location,
        event.city && event.state ? `${event.city}, ${event.state}` : "",
        event.scanLocation,
        event.eventLocation,
      ),
      time: firstTextValue(event.time, event.dateTime, event.timestamp, event.date, event.eventTime),
    }))
    .filter((event) => event.status || event.location || event.time);
}

function fedExTrackingUrl(trackingNumber) {
  const cleanTrackingNumber = String(trackingNumber || "").replace(/[^A-Za-z0-9]/g, "");
  return cleanTrackingNumber ? `https://www.fedex.com/fedextrack/?trknbr=${cleanTrackingNumber}` : "";
}

function orderRowToShipment(row) {
  const orderItems = row?.order_items && typeof row.order_items === "object" ? row.order_items : {};
  const shipment = orderItems.shipment || orderItems.shipping || orderItems.tracking || {};
  const customer = orderItems.customer || {};
  const trackingNumber = firstTextValue(
    row.tracking_number,
    shipment.trackingNumber,
    shipment.tracking_number,
    shipment.number,
    orderItems.trackingNumber,
    orderItems.tracking_number,
  );
  const carrier = firstTextValue(
    row.tracking_carrier,
    shipment.carrier,
    shipment.carrierCode,
    orderItems.trackingCarrier,
    trackingNumber ? "FedEx" : "",
  );
  const trackingUrl = firstTextValue(
    row.tracking_url,
    shipment.trackingUrl,
    shipment.url,
    carrier.toLowerCase().includes("fedex") ? fedExTrackingUrl(trackingNumber) : "",
  );
  const events = normalizeTrackingEvents(
    row.tracking_events,
    shipment.events,
    shipment.trackingEvents,
    orderItems.trackingEvents,
  );

  return {
    id: row.id,
    orderNumber: row.id,
    orderStatus: row.status || "Preparing",
    total: Number(row.total || orderItems.totals?.total || 0),
    itemCount: Array.isArray(orderItems.items)
      ? orderItems.items.reduce((sum, item) => sum + Number(item.quantity || item.qty || 0), 0)
      : Number(row.qty || 0),
    customerEmail: row.customer_email || customer.email || "",
    customerCompany: row.customer_company || customer.company || "",
    carrier: carrier || "Plain Depot",
    trackingNumber,
    trackingStatus: firstTextValue(
      row.tracking_status,
      shipment.status,
      shipment.trackingStatus,
      orderItems.trackingStatus,
      row.status,
      "Preparing",
    ),
    trackingEta: firstTextValue(
      row.tracking_eta,
      shipment.estimatedDelivery,
      shipment.eta,
      orderItems.trackingEta,
    ),
    trackingLocation: firstTextValue(
      row.tracking_location,
      shipment.location,
      shipment.currentLocation,
      orderItems.trackingLocation,
    ),
    trackingUrl,
    trackingEvents: events,
    updatedAt: row.tracking_updated_at || row.updated_at || "",
    orderDate: row.order_date || "",
    orderTime: row.order_time || "",
  };
}

export async function saveContractorProfile(profile) {
  if (!supabase) {
    return {
      status: "local",
      profile: publicProfileSnapshot(profile),
    };
  }

  const userId = await getAuthenticatedUserId();
  const { error } = await supabase
    .from("plain_depot_clients")
    .insert({
      user_id: userId,
      name: profile.name,
      company: profile.company,
      email: profile.email,
      phone: profile.phone,
      trade: profile.trade ?? "Electrical",
      project_type: profile.projectType,
      default_zip: profile.zip,
      notes: profile.notes,
      status: "new",
    });

  if (error) {
    if (error.code === "42501" || /row-level security/i.test(error.message ?? "")) {
      throw new Error(
        "Account requests are not enabled in Supabase yet. Run supabase/allow_mobile_account_signups.sql in the Supabase SQL Editor.",
      );
    }
    throw error;
  }

  return {
    status: "saved",
  };
}

export async function getContractorProfileForCurrentUser() {
  if (!supabase) {
    return {
      status: "local",
      profile: null,
    };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  const email = sessionData.session?.user?.email;

  if (!email) {
    return {
      status: "signed-out",
      profile: null,
    };
  }

  const { data, error } = await supabase
    .from("plain_depot_clients")
    .select("id, user_id, name, company, email, phone, trade, project_type, default_zip, status, created_at")
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    status: data ? "loaded" : "missing",
    profile: data,
  };
}

export async function createContractorAccount(profile) {
  if (!supabase) {
    return {
      status: "local",
      profile: publicProfileSnapshot(profile),
      user: { email: profile.email },
      session: null,
    };
  }

  let authStatus = "profile-only";
  let authWarning = "";
  let authUser = null;
  let authSession = null;

  if (profile.password) {
    const { data, error } = await supabase.auth.signUp({
      email: profile.email,
      password: profile.password,
      options: {
        data: {
          account_type: "contractor",
          company: profile.company,
          name: profile.name,
          phone: profile.phone,
          trade: profile.trade ?? "Electrical",
        },
      },
    });

    if (error) {
      authWarning = error.message;
    } else if (data?.user) {
      authStatus = "created";
      authUser = data.user;
      authSession = data.session;
    }

    if (!authSession && !authWarning) {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: profile.password,
      });

      if (signInError) {
        authWarning = signInError.message;
      } else {
        authStatus = "created";
        authUser = signInData.user;
        authSession = signInData.session;
      }
    }
  }

  const accountNotes = [
    profile.notes,
    `Account type: Contractor`,
    profile.monthlyVolume ? `Estimated monthly volume: ${profile.monthlyVolume}` : "",
    profile.termsAccepted ? "Terms accepted: yes" : "",
  ]
    .filter(Boolean)
    .join("\n");

  const savedProfile = await saveContractorProfile({
    ...profile,
    notes: accountNotes,
  });

  return {
    ...savedProfile,
    authStatus,
    authWarning,
    user: authUser,
    session: authSession,
    status: authStatus === "created" ? "created" : savedProfile.status,
  };
}

export async function signInContractorAccount({ email, password }) {
  if (!supabase) {
    return {
      status: "local",
      user: { email },
    };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return {
    status: "signed-in",
    user: data.user,
  };
}

export async function getCurrentContractorSession() {
  if (!supabase) {
    return {
      status: "local",
      user: null,
      session: null,
    };
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return {
    status: data.session ? "signed-in" : "signed-out",
    user: data.session?.user ?? null,
    session: data.session,
  };
}

export async function signOutContractorAccount() {
  if (!supabase) {
    return { status: "local" };
  }

  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }

  return { status: "signed-out" };
}

async function getAuthenticatedUserId() {
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  return data.user?.id ?? null;
}

export async function loadMobileAppState() {
  if (!supabase) {
    return {
      status: "local",
      profile: {},
      cart: [],
      projects: [],
      previousOrders: [],
      notifications: [],
      preferences: {},
    };
  }

  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return {
      status: "signed-out",
      profile: {},
      cart: [],
      projects: [],
      previousOrders: [],
      notifications: [],
      preferences: {},
    };
  }

  const { data, error } = await supabase
    .from("plain_depot_mobile_app_state")
    .select("profile, cart, projects, previous_orders, notifications, preferences, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    status: data ? "loaded" : "missing",
    profile: data?.profile && typeof data.profile === "object" ? data.profile : {},
    cart: Array.isArray(data?.cart) ? data.cart : [],
    projects: Array.isArray(data?.projects) ? data.projects : [],
    previousOrders: Array.isArray(data?.previous_orders) ? data.previous_orders : [],
    notifications: Array.isArray(data?.notifications) ? data.notifications : [],
    preferences: data?.preferences && typeof data.preferences === "object" ? data.preferences : {},
    updatedAt: data?.updated_at ?? null,
  };
}

export async function saveMobileAppState({
  cart = [],
  projects = [],
  profile = {},
  previousOrders = [],
  notifications = [],
  preferences = {},
} = {}) {
  if (!supabase) {
    return {
      status: "local",
      profile,
      cart,
      projects,
      previousOrders,
      notifications,
      preferences,
    };
  }

  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return {
      status: "signed-out",
      profile,
      cart,
      projects,
      previousOrders,
      notifications,
      preferences,
    };
  }

  const { error } = await supabase
    .from("plain_depot_mobile_app_state")
    .upsert(
      {
        user_id: userId,
        profile,
        cart,
        projects,
        previous_orders: previousOrders,
        notifications,
        preferences,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    if (error.code === "42P01" || /does not exist/i.test(error.message ?? "")) {
      throw new Error(
        "Mobile app sync is not enabled in Supabase yet. Run supabase/allow_mobile_account_signups.sql in the Supabase SQL Editor.",
      );
    }
    throw error;
  }

  return {
    status: "saved",
  };
}

export async function syncMobileProfileState(profile = null) {
  if (!supabase) return { status: "local" };

  const { data, error } = await supabase.auth.getUser();

  if (error) throw error;
  if (!data.user) return { status: "signed-out" };

  const currentState = await loadMobileAppState();

  return saveMobileAppState({
    profile: buildMobileProfileSnapshot(data.user, profile),
    cart: currentState.cart,
    projects: currentState.projects,
    previousOrders: currentState.previousOrders,
    notifications: currentState.notifications,
    preferences: currentState.preferences,
  });
}

export async function appendMobileOrderHistory({ order, cartItems, customer, totals }) {
  if (!supabase) return { status: "local" };

  const userId = await getAuthenticatedUserId();

  if (!userId) return { status: "signed-out" };

  const orderSnapshot = {
    order_id: order?.orderNumber || order?.orderId || null,
    user_id: userId,
    client_id: order?.clientId || customer?.clientId || customer?.client_id || null,
    customer,
    totals,
    items: cartItems.map(toOrderLineItem),
    status: "submitted",
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("plain_depot_user_order_history")
    .insert({
      user_id: userId,
      client_id: orderSnapshot.client_id,
      order_id: orderSnapshot.order_id,
      customer,
      totals,
      items: orderSnapshot.items,
      status: orderSnapshot.status,
    });

  if (error && error.code !== "42P01") {
    throw error;
  }

  const currentState = await loadMobileAppState();

  return saveMobileAppState({
    profile: currentState.profile,
    cart: currentState.cart,
    projects: currentState.projects,
    previousOrders: [orderSnapshot, ...currentState.previousOrders].slice(0, 50),
    notifications: [
      {
        id: `order-${Date.now()}`,
        type: "order",
        title: "Order submitted",
        body: `${orderSnapshot.order_id || "Your order"} was sent for review.`,
        created_at: orderSnapshot.created_at,
      },
      ...currentState.notifications,
    ].slice(0, 50),
    preferences: currentState.preferences,
  });
}

async function resolveOrderAccountLink(customer = {}) {
  const userId = await getAuthenticatedUserId();
  const explicitClientId = customer.clientId || customer.client_id || null;

  if (explicitClientId || !supabase) {
    return {
      userId: customer.userId || customer.user_id || userId || null,
      clientId: explicitClientId,
    };
  }

  if (userId) {
    const { data, error } = await supabase
      .from("plain_depot_clients")
      .select("id, user_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== "42703") throw error;
    if (data?.id) {
      return {
        userId: data.user_id || userId,
        clientId: data.id,
      };
    }
  }

  if (customer.email) {
    const { data, error } = await supabase
      .from("plain_depot_clients")
      .select("id, user_id")
      .ilike("email", customer.email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data?.id) {
      return {
        userId: data.user_id || userId || null,
        clientId: data.id,
      };
    }
  }

  return {
    userId: customer.userId || customer.user_id || userId || null,
    clientId: null,
  };
}

export async function createOrderRequest({ cartItems, customer, totals }) {
  if (!supabase) {
    return {
      status: "local",
      orderStatus: "Preparing",
      orderNumber: "LOCAL-PREVIEW",
      customer,
      totals,
      lineItems: cartItems.map(toOrderLineItem),
    };
  }

  const orderId = createPlainDepotOrderId();
  const { date, time } = currentDateParts();
  const orderItems = cartItems.map(toOrderLineItem);
  const primaryItem = cartItems[0];
  const totalQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const customerLabel = customer.company
    ? `${customer.company} (${customer.name || customer.email})`
    : customer.name || customer.email || "Website Customer";
  const accountLink = await resolveOrderAccountLink(customer);

  const { data: order, error: orderError } = await supabase
    .from("plain_depot_orders")
    .insert({
      id: orderId,
      account_user_id: accountLink.userId,
      client_id: accountLink.clientId,
      customer_email: customer.email || null,
      customer_company: customer.company || null,
      customer: customerLabel,
      sku: primaryItem?.id ?? null,
      qty: totalQuantity || 1,
      total: totals.total,
      status: "Preparing",
      order_date: date,
      order_time: time,
      order_items: {
        customer,
        account: {
          user_id: accountLink.userId,
          client_id: accountLink.clientId,
          email: customer.email || null,
          company: customer.company || null,
        },
        totals,
        items: orderItems,
        notes: customer.notes,
      },
    })
    .select("id")
    .single();

  if (orderError) {
    throw orderError;
  }

  return {
    status: "saved",
    orderStatus: "Preparing",
    orderId: order.id,
    orderNumber: order.id,
    userId: accountLink.userId,
    clientId: accountLink.clientId,
    customer,
    totals,
    lineItems: orderItems,
  };
}

export async function getPlainDepotOrderStatus(orderId) {
  if (!supabase || !orderId) {
    return {
      status: supabase ? "missing_order_id" : "local",
      order: null,
    };
  }

  const { data, error } = await supabase
    .from("plain_depot_orders")
    .select("id, status, total, order_items, updated_at, order_date, order_time")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    status: data ? "loaded" : "missing",
    order: data
      ? {
          id: data.id,
          orderNumber: data.id,
          status: data.status || "Preparing",
          total: Number(data.total || 0),
          orderItems: data.order_items,
          updatedAt: data.updated_at || null,
          orderDate: data.order_date || "",
          orderTime: data.order_time || "",
        }
      : null,
  };
}

export async function listPlainDepotAccountShipments() {
  if (!supabase) {
    return {
      status: "local",
      shipments: [],
    };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!userData.user) {
    return {
      status: "signed-out",
      shipments: [],
    };
  }

  try {
    const { error: syncError } = await supabase.functions.invoke("shippo-sync-tracking", {
      body: {},
    });

    if (syncError) {
      console.warn("Unable to sync Shippo tracking before loading shipments.", syncError);
    }
  } catch (error) {
    console.warn("Unable to sync Shippo tracking before loading shipments.", error);
  }

  async function runQuery(selectFields) {
    return supabase
      .from("plain_depot_orders")
      .select(selectFields)
      .order("updated_at", { ascending: false })
      .limit(50);
  }

  let { data, error } = await runQuery(orderShipmentTrackingSelect);

  if (error && (error.code === "42703" || /column .* does not exist/i.test(error.message ?? ""))) {
    const fallbackResult = await runQuery(orderShipmentBaseSelect);
    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) {
    throw error;
  }

  return {
    status: "loaded",
    shipments: (data || []).map(orderRowToShipment),
  };
}

export function subscribeToPlainDepotOrderChanges(callback) {
  if (!supabase || typeof callback !== "function") return () => {};

  const channel = supabase
    .channel(`plain-depot-account-orders-${Date.now()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "plain_depot_orders" },
      callback,
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function createCheckoutSessionDraft(cartItems, customer) {
  const lineItems = cartItems.map((item) => ({
    price_data: {
      currency: "usd",
      product_data: {
        name: item.name,
        metadata: {
          product_id: item.id,
          category: item.categoryName,
        },
      },
      unit_amount: Math.round(item.price * 100),
    },
    quantity: item.quantity,
  }));

  return {
    provider: "stripe",
    mode: "payment",
    status: stripePublishableKey ? "ready" : "missing_publishable_key",
    customer,
    lineItems,
  };
}

export async function saveQuoteRequestDraft(payload) {
  if (!supabase) {
    return {
      status: "local_draft",
      message: "Supabase environment keys are not configured yet.",
      payload,
    };
  }

  const { data, error } = await supabase
    .from("plain_depot_orders")
    .insert({
      id: createPlainDepotOrderId(),
      customer: payload.company || payload.name || payload.email || "Quote Request",
      sku: null,
      qty: 1,
      total: 0,
      status: "Quote Requested",
      order_date: currentDateParts().date,
      order_time: currentDateParts().time,
      order_items: payload,
    })
    .select();

  if (error) {
    throw error;
  }

  return { status: "saved", data };
}
