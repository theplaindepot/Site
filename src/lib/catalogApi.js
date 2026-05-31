import { supabase } from "./integrations.js";

export const emptyCatalog = {
  categories: [],
  products: [],
  settings: null,
  source: "public",
};

const categoryAccents = {
  gfci: "#6d5dfc",
  switches: "#22d3ee",
  switch: "#22d3ee",
  outlets: "#a78bfa",
  outlet: "#a78bfa",
  duplex: "#a78bfa",
  plates: "#f8fafc",
  plate: "#f8fafc",
  connectors: "#38bdf8",
  connector: "#38bdf8",
  commercial: "#818cf8",
  accessories: "#60a5fa",
  accessory: "#60a5fa",
};

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
}

function slugify(value, fallback = "electrical") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || fallback;
}

function titleCase(value) {
  return String(value || "Electrical")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function inferImageType(product) {
  const text = `${product.name ?? ""} ${product.category ?? ""} ${product.img ?? ""}`.toLowerCase();

  if (text.includes("gfci")) return "gfci";
  if (text.includes("lever") || text.includes("connector")) return "connector";
  if (text.includes("switch")) return "switch";
  if (text.includes("plate")) return "plate";
  if (text.includes("decorator")) return "decorator";
  if (text.includes("job") || text.includes("commercial")) return "jobpack";
  if (text.includes("outlet") || text.includes("duplex")) return "duplex";
  return "accessory";
}

function storefrontImageUrl(row) {
  const image = storefrontImageGallery(row)[0] || "";
  return image.startsWith("data:image/") || /^https?:\/\//i.test(image) ? image : "";
}

function normalizeStorefrontImages(value) {
  let images = value;
  if (typeof images === "string") {
    try {
      images = JSON.parse(images || "[]");
    } catch {
      images = images ? [images] : [];
    }
  }
  if (!Array.isArray(images)) return [];
  return [...new Set(images.map((image) => String(image || "").trim()).filter(Boolean))]
    .filter((image) => image.startsWith("data:image/") || /^https?:\/\//i.test(image))
    .slice(0, 8);
}

function storefrontImageGallery(row) {
  const images = normalizeStorefrontImages(row.website_images);
  const singleImage = String(row.website_image || row.img || "").trim();
  if (singleImage) images.push(singleImage);
  return normalizeStorefrontImages(images);
}

const websiteSpecsStart = "[[TPD_TECH_SPECS]]";
const websiteSpecsEnd = "[[/TPD_TECH_SPECS]]";

function normalizeStorefrontSpecs(value) {
  let specs = value;
  if (typeof specs === "string") {
    const text = specs.trim();
    if (!text) return [];
    try {
      specs = JSON.parse(text);
    } catch {
      specs = text.split(/\r?\n/);
    }
  }
  if (specs && typeof specs === "object" && !Array.isArray(specs)) {
    specs = Object.entries(specs).map(([label, value]) => ({ label, value }));
  }
  if (!Array.isArray(specs)) return [];
  return specs
    .map((item) => {
      if (Array.isArray(item)) {
        return { label: item[0], value: item.slice(1).join(": ") };
      }
      if (item && typeof item === "object") {
        return {
          label: item.label ?? item.name ?? item.key ?? item.title ?? "",
          value: item.value ?? item.detail ?? item.text ?? "",
        };
      }
      const line = String(item || "").trim();
      const parts = line.split(/\s*[:=]\s*/);
      if (parts.length >= 2) return { label: parts.shift(), value: parts.join(": ") };
      return { label: line, value: "" };
    })
    .map((spec) => ({
      label: String(spec.label || "").trim(),
      value: String(spec.value || "").trim(),
    }))
    .filter((spec) => spec.label || spec.value)
    .slice(0, 12);
}

function splitStorefrontDescription(value) {
  const rawDescription = String(value || "");
  const startIndex = rawDescription.indexOf(websiteSpecsStart);
  if (startIndex < 0) {
    return { description: rawDescription.trim(), specs: [] };
  }

  const endIndex = rawDescription.indexOf(websiteSpecsEnd, startIndex + websiteSpecsStart.length);
  const specText = rawDescription
    .slice(startIndex + websiteSpecsStart.length, endIndex >= 0 ? endIndex : undefined)
    .trim();
  let parsedSpecs = specText;
  try {
    parsedSpecs = JSON.parse(specText || "[]");
  } catch {
    parsedSpecs = specText;
  }

  return {
    description: rawDescription.slice(0, startIndex).trim(),
    specs: normalizeStorefrontSpecs(parsedSpecs),
  };
}

function categoryDescription(name) {
  const normalized = slugify(name);
  if (normalized.includes("gfci")) return "GFCI protection, self-test devices, and job-ready receptacles.";
  if (normalized.includes("switch")) return "Switches, controls, and common electrical trim-out devices.";
  if (normalized.includes("plate")) return "Wall plates, finish hardware, and trim accessories.";
  if (normalized.includes("connector")) return "Lever connectors and wiring accessories for fast installs.";
  if (normalized.includes("commercial")) return "Commercial-grade stock and project packs for larger jobs.";
  return "Electrical supplies curated for contractor-grade ordering.";
}

function buildCategories(products) {
  const categoryMap = new Map();

  products.forEach((product) => {
    const categoryName = product.categoryName;
    const id = product.category;
    const current = categoryMap.get(id) ?? {
      id,
      name: categoryName,
      description: categoryDescription(categoryName),
      accent: categoryAccents[id] ?? "#6d5dfc",
      count: 0,
    };

    current.count += 1;
    categoryMap.set(id, current);
  });

  return [...categoryMap.values()];
}

function mapPlainDepotProduct(row) {
  const price = toNumber(row.price);
  const categoryName = titleCase(row.category);
  const category = slugify(row.category);
  const imageGallery = storefrontImageGallery(row);
  const availability = String(row.availability || row.website_availability || "In stock");
  const normalizedAvailability = availability.toLowerCase();
  const availabilityScore = normalizedAvailability.includes("out")
    ? 0
    : normalizedAvailability.includes("low") || normalizedAvailability.includes("limited")
      ? 35
      : 88;
  const hasExactStock = row.stock !== null && row.stock !== undefined && row.stock !== "";
  const stockQuantity = hasExactStock ? Math.max(0, Math.round(toNumber(row.stock))) : null;
  const descriptionData = splitStorefrontDescription(row.website_description);
  const availabilityLabel =
    stockQuantity !== null
      ? `${stockQuantity} ${stockQuantity === 1 ? "unit" : "units"} in stock`
      : availabilityScore === 0
        ? "0 units in stock"
        : "In stock";

  return {
    id: row.sku,
    name: row.name,
    category,
    categoryName,
    price,
    contractorPrice: price,
    stock: availabilityScore,
    stockQuantity: stockQuantity ?? availabilityScore,
    lowStockThreshold: 40,
    bestSelling: availabilityScore,
    createdAt: row.created_at,
    rating: 4.8,
    imageUrl: imageGallery[0] || storefrontImageUrl(row),
    imageGallery,
    imageType: inferImageType({ ...row, img: row.website_image || row.img }),
    accent: categoryAccents[category] ?? "#6d5dfc",
    availabilityLabel,
    stockStatus: availabilityScore === 0 ? "out" : availabilityScore < 50 ? "limited" : "available",
    summary: descriptionData.description || `${row.name} is available for contractor ordering through The Plain Depot.`,
    specs: Object.fromEntries(
      (descriptionData.specs.length
        ? descriptionData.specs
        : [
            { label: "SKU", value: row.sku },
            { label: "Category", value: categoryName },
            { label: "Availability", value: availabilityLabel },
          ]
      ).map((spec) => [spec.label, spec.value]),
    ),
    bulkTiers: [],
    fulfillment: "Pickup timing is confirmed during warehouse review.",
  };
}

async function fetchPlainDepotSettings() {
  const publicSettings = await supabase
    .from("plain_depot_public_settings")
    .select("id,business_name,subtitle,updated_at")
    .limit(1)
    .maybeSingle();

  if (!publicSettings.error) {
    return publicSettings.data;
  }

  const { data, error } = await supabase
    .from("plain_depot_settings")
    .select("id,business_name,subtitle,updated_at")
    .limit(1)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data;
}

async function fetchPlainDepotProducts() {
  const publicColumns =
    "sku,name,category,price,stock,availability,img,created_at,updated_at,website_description,website_image,website_images,website_featured,website_availability";
  const privateColumns =
    "sku,name,category,price,stock,img,created_at,updated_at,website_description,website_image,website_images,website_featured,website_availability";
  const publicProducts = await supabase
    .from("plain_depot_public_products")
    .select(publicColumns)
    .order("name", { ascending: true });

  if (!publicProducts.error) {
    return publicProducts;
  }

  const privateProducts = await supabase
    .from("plain_depot_products")
    .select(privateColumns)
    .order("name", { ascending: true });

  if (!privateProducts.error) return privateProducts;

  return supabase
    .from("plain_depot_public_products")
    .select("sku,name,category,price,availability,img,created_at,updated_at")
    .order("name", { ascending: true });
}

export async function fetchStorefrontCatalog() {
  if (!supabase) {
    return {
      ...emptyCatalog,
      source: "missing-credentials",
    };
  }

  const [productResult, settings] = await Promise.all([
    fetchPlainDepotProducts(),
    fetchPlainDepotSettings(),
  ]);

  if (productResult.error) {
    const message = productResult.error?.message ?? "Unable to load Plain Depot catalog.";
    throw new Error(message);
  }

  const products = (productResult.data ?? [])
    .filter((row) => row.website_featured !== false)
    .map(mapPlainDepotProduct);
  const categories = buildCategories(products);

  return {
    categories,
    products,
    settings,
    source: "public",
  };
}

export function subscribeToCatalogChanges(onChange) {
  if (!supabase || typeof onChange !== "function") return () => {};

  const intervalId = window.setInterval(onChange, 5000);
  const refreshWhenVisible = () => {
    if (document.visibilityState === "visible") onChange();
  };
  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", refreshWhenVisible);
  const channel = supabase
    .channel("plain-depot-storefront-products")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "plain_depot_products" },
      () => onChange(),
    )
    .subscribe();

  return () => {
    window.clearInterval(intervalId);
    window.removeEventListener("focus", onChange);
    document.removeEventListener("visibilitychange", refreshWhenVisible);
    supabase.removeChannel(channel);
  };
}
