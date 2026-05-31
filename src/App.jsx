import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Boxes,
  Building2,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Database,
  DollarSign,
  Factory,
  Filter,
  Home,
  LogIn,
  Menu,
  Minus,
  Package,
  Plus,
  Plug,
  Route,
  Search,
  Shield,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Star,
  Trash2,
  Truck,
  User,
  Warehouse,
  X,
  Zap,
} from "lucide-react";
import { trustedSegments } from "./data/catalog.js";
import {
  emptyCatalog,
  fetchStorefrontCatalog,
  subscribeToCatalogChanges,
} from "./lib/catalogApi.js";
import {
  createCheckoutSessionDraft,
  createContractorAccount,
  createOrderRequest,
  appendMobileOrderHistory,
  getContractorProfileForCurrentUser,
  getCurrentContractorSession,
  listPlainDepotAccountShipments,
  getPlainDepotOrderStatus,
  loadMobileAppState,
  saveContractorProfile,
  saveMobileAppState,
  syncMobileProfileState,
  subscribeToPlainDepotOrderChanges,
  signInContractorAccount,
  signOutContractorAccount,
} from "./lib/integrations.js";

const navItems = [
  { id: "home", label: "Home" },
  { id: "shop", label: "Shop" },
  { id: "account", label: "Account" },
];

const enableNativeProjects = false;

const nativeNavItemsBase = [
  { id: "home", label: "Home", icon: Home },
  { id: "shop", label: "Shop", icon: Search },
  { id: "projects", label: "Projects", icon: ClipboardList },
  { id: "tracking", label: "Track", icon: Truck },
  { id: "cart", label: "Cart", icon: ShoppingCart },
  { id: "account", label: "Account", icon: User },
];

const nativeNavItems = nativeNavItemsBase.filter(
  (item) => enableNativeProjects || item.id !== "projects",
);

const sortOptions = [
  { id: "best", label: "Best selling" },
  { id: "price", label: "Price" },
  { id: "newest", label: "Newest" },
  { id: "stock", label: "Availability" },
];

function isPhoneViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const nativeWelcomeStorageKey = "plainDepotNativeWelcomeComplete";
const nativeProjectsStorageKey = "plainDepotNativeProjects";
const nativeOrderProgressStorageKey = "plainDepotNativeOrderProgress";
const nativeOrderStatusPollMs = 7000;

const nativeOrderStatusMeta = [
  {
    matches: ["quote requested", "submitted", "new"],
    progress: 12,
    label: "Order submitted",
    copy: "Your order is waiting for Plain Depot review.",
  },
  {
    matches: ["preparing", "review", "processing"],
    progress: 34,
    label: "Preparing order",
    copy: "Plain Depot is checking quantities and availability.",
  },
  {
    matches: ["picking", "sourcing", "packed"],
    progress: 58,
    label: "Picking materials",
    copy: "Warehouse material is being matched to your order.",
  },
  {
    matches: ["ready for pickup", "ready"],
    progress: 84,
    label: "Ready for pickup",
    copy: "Your order is ready for pickup or final confirmation.",
  },
  {
    matches: ["picked up", "delivered", "complete", "completed", "closed"],
    progress: 100,
    label: "Order complete",
    copy: "This order is complete in the software.",
  },
  {
    matches: ["cancel", "exception", "delay", "hold"],
    progress: 100,
    label: "Needs attention",
    copy: "This order needs review in the software.",
  },
];

function getNativeOrderStatusMeta(status) {
  const normalizedStatus = String(status || "Submitted").trim().toLowerCase();
  return (
    nativeOrderStatusMeta.find((item) =>
      item.matches.some((match) => normalizedStatus.includes(match)),
    ) || {
      progress: 24,
      label: status || "Order submitted",
      copy: "Waiting for the next software status update.",
    }
  );
}

const nativeShipmentStatusMeta = [
  {
    matches: ["delivered", "complete", "picked up"],
    progress: 100,
    label: "Delivered",
    copy: "This shipment has been delivered.",
  },
  {
    matches: ["out for delivery"],
    progress: 86,
    label: "Out for delivery",
    copy: "The carrier has it out for final delivery.",
  },
  {
    matches: ["in transit", "at facility", "departed", "arrived"],
    progress: 58,
    label: "In transit",
    copy: "The carrier is moving this shipment.",
  },
  {
    matches: ["label", "created", "ready", "preparing", "processing"],
    progress: 26,
    label: "Preparing shipment",
    copy: "Plain Depot is preparing shipment details.",
  },
  {
    matches: ["exception", "delay", "hold", "attention"],
    progress: 72,
    label: "Needs attention",
    copy: "The shipment has a carrier update that needs review.",
  },
];

function getNativeShipmentStatusMeta(status) {
  const normalizedStatus = String(status || "Preparing").trim().toLowerCase();
  return (
    nativeShipmentStatusMeta.find((item) =>
      item.matches.some((match) => normalizedStatus.includes(match)),
    ) || {
      progress: normalizedStatus.includes("submitted") ? 16 : 42,
      label: status || "Preparing shipment",
      copy: "Waiting for the next shipment update.",
    }
  );
}

function formatShipmentDate(value, fallback = "Pending") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const starterNativeProjects = [
  {
    id: "starter-rough-in",
    name: "Rough-in starter",
    status: "Estimating",
    items: [],
    createdAt: new Date().toISOString(),
  },
];

function App() {
  const [activePage, setActivePage] = useState("home");
  const [isNativeApp, setIsNativeApp] = useState(() => Capacitor.getPlatform() !== "web");
  const [isPhoneScreen, setIsPhoneScreen] = useState(isPhoneViewport);
  const [accountUser, setAccountUser] = useState(null);
  const [isCheckingAccountSession, setIsCheckingAccountSession] = useState(
    () => Capacitor.getPlatform() !== "web",
  );
  const [showNativeWelcome, setShowNativeWelcome] = useState(() => {
    if (Capacitor.getPlatform() === "web" || typeof window === "undefined") return false;
    return window.localStorage.getItem(nativeWelcomeStorageKey) !== "true";
  });
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [catalogStatus, setCatalogStatus] = useState({
    loading: true,
    source: emptyCatalog.source,
    error: "",
  });
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [cart, setCart] = useState([]);
  const [nativeProjects, setNativeProjects] = useState(() => {
    if (typeof window === "undefined") return starterNativeProjects;
    try {
      const savedProjects = JSON.parse(window.localStorage.getItem(nativeProjectsStorageKey) || "[]");
      return Array.isArray(savedProjects) && savedProjects.length ? savedProjects : starterNativeProjects;
    } catch {
      return starterNativeProjects;
    }
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [maxPrice, setMaxPrice] = useState(350);
  const [sortBy, setSortBy] = useState("best");
  const [isMobileCloudStateLoaded, setIsMobileCloudStateLoaded] = useState(false);
  const [isNativeCheckoutMode, setIsNativeCheckoutMode] = useState(false);
  const [projectOrderContext, setProjectOrderContext] = useState(null);
  const [homeOrderProgress, setHomeOrderProgress] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const savedProgress = JSON.parse(window.localStorage.getItem(nativeOrderProgressStorageKey) || "null");
      if (!savedProgress?.startedAt) return null;
      return savedProgress;
    } catch {
      return null;
    }
  });
  const [accountShipments, setAccountShipments] = useState([]);
  const [accountShipmentsStatus, setAccountShipmentsStatus] = useState({
    loading: false,
    error: "",
    status: "idle",
  });
  const isMobileWebsite = !isNativeApp && isPhoneScreen;

  const products = catalog.products;
  const categories = catalog.categories;
  const catalogMaxPrice = useMemo(
    () =>
      Math.max(
        350,
        Math.ceil(products.reduce((highest, product) => Math.max(highest, product.price), 0)),
      ),
    [products],
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updatePhoneScreen = () => setIsPhoneScreen(mediaQuery.matches);

    updatePhoneScreen();
    mediaQuery.addEventListener("change", updatePhoneScreen);

    return () => mediaQuery.removeEventListener("change", updatePhoneScreen);
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    const platform = Capacitor.getPlatform();
    if (platform !== "web") {
      document.documentElement.classList.add("native-app", `native-${platform}`);
    }
    setIsNativeApp(platform !== "web");
    window.localStorage.setItem("plainDepotTheme", "dark");
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadAccountSession() {
      try {
        const session = await getCurrentContractorSession();
        if (!isMounted) return;
        setAccountUser(session.user);
        if (Capacitor.getPlatform() !== "web" && session.user) {
          window.localStorage.setItem(nativeWelcomeStorageKey, "true");
          setShowNativeWelcome(false);
        }
      } catch {
        if (!isMounted) return;
        setAccountUser(null);
      } finally {
        if (isMounted) setIsCheckingAccountSession(false);
      }
    }

    loadAccountSession();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setMaxPrice((currentMaxPrice) => {
      const numericMaxPrice = Number(currentMaxPrice);
      return numericMaxPrice >= catalogMaxPrice ? currentMaxPrice : catalogMaxPrice;
    });
  }, [catalogMaxPrice]);

  useEffect(() => {
    let isMounted = true;

    async function loadCatalog() {
      try {
        const nextCatalog = await fetchStorefrontCatalog();
        if (!isMounted) return;

        setCatalog(nextCatalog);
        setCatalogStatus({
          loading: false,
          source: nextCatalog.source,
          error: "",
        });
        setSelectedProduct((currentProduct) => {
          const matchingProduct = nextCatalog.products.find(
            (product) => product.id === currentProduct?.id,
          );
          return matchingProduct ?? nextCatalog.products[0] ?? null;
        });
      } catch (error) {
        if (!isMounted) return;

        setCatalog(emptyCatalog);
        setCatalogStatus({
          loading: false,
          source: "error",
          error: error instanceof Error ? error.message : "Unable to load the product catalog.",
        });
        setSelectedProduct(null);
      }
    }

    loadCatalog();
    const unsubscribe = subscribeToCatalogChanges(loadCatalog);

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const cartItems = useMemo(
    () =>
      cart
        .map((line) => {
          const product = products.find((item) => item.id === line.productId);
          return product ? { ...product, quantity: line.quantity } : null;
        })
        .filter(Boolean),
    [cart, products],
  );

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const nextProducts = products.filter((product) => {
      const matchesSearch =
        !normalizedSearch ||
        product.name.toLowerCase().includes(normalizedSearch) ||
        product.categoryName.toLowerCase().includes(normalizedSearch) ||
        product.summary.toLowerCase().includes(normalizedSearch);
      const matchesCategory = category === "all" || product.category === category;
      const matchesPrice = product.price <= Number(maxPrice);
      return matchesSearch && matchesCategory && matchesPrice;
    });

    return [...nextProducts].sort((a, b) => {
      if (sortBy === "price") return a.price - b.price;
      if (sortBy === "newest") return new Date(b.createdAt) - new Date(a.createdAt);
      if (sortBy === "stock") return b.stockQuantity - a.stockQuantity;
      return b.bestSelling - a.bestSelling;
    });
  }, [category, maxPrice, products, search, sortBy]);

  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.0875;
  const total = subtotal + tax;

  useEffect(() => {
    if (!isNativeApp || typeof window === "undefined") return;
    window.localStorage.setItem(nativeProjectsStorageKey, JSON.stringify(nativeProjects));
  }, [isNativeApp, nativeProjects]);

  useEffect(() => {
    if (!isNativeApp || typeof window === "undefined") return;
    if (homeOrderProgress) {
      window.localStorage.setItem(nativeOrderProgressStorageKey, JSON.stringify(homeOrderProgress));
      return;
    }
    window.localStorage.removeItem(nativeOrderProgressStorageKey);
  }, [homeOrderProgress, isNativeApp]);

  useEffect(() => {
    if (!isNativeApp || !accountUser || !homeOrderProgress?.orderId) return undefined;

    let isMounted = true;
    const trackedOrderId = homeOrderProgress.orderId;

    async function syncTrackedOrderStatus() {
      try {
        const result = await getPlainDepotOrderStatus(trackedOrderId);
        if (!isMounted || !result.order) return;

        setHomeOrderProgress((current) => {
          if (!current || current.orderId !== trackedOrderId) return current;
          return {
            ...current,
            orderNumber: result.order.orderNumber || current.orderNumber,
            softwareStatus: result.order.status || current.softwareStatus || "Preparing",
            total: result.order.total || current.total,
            statusUpdatedAt: result.order.updatedAt || current.statusUpdatedAt,
            lastSyncedAt: new Date().toISOString(),
            syncError: "",
          };
        });
      } catch (error) {
        console.warn("Unable to sync Plain Depot order status.", error);
        if (!isMounted) return;
        setHomeOrderProgress((current) =>
          current && current.orderId === trackedOrderId
            ? {
                ...current,
                syncError: "Status sync delayed",
                lastSyncedAt: new Date().toISOString(),
              }
            : current,
        );
      }
    }

    syncTrackedOrderStatus();
    const syncTimer = window.setInterval(syncTrackedOrderStatus, nativeOrderStatusPollMs);

    return () => {
      isMounted = false;
      window.clearInterval(syncTimer);
    };
  }, [accountUser, homeOrderProgress?.orderId, isNativeApp]);

  useEffect(() => {
    if (!isNativeApp) return undefined;

    if (!accountUser) {
      setAccountShipments([]);
      setAccountShipmentsStatus({ loading: false, error: "", status: "signed-out" });
      return undefined;
    }

    let isMounted = true;

    async function loadAccountShipments({ quiet = false } = {}) {
      if (!quiet) {
        setAccountShipmentsStatus({ loading: true, error: "", status: "loading" });
      }

      try {
        const result = await listPlainDepotAccountShipments();
        if (!isMounted) return;
        setAccountShipments(result.shipments || []);
        setAccountShipmentsStatus({ loading: false, error: "", status: result.status });
      } catch (error) {
        console.warn("Unable to load Plain Depot account shipments.", error);
        if (!isMounted) return;
        setAccountShipmentsStatus({
          loading: false,
          error: error instanceof Error ? error.message : "Unable to load shipments.",
          status: "error",
        });
      }
    }

    loadAccountShipments();
    const unsubscribe = subscribeToPlainDepotOrderChanges(() => {
      loadAccountShipments({ quiet: true });
    });
    const refreshTimer = window.setInterval(() => {
      loadAccountShipments({ quiet: true });
    }, 60000);

    return () => {
      isMounted = false;
      unsubscribe();
      window.clearInterval(refreshTimer);
    };
  }, [accountUser, isNativeApp]);

  useEffect(() => {
    if (!isNativeApp) return;

    if (!accountUser) {
      setIsMobileCloudStateLoaded(false);
      return;
    }

    let isMounted = true;

    async function loadSignedInMobileState() {
      setIsMobileCloudStateLoaded(false);

      try {
        const state = await loadMobileAppState();
        if (!isMounted) return;

        if (state.status === "loaded") {
          setCart(Array.isArray(state.cart) ? state.cart : []);
          setNativeProjects(
            Array.isArray(state.projects) && state.projects.length
              ? state.projects
              : starterNativeProjects,
          );
        } else if (state.status === "missing") {
          await syncMobileProfileState();
          await saveMobileAppState({ cart, projects: nativeProjects });
        }
      } catch (error) {
        console.warn("Unable to load mobile app state from Supabase.", error);
      } finally {
        if (isMounted) setIsMobileCloudStateLoaded(true);
      }
    }

    loadSignedInMobileState();

    return () => {
      isMounted = false;
    };
  }, [accountUser, isNativeApp]);

  useEffect(() => {
    if (!isNativeApp || !accountUser || !isMobileCloudStateLoaded) return;

    const saveTimer = window.setTimeout(() => {
      loadMobileAppState()
        .then((state) =>
          saveMobileAppState({
            profile: state.profile,
            cart,
            projects: nativeProjects,
            previousOrders: state.previousOrders,
            notifications: state.notifications,
            preferences: state.preferences,
          }),
        )
        .catch((error) => {
          console.warn("Unable to save mobile app state to Supabase.", error);
        });
    }, 400);

    return () => window.clearTimeout(saveTimer);
  }, [accountUser, cart, isMobileCloudStateLoaded, isNativeApp, nativeProjects]);

  function navigate(page) {
    const nextPage = !enableNativeProjects && page === "projects" ? "shop" : page;
    setIsNativeCheckoutMode(false);
    setActivePage(nextPage);
    setMenuOpen(false);
    const nativeScrollContainer = document.querySelector(".native-main");
    if (nativeScrollContainer) {
      nativeScrollContainer.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openProduct(product) {
    if (!product) return;
    setSelectedProduct(product);
    navigate("product");
  }

  function addToCart(product, quantity = 1) {
    setProjectOrderContext(null);
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (existing) {
        return current.map((line) =>
          line.productId === product.id
            ? { ...line, quantity: line.quantity + quantity }
            : line,
        );
      }
      return [...current, { productId: product.id, quantity }];
    });
  }

  function updateCart(productId, quantity) {
    setCart((current) =>
      current
        .map((line) =>
          line.productId === productId
            ? { ...line, quantity: Math.max(1, quantity) }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  function removeFromCart(productId) {
    setCart((current) => current.filter((line) => line.productId !== productId));
  }

  function saveCurrentCartAsProject(projectName) {
    const cleanName = String(projectName || "").trim();
    if (!cleanName || !cart.length) return "";
    const id = `project-${Date.now()}`;
    setNativeProjects((current) => [
      {
        id,
        name: cleanName,
        status: "Estimating",
        items: cart,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ]);
    return id;
  }

  function createNativeProject(projectName) {
    const cleanName = String(projectName || "").trim();
    if (!cleanName) return "";
    const id = `project-${Date.now()}`;
    setNativeProjects((current) => [
      {
        id,
        name: cleanName,
        status: "Estimating",
        items: [],
        orderedItems: [],
        createdAt: new Date().toISOString(),
      },
      ...current,
    ]);
    return id;
  }

  function duplicateProjectToCart(projectId) {
    const project = nativeProjects.find((item) => item.id === projectId);
    if (!project?.items?.length) return;
    setCart(project.items);
    navigate("cart");
  }

  function addProductToProject(projectId, product, quantity = 1) {
    if (!projectId || !product) return;
    setNativeProjects((current) =>
      current.map((project) => {
        if (project.id !== projectId) return project;

        const items = Array.isArray(project.items) ? project.items : [];
        const existingItem = items.find((line) => line.productId === product.id);
        const nextItems = existingItem
          ? items.map((line) =>
              line.productId === product.id
                ? { ...line, quantity: Math.max(1, Number(line.quantity || 0) + quantity) }
                : line,
            )
          : [...items, { productId: product.id, quantity: Math.max(1, quantity) }];

        return { ...project, items: nextItems, updatedAt: new Date().toISOString() };
      }),
    );
  }

  function updateProjectMaterialQuantity(projectId, productId, quantity) {
    setNativeProjects((current) =>
      current.map((project) => {
        if (project.id !== projectId) return project;
        const nextItems = (project.items || [])
          .map((line) =>
            line.productId === productId
              ? { ...line, quantity: Math.max(0, Number(quantity || 0)) }
              : line,
          )
          .filter((line) => Number(line.quantity || 0) > 0);

        return { ...project, items: nextItems, updatedAt: new Date().toISOString() };
      }),
    );
  }

  function removeProjectMaterial(projectId, productId) {
    setNativeProjects((current) =>
      current.map((project) => {
        if (project.id !== projectId) return project;
        return {
          ...project,
          items: (project.items || []).filter((line) => line.productId !== productId),
          updatedAt: new Date().toISOString(),
        };
      }),
    );
  }

  function orderProjectMaterials(projectId, productIds = []) {
    const project = nativeProjects.find((item) => item.id === projectId);
    if (!project?.items?.length) return false;
    const selectedProductIds = new Set(productIds.filter(Boolean));
    const orderItems = project.items.filter(
      (line) => !selectedProductIds.size || selectedProductIds.has(line.productId),
    );
    if (!orderItems.length) return false;
    setProjectOrderContext({
      projectId,
      projectName: project.name,
      productIds: orderItems.map((line) => line.productId),
      createdAt: new Date().toISOString(),
    });
    setCart(orderItems);
    navigate("cart");
    return true;
  }

  function markProjectMaterialsOrdered(projectId, orderedItems = []) {
    if (!projectId || !orderedItems.length) return;
    const orderedAt = new Date().toISOString();
    setNativeProjects((current) =>
      current.map((project) => {
        if (project.id !== projectId) return project;

        const orderedMap = new Map();
        (project.orderedItems || []).forEach((line) => {
          const productId = line.productId || line.id;
          if (!productId) return;
          orderedMap.set(productId, {
            productId,
            quantity: Math.max(0, Number(line.quantity ?? line.qty ?? 0)),
            orderedAt: line.orderedAt || orderedAt,
          });
        });
        orderedItems.forEach((item) => {
          const productId = item.productId || item.id;
          if (!productId) return;
          const existing = orderedMap.get(productId);
          orderedMap.set(productId, {
            productId,
            quantity: (existing?.quantity || 0) + Math.max(0, Number(item.quantity ?? item.qty ?? 0)),
            orderedAt,
          });
        });

        return {
          ...project,
          orderedItems: Array.from(orderedMap.values()).filter((line) => line.quantity > 0),
          updatedAt: orderedAt,
        };
      }),
    );
    setProjectOrderContext(null);
  }

  function startHomeOrderProgress({ order, itemCount, projectName, totals }) {
    const startedAt = new Date().toISOString();
    setHomeOrderProgress({
      id: order?.orderId || order?.id || order?.orderNumber || `order-${Date.now()}`,
      orderId: order?.orderId || order?.id || order?.orderNumber || "",
      orderNumber: order?.orderNumber || "Order submitted",
      softwareStatus: order?.orderStatus || "Preparing",
      itemCount,
      projectName,
      total: Number(totals?.total || 0),
      startedAt,
      lastSyncedAt: startedAt,
    });
  }

  function removeNativeProject(projectId) {
    setNativeProjects((current) => current.filter((project) => project.id !== projectId));
  }

  function completeNativeWelcome(page = "home", user = null) {
    if (user) setAccountUser(user);
    window.localStorage.setItem(nativeWelcomeStorageKey, "true");
    setShowNativeWelcome(false);
    setActivePage(page);
  }

  function restartNativeWelcome() {
    window.localStorage.removeItem(nativeWelcomeStorageKey);
    setShowNativeWelcome(true);
    setActivePage("home");
  }

  if (isNativeApp && isCheckingAccountSession) {
    return <NativeLaunchScreen />;
  }

  if (isNativeApp && showNativeWelcome) {
    return <NativeWelcome onComplete={completeNativeWelcome} />;
  }

  return (
    <div className={`min-h-screen bg-fog text-ink antialiased transition-colors duration-300 dark:bg-ink dark:text-white ${isNativeApp ? "native-app-shell" : ""} ${isMobileWebsite ? "mobile-website-shell" : ""}`}>
      {!isNativeCheckoutMode && (
        <Header
          activePage={activePage}
          cartCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
          isNativeApp={isNativeApp}
          menuOpen={menuOpen}
          navigate={navigate}
          setMenuOpen={setMenuOpen}
        />
      )}

      <main className={isNativeApp ? `native-main ${isNativeCheckoutMode ? "native-main-checkout" : ""}` : isMobileWebsite ? "mobile-web-main" : undefined}>
        <AnimatePresence mode="wait">
          {activePage === "home" && (
            <PageTransition key="home">
              {isNativeApp ? (
                <NativeHome
                  addToCart={addToCart}
                  cartCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
                  accountUser={accountUser}
                  catalogStatus={catalogStatus}
                  dismissOrderProgress={() => setHomeOrderProgress(null)}
                  navigate={navigate}
                  orderProgress={homeOrderProgress}
                  openProduct={openProduct}
                  products={products}
                  setSearch={setSearch}
                />
              ) : isMobileWebsite ? (
                <MobileWebsiteHome
                  addToCart={addToCart}
                  catalogStatus={catalogStatus}
                  categories={categories}
                  navigate={navigate}
                  openProduct={openProduct}
                  products={products}
                />
              ) : (
                <HomePage
                  catalogStatus={catalogStatus}
                  categories={categories}
                  navigate={navigate}
                  products={products}
                />
              )}
            </PageTransition>
          )}
          {activePage === "notifications" && (
            <PageTransition key="notifications">
              <NativeNotificationsPage
                accountUser={accountUser}
                cartCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
                catalogStatus={catalogStatus}
                navigate={navigate}
                products={products}
                projects={nativeProjects}
              />
            </PageTransition>
          )}
          {activePage === "tracking" && (
            <PageTransition key="tracking">
              <NativeTrackingPage
                accountUser={accountUser}
                navigate={navigate}
                shipments={accountShipments}
                shipmentStatus={accountShipmentsStatus}
              />
            </PageTransition>
          )}
          {activePage === "shop" && (
            <PageTransition key="shop">
              <ShopPage
                addToCart={addToCart}
                categories={categories}
                catalogMaxPrice={catalogMaxPrice}
                category={category}
                filteredProducts={filteredProducts}
                maxPrice={maxPrice}
                openProduct={openProduct}
                search={search}
                setCategory={setCategory}
                setMaxPrice={setMaxPrice}
                setSearch={setSearch}
                setSortBy={setSortBy}
                sortBy={sortBy}
              />
            </PageTransition>
          )}
          {activePage === "product" && (
            <PageTransition key="product">
              {selectedProduct ? (
                <ProductPage
                  addToCart={addToCart}
                  navigate={navigate}
                  openProduct={openProduct}
                  product={selectedProduct}
                  products={products}
                />
              ) : (
                <EmptyCatalogPage navigate={navigate} />
              )}
            </PageTransition>
          )}
          {activePage === "cart" && (
            <PageTransition key="cart">
              <CartPage
                accountUser={accountUser}
                cartItems={cartItems}
                clearCart={() => {
                  setCart([]);
                  setProjectOrderContext(null);
                }}
                completeProjectOrder={markProjectMaterialsOrdered}
                isNativeApp={isNativeApp}
                navigate={navigate}
                projectOrderContext={projectOrderContext}
                removeFromCart={removeFromCart}
                restartNativeWelcome={restartNativeWelcome}
                startHomeOrderProgress={startHomeOrderProgress}
                subtotal={subtotal}
                setNativeCheckoutMode={setIsNativeCheckoutMode}
                tax={tax}
                total={total}
                updateCart={updateCart}
              />
            </PageTransition>
          )}
          {enableNativeProjects && activePage === "projects" && (
            <PageTransition key="projects">
              <NativeProjectsPage
                accountUser={accountUser}
                addProductToProject={addProductToProject}
                createNativeProject={createNativeProject}
                cartItems={cartItems}
                duplicateProjectToCart={duplicateProjectToCart}
                navigate={navigate}
                orderProjectMaterials={orderProjectMaterials}
                products={products}
                projects={nativeProjects}
                removeProjectMaterial={removeProjectMaterial}
                removeProject={removeNativeProject}
                restartNativeWelcome={restartNativeWelcome}
                saveCurrentCartAsProject={saveCurrentCartAsProject}
                updateProjectMaterialQuantity={updateProjectMaterialQuantity}
              />
            </PageTransition>
          )}
          {activePage === "account" && (
            <PageTransition key="account">
              <AccountPage
                accountUser={accountUser}
                cartItems={cartItems}
                isNativeApp={isNativeApp}
                navigate={navigate}
                products={products}
                projects={nativeProjects}
                restartNativeWelcome={restartNativeWelcome}
                setAccountUser={setAccountUser}
              />
            </PageTransition>
          )}
        </AnimatePresence>
      </main>

      {isNativeApp && !isNativeCheckoutMode ? (
        <NativeTabBar
          activePage={activePage}
          cartCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
          navigate={navigate}
        />
      ) : !isNativeApp ? (
        <Footer navigate={navigate} />
      ) : null}
    </div>
  );
}

function PageTransition({ children }) {
  return (
    <motion.div
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="native-route-page"
      exit={{ opacity: 0, scale: 0.996, y: 8 }}
      initial={{ opacity: 0, scale: 0.996, y: 12 }}
      transition={{ damping: 30, mass: 0.7, stiffness: 300, type: "spring" }}
    >
      {children}
    </motion.div>
  );
}

function Header({
  activePage,
  cartCount,
  isNativeApp,
  menuOpen,
  navigate,
  setMenuOpen,
}) {
  return (
    <header className={`app-header sticky top-0 z-50 border-b border-black/10 bg-white/85 backdrop-blur-2xl dark:border-white/10 dark:bg-ink/85 ${isNativeApp ? "native-shell-header" : ""}`}>
      <nav className="mx-auto flex min-h-20 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <button
          aria-label="The Plain Depot home"
          className="site-logo-button"
          onClick={() => navigate("home")}
        >
          <img
            alt="The Plain Depot Material Supply"
            className="site-logo"
            src="/plain-depot-logo-website.png"
          />
        </button>

        <div className="nav-segment hidden lg:grid">
          {navItems.map((item) => (
            <button
              className={`rounded-full px-4 py-2 text-center text-sm font-bold transition ${
                activePage === item.id
                  ? "bg-ink text-white shadow-sm dark:bg-white dark:text-ink"
                  : "text-black/60 hover:text-ink dark:text-white/60 dark:hover:text-white"
              }`}
              key={item.id}
              onClick={() => navigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {isNativeApp ? (
            <button className="icon-button relative" onClick={() => navigate("notifications")} title="Notifications">
              <Bell className="h-5 w-5" />
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-electric-500 px-1 text-[11px] font-black text-white">
                {cartCount ? 2 : 1}
              </span>
            </button>
          ) : (
            <button className="icon-button relative" onClick={() => navigate("cart")} title="Cart">
              <ShoppingCart className="h-5 w-5" />
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-electric-500 px-1 text-[11px] font-black text-white">
                {cartCount}
              </span>
            </button>
          )}
          {!isNativeApp && (
            <>
              <button
                className="btn-primary hidden sm:inline-flex"
                onClick={() => navigate("account")}
              >
                <User className="h-4 w-4" />
                Account
              </button>
              <button
                className="icon-button lg:hidden"
                onClick={() => setMenuOpen((value) => !value)}
                title="Menu"
              >
                {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </>
          )}
        </div>
      </nav>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="mx-4 mb-4 grid gap-1 rounded-3xl border border-black/10 bg-white p-2 shadow-panel dark:border-white/10 dark:bg-carbon lg:hidden"
            exit={{ opacity: 0, y: -8 }}
            initial={{ opacity: 0, y: -8 }}
          >
            {navItems.map((item) => (
              <button
                className={`rounded-2xl px-4 py-3 text-left text-sm font-bold ${
                  activePage === item.id
                    ? "bg-ink text-white dark:bg-white dark:text-ink"
                    : "text-black/70 dark:text-white/70"
                }`}
                key={item.id}
                onClick={() => navigate(item.id)}
              >
                {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function NativeLaunchScreen() {
  return (
    <main className="native-welcome-screen is-centered">
      <div className="native-welcome-card">
        <img
          alt="The Plain Depot Material Supply"
          className="native-welcome-logo"
          src="/plain-depot-logo-website.png"
        />
        <div className="native-welcome-copy">
          <p>Loading account</p>
          <h1>Welcome</h1>
          <span>Checking your contractor account.</span>
        </div>
      </div>
    </main>
  );
}

function NativeWelcome({ onComplete }) {
  const [mode, setMode] = useState("welcome");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [createStep, setCreateStep] = useState(0);
  const [createForm, setCreateForm] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    zip: "",
    termsAccepted: false,
  });
  const [loginError, setLoginError] = useState("");
  const [loginStatus, setLoginStatus] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createStatus, setCreateStatus] = useState("");
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  function updateCreateField(field, value) {
    setCreateForm((current) => ({ ...current, [field]: value }));
  }

  const createSteps = [
    {
      field: "name",
      label: "Your name",
      title: "What is your name?",
      placeholder: "Full name",
      autoComplete: "name",
    },
    {
      field: "company",
      label: "Company",
      title: "What company are you ordering for?",
      placeholder: "Company name",
      autoComplete: "organization",
    },
    {
      field: "email",
      label: "Email",
      title: "What email should we use?",
      placeholder: "you@company.com",
      type: "email",
      inputMode: "email",
      autoComplete: "email",
    },
    {
      field: "phone",
      label: "Phone",
      title: "What is your phone number?",
      placeholder: "(555) 000-0000",
      inputMode: "tel",
      autoComplete: "tel",
    },
    {
      field: "zip",
      label: "Pickup ZIP",
      title: "What pickup ZIP should we keep on file?",
      placeholder: "60607",
      inputMode: "numeric",
      autoComplete: "postal-code",
    },
    {
      field: "password",
      label: "Password",
      title: "Create a password",
      placeholder: "At least 8 characters",
      type: "password",
      autoComplete: "new-password",
    },
    {
      field: "confirmPassword",
      label: "Confirm password",
      title: "Confirm your password",
      placeholder: "Confirm password",
      type: "password",
      autoComplete: "new-password",
    },
    {
      field: "termsAccepted",
      label: "Account review",
      title: "Approve account review",
      copy: "The Plain Depot may review this account request and contact me about trade terms.",
      type: "checkbox",
    },
  ];
  const activeCreateStep = createSteps[createStep];
  const createProgress = Math.round(((createStep + 1) / createSteps.length) * 100);

  async function submitLogin(event) {
    event.preventDefault();
    setLoginError("");
    setLoginStatus("");
    setIsSigningIn(true);

    try {
      if (!email.trim()) throw new Error("Enter your email.");
      if (!password) throw new Error("Enter your password.");

      const result = await signInContractorAccount({ email: email.trim(), password });
      setLoginStatus("Signed in.");
      onComplete("account", result.user);
    } catch (error) {
      setLoginError(
        error instanceof Error
          ? error.message
          : "Unable to sign in.",
      );
    } finally {
      setIsSigningIn(false);
    }
  }

  async function submitCreateAccount(event) {
    event.preventDefault();
    setCreateError("");
    setCreateStatus("");
    setIsCreatingAccount(true);

    try {
      if (!createForm.name.trim()) throw new Error("Enter your name.");
      if (!createForm.company.trim()) throw new Error("Enter your company.");
      if (!createForm.email.trim()) throw new Error("Enter your email.");
      if (createForm.password.length < 8) {
        throw new Error("Use at least 8 characters for the password.");
      }
      if (createForm.password !== createForm.confirmPassword) {
        throw new Error("Passwords do not match.");
      }
      if (!createForm.termsAccepted) {
        throw new Error("Accept the account terms to continue.");
      }

      const result = await createContractorAccount({
        ...createForm,
        trade: "Electrical",
        projectType: "Mobile app signup",
        monthlyVolume: "Mobile app signup",
        notes: "Created from mobile app welcome screen.",
      });
      const session = await getCurrentContractorSession();
      const createdUser = result.user ?? session.user;

      setCreateStatus(
        createdUser
          ? "Account created."
          : "Account request submitted.",
      );
      if (!createdUser && result.authWarning) {
        throw new Error(
          `${result.authWarning}. If email confirmation is enabled in Supabase, confirm the email before login or disable confirmation for instant app login.`,
        );
      }
      if (!createdUser) {
        throw new Error("Account was created, but Supabase did not return a signed-in session.");
      }
      onComplete("account", createdUser);
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : "Unable to create this account.",
      );
    } finally {
      setIsCreatingAccount(false);
    }
  }

  function validateCreateStep(step = activeCreateStep) {
    if (!step) return "";
    const value = createForm[step.field];

    if (step.field === "name" && !String(value).trim()) return "Enter your name.";
    if (step.field === "company" && !String(value).trim()) return "Enter your company.";
    if (step.field === "email" && !String(value).trim()) return "Enter your email.";
    if (step.field === "password" && String(value).length < 8) {
      return "Use at least 8 characters for the password.";
    }
    if (step.field === "confirmPassword" && value !== createForm.password) {
      return "Passwords do not match.";
    }
    if (step.field === "termsAccepted" && !value) {
      return "Accept the account terms to continue.";
    }

    return "";
  }

  function advanceCreateStep(event) {
    event.preventDefault();
    setCreateError("");
    setCreateStatus("");

    const validationError = validateCreateStep();
    if (validationError) {
      setCreateError(validationError);
      return;
    }

    if (createStep < createSteps.length - 1) {
      setCreateStep((current) => current + 1);
      return;
    }

    submitCreateAccount(event);
  }

  function backFromCreateStep() {
    setCreateError("");
    setCreateStatus("");
    if (createStep > 0) {
      setCreateStep((current) => current - 1);
      return;
    }
    setMode("welcome");
  }

  return (
    <main className={`native-welcome-screen ${mode === "welcome" ? "is-centered" : "is-form"}`}>
      <div className="native-welcome-card">
        <img
          alt="The Plain Depot Material Supply"
          className="native-welcome-logo"
          src="/plain-depot-logo-website.png"
        />

        {mode === "welcome" ? (
          <>
            <div className="native-welcome-copy">
              <p>Contractor supply app</p>
              <h1>Welcome</h1>
              <span>
                Create your trade account or sign in to manage carts, orders, pickup notes, and contractor pricing.
              </span>
            </div>

            <div className="native-welcome-actions">
              <button className="native-welcome-primary" onClick={() => setMode("create")}>
                <User className="h-5 w-5" />
                Create account
              </button>
              <button className="native-welcome-secondary" onClick={() => setMode("login")}>
                <LogIn className="h-5 w-5" />
                Login
              </button>
            </div>
          </>
        ) : mode === "login" ? (
          <form className="native-login-form" onSubmit={submitLogin}>
            <div className="native-welcome-copy">
              <p>Welcome back</p>
              <h1>Login</h1>
              <span>Use your contractor account email and password.</span>
            </div>

            <label>
              <span>Email</span>
              <input
                autoComplete="email"
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                type="email"
                value={email}
              />
            </label>
            <label>
              <span>Password</span>
              <input
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                type="password"
                value={password}
              />
            </label>

            {loginError && <div className="native-login-message error">{loginError}</div>}
            {loginStatus && <div className="native-login-message">{loginStatus}</div>}

            <button className="native-welcome-primary" disabled={isSigningIn} type="submit">
              <LogIn className="h-5 w-5" />
              {isSigningIn ? "Signing in..." : "Login"}
            </button>
            <button
              className="native-login-link"
              onClick={() => setMode("welcome")}
              type="button"
            >
              Back
            </button>
          </form>
        ) : (
          <form className="native-login-form native-step-form" onSubmit={advanceCreateStep}>
            <div className="native-welcome-copy">
              <p>New account</p>
              <h1>{activeCreateStep.title}</h1>
              <span>Step {createStep + 1} of {createSteps.length}</span>
            </div>

            <div className="native-progress-track" aria-hidden="true">
              <span style={{ width: `${createProgress}%` }} />
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                className="native-create-step"
                exit={{ opacity: 0, x: -22, filter: "blur(4px)" }}
                initial={{ opacity: 0, x: 22, filter: "blur(4px)" }}
                key={activeCreateStep.field}
                transition={{ duration: 0.24, ease: "easeOut" }}
              >
                {activeCreateStep.type === "checkbox" ? (
                  <label className="native-check-row native-step-check">
                    <input
                      checked={createForm.termsAccepted}
                      onChange={(event) => updateCreateField("termsAccepted", event.target.checked)}
                      type="checkbox"
                    />
                    <span>{activeCreateStep.copy}</span>
                  </label>
                ) : (
                  <label>
                    <span>{activeCreateStep.label}</span>
                    <input
                      autoComplete={activeCreateStep.autoComplete}
                      autoFocus
                      inputMode={activeCreateStep.inputMode}
                      onChange={(event) =>
                        updateCreateField(activeCreateStep.field, event.target.value)
                      }
                      placeholder={activeCreateStep.placeholder}
                      type={activeCreateStep.type ?? "text"}
                      value={createForm[activeCreateStep.field]}
                    />
                  </label>
                )}
              </motion.div>
            </AnimatePresence>

            {createError && <div className="native-login-message error">{createError}</div>}
            {createStatus && <div className="native-login-message">{createStatus}</div>}

            <button className="native-welcome-primary" disabled={isCreatingAccount} type="submit">
              <User className="h-5 w-5" />
              {isCreatingAccount
                ? "Creating account..."
                : createStep === createSteps.length - 1
                  ? "Create account"
                  : "Next"}
            </button>
            <button
              className="native-login-link"
              onClick={backFromCreateStep}
              type="button"
            >
              {createStep > 0 ? "Previous" : "Back"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

function NativeHome({
  accountUser,
  addToCart,
  cartCount,
  catalogStatus,
  dismissOrderProgress,
  navigate,
  orderProgress,
  openProduct,
  products,
  setSearch,
}) {
  const [homeSearch, setHomeSearch] = useState("");
  const availableCount = products.filter((product) => product.stockStatus !== "out").length;
  const featuredProducts = products.slice(0, 3);
  const firstName =
    accountUser?.user_metadata?.name?.split(/\s+/)[0] ||
    accountUser?.user_metadata?.full_name?.split(/\s+/)[0] ||
    "Contractor";
  const estimatedMonthlySavings = cartCount
    ? Math.max(42, cartCount * 31.25)
    : 248.75;
  const topActions = [
    {
      icon: ShoppingCart,
      label: "Quick Order",
      copy: cartCount ? "Review cart" : "Start cart",
      action: () => navigate(cartCount ? "cart" : "shop"),
    },
    { icon: Search, label: "Scan Product", copy: "Find SKU", action: () => navigate("shop") },
    { icon: Package, label: "Browse", copy: "Fast picks", action: () => navigate("shop") },
  ];
  const catalogLabel = catalogStatus.loading
    ? "Syncing catalog"
    : catalogStatus.error
      ? "Catalog issue"
      : "Catalog live";
  const summaryCards = [
    { label: "Ready SKUs", value: availableCount.toLocaleString(), icon: Package },
    { label: "Cart items", value: cartCount.toString(), icon: ShoppingCart },
  ];
  const activeOrderStatus = orderProgress?.softwareStatus || orderProgress?.orderStatus || "Submitted";
  const activeOrderStage = getNativeOrderStatusMeta(activeOrderStatus);
  const orderProgressPercent = orderProgress ? activeOrderStage.progress : 0;

  function submitHomeSearch(event) {
    event.preventDefault();
    setSearch?.(homeSearch.trim());
    navigate("shop");
  }

  return (
    <section className="native-dashboard">
      <div className="native-screen">
        <div className="native-home-hero">
          <div className="native-home-topbar">
            <div>
              <span>Good morning,</span>
              <strong>{firstName}</strong>
              <small className="native-home-status-pill">{catalogLabel}</small>
            </div>
            <button onClick={() => navigate("notifications")} title="Notifications">
              <Bell className="h-4 w-4" />
            </button>
            <button className="native-home-avatar" onClick={() => navigate("account")} title="Account">
              {firstName.slice(0, 1).toUpperCase()}
            </button>
          </div>

          {orderProgress && (
            <div
              className="native-home-order-progress-card"
              style={{ "--order-progress": `${orderProgressPercent}%` }}
            >
              <div className="native-home-order-progress-top">
                <span>Active order</span>
                <button onClick={dismissOrderProgress} title="Dismiss order progress" type="button">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <strong>{activeOrderStage.label}</strong>
              <p>{activeOrderStage.copy}</p>
              <div className="native-home-order-progress-track">
                <span />
              </div>
              <div className="native-home-order-progress-meta">
                <span>{orderProgress.orderNumber}</span>
                <span>
                  {activeOrderStatus}
                  {orderProgress.syncError ? " · sync delayed" : ""}
                </span>
              </div>
            </div>
          )}

          <div className="native-home-workflow-card">
            <div className="native-home-workflow-main">
              <span>Pro account</span>
              <h1>Build today&apos;s material run</h1>
              <p>{cartCount ? `${cartCount} item${cartCount === 1 ? "" : "s"} ready to review.` : "Search, add items, and submit a project order."}</p>
              <button onClick={() => navigate(cartCount ? "cart" : "shop")}>
                {cartCount ? "Open cart" : "Start order"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <div className="native-home-workflow-side">
              <div className="native-home-savings">
                <span>Total savings</span>
                <strong>{money.format(estimatedMonthlySavings)}</strong>
                <small>This month</small>
              </div>
              <div className="native-home-cart-pill">
                <ShoppingCart className="h-4 w-4" />
                <strong>{cartCount}</strong>
              </div>
            </div>
          </div>

          <div className="native-home-top-actions">
            {topActions.map(({ action, copy, icon: Icon, label }) => (
              <button key={label} onClick={action}>
                <Icon className="h-5 w-5" />
                <span>{label}</span>
                <small>{copy}</small>
              </button>
            ))}
          </div>

          <form className="native-home-search" onSubmit={submitHomeSearch}>
            <input
              aria-label="Search products, categories, SKUs"
              onChange={(event) => setHomeSearch(event.target.value)}
              placeholder="Search products, categories, SKUs..."
              value={homeSearch}
            />
            <button aria-label="Search catalog" type="submit">
              <Search className="h-5 w-5" />
            </button>
          </form>
        </div>

        <div className="native-home-section-heading">
          <h2>Today</h2>
        </div>

        <div className="native-home-summary-grid">
          {summaryCards.map(({ icon: Icon, label, value }) => (
            <button key={label} onClick={() => navigate(label === "Cart items" ? "cart" : "shop")}>
              <div>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
              <Icon className="h-5 w-5" />
            </button>
          ))}
        </div>

        {featuredProducts.length > 0 && (
          <div className="native-home-reorder-card">
            <div className="native-section-title">
              <h2>Fast picks</h2>
              <button onClick={() => navigate("shop")}>Shop</button>
            </div>
            <div className="native-product-list">
              {featuredProducts.map((product) => (
                <div className="native-product-list-row" key={product.id}>
                  <button
                    aria-label={`Add ${product.name} to cart`}
                    className="native-product-quick-add"
                    onClick={() => addToCart(product)}
                    type="button"
                  >
                    <ProductVisual product={product} small />
                    <span>
                      <strong>{product.name}</strong>
                      <small>{product.availabilityLabel}</small>
                      <b>{money.format(product.price)}</b>
                    </span>
                    <em>
                      <Plus className="h-4 w-4" />
                    </em>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function NativeTrackingPage({ accountUser, navigate, shipments, shipmentStatus }) {
  const activeShipments = shipments.filter(
    (shipment) => !String(shipment.trackingStatus || shipment.orderStatus).toLowerCase().includes("delivered"),
  );
  const deliveredShipments = shipments.length - activeShipments.length;
  const latestShipment = shipments[0] || null;
  const isLoading = shipmentStatus?.loading;
  const hasError = Boolean(shipmentStatus?.error);

  function openTrackingLink(shipment) {
    if (!shipment?.trackingUrl) return;
    window.open(shipment.trackingUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="native-tracking-screen">
      <div className="native-screen">
        <div className="native-tracking-hero">
          <div>
            <p className="native-kicker">Tracking</p>
            <h1>Your shipments</h1>
            <p>
              Only orders connected to your signed-in Plain Depot account show here.
            </p>
          </div>
          <button onClick={() => navigate("shop")} type="button">
            <Package className="h-4 w-4" />
            Shop
          </button>
        </div>

        {!accountUser ? (
          <div className="native-tracking-card native-tracking-empty">
            <div className="native-tracking-icon">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h2>Login to see shipment tracking</h2>
            <p>Your tracking page only loads shipments tied to your account.</p>
            <button onClick={() => navigate("account")} type="button">Login</button>
          </div>
        ) : (
          <>
            <div className="native-tracking-stats">
              <div>
                <span>Active</span>
                <strong>{activeShipments.length}</strong>
              </div>
              <div>
                <span>Delivered</span>
                <strong>{deliveredShipments}</strong>
              </div>
              <div>
                <span>Latest</span>
                <strong>{latestShipment?.trackingStatus || latestShipment?.orderStatus || "None"}</strong>
              </div>
            </div>

            {hasError && (
              <div className="native-tracking-card native-tracking-message error">
                <AlertTriangle className="h-5 w-5" />
                <span>{shipmentStatus.error}</span>
              </div>
            )}

            {isLoading && (
              <div className="native-tracking-card native-tracking-message">
                <Activity className="h-5 w-5" />
                <span>Loading your shipments...</span>
              </div>
            )}

            {!isLoading && !hasError && shipments.length === 0 && (
              <div className="native-tracking-card native-tracking-empty">
                <div className="native-tracking-icon">
                  <Truck className="h-6 w-6" />
                </div>
                <h2>No shipments yet</h2>
                <p>
                  When Plain Depot adds tracking to one of your orders, it will show here.
                </p>
                <button onClick={() => navigate("shop")} type="button">Start an order</button>
              </div>
            )}

            <div className="native-tracking-list">
              {shipments.map((shipment) => {
                const status = shipment.trackingStatus || shipment.orderStatus;
                const statusMeta = getNativeShipmentStatusMeta(status);
                const eventRows = shipment.trackingEvents.slice(0, 3);
                const hasTrackingNumber = Boolean(shipment.trackingNumber);

                return (
                  <article
                    className="native-tracking-card native-tracking-shipment"
                    key={shipment.id}
                    style={{ "--shipment-progress": `${statusMeta.progress}%` }}
                  >
                    <div className="native-tracking-shipment-top">
                      <div>
                        <span>{shipment.carrier || "Plain Depot"}</span>
                        <strong>{shipment.orderNumber}</strong>
                      </div>
                      <em>{statusMeta.label}</em>
                    </div>

                    <p>{statusMeta.copy}</p>

                    <div className="native-tracking-progress">
                      <span />
                    </div>

                    <div className="native-tracking-detail-grid">
                      <div>
                        <span>Tracking</span>
                        <strong>{hasTrackingNumber ? shipment.trackingNumber : "Pending"}</strong>
                      </div>
                      <div>
                        <span>ETA</span>
                        <strong>{formatShipmentDate(shipment.trackingEta)}</strong>
                      </div>
                      <div>
                        <span>Location</span>
                        <strong>{shipment.trackingLocation || "Pending carrier scan"}</strong>
                      </div>
                      <div>
                        <span>Updated</span>
                        <strong>{formatShipmentDate(shipment.updatedAt, "Not synced")}</strong>
                      </div>
                    </div>

                    {eventRows.length > 0 && (
                      <div className="native-tracking-events">
                        {eventRows.map((event) => (
                          <div key={event.id}>
                            <span>{formatShipmentDate(event.time, "Recent")}</span>
                            <strong>{event.status || "Carrier update"}</strong>
                            {event.location && <small>{event.location}</small>}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="native-tracking-actions">
                      <button
                        disabled={!shipment.trackingUrl}
                        onClick={() => openTrackingLink(shipment)}
                        type="button"
                      >
                        <Truck className="h-4 w-4" />
                        {hasTrackingNumber ? "Open carrier tracking" : "Tracking pending"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function NativeNotificationsPage({
  accountUser,
  cartCount,
  catalogStatus,
  navigate,
  products = [],
  projects = [],
}) {
  const [activeFilter, setActiveFilter] = useState("all");
  const [readIds, setReadIds] = useState([]);
  const lowStockCount = products.filter(
    (product) => product.stockStatus !== "out" && Number(product.stockQuantity ?? 0) <= 10,
  ).length;
  const notifications = [
    {
      id: "cart",
      category: "orders",
      icon: ShoppingCart,
      time: "Now",
      title: cartCount ? "Cart ready for review" : "Start an order cart",
      copy: cartCount
        ? `${cartCount} item${cartCount === 1 ? "" : "s"} waiting in your cart.`
        : "Add material before sending an order request.",
      page: cartCount ? "cart" : "shop",
      cta: cartCount ? "Open cart" : "Shop",
      unread: cartCount > 0,
    },
    {
      id: "account",
      category: "account",
      icon: ShieldCheck,
      time: accountUser ? "Active" : "Required",
      title: accountUser ? "Account active" : "Sign in to order",
      copy: accountUser ? "Your contractor account is connected." : "Create or sign in before submitting orders.",
      page: "account",
      cta: accountUser ? "View" : "Sign in",
      unread: !accountUser,
    },
    {
      id: "catalog",
      category: "catalog",
      icon: catalogStatus.error ? AlertTriangle : Package,
      time: catalogStatus.error ? "Issue" : "Live",
      title: catalogStatus.error ? "Catalog needs review" : "Catalog is live",
      copy: catalogStatus.error || "Products and availability are ready to browse.",
      page: "shop",
      cta: "Browse",
      unread: Boolean(catalogStatus.error),
    },
    ...(enableNativeProjects
      ? [
          {
            id: "projects",
            category: "orders",
            icon: ClipboardList,
            time: projects.length ? "Saved" : "New",
            title: projects.length
              ? `${projects.length} saved project list${projects.length === 1 ? "" : "s"}`
              : "Save a project list",
            copy: projects.length
              ? "Open a saved list to reorder material faster."
              : "Add cart items to a project so you can reorder them later.",
            page: "projects",
            cta: "Projects",
            unread: false,
          },
        ]
      : [
          {
            id: "order-progress",
            category: "orders",
            icon: Truck,
            time: "Live",
            title: "Order status updates",
            copy: "Submitted orders show live progress from the software on Home.",
            page: "home",
            cta: "Home",
            unread: false,
          },
        ]),
    {
      id: "stock",
      category: "catalog",
      icon: Boxes,
      time: lowStockCount ? "Watch" : "Ready",
      title: lowStockCount ? `${lowStockCount} low-stock item${lowStockCount === 1 ? "" : "s"}` : "Inventory looks ready",
      copy: lowStockCount
        ? "Review available quantities before placing a larger order."
        : "Available catalog items are ready for order carts.",
      page: "shop",
      cta: "Check stock",
      unread: lowStockCount > 0,
    },
    {
      id: "savings",
      category: "account",
      icon: DollarSign,
      time: "This month",
      title: "Savings tracker moved",
      copy: "Your savings tracker now lives on the account page.",
      page: "account",
      cta: "View savings",
      unread: false,
    },
  ];
  const filters = [
    { id: "all", label: "All" },
    { id: "orders", label: "Orders" },
    { id: "catalog", label: "Catalog" },
    { id: "account", label: "Account" },
  ];
  const unreadCount = notifications.filter(
    (notification) => notification.unread && !readIds.includes(notification.id),
  ).length;
  const filteredNotifications = notifications.filter(
    (notification) => activeFilter === "all" || notification.category === activeFilter,
  );

  function openNotification(notification) {
    setReadIds((current) =>
      current.includes(notification.id) ? current : [...current, notification.id],
    );
    navigate(notification.page);
  }

  return (
    <section className="native-dashboard">
      <div className="native-screen">
        <div className="native-notifications-hero">
          <div>
            <p className="native-kicker">Notifications</p>
            <h1>Updates</h1>
          </div>
          <span>{unreadCount} unread</span>
        </div>

        <div className="native-notifications-tools">
          <div>
            {filters.map((filter) => (
              <button
                className={activeFilter === filter.id ? "active" : ""}
                key={filter.id}
                onClick={() => setActiveFilter(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <button onClick={() => setReadIds(notifications.map((notification) => notification.id))}>
            Mark read
          </button>
        </div>

        <div className="native-notification-list">
          {filteredNotifications.map((notification) => {
            const { copy, cta, icon: Icon, id, time, title } = notification;
            const isUnread = notification.unread && !readIds.includes(id);

            return (
            <button
              className={isUnread ? "unread" : ""}
              key={id}
              onClick={() => openNotification(notification)}
            >
              <span>
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <small className="native-notification-meta">
                  {time}
                  {isUnread && <b />}
                </small>
                <strong>{title}</strong>
                <small>{copy}</small>
                <em>{cta}</em>
              </div>
              <ChevronRight className="h-4 w-4" />
            </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function NativeTabBar({ activePage, cartCount, navigate }) {
  const nativeTabAliases = {
    notifications: "home",
    product: "shop",
    projects: enableNativeProjects ? "projects" : "shop",
  };
  const normalizedPage = nativeTabAliases[activePage] || activePage;

  return (
    <nav
      className="native-tab-bar"
      aria-label="App navigation"
      style={{ "--native-tab-count": nativeNavItems.length }}
    >
      {nativeNavItems.map((item) => {
        const Icon = item.icon;
        const isActive = normalizedPage === item.id;

        return (
          <button
            aria-label={`Open ${item.label}`}
            aria-current={isActive ? "page" : undefined}
            className={isActive ? "active" : ""}
            key={item.id}
            onClick={() => navigate(item.id)}
          >
            <span className="native-tab-icon">
              <Icon className="h-5 w-5" />
              {item.id === "cart" && cartCount > 0 && <b>{cartCount}</b>}
            </span>
            <span className="native-tab-label">{item.label}</span>
            <span className="native-tab-active-glow" aria-hidden="true" />
          </button>
        );
      })}
    </nav>
  );
}

function NativeProjectsPage({
  accountUser,
  addProductToProject,
  createNativeProject,
  cartItems,
  duplicateProjectToCart,
  navigate,
  orderProjectMaterials,
  products,
  projects,
  removeProjectMaterial,
  removeProject,
  restartNativeWelcome,
  saveCurrentCartAsProject,
  updateProjectMaterialQuantity,
}) {
  const [projectName, setProjectName] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [isAddingMaterials, setIsAddingMaterials] = useState(false);
  const [projectProductSearch, setProjectProductSearch] = useState("");
  const [selectedMaterialIds, setSelectedMaterialIds] = useState([]);
  const [projectActionMessage, setProjectActionMessage] = useState("");
  const [calculator, setCalculator] = useState({
    projectType: "Kitchen trim-out",
    rooms: 1,
    devices: 12,
    markup: 28,
  });
  const [saveStatus, setSaveStatus] = useState("");

  const averageMaterialPrice =
    products.length ? products.reduce((sum, product) => sum + product.price, 0) / products.length : 18;

  function resolveProjectLine(line) {
    const productId = line.productId || line.id || line.sku || line.name;
    const product = products.find((item) => item.id === productId);
    const quantity = Math.max(0, Number(line.quantity ?? line.qty ?? 0));
    const unitPrice = Number(line.unitPrice ?? line.unit_price ?? line.price ?? product?.price ?? 0);
    const lineTotal = Number(line.total ?? line.line_total ?? unitPrice * quantity);

    return {
      key: productId || `${line.name || "material"}-${quantity}`,
      productId,
      name: product?.name || line.name || line.title || productId || "Material item",
      categoryName: product?.categoryName || line.categoryName || line.category || "Material",
      quantity,
      unitPrice,
      total: Number.isFinite(lineTotal) ? lineTotal : 0,
    };
  }

  const projectTotals = projects.map((project) => {
    const materialLines = (project.items || []).map(resolveProjectLine).filter((line) => line.quantity > 0);
    const orderedSource =
      project.orderedItems || project.orderedMaterials || project.ordered || project.fulfilledItems || [];
    const orderedLines = Array.isArray(orderedSource)
      ? orderedSource.map(resolveProjectLine).filter((line) => line.quantity > 0)
      : [];
    const orderedByProduct = orderedLines.reduce((map, line) => {
      if (!line.productId) return map;
      map.set(line.productId, (map.get(line.productId) || 0) + line.quantity);
      return map;
    }, new Map());
    const neededToAdd = materialLines
      .map((line) => {
        const orderedQuantity = line.productId ? orderedByProduct.get(line.productId) || 0 : 0;
        const remainingQuantity = Math.max(0, line.quantity - orderedQuantity);
        return {
          ...line,
          quantity: remainingQuantity,
          total: line.unitPrice * remainingQuantity,
        };
      })
      .filter((line) => line.quantity > 0);
    const total = materialLines.reduce((sum, line) => sum + line.total, 0);
    const orderedTotal = orderedLines.reduce((sum, line) => sum + line.total, 0);
    const neededTotal = neededToAdd.reduce((sum, line) => sum + line.total, 0);
    const branded = total * 1.28;
    return {
      ...project,
      materialLines,
      orderedLines,
      neededToAdd,
      total,
      orderedTotal,
      neededTotal,
      branded,
      savings: Math.max(0, branded - total),
      itemCount: materialLines.reduce((sum, line) => sum + line.quantity, 0),
      orderedCount: orderedLines.reduce((sum, line) => sum + line.quantity, 0),
      neededCount: neededToAdd.reduce((sum, line) => sum + line.quantity, 0),
    };
  });
  const savedProjectTotal = projectTotals.reduce((sum, project) => sum + project.total, 0);
  const trackedSavings = projectTotals.reduce((sum, project) => sum + project.savings, 0);
  const selectedProject = projectTotals.find((project) => project.id === selectedProjectId) || null;
  const normalizedProjectSearch = projectProductSearch.trim().toLowerCase();
  const projectPickerProducts = products
    .filter(
      (product) =>
        !normalizedProjectSearch ||
        product.name.toLowerCase().includes(normalizedProjectSearch) ||
        product.categoryName.toLowerCase().includes(normalizedProjectSearch) ||
        product.summary.toLowerCase().includes(normalizedProjectSearch),
    )
    .slice(0, 10);
  const calculatorAreaCost =
    Number(calculator.rooms || 0) * Number(calculator.devices || 0) * averageMaterialPrice;
  const estimatedMaterialCost = (selectedProject?.total || 0) + calculatorAreaCost;
  const brandedEstimate = estimatedMaterialCost * (1 + Number(calculator.markup || 0) / 100);
  const estimatedSavings = Math.max(0, brandedEstimate - estimatedMaterialCost);
  const isProjectLocked = !accountUser;

  useEffect(() => {
    if (!selectedProjectId) return;
    if (!projectTotals.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId("");
    }
  }, [projectTotals, selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId || typeof document === "undefined") return;
    const nativeScrollContainer = document.querySelector(".native-main");
    if (nativeScrollContainer) {
      nativeScrollContainer.scrollTo({ top: 0, behavior: "smooth" });
    }
    setIsAddingMaterials(false);
    setProjectProductSearch("");
    setSelectedMaterialIds([]);
    setProjectActionMessage("");
  }, [selectedProjectId]);

  function createProject() {
    setSaveStatus("");
    if (isProjectLocked) {
      setSaveStatus("To be able to use projects, please sign in or create an account.");
      return;
    }
    const nextProjectName = projectName.trim();
    if (!nextProjectName) {
      setSaveStatus("Name the project before creating it.");
      return;
    }
    const createdProjectId = createNativeProject(nextProjectName);
    if (createdProjectId) {
      setProjectName("");
      setSaveStatus("Project created.");
      setSelectedProjectId(createdProjectId);
    }
  }

  function saveCartProject() {
    setSaveStatus("");
    if (isProjectLocked) {
      setSaveStatus("To be able to use projects, please sign in or create an account.");
      return;
    }
    if (!cartItems.length) {
      setSaveStatus("There are no cart items to save.");
      return;
    }
    const savedProjectId = saveCurrentCartAsProject(projectName || `${calculator.projectType} list`);
    if (savedProjectId) {
      setProjectName("");
      setSaveStatus("Cart saved as a project.");
      setSelectedProjectId(savedProjectId);
    }
  }

  function updateCalculator(field, value) {
    setCalculator((current) => ({ ...current, [field]: value }));
  }

  function formatProjectDate(value) {
    if (!value) return "No date";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "No date";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function openProject(projectId) {
    setSelectedProjectId(projectId);
  }

  function handlePreviewKeyDown(event, projectId) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openProject(projectId);
  }

  function toggleSelectedMaterial(productId) {
    if (!productId) return;
    setSelectedMaterialIds((current) =>
      current.includes(productId)
        ? current.filter((item) => item !== productId)
        : [...current, productId],
    );
  }

  function handleAddProjectMaterial(product) {
    addProductToProject(selectedProject.id, product, 1);
    setProjectActionMessage(`${product.name} added to ${selectedProject.name}.`);
  }

  function handleOrderProjectMaterials(productIds = []) {
    const didStartOrder = orderProjectMaterials(selectedProject.id, productIds);
    if (!didStartOrder) {
      setProjectActionMessage("Add at least one material before starting an order.");
    }
  }

  function selectAllNeededMaterials() {
    if (!selectedProject?.neededToAdd?.length) return;
    setSelectedMaterialIds(selectedProject.neededToAdd.map((line) => line.productId).filter(Boolean));
  }

  function renderMaterialList(lines, emptyMessage, options = {}) {
    const { editable = false, selectable = false } = options;

    if (!lines.length) {
      return <div className="native-material-empty">{emptyMessage}</div>;
    }

    return (
      <div className="native-material-list">
        {lines.map((line, index) => (
          <div
            className={`native-material-row${selectable ? " is-selectable" : ""}${editable ? " is-editable" : ""}`}
            key={`${line.key}-${line.quantity}-${index}`}
            onClick={selectable ? () => toggleSelectedMaterial(line.productId) : undefined}
          >
            {selectable && (
              <button
                className={`native-material-select${selectedMaterialIds.includes(line.productId) ? " is-selected" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleSelectedMaterial(line.productId);
                }}
                title="Select material"
              >
                <span />
              </button>
            )}
            <div>
              <strong>{line.name}</strong>
              <span>{line.categoryName}</span>
            </div>
            {editable ? (
              <div className="native-material-controls">
                <button
                  disabled={line.quantity <= 1}
                  onClick={() =>
                    updateProjectMaterialQuantity(selectedProject.id, line.productId, line.quantity - 1)
                  }
                  title="Reduce quantity"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span>{line.quantity}</span>
                <button
                  onClick={() =>
                    updateProjectMaterialQuantity(selectedProject.id, line.productId, line.quantity + 1)
                  }
                  title="Increase quantity"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  onClick={() => removeProjectMaterial(selectedProject.id, line.productId)}
                  title="Remove material"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div>
                <strong>{line.quantity}</strong>
                <span>{money.format(line.total)}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (selectedProject) {
    return (
      <section className="native-dashboard">
        <div className="native-screen">
          <button className="native-project-back" onClick={() => setSelectedProjectId("")}>
            Back to projects
          </button>

          <div className="native-project-hero native-project-detail-hero">
            <p className="native-kicker">Project tracker</p>
            <h1>{selectedProject.name}</h1>
            <p>
              {selectedProject.status || "Estimating"} · Created {formatProjectDate(selectedProject.createdAt)}
            </p>
            <div className="native-project-metrics">
              <div>
                <span>Needed</span>
                <strong>{selectedProject.itemCount}</strong>
              </div>
              <div>
                <span>Ordered</span>
                <strong>{selectedProject.orderedCount}</strong>
              </div>
              <div>
                <span>To add</span>
                <strong>{selectedProject.neededCount}</strong>
              </div>
            </div>
          </div>

          <div className="native-project-detail-actions">
            <button onClick={() => setIsAddingMaterials((current) => !current)}>
              <Plus className="h-4 w-4" />
              {isAddingMaterials ? "Close add" : "Add materials"}
            </button>
            <button
              disabled={isProjectLocked || !selectedProject.neededToAdd.length}
              onClick={() =>
                handleOrderProjectMaterials(selectedProject.neededToAdd.map((line) => line.productId))
              }
            >
              <ShoppingCart className="h-4 w-4" />
              Order all
            </button>
          </div>

          {projectActionMessage && <div className="native-project-message">{projectActionMessage}</div>}

          {isAddingMaterials && (
            <div className="native-project-card native-project-picker">
              <div className="native-section-title">
                <h2>Add Materials</h2>
                <button onClick={() => setProjectProductSearch("")}>Clear</button>
              </div>
              <label className="native-project-picker-search">
                <Search className="h-4 w-4" />
                <input
                  onChange={(event) => setProjectProductSearch(event.target.value)}
                  placeholder="Search products"
                  value={projectProductSearch}
                />
              </label>
              <div className="native-project-product-list">
                {projectPickerProducts.map((product) => (
                  <div className="native-project-product-row" key={product.id}>
                    <div>
                      <strong>{product.name}</strong>
                      <span>{product.categoryName} · {money.format(product.price)}</span>
                    </div>
                    <button disabled={isProjectLocked} onClick={() => handleAddProjectMaterial(product)}>
                      <Plus className="h-4 w-4" />
                      Add
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="native-project-card native-material-section">
            <div className="native-section-title">
              <h2>Materials Needed</h2>
              <span>{money.format(selectedProject.total)}</span>
            </div>
            {renderMaterialList(
              selectedProject.materialLines,
              "No materials are saved to this project yet. Tap Add materials to build this list.",
              { editable: true },
            )}
          </div>

          <div className="native-project-card native-material-section">
            <div className="native-section-title">
              <h2>Ordered</h2>
              <span>{money.format(selectedProject.orderedTotal)}</span>
            </div>
            {renderMaterialList(
              selectedProject.orderedLines,
              "No ordered materials are tracked for this project yet.",
            )}
          </div>

          <div className="native-project-card native-material-section">
            <div className="native-section-title">
              <h2>Ready To Order</h2>
              {selectedMaterialIds.length ? (
                <button onClick={() => handleOrderProjectMaterials(selectedMaterialIds)}>
                  Order selected ({selectedMaterialIds.length})
                </button>
              ) : selectedProject.neededToAdd.length ? (
                <button onClick={selectAllNeededMaterials}>Select all</button>
              ) : (
                <span>{money.format(selectedProject.neededTotal)}</span>
              )}
            </div>
            {selectedProject.neededToAdd.length > 0 && (
              <p className="native-project-help-text">Tap a row to choose specific materials, or order all from the top.</p>
            )}
            {renderMaterialList(
              selectedProject.neededToAdd,
              "Everything saved to this project is marked as ordered.",
              { selectable: true },
            )}
          </div>

          <div className="native-project-card">
            <div className="native-section-title">
              <h2>Job Cost Calculator</h2>
            </div>
            <div className="native-calculator-grid">
              <label>
                <span>Project type</span>
                <select
                  onChange={(event) => updateCalculator("projectType", event.target.value)}
                  value={calculator.projectType}
                >
                  <option>Kitchen trim-out</option>
                  <option>Multi-room rough-in</option>
                  <option>Service upgrade</option>
                  <option>Tenant buildout</option>
                </select>
              </label>
              <label>
                <span>Rooms / areas</span>
                <input
                  min="1"
                  onChange={(event) => updateCalculator("rooms", event.target.value)}
                  type="number"
                  value={calculator.rooms}
                />
              </label>
              <label>
                <span>Devices per area</span>
                <input
                  min="1"
                  onChange={(event) => updateCalculator("devices", event.target.value)}
                  type="number"
                  value={calculator.devices}
                />
              </label>
              <label>
                <span>Branded markup %</span>
                <input
                  min="0"
                  onChange={(event) => updateCalculator("markup", event.target.value)}
                  type="number"
                  value={calculator.markup}
                />
              </label>
            </div>
            <div className="native-calculator-result">
              <div>
                <span>Project estimate</span>
                <strong>{money.format(estimatedMaterialCost)}</strong>
              </div>
              <div>
                <span>Estimated savings</span>
                <strong>{money.format(estimatedSavings)}</strong>
              </div>
            </div>
          </div>

          <button
            className="native-project-danger"
            disabled={isProjectLocked}
            onClick={() => {
              removeProject(selectedProject.id);
              setSelectedProjectId("");
            }}
          >
            <Trash2 className="h-4 w-4" />
            Remove project
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="native-dashboard">
      <div className="native-screen">
        <div className="native-project-hero">
          <p className="native-kicker">Contractor software</p>
          <h1>Projects</h1>
          <p>Track job lists, ordered material, and the missing pieces for each active project.</p>
          <div className="native-project-metrics">
            <div>
              <span>Lists</span>
              <strong>{projects.length}</strong>
            </div>
            <div>
              <span>Tracked</span>
              <strong>{money.format(savedProjectTotal)}</strong>
            </div>
            <div>
              <span>Savings</span>
              <strong>{money.format(trackedSavings)}</strong>
            </div>
          </div>
        </div>

        <div className="native-project-card">
          <div className="native-section-title">
            <h2>Your Projects</h2>
            <button onClick={() => setProjectName(projectName || `${calculator.projectType} project`)}>
              Quick name
            </button>
          </div>
          {isProjectLocked ? (
            <div className="native-project-auth-card">
              <div>
                <strong>Account required</strong>
                <p>To be able to use projects, please sign in or create an account.</p>
              </div>
              <div className="native-project-auth-actions">
                <button onClick={() => navigate("account")}>
                  <LogIn className="h-4 w-4" />
                  Sign in
                </button>
                <button onClick={() => (restartNativeWelcome ? restartNativeWelcome() : navigate("account"))}>
                  <User className="h-4 w-4" />
                  Create account
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="native-project-save-row">
                <input
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="New project name"
                  value={projectName}
                />
                <button onClick={createProject}>
                  <Plus className="h-4 w-4" />
                  Create
                </button>
              </div>
              {cartItems.length > 0 && (
                <button className="native-project-cart-save" onClick={saveCartProject}>
                  Save current cart as a project
                </button>
              )}
            </>
          )}
          {saveStatus && <div className="native-project-message">{saveStatus}</div>}
          <div className="native-project-preview-grid">
            {projectTotals.map((project) => (
              <div
                className="native-project-preview-card"
                key={project.id}
                onClick={() => openProject(project.id)}
                onKeyDown={(event) => handlePreviewKeyDown(event, project.id)}
                role="button"
                tabIndex={0}
              >
                <div className="native-project-preview-top">
                  <div>
                    <strong>{project.name}</strong>
                    <span>{project.status || "Estimating"} · {formatProjectDate(project.createdAt)}</span>
                  </div>
                  <ChevronRight className="h-4 w-4" />
                </div>
                <div className="native-project-preview-stats">
                  <div>
                    <span>Materials</span>
                    <strong>{project.itemCount}</strong>
                  </div>
                  <div>
                    <span>Ordered</span>
                    <strong>{project.orderedCount}</strong>
                  </div>
                  <div>
                    <span>Value</span>
                    <strong>{money.format(project.total)}</strong>
                  </div>
                </div>
                <div className="native-project-preview-materials">
                  {project.materialLines.length
                    ? project.materialLines.slice(0, 2).map((line) => (
                        <span key={line.key}>{line.quantity}x {line.name}</span>
                      ))
                    : <span>No material list saved yet</span>}
                </div>
                <div className="native-project-item-actions native-project-preview-actions">
                  <button
                    disabled={isProjectLocked || !project.itemCount}
                    onClick={(event) => {
                      event.stopPropagation();
                      duplicateProjectToCart(project.id);
                    }}
                  >
                    Reorder
                  </button>
                  <button
                    disabled={isProjectLocked}
                    onClick={(event) => {
                      event.stopPropagation();
                      removeProject(project.id);
                    }}
                    title="Remove project"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function HomePage({
  catalogStatus,
  categories,
  navigate,
  products,
}) {
  const visibleCategories = categories.slice(0, 6);
  const [calculatorSpend, setCalculatorSpend] = useState(4800);
  const contractorRate = calculatorSpend >= 10000 ? 0.3 : calculatorSpend >= 5000 ? 0.25 : 0.2;
  const estimatedSavings = calculatorSpend * contractorRate;
  const netSpend = calculatorSpend - estimatedSavings;
  const availableCount = products.filter((product) => product.stockStatus !== "out").length;
  const homeStats = [
    { label: "Catalog SKUs", value: products.length.toLocaleString() },
    { label: "Available Items", value: availableCount.toLocaleString() },
    { label: "Brand Markup Cut", value: "20-30%" },
    { label: "Trade Focus", value: "Electrical" },
  ];

  return (
    <>
      <section className="hero-grid relative overflow-hidden">
        <div className="mx-auto grid min-h-[calc(100svh-80px)] w-full max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.03fr_0.97fr] lg:px-8 lg:py-20">
          <div className="relative z-10">
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="pill mb-7"
              initial={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.5 }}
            >
              <Sparkles className="h-4 w-4 text-electric-300" />
              Direct-source wholesale platform
              <span className="hidden h-1 w-1 rounded-full bg-white/40 sm:inline-block" />
              <span className="hidden sm:inline">
                {catalogStatus.loading
                  ? "Loading catalog"
                  : catalogStatus.error
                    ? "Catalog updating"
                    : "Live storefront"}
              </span>
            </motion.div>
            <motion.h1
              animate={{ opacity: 1, y: 0 }}
              className="max-w-4xl text-5xl font-black leading-[0.94] tracking-normal text-white sm:text-6xl lg:text-8xl"
              initial={{ opacity: 0, y: 18 }}
              transition={{ delay: 0.08, duration: 0.55 }}
            >
              Branded Is <span className="line-through decoration-electric-500 decoration-[0.08em]">Killing</span> Your Margins
            </motion.h1>
            <motion.p
              animate={{ opacity: 1, y: 0 }}
              className="mt-7 max-w-2xl text-lg leading-8 text-white/70 sm:text-xl"
              initial={{ opacity: 0, y: 18 }}
              transition={{ delay: 0.16, duration: 0.55 }}
            >
              Products sourced through the same manufacturer networks behind major
              branded lines, without the middle-man layers and branding premiums.
            </motion.p>
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="mt-9 flex flex-col gap-3 sm:flex-row"
              initial={{ opacity: 0, y: 18 }}
              transition={{ delay: 0.24, duration: 0.55 }}
            >
              <button className="btn-primary h-14 px-7 text-base" onClick={() => navigate("shop")}>
                Shop Products
                <ArrowRight className="h-5 w-5" />
              </button>
              <button
                className="btn-secondary h-14 border-white/15 bg-white/10 px-7 text-base text-white hover:bg-white/15"
                onClick={() => navigate("account")}
              >
                Open Contractor Account
              </button>
            </motion.div>

            <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {homeStats.map((stat) => (
                <div className="stat-card" key={stat.label}>
                  <p className="text-2xl font-black text-white">{stat.value}</p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-white/50">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 grid gap-4 lg:pl-8">
            <div className="glass-panel rounded-[1.75rem] p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-white/60">Contractor savings</p>
                  <h2 className="mt-1 text-2xl font-black text-white">Project cost calculator</h2>
                </div>
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-electric-500/15 text-electric-300">
                  <DollarSign className="h-6 w-6" />
                </div>
              </div>
              <div className="mt-5">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-white/45">
                      Monthly supply spend
                    </p>
                    <p className="mt-2 text-3xl font-black text-white">
                      {money.format(calculatorSpend)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-emerald-400/10 px-4 py-3 text-right">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-200">
                      Savings
                    </p>
                    <p className="text-2xl font-black text-emerald-200">
                      {money.format(estimatedSavings)}
                    </p>
                  </div>
                </div>
                <input
                  aria-label="Monthly supply spend"
                  className="mt-5 w-full accent-electric-500"
                  max="20000"
                  min="500"
                  onChange={(event) => setCalculatorSpend(Number(event.target.value))}
                  step="100"
                  type="range"
                  value={calculatorSpend}
                />
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="calculator-metric">
                    <span>Rate</span>
                    <strong>{Math.round(contractorRate * 100)}%</strong>
                  </div>
                  <div className="calculator-metric">
                    <span>Net</span>
                    <strong>{money.format(netSpend)}</strong>
                  </div>
                  <div className="calculator-metric">
                    <span>Tier</span>
                    <strong>{calculatorSpend >= 10000 ? "Pro" : calculatorSpend >= 5000 ? "Crew" : "Base"}</strong>
                  </div>
                </div>
                <button className="mt-5 w-full btn-primary" onClick={() => navigate("account")}>
                  Open Contractor Account
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-tight border-y border-black/10 bg-white dark:border-white/10 dark:bg-carbon/70">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs font-black uppercase tracking-[0.24em] text-black/40 dark:text-white/40">
            Trusted by fast-moving crews
          </p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {trustedSegments.map((segment, index) => (
              <div className="trusted-card" key={segment}>
                {[Building2, Factory, Zap, Home][index] &&
                  (() => {
                    const Icon = [Building2, Factory, Zap, Home][index];
                    return <Icon className="h-5 w-5 text-electric-500" />;
                  })()}
                <span>{segment}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <SectionHeading
          eyebrow="Featured categories"
          title="Electrical today. Every trade tomorrow."
          copy="The platform starts with electrical distribution and is structured for future expansion into plumbing, HVAC, tools, and job-site replenishment."
        />
        {visibleCategories.length ? (
          <div className="mx-auto grid w-full max-w-7xl gap-4 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 lg:px-8">
            {visibleCategories.map((categoryItem) => (
            <button
              className="category-card group"
              key={categoryItem.id}
              onClick={() => navigate("shop")}
              style={{ "--category-accent": categoryItem.accent }}
            >
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-black/40 dark:text-white/40">
                    {categoryItem.count} SKUs
                  </p>
                  <h3 className="mt-4 text-2xl font-black">{categoryItem.name}</h3>
                </div>
                <span className="category-icon">
                  <Plug className="h-6 w-6" />
                </span>
              </div>
              <p className="mt-8 text-sm leading-6 text-black/60 dark:text-white/60">
                {categoryItem.description}
              </p>
              <span className="mt-8 inline-flex items-center gap-2 text-sm font-black text-electric-600 dark:text-electric-300">
                View category
                <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </span>
            </button>
            ))}
          </div>
        ) : (
          <EmptyState
            copy="Categories will appear here as products become available."
            title="Categories are being updated"
          />
        )}
      </section>

      <section className="section">
        <SectionHeading
          eyebrow="Why choose us"
          title="The same supply chain advantages, without the branded-price stack."
          copy="The Plain Depot works close to manufacturer and supplier channels so contractors can buy dependable materials without paying extra for middlemen, label premiums, and slow quote loops."
        />
        <div className="mx-auto grid w-full max-w-7xl gap-4 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 lg:px-8">
          {[
            ["Local pickup", Truck, "Fast warehouse fulfillment for contractor orders."],
            ["Direct-source pricing", DollarSign, "Pricing built around manufacturer access instead of retail brand premiums."],
            ["Bulk discounts", Boxes, "Tiered volume breaks visible before checkout."],
            ["Manufacturer networks", Factory, "Products sourced from the same manufacturing channels used by branded lines."],
            ["Availability clarity", Database, "Public product availability without back-office details."],
            ["Order visibility", Route, "Customer-ready order status after checkout."],
          ].map(([title, Icon, copy]) => (
            <div className="feature-card" key={title}>
              <Icon className="h-6 w-6 text-electric-500" />
              <h3>{title}</h3>
              <p>{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section bg-white dark:bg-carbon/70">
        <SectionHeading
          eyebrow="Product availability"
          title="Check stock before the crew leaves."
          copy="Availability is presented in customer-safe terms so crews can order without back-office details."
        />
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="panel p-5 sm:p-7">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-black/50 dark:text-white/50">
                  Public storefront
                </p>
                <h3 className="text-2xl font-black">Availability overview</h3>
              </div>
              <Activity className="h-6 w-6 text-electric-500" />
            </div>
            <div className="space-y-4">
              {products.slice(0, 7).map((product) => (
                <InventoryBar key={product.id} product={product} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="cta-panel mx-auto max-w-7xl overflow-hidden p-8 text-white sm:p-12">
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.24em] text-electric-300 dark:text-electric-600">
                Contractor account platform
              </p>
              <h2 className="mt-4 text-4xl font-black tracking-normal sm:text-6xl">
                Build Faster. Source Smarter.
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-white/68">
                Launch a trade account, upload takeoff lists, build project carts,
                and get clear pickup expectations after checkout.
              </p>
            </div>
            <button className="btn-primary h-14 px-7" onClick={() => navigate("account")}>
              Open Contractor Account
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function MobileWebsiteHome({
  addToCart,
  catalogStatus,
  categories,
  navigate,
  openProduct,
  products,
}) {
  const quickProducts = products.slice(0, 4);
  const visibleCategories = categories.slice(0, 4);
  const availableCount = products.filter((product) => product.stockStatus !== "out").length;
  const limitedCount = products.filter((product) => product.stockStatus === "limited").length;
  const catalogLabel = catalogStatus.loading
    ? "Catalog loading"
    : catalogStatus.error
      ? "Catalog updating"
      : `${availableCount} available items`;
  const firstProduct = quickProducts[0];

  return (
    <section className="mobile-web-home">
      <div className="mobile-web-hero">
        <div className="mobile-web-hero-top">
          <p className="mobile-web-kicker">
            <Sparkles className="h-4 w-4" />
            Contractor supply desk
          </p>
          <span>{catalogLabel}</span>
        </div>
        <h1>Buy job-ready materials without the branded markup.</h1>
        <p>
          A phone-first supply workflow for electrical crews: browse stock,
          build an order cart, and request contractor pricing in minutes.
        </p>
        <div className="mobile-web-trust-strip">
          <span>
            <ShieldCheck className="h-4 w-4" />
            Trade pricing
          </span>
          <span>
            <Warehouse className="h-4 w-4" />
            Pickup review
          </span>
          <span>
            <Route className="h-4 w-4" />
            Order visibility
          </span>
        </div>
        <div className="mobile-web-actions">
          <button className="btn-primary" onClick={() => navigate("shop")}>
            Shop products
            <ArrowRight className="h-4 w-4" />
          </button>
          <button className="btn-secondary" onClick={() => navigate("account")}>
            Contractor account
          </button>
        </div>
        <div className="mobile-web-stats">
          <div>
            <span>Catalog</span>
            <strong>{products.length.toLocaleString()}</strong>
          </div>
          <div>
            <span>Limited stock</span>
            <strong>{limitedCount.toLocaleString()}</strong>
          </div>
        </div>
      </div>

      <div className="mobile-web-command-grid">
        <button onClick={() => navigate("shop")} type="button">
          <Search className="h-5 w-5" />
          <span>Find materials</span>
          <small>Search the electrical catalog</small>
        </button>
        <button onClick={() => navigate("account")} type="button">
          <User className="h-5 w-5" />
          <span>Trade account</span>
          <small>Save company and pickup details</small>
        </button>
      </div>

      <div className="mobile-web-card mobile-web-procurement">
        <div className="mobile-web-procurement-copy">
          <span>Procurement snapshot</span>
          <strong>20-30% markup reduction target</strong>
          <p>Built around direct-source pricing, volume tiers, and contractor order review.</p>
        </div>
        <div className="mobile-web-procurement-meter" aria-hidden="true">
          <span />
        </div>
      </div>

      {firstProduct && (
        <button className="mobile-web-featured-product" onClick={() => openProduct(firstProduct)} type="button">
          <div className="mobile-web-featured-visual">
            <ProductVisual product={firstProduct} />
          </div>
          <div>
            <span>Featured item</span>
            <strong>{firstProduct.name}</strong>
            <small>{firstProduct.availabilityLabel}</small>
          </div>
          <em>{money.format(firstProduct.price)}</em>
        </button>
      )}

      <div className="mobile-web-section mobile-web-product-section">
        <div className="mobile-web-section-title">
          <div>
            <span>Quick order</span>
            <h2>Popular materials</h2>
          </div>
          <button onClick={() => navigate("shop")}>Shop all</button>
        </div>
        <div className="mobile-web-product-list">
          {quickProducts.map((product) => (
            <div className="mobile-web-product-row" key={product.id}>
              <button onClick={() => openProduct(product)} type="button">
                <div className="mobile-web-product-visual">
                  <ProductVisual product={product} small />
                </div>
                <span>
                  <strong>{product.name}</strong>
                  <small>{product.categoryName}</small>
                </span>
              </button>
              <div>
                <strong>{money.format(product.price)}</strong>
                <small>{product.availabilityLabel}</small>
                <button onClick={() => addToCart(product, 1)} type="button">
                  <ShoppingCart className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mobile-web-section">
        <div className="mobile-web-section-title">
          <div>
            <span>Browse by trade</span>
            <h2>Electrical categories</h2>
          </div>
        </div>
        <div className="mobile-web-category-grid">
          {visibleCategories.map((categoryItem) => (
            <button key={categoryItem.id} onClick={() => navigate("shop")} type="button">
              <Plug className="h-4 w-4" />
              <span>{categoryItem.name}</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>

      <div className="mobile-web-card mobile-web-account-cta">
        <div className="mobile-web-account-icon">
          <Package className="h-5 w-5" />
        </div>
        <div>
          <strong>Ready for contractor pricing?</strong>
          <p>Open a contractor account for project carts, order history, and pickup notes.</p>
        </div>
        <button onClick={() => navigate("account")} type="button">Open</button>
      </div>
    </section>
  );
}

function ShopPage({
  addToCart,
  categories,
  catalogMaxPrice,
  category,
  filteredProducts,
  maxPrice,
  openProduct,
  search,
  setCategory,
  setMaxPrice,
  setSearch,
  setSortBy,
  sortBy,
}) {
  return (
    <section className="section shop-section">
      <div className="shop-container mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="shop-layout grid gap-5 lg:grid-cols-[340px_1fr]">
          <aside className="shop-filter-panel panel h-fit p-6 lg:sticky lg:top-28">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-electric-500">
                  Marketplace
                </p>
                <h1 className="mt-2 text-3xl font-black">Shop electrical</h1>
              </div>
              <Filter className="h-5 w-5 text-black/50 dark:text-white/50" />
            </div>

            <label className="mt-6 block">
              <span className="input-label">Search catalog</span>
              <span className="search-field mt-2">
                <Search className="h-4 w-4" />
                <input
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="GFCI, wall plate, connector..."
                  value={search}
                />
              </span>
            </label>

            <div className="mt-6">
              <span className="input-label">Category</span>
              <div className="shop-category-list mt-3 grid gap-2">
                <button
                  className={`filter-chip ${category === "all" ? "active" : ""}`}
                  onClick={() => setCategory("all")}
                >
                  All products
                </button>
                {categories.map((item) => (
                  <button
                    className={`filter-chip ${category === item.id ? "active" : ""}`}
                    key={item.id}
                    onClick={() => setCategory(item.id)}
                  >
                    <span>{item.name}</span>
                    <span>{item.count}</span>
                  </button>
                ))}
              </div>
            </div>

            <label className="mt-6 block">
              <span className="input-label">Max price: {money.format(Number(maxPrice))}</span>
              <input
                className="mt-3 w-full accent-electric-500"
                max={catalogMaxPrice}
                min="1"
                onChange={(event) => setMaxPrice(event.target.value)}
                type="range"
                value={maxPrice}
              />
            </label>

            <div className="shop-pricing-note mt-6 rounded-3xl border border-electric-500/20 bg-electric-500/10 p-4">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-electric-500" />
              <p className="text-sm font-black">Transparent pricing</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-black/60 dark:text-white/60">
                Compare contractor-ready pricing without the middle-man markup or brand-label premium.
              </p>
            </div>
          </aside>

          <div>
            <div className="shop-results-panel panel mb-5 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-black/50 dark:text-white/50">
                  {filteredProducts.length} matching SKUs
                </p>
                <h2 className="text-2xl font-black">Electrical marketplace</h2>
              </div>
              <div className="shop-sort-row flex flex-wrap gap-2">
                {sortOptions.map((option) => (
                  <button
                    className={`sort-button ${sortBy === option.id ? "active" : ""}`}
                    key={option.id}
                    onClick={() => setSortBy(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredProducts.length ? (
              <div className="product-grid grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredProducts.map((product) => (
                <ProductCard
                  addToCart={addToCart}
                  key={product.id}
                  openProduct={openProduct}
                  product={product}
                  showQuickOrder={false}
                />
                ))}
              </div>
            ) : (
              <div className="panel p-8 text-center">
                <p className="text-sm font-black uppercase tracking-[0.18em] text-electric-500">
                  Product catalog
                </p>
                <h3 className="mt-3 text-2xl font-black">No products found</h3>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-black/60 dark:text-white/60">
                  Try clearing filters or search terms. If the item is still missing, request a quote.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductPage({ addToCart, navigate, openProduct, product, products }) {
  const [quantity, setQuantity] = useState(1);
  const brandedComparisonPrice = Number((product.price * 1.4).toFixed(2));
  const comparisonDifference = Number((brandedComparisonPrice - product.price).toFixed(2));
  const gallery = product.imageGallery?.length
    ? product.imageGallery
    : product.imageUrl
      ? [product.imageUrl]
      : [];
  const [activeImage, setActiveImage] = useState(gallery[0] || "");
  const gallerySignature = gallery.join("|");
  const related = products
    .filter((item) => item.category === product.category && item.id !== product.id)
    .concat(products.filter((item) => item.category !== product.category))
    .slice(0, 3);

  useEffect(() => {
    setActiveImage(gallery[0] || "");
    setQuantity(1);
  }, [gallerySignature, product.id]);

  return (
    <section className="section product-detail-section">
      <div className="product-detail-container mx-auto grid w-full max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
        <div className="product-gallery-panel panel p-5 sm:p-6">
          <div className="product-detail-stage product-stage p-8">
            <ProductVisual imageUrl={activeImage} large product={product} />
          </div>
          {gallery.length > 1 && (
            <div className="product-thumbnail-grid mt-4 grid grid-cols-3 gap-3">
              {gallery.slice(0, 6).map((image, index) => (
                <button
                  className={`thumbnail-button ${image === activeImage ? "is-active" : ""}`}
                  key={`${image}-${index}`}
                  onClick={() => setActiveImage(image)}
                >
                  <ProductVisual imageUrl={image} product={product} small />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="product-info-stack space-y-4">
          <div className="product-purchase-panel panel p-6 sm:p-8">
            <div className="product-detail-header flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-electric-500">
                  {product.categoryName}
                </p>
                <h1 className="product-detail-title mt-3 text-4xl font-black tracking-normal sm:text-5xl">
                  {product.name}
                </h1>
              </div>
              <div className="product-price-card min-w-[130px] rounded-2xl bg-electric-500/10 px-3.5 py-2.5 text-left">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-electric-600 dark:text-electric-300">
                  Price
                </p>
                <p className="mt-0.5 whitespace-nowrap text-xl font-black">{money.format(product.price)}</p>
              </div>
            </div>

            <div className="product-metric-grid mt-6 grid gap-3 sm:grid-cols-3">
              <MetricPill icon={Star} label="Rating" value={product.rating} />
              <MetricPill
                icon={Warehouse}
                label="Available"
                value={product.availabilityLabel}
              />
              <MetricPill icon={Truck} label="Pickup" value="Warehouse review" />
            </div>

            <div className="product-purchase-row mt-7 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
              <QuantityStepper quantity={quantity} setQuantity={setQuantity} />
              <div className="product-detail-actions grid gap-3 sm:grid-cols-2">
                <button
                  className="btn-primary h-13"
                  onClick={() => {
                    addToCart(product, quantity);
                    navigate("cart");
                  }}
                >
                  <ShoppingCart className="h-5 w-5" />
                  Start order
                </button>
                <button
                  className="btn-secondary h-13"
                  onClick={() => {
                    addToCart(product, quantity);
                    navigate("shop");
                  }}
                >
                  Add more items
                </button>
              </div>
            </div>

            <div className="product-inline-benchmark mt-6 border-t border-black/10 pt-5 dark:border-white/10">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="input-label">Cost comparison</p>
                  <h2 className="mt-2 text-xl font-black">Price benchmark</h2>
                </div>
                <span className="product-savings-pill">
                  Save {money.format(comparisonDifference)} / unit
                </span>
              </div>
              <div className="cost-comparison-panel">
                <div className="cost-comparison-row">
                  <span>Branded price</span>
                  <strong>{money.format(brandedComparisonPrice)}</strong>
                </div>
                <div className="cost-comparison-row">
                  <span>Plain Depot price</span>
                  <strong>{money.format(product.price)}</strong>
                </div>
                <div className="cost-comparison-row cost-comparison-row-total">
                  <span>Difference per unit</span>
                  <strong>{money.format(comparisonDifference)}</strong>
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-black/50 dark:text-white/50">
                Prices shown per unit.
              </p>
            </div>

            <div className="product-description-panel mt-6 border-t border-black/10 pt-5 dark:border-white/10">
              <p className="input-label">Product details</p>
              <ProductDescription text={product.summary} />
            </div>
          </div>

          <div className="product-detail-support-grid grid gap-4">
            <div className="product-spec-panel panel p-6">
              <h2 className="section-card-title">Technical specs</h2>
              <div className="mt-4 divide-y divide-black/10 dark:divide-white/10">
                {Object.entries(product.specs).map(([key, value]) => (
                  <div className="flex items-center justify-between gap-4 py-3" key={key}>
                    <span className="text-sm font-semibold text-black/50 dark:text-white/50">
                      {key}
                    </span>
                    <span className="text-right text-sm font-black">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="product-related-panel panel p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="section-card-title">Related products</h2>
              <button
                className="text-sm font-black text-electric-600 dark:text-electric-300"
                onClick={() => navigate("shop")}
              >
                View all
              </button>
            </div>
            <div className="product-related-grid mt-4 grid gap-3 md:grid-cols-3">
              {related.map((item) => (
                <button
                  className="related-product"
                  key={item.id}
                  onClick={() => openProduct(item)}
                >
                  <ProductVisual product={item} small />
                  <p className="mt-3 text-sm font-black">{item.name}</p>
                  <p className="mt-1 text-sm font-bold text-electric-600 dark:text-electric-300">
                    {money.format(item.price)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductDescription({ text }) {
  const blocks = [];
  let paragraphLines = [];
  let bulletLines = [];

  function flushParagraph() {
    if (!paragraphLines.length) return;
    blocks.push({ type: "paragraph", lines: paragraphLines });
    paragraphLines = [];
  }

  function flushBullets() {
    if (!bulletLines.length) return;
    blocks.push({ type: "bullets", lines: bulletLines });
    bulletLines = [];
  }

  String(text || "")
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        flushParagraph();
        flushBullets();
        return;
      }

      const bulletMatch = trimmedLine.match(/^\*\s*(.+)$/);
      if (bulletMatch) {
        flushParagraph();
        bulletLines.push(bulletMatch[1].trim());
        return;
      }

      flushBullets();
      paragraphLines.push(trimmedLine);
    });

  flushParagraph();
  flushBullets();

  if (!blocks.length) return null;

  return (
    <div className="mt-2 space-y-3 text-base leading-7 text-black/60 dark:text-white/60">
      {blocks.map((block, index) =>
        block.type === "bullets" ? (
          <ul className="list-disc space-y-2 pl-5" key={`bullets-${index}`}>
            {block.lines.map((item, itemIndex) => (
              <li key={`${item}-${itemIndex}`}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={`paragraph-${index}`}>{block.lines.join(" ")}</p>
        ),
      )}
    </div>
  );
}

function CartPage({
  accountUser,
  cartItems,
  clearCart,
  completeProjectOrder,
  isNativeApp = false,
  navigate,
  projectOrderContext,
  removeFromCart,
  restartNativeWelcome,
  setNativeCheckoutMode,
  startHomeOrderProgress,
  subtotal,
  tax,
  total,
  updateCart,
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [zip, setZip] = useState("60607");
  const [notes, setNotes] = useState("Deliver to loading dock B. Call site foreman on arrival.");
  const [fulfillmentMethod, setFulfillmentMethod] = useState("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [checkoutDraft, setCheckoutDraft] = useState(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accountProfile, setAccountProfile] = useState(null);
  const [isSwipeCheckoutOpen, setIsSwipeCheckoutOpen] = useState(false);
  const [isOrderConfirmationOpen, setIsOrderConfirmationOpen] = useState(false);
  const [checkoutSwipeOffset, setCheckoutSwipeOffset] = useState(0);
  const [isCheckoutSwiping, setIsCheckoutSwiping] = useState(false);
  const [isCheckoutCompleting, setIsCheckoutCompleting] = useState(false);
  const checkoutSwipeStartYRef = useRef(0);
  const checkoutSwipeOffsetRef = useRef(0);
  const checkoutSwipeTargetOffsetRef = useRef(0);
  const checkoutSwipeFrameRef = useRef(null);
  const checkoutSwipeSubmitTimerRef = useRef(null);
  const checkoutSwipeSubmitOffset = 150;
  const checkoutSwipeReleaseOffset = 18;
  const checkoutSwipeCompleteDuration = 680;
  const checkoutSwipeTravelLimit =
    typeof window === "undefined" ? 720 : Math.max(720, Math.round(window.innerHeight * 1.15));
  const checkoutSwipeCompleteOffset =
    typeof window === "undefined"
      ? checkoutSwipeTravelLimit
      : Math.min(checkoutSwipeTravelLimit, Math.max(checkoutSwipeSubmitOffset, window.innerHeight * 0.92));
  const checkoutSwipeProgress = Math.min(1, checkoutSwipeOffset / checkoutSwipeSubmitOffset);
  const checkoutSwipePanelOffset = Math.min(checkoutSwipeOffset * 0.72, checkoutSwipeTravelLimit);

  useEffect(() => {
    let isMounted = true;

    async function loadCheckoutAccountProfile() {
      if (!accountUser) {
        if (isMounted) setAccountProfile(null);
        return;
      }

      try {
        const result = await getContractorProfileForCurrentUser();
        if (isMounted) setAccountProfile(result.profile);
      } catch {
        if (isMounted) setAccountProfile(null);
      }
    }

    loadCheckoutAccountProfile();

    return () => {
      isMounted = false;
    };
  }, [accountUser]);

  useEffect(() => {
    if (!isNativeApp || !setNativeCheckoutMode) return undefined;
    setNativeCheckoutMode(isSwipeCheckoutOpen || isOrderConfirmationOpen);
    return () => setNativeCheckoutMode(false);
  }, [isNativeApp, isOrderConfirmationOpen, isSwipeCheckoutOpen, setNativeCheckoutMode]);

  useEffect(() => {
    return () => {
      if (checkoutSwipeFrameRef.current) {
        window.cancelAnimationFrame(checkoutSwipeFrameRef.current);
      }
      if (checkoutSwipeSubmitTimerRef.current) {
        window.clearTimeout(checkoutSwipeSubmitTimerRef.current);
      }
    };
  }, []);

  const accountCustomer = {
    userId: accountUser?.id || accountProfile?.user_id || null,
    clientId: accountProfile?.id || accountProfile?.client_id || null,
    name:
      accountProfile?.name ||
      accountUser?.user_metadata?.name ||
      accountUser?.user_metadata?.full_name ||
      "",
    company:
      accountProfile?.company ||
      accountUser?.user_metadata?.company ||
      "",
    email: accountProfile?.email || accountUser?.email || "",
    phone:
      accountProfile?.phone ||
      accountUser?.user_metadata?.phone ||
      "",
    zip: accountProfile?.default_zip || accountProfile?.defaultZip || zip,
  };
  const useSignedInCustomer = Boolean(isNativeApp && accountUser);
  const checkoutCustomerName = useSignedInCustomer ? accountCustomer.name : name;
  const checkoutCustomerCompany = useSignedInCustomer ? accountCustomer.company : company;
  const checkoutCustomerEmail = useSignedInCustomer ? accountCustomer.email : email;
  const checkoutCustomerPhone = useSignedInCustomer ? accountCustomer.phone : phone;
  const checkoutCustomerZip = useSignedInCustomer ? accountCustomer.zip : zip;
  const isMobileOrderingLocked = Boolean(isNativeApp && !accountUser);

  async function prepareCheckout() {
    setCheckoutError("");
    setIsSubmitting(true);

    try {
      if (isNativeApp && !accountUser) {
        navigate("account");
        throw new Error("Log in before submitting an order from the app.");
      }

      if (!checkoutCustomerEmail && !checkoutCustomerName && !checkoutCustomerCompany) {
        throw new Error("Add account details before submitting this order.");
      }

      if (fulfillmentMethod === "delivery" && !deliveryAddress.trim()) {
        throw new Error("Add a delivery address before submitting this order.");
      }

      const customer = {
        userId: accountCustomer.userId,
        clientId: accountCustomer.clientId,
        name: checkoutCustomerName,
        company: checkoutCustomerCompany,
        email: checkoutCustomerEmail,
        phone: checkoutCustomerPhone,
        accountType: "contractor",
        fulfillmentMethod,
        fulfillment_method: fulfillmentMethod,
        fulfillmentLabel: fulfillmentMethod === "delivery" ? "Delivery" : "Pickup",
        pickupZip: fulfillmentMethod === "pickup" ? checkoutCustomerZip : "",
        deliveryAddress: fulfillmentMethod === "delivery" ? deliveryAddress.trim() : "",
        delivery_address: fulfillmentMethod === "delivery" ? deliveryAddress.trim() : "",
        deliveryInstructions: fulfillmentMethod === "delivery" ? deliveryInstructions.trim() : "",
        zip: checkoutCustomerZip,
        notes,
      };
      const totals = {
        subtotal: Number(subtotal.toFixed(2)),
        tax: Number(tax.toFixed(2)),
        total: Number(total.toFixed(2)),
      };

      if (!useSignedInCustomer && name && company && email) {
        await saveContractorProfile({
          name,
          company,
          email,
          phone,
          zip,
          notes,
          trade: "Electrical",
          projectType: "Order checkout",
        });
      }

      const submittedCartItems = cartItems;
      const order = await createOrderRequest({ cartItems: submittedCartItems, customer, totals });
      const checkout = await createCheckoutSessionDraft(submittedCartItems, customer);
      setCheckoutDraft({
        ...checkout,
        ...order,
        submittedItems: submittedCartItems,
        submittedTotals: totals,
        submittedItemCount: submittedCartItems.length,
      });
      checkoutSwipeOffsetRef.current = 0;
      checkoutSwipeTargetOffsetRef.current = 0;
      setCheckoutSwipeOffset(0);
      setIsCheckoutCompleting(false);
      setIsSwipeCheckoutOpen(false);
      if (isNativeApp) {
        setIsOrderConfirmationOpen(true);
        setNativeCheckoutMode?.(true);
      } else {
        setNativeCheckoutMode?.(false);
      }
      if (isNativeApp && accountUser) {
        try {
          await appendMobileOrderHistory({ order, cartItems: submittedCartItems, customer, totals });
        } catch (historyError) {
          console.warn("Unable to save mobile order history.", historyError);
        }
        startHomeOrderProgress?.({
          order,
          itemCount: submittedCartItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
          projectName: projectOrderContext?.projectName,
          totals,
        });
        if (projectOrderContext?.projectId) {
          completeProjectOrder?.(projectOrderContext.projectId, submittedCartItems);
        }
        clearCart?.();
      }
    } catch (error) {
      setIsCheckoutCompleting(false);
      setCheckoutError(
        error instanceof Error
          ? error.message
          : "Unable to submit this order.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function setSmoothCheckoutSwipeOffset(nextOffset) {
    checkoutSwipeTargetOffsetRef.current = nextOffset;
    checkoutSwipeOffsetRef.current = nextOffset;

    if (checkoutSwipeFrameRef.current) return;

    checkoutSwipeFrameRef.current = window.requestAnimationFrame(() => {
      checkoutSwipeFrameRef.current = null;
      setCheckoutSwipeOffset(checkoutSwipeTargetOffsetRef.current);
    });
  }

  function beginCheckoutScreenSwipe(event) {
    if (
      event.target?.closest?.(".native-checkout-back") ||
      isCheckoutCompleting ||
      isSubmitting ||
      !cartItems.length
    ) {
      return;
    }

    checkoutSwipeStartYRef.current = event.clientY;
    checkoutSwipeOffsetRef.current = 0;
    checkoutSwipeTargetOffsetRef.current = 0;
    if (checkoutSwipeFrameRef.current) {
      window.cancelAnimationFrame(checkoutSwipeFrameRef.current);
      checkoutSwipeFrameRef.current = null;
    }
    setCheckoutSwipeOffset(0);
    setIsCheckoutSwiping(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function updateCheckoutScreenSwipe(event) {
    if (!isCheckoutSwiping || isCheckoutCompleting || isSubmitting || !cartItems.length) return;

    const coalescedEvents = event.getCoalescedEvents?.();
    const latestPointer = coalescedEvents?.length
      ? coalescedEvents[coalescedEvents.length - 1]
      : event;
    const nextOffset = Math.max(
      0,
      Math.min(checkoutSwipeTravelLimit, checkoutSwipeStartYRef.current - latestPointer.clientY),
    );
    setSmoothCheckoutSwipeOffset(nextOffset);
  }

  function endCheckoutScreenSwipe(event) {
    if (!isCheckoutSwiping) return;

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setIsCheckoutSwiping(false);

    if (
      checkoutSwipeOffsetRef.current >= checkoutSwipeReleaseOffset &&
      !isCheckoutCompleting &&
      !isSubmitting &&
      cartItems.length
    ) {
      setIsCheckoutCompleting(true);
      checkoutSwipeTargetOffsetRef.current = checkoutSwipeCompleteOffset;
      if (checkoutSwipeFrameRef.current) {
        window.cancelAnimationFrame(checkoutSwipeFrameRef.current);
        checkoutSwipeFrameRef.current = null;
      }
      checkoutSwipeOffsetRef.current = checkoutSwipeCompleteOffset;
      setCheckoutSwipeOffset(checkoutSwipeCompleteOffset);
      checkoutSwipeSubmitTimerRef.current = window.setTimeout(() => {
        checkoutSwipeSubmitTimerRef.current = null;
        prepareCheckout();
      }, checkoutSwipeCompleteDuration);
      window.setTimeout(() => {
        checkoutSwipeOffsetRef.current = 0;
        checkoutSwipeTargetOffsetRef.current = 0;
        setCheckoutSwipeOffset(0);
      }, checkoutSwipeCompleteDuration + 420);
      return;
    }

    checkoutSwipeOffsetRef.current = 0;
    checkoutSwipeTargetOffsetRef.current = 0;
    setIsCheckoutCompleting(false);
    if (checkoutSwipeSubmitTimerRef.current) {
      window.clearTimeout(checkoutSwipeSubmitTimerRef.current);
      checkoutSwipeSubmitTimerRef.current = null;
    }
    if (checkoutSwipeFrameRef.current) {
      window.cancelAnimationFrame(checkoutSwipeFrameRef.current);
      checkoutSwipeFrameRef.current = null;
    }
    setCheckoutSwipeOffset(0);
  }

  if (isNativeApp && isOrderConfirmationOpen && checkoutDraft) {
    const confirmationItemCount =
      checkoutDraft.submittedItemCount ??
      checkoutDraft.submittedItems?.length ??
      checkoutDraft.lineItems?.length ??
      0;
    const confirmationTotal =
      checkoutDraft.submittedTotals?.total ??
      checkoutDraft.totals?.total ??
      total;

    return (
      <section className="native-order-confirmation-screen">
        <div className="native-order-confetti" aria-hidden="true">
          {Array.from({ length: 22 }).map((_, index) => (
            <span key={`confetti-${index}`} />
          ))}
        </div>

        <div className="native-order-success-mark">
          <ShieldCheck className="h-9 w-9" />
        </div>

        <div className="native-order-confirmation-copy">
          <span>Order submitted</span>
          <h1>We got your order.</h1>
          <p>
            {checkoutDraft.orderNumber || "Your project order"} has been sent to Plain Depot for review.
          </p>
        </div>

        <div className="native-order-confirmation-card">
          <SummaryLine label="Order" value={checkoutDraft.orderNumber || "Submitted"} />
          <SummaryLine label="Items" value={`${confirmationItemCount}`} />
          <SummaryLine large label="Estimated total" value={money.format(confirmationTotal)} />
        </div>

        <div className="native-order-confirmation-actions">
          <button
            onClick={() => {
              setIsOrderConfirmationOpen(false);
              setNativeCheckoutMode?.(false);
              navigate("home");
            }}
            type="button"
          >
            Back home
          </button>
          <button
            onClick={() => {
              setIsOrderConfirmationOpen(false);
              setNativeCheckoutMode?.(false);
              navigate("account");
            }}
            type="button"
          >
            View account
          </button>
        </div>
      </section>
    );
  }

  if (isNativeApp && isSwipeCheckoutOpen) {
    return (
      <section
        className={`native-checkout-confirm-screen ${isCheckoutSwiping ? "swiping" : ""} ${isCheckoutCompleting ? "completing" : ""}`}
        onPointerCancel={endCheckoutScreenSwipe}
        onPointerDown={beginCheckoutScreenSwipe}
        onPointerMove={updateCheckoutScreenSwipe}
        onPointerUp={endCheckoutScreenSwipe}
        style={{ "--checkout-swipe-progress": checkoutSwipeProgress }}
      >
        <button
          className="native-checkout-back"
          onClick={() => {
            setCheckoutError("");
            checkoutSwipeOffsetRef.current = 0;
            checkoutSwipeTargetOffsetRef.current = 0;
            setCheckoutSwipeOffset(0);
            setIsCheckoutCompleting(false);
            setIsSwipeCheckoutOpen(false);
          }}
          type="button"
        >
          <ChevronRight className="h-5 w-5" />
          Back
        </button>

        <div className="native-checkout-fading-content">
          <div className="native-checkout-confirm-copy">
            <span>Final step</span>
            <h1>Swipe up to place order</h1>
            <p>
              Drag upward anywhere on the screen to submit your cart to Plain Depot for review.
            </p>
          </div>

          <div className="native-checkout-confirm-summary">
            <SummaryLine label="Items" value={`${cartItems.length}`} />
            <SummaryLine label="Fulfillment" value={fulfillmentMethod === "delivery" ? "Delivery" : "Pickup"} />
            <SummaryLine label="Subtotal" value={money.format(subtotal)} />
            <SummaryLine label="Estimated tax" value={money.format(tax)} />
            <SummaryLine large label="Estimated total" value={money.format(total)} />
          </div>
        </div>

        <div
          className={`native-swipe-buy native-full-screen-swipe ${isSubmitting || !cartItems.length ? "disabled" : ""} ${isCheckoutCompleting ? "completing" : ""}`}
          style={{ "--checkout-panel-offset": `${checkoutSwipePanelOffset}px` }}
        >
          <div className="native-swipe-buy-copy">
            <span>Estimated total</span>
            <strong>{money.format(total)}</strong>
          </div>
          <div
            aria-label="Swipe up anywhere on screen to submit order"
            className="native-swipe-buy-track"
            role="button"
            style={{ "--swipe-progress": checkoutSwipeProgress }}
            tabIndex={isSubmitting || !cartItems.length ? -1 : 0}
          >
            <span className="native-swipe-buy-fill" />
            <span
              className="native-swipe-buy-thumb"
              style={{ transform: `translate3d(0, ${-checkoutSwipeOffset}px, 0)` }}
            >
              <ArrowRight className="h-5 w-5" />
            </span>
            <span className="native-swipe-buy-label">
              {isSubmitting || isCheckoutCompleting
                ? "Placing order..."
                : !cartItems.length
                  ? "Add items to buy"
                  : "Swipe anywhere up"}
            </span>
          </div>
        </div>

        {checkoutError && (
          <div className="native-checkout-error">
            <p>Order was not saved</p>
            <span>{checkoutError}</span>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="section">
      <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 sm:px-6 lg:grid-cols-[1fr_420px] lg:px-8">
        <div className="space-y-4">
          <div className="panel p-6">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-electric-500">
              Cart and checkout
            </p>
            <h1 className="mt-3 text-4xl font-black">
              {projectOrderContext ? "Project checkout" : "Order cart"}
            </h1>
            <p className="mt-3 max-w-2xl leading-7 text-black/60 dark:text-white/60">
              {projectOrderContext
                ? `Review materials from ${projectOrderContext.projectName || "this project"} before placing the order.`
                : "Review your materials, quantities, and checkout details before placing the order."}
            </p>
          </div>

          {cartItems.map((item) => (
            <div className="panel grid gap-4 p-5 sm:grid-cols-[120px_1fr_auto] sm:items-center" key={item.id}>
              <ProductVisual product={item} small />
              <div>
                <p className="text-lg font-black">{item.name}</p>
                <p className="mt-1 text-sm font-semibold text-black/50 dark:text-white/50">
                  {item.categoryName} | {money.format(item.price)} each | SKU {item.id}
                </p>
                <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-electric-600 dark:text-electric-300">
                  {item.availabilityLabel}
                </p>
              </div>
              <div className="flex items-center justify-between gap-4 sm:justify-end">
                <QuantityStepper
                  compact
                  quantity={item.quantity}
                  setQuantity={(quantity) => updateCart(item.id, quantity)}
                />
                <button
                  className="icon-button"
                  onClick={() => removeFromCart(item.id)}
                  title="Remove item"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <aside className="panel h-fit p-5 lg:sticky lg:top-28">
          <h2 className="text-2xl font-black">Checkout summary</h2>
          {isMobileOrderingLocked ? (
            <>
              <div className="mt-5 rounded-3xl border border-electric-500/25 bg-electric-500/10 p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-electric-500/15 text-electric-500 dark:text-electric-300">
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-black">Account required</p>
                    <p className="mt-1 text-sm leading-6 text-black/60 dark:text-white/60">
                      To be able to order, please sign in or create an account.
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3">
                  <button className="btn-primary h-12 w-full" onClick={() => navigate("account")}>
                    <LogIn className="h-5 w-5" />
                    Sign in
                  </button>
                  <button
                    className="btn-secondary h-12 w-full"
                    onClick={() => (restartNativeWelcome ? restartNativeWelcome() : navigate("account"))}
                  >
                    <User className="h-5 w-5" />
                    Create account
                  </button>
                </div>
              </div>

              <div className="mt-6 space-y-3 border-t border-black/10 pt-5 text-sm dark:border-white/10">
                <SummaryLine label="Subtotal" value={money.format(subtotal)} />
                <SummaryLine label="Estimated tax" value={money.format(tax)} />
                <SummaryLine large label="Estimated total" value={money.format(total)} />
              </div>
            </>
          ) : (
            <>
          <div className="mt-5 grid gap-3">
            {useSignedInCustomer ? (
              <div className="rounded-3xl border border-electric-500/20 bg-electric-500/10 p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-electric-500/15 text-electric-500 dark:text-electric-300">
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="input-label">Ordering as</p>
                    <h3 className="mt-1 truncate text-lg font-black">
                      {checkoutCustomerCompany || checkoutCustomerName || checkoutCustomerEmail}
                    </h3>
                    <p className="mt-1 truncate text-sm font-bold text-black/55 dark:text-white/55">
                      {checkoutCustomerEmail}
                    </p>
                    {checkoutCustomerPhone && (
                      <p className="mt-1 truncate text-sm font-bold text-black/55 dark:text-white/55">
                        {checkoutCustomerPhone}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <label>
                  <span className="input-label">Name</span>
                  <input
                    className="input-control mt-2"
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Full name"
                    value={name}
                  />
                </label>
                <label>
                  <span className="input-label">Company</span>
                  <input
                    className="input-control mt-2"
                    onChange={(event) => setCompany(event.target.value)}
                    placeholder="Company name"
                    value={company}
                  />
                </label>
                <label>
                  <span className="input-label">Email</span>
                  <input
                    className="input-control mt-2"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="orders@company.com"
                    type="email"
                    value={email}
                  />
                </label>
                <label>
                  <span className="input-label">Phone</span>
                  <input
                    className="input-control mt-2"
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="(555) 000-0000"
                    value={phone}
                  />
                </label>
                <label>
                  <span className="input-label">Pickup ZIP</span>
                  <input
                    className="input-control mt-2"
                    onChange={(event) => setZip(event.target.value)}
                    value={zip}
                  />
                </label>
              </>
            )}
            <div className="cart-fulfillment-card">
              <div className="cart-fulfillment-heading">
                <span>
                  <Truck className="h-4 w-4" />
                </span>
                <div>
                  <p className="input-label">Fulfillment</p>
                  <h3>Choose pickup or delivery</h3>
                </div>
              </div>
              <div className="cart-fulfillment-toggle">
                <button
                  className={fulfillmentMethod === "pickup" ? "active" : ""}
                  onClick={() => setFulfillmentMethod("pickup")}
                  type="button"
                >
                  <Truck className="h-4 w-4" />
                  <span>
                    <strong>Pickup</strong>
                    <small>Warehouse review</small>
                  </span>
                </button>
                <button
                  className={fulfillmentMethod === "delivery" ? "active" : ""}
                  onClick={() => setFulfillmentMethod("delivery")}
                  type="button"
                >
                  <Route className="h-4 w-4" />
                  <span>
                    <strong>Delivery</strong>
                    <small>Send to job site</small>
                  </span>
                </button>
              </div>
              {fulfillmentMethod === "pickup" ? (
                <p className="cart-fulfillment-help">
                  Plain Depot will confirm pickup timing after reviewing the order.
                </p>
              ) : (
                <div className="cart-delivery-fields">
                  <label>
                    <span className="input-label">Delivery address</span>
                    <textarea
                      className="input-control mt-2 min-h-24"
                      onChange={(event) => setDeliveryAddress(event.target.value)}
                      placeholder="Street, city, state, ZIP"
                      value={deliveryAddress}
                    />
                  </label>
                  <label>
                    <span className="input-label">Delivery instructions</span>
                    <textarea
                      className="input-control mt-2 min-h-20"
                      onChange={(event) => setDeliveryInstructions(event.target.value)}
                      placeholder="Gate code, loading dock, site contact, timing"
                      value={deliveryInstructions}
                    />
                  </label>
                </div>
              )}
            </div>
            <label>
              <span className="input-label">Order notes</span>
              <textarea
                className="input-control mt-2 min-h-28"
                onChange={(event) => setNotes(event.target.value)}
                value={notes}
              />
            </label>
          </div>

          <div className="mt-6 space-y-3 border-t border-black/10 pt-5 text-sm dark:border-white/10">
            <SummaryLine label="Fulfillment" value={fulfillmentMethod === "delivery" ? "Delivery" : "Pickup"} />
            <SummaryLine label="Subtotal" value={money.format(subtotal)} />
            <SummaryLine label="Estimated tax" value={money.format(tax)} />
            <SummaryLine large label="Estimated total" value={money.format(total)} />
          </div>

          {isNativeApp ? (
            <button
              className="native-place-order-button"
              disabled={isSubmitting || !cartItems.length}
              onClick={() => {
                setCheckoutError("");
                if (fulfillmentMethod === "delivery" && !deliveryAddress.trim()) {
                  setCheckoutError("Add a delivery address before submitting this order.");
                  return;
                }
                setIsSwipeCheckoutOpen(true);
              }}
              type="button"
            >
              <CreditCard className="h-5 w-5" />
              {isSubmitting ? "Sending order..." : "Place order"}
            </button>
          ) : (
            <div className="mt-6 grid gap-3">
              <button
                className="btn-primary h-13 disabled:cursor-not-allowed disabled:opacity-55"
                disabled={isSubmitting || !cartItems.length}
                onClick={prepareCheckout}
              >
                <CreditCard className="h-5 w-5" />
                {isSubmitting ? "Sending order..." : "Submit order request"}
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button className="btn-secondary h-12">
                  <Smartphone className="h-4 w-4" />
                  Apple Pay
                </button>
                <button className="btn-secondary h-12">
                  <CreditCard className="h-4 w-4" />
                  Google Pay
                </button>
              </div>
            </div>
          )}

          {checkoutDraft && (
            <div className="mt-4 rounded-3xl border border-electric-500/25 bg-electric-500/10 p-4 text-sm">
              <p className="font-black">Order received</p>
              <p className="mt-1 text-black/60 dark:text-white/60">
                {checkoutDraft.orderNumber} has been submitted. Our team will review it and follow up.
              </p>
            </div>
          )}

          {checkoutError && (
            <div className="mt-4 rounded-3xl border border-red-500/25 bg-red-500/10 p-4 text-sm">
              <p className="font-black text-red-500">Order was not saved</p>
              <p className="mt-1 text-black/60 dark:text-white/60">{checkoutError}</p>
            </div>
          )}

          {enableNativeProjects && (
            <button
              className="mt-4 w-full text-sm font-black text-electric-600 dark:text-electric-300"
              onClick={() => navigate("account")}
            >
              Save as contractor project list
            </button>
          )}
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

function SwipeSubmitControl({ disabled, isSubmitting, label = "Swipe up to place order", onComplete, total }) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const maxOffset = 92;
  const progress = Math.min(1, dragOffset / maxOffset);

  function beginSwipe(event) {
    if (disabled) return;
    startYRef.current = event.clientY;
    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function updateSwipe(event) {
    if (!isDragging || disabled) return;
    const nextOffset = Math.max(0, Math.min(maxOffset, startYRef.current - event.clientY));
    setDragOffset(nextOffset);
  }

  function endSwipe(event) {
    if (!isDragging) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setIsDragging(false);
    if (progress >= 0.78 && !disabled) {
      setDragOffset(maxOffset);
      onComplete();
      window.setTimeout(() => setDragOffset(0), 420);
      return;
    }
    setDragOffset(0);
  }

  return (
    <div className={`native-swipe-buy ${disabled ? "disabled" : ""} ${isDragging ? "dragging" : ""}`}>
      <div className="native-swipe-buy-copy">
        <span>Estimated total</span>
        <strong>{money.format(total)}</strong>
      </div>
      <div
        aria-label="Swipe up to submit order"
        className="native-swipe-buy-track"
        onPointerCancel={endSwipe}
        onPointerDown={beginSwipe}
        onPointerMove={updateSwipe}
        onPointerUp={endSwipe}
        role="button"
        style={{ "--swipe-progress": progress }}
        tabIndex={disabled ? -1 : 0}
      >
        <span className="native-swipe-buy-fill" />
        <span
          className="native-swipe-buy-thumb"
          style={{ transform: `translateY(${-dragOffset}px)` }}
        >
          <ArrowRight className="h-5 w-5" />
        </span>
        <span className="native-swipe-buy-label">
          {isSubmitting ? "Sending order..." : disabled ? "Add items to buy" : label}
        </span>
      </div>
    </div>
  );
}

function AccountPage({
  accountUser,
  cartItems = [],
  isNativeApp = false,
  navigate,
  products = [],
  projects = [],
  restartNativeWelcome,
  setAccountUser,
}) {
  const accountSteps = [
    {
      icon: ShieldCheck,
      title: "Account review",
      copy: "Company details are reviewed before trade terms are attached to the account.",
    },
    {
      icon: DollarSign,
      title: "Trade pricing",
      copy: "Requested volume and project type help route the account for proper pricing.",
    },
    {
      icon: ClipboardList,
      title: "Project-ready profile",
      copy: "Job-site ZIP, contact details, and notes stay connected for future orders.",
    },
  ];
  const [profileForm, setProfileForm] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    zip: "",
    projectType: "Commercial trim-out",
    monthlyVolume: "$2,500 - $10,000",
    notes: "",
    termsAccepted: false,
  });
  const [profileStatus, setProfileStatus] = useState("");
  const [profileError, setProfileError] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
  });
  const [loginStatus, setLoginStatus] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [contractorProfile, setContractorProfile] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadContractorProfile() {
      if (!accountUser) {
        setContractorProfile(null);
        return;
      }

      try {
        const result = await getContractorProfileForCurrentUser();
        if (isMounted) setContractorProfile(result.profile);
      } catch {
        if (isMounted) setContractorProfile(null);
      }
    }

    loadContractorProfile();

    return () => {
      isMounted = false;
    };
  }, [accountUser]);

  function updateProfileField(field, value) {
    setProfileForm((current) => ({ ...current, [field]: value }));
  }

  function updateLoginField(field, value) {
    setLoginForm((current) => ({ ...current, [field]: value }));
  }

  async function submitAccountLogin(event) {
    event.preventDefault();
    setLoginStatus("");
    setLoginError("");
    setIsLoggingIn(true);

    try {
      if (!loginForm.email.trim()) throw new Error("Enter your email.");
      if (!loginForm.password) throw new Error("Enter your password.");

      const result = await signInContractorAccount({
        email: loginForm.email.trim(),
        password: loginForm.password,
      });

      setAccountUser(result.user);
      let loadedProfile = null;
      try {
        const profileResult = await getContractorProfileForCurrentUser();
        loadedProfile = profileResult.profile;
        setContractorProfile(loadedProfile);
      } catch {
        setContractorProfile(null);
      }
      if (isNativeApp) {
        syncMobileProfileState(loadedProfile).catch((syncError) => {
          console.warn("Unable to sync mobile profile state.", syncError);
        });
        navigate("home");
      }
      setLoginStatus("Signed in. This account now works on the website and app.");
      setLoginForm({ email: "", password: "" });
    } catch (error) {
      setLoginError(
        error instanceof Error
          ? error.message
          : "Unable to sign in.",
      );
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function signOutAccount() {
    setLoginStatus("");
    setLoginError("");

    try {
      await signOutContractorAccount();
      setAccountUser(null);
      setContractorProfile(null);
      setLoginStatus("Signed out.");
    } catch (error) {
      setLoginError(
        error instanceof Error
          ? error.message
          : "Unable to sign out.",
      );
    }
  }

  async function submitContractorProfile(event) {
    event.preventDefault();
    setProfileStatus("");
    setProfileError("");
    setIsSavingProfile(true);

    try {
      if (profileForm.password.length < 8) {
        throw new Error("Use at least 8 characters for the password.");
      }
      if (profileForm.password !== profileForm.confirmPassword) {
        throw new Error("Passwords do not match.");
      }
      if (!profileForm.termsAccepted) {
        throw new Error("Accept the account terms to continue.");
      }

      const result = await createContractorAccount({
        ...profileForm,
        trade: "Electrical",
      });
      const currentSession = await getCurrentContractorSession();
      const createdUser = result.user ?? currentSession.user;
      const createdProfile = {
        name: profileForm.name,
        company: profileForm.company,
        email: profileForm.email,
        phone: profileForm.phone,
        trade: "Electrical",
        project_type: profileForm.projectType,
        default_zip: profileForm.zip,
        status: "new",
      };
      setAccountUser(createdUser);
      setContractorProfile(createdProfile);
      if (isNativeApp && createdUser) {
        syncMobileProfileState(createdProfile).catch((syncError) => {
          console.warn("Unable to sync mobile profile state.", syncError);
        });
        navigate("home");
      }
      setProfileStatus(
        createdUser
          ? "Account created and signed in. This account now works on the website and app."
          : result.authWarning
            ? `Account request saved. Sign-in setup needs review: ${result.authWarning}`
            : "Account request submitted. We will review it and follow up shortly.",
      );
      setProfileForm({
        name: "",
        company: "",
        email: "",
        phone: "",
        password: "",
        confirmPassword: "",
        zip: "",
        projectType: "Commercial trim-out",
        monthlyVolume: "$2,500 - $10,000",
        notes: "",
        termsAccepted: false,
      });
    } catch (error) {
      setProfileError(
        error instanceof Error
          ? error.message
          : "Unable to create this account.",
      );
    } finally {
      setIsSavingProfile(false);
    }
  }

  const accountDisplayName =
    contractorProfile?.name ||
    accountUser?.user_metadata?.name ||
    accountUser?.user_metadata?.full_name ||
    accountUser?.email?.split("@")[0] ||
    "Contractor";
  const accountCompany =
    contractorProfile?.company ||
    accountUser?.user_metadata?.company ||
    "Company profile pending";
  const accountInitials = accountDisplayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "PD";
  const accountCartTotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const accountProjectTotals = projects.map((project) => {
    const total = (project.items || []).reduce((sum, line) => {
      const product = products.find((item) => item.id === line.productId);
      return sum + (product?.price || 0) * line.quantity;
    }, 0);
    return {
      ...project,
      total,
      savings: Math.max(0, total * 0.28),
    };
  });
  const accountSavedListSavings = accountProjectTotals.reduce(
    (sum, project) => sum + project.savings,
    0,
  );
  const accountCartSavings = accountCartTotal * 0.28;
  const accountTrackedSavings = accountCartSavings + (enableNativeProjects ? accountSavedListSavings : 0);
  const webAccountDetails = [
    ["Name", accountDisplayName],
    ["Company", accountCompany],
    ["Email", contractorProfile?.email || accountUser?.email || "Not provided"],
    ["Phone", contractorProfile?.phone || accountUser?.user_metadata?.phone || "Not provided"],
    ["Trade", contractorProfile?.trade || accountUser?.user_metadata?.trade || "Electrical"],
    ["Project type", contractorProfile?.project_type || contractorProfile?.projectType || "Not provided"],
    ["Default ZIP", contractorProfile?.default_zip || contractorProfile?.defaultZip || "Not provided"],
    ["Account status", contractorProfile?.status || "Active"],
  ];

  if (isNativeApp) {
    return (
      <section className="native-account-screen">
        <div className="native-screen">
          {accountUser ? (
            <>
              <div className="native-account-card native-account-hero">
                <div className="native-account-topline">
                  <div className="native-account-avatar native-account-avatar-text">
                    {accountInitials}
                  </div>
                  <span className="native-account-state">
                    <ShieldCheck className="h-4 w-4" />
                    Active
                  </span>
                </div>
                <p className="native-kicker">Contractor account</p>
                <h1>{accountDisplayName}</h1>
                <p className="native-account-copy">{accountCompany}</p>
                <div className="native-account-email">
                  <span>Email</span>
                  <strong>{accountUser.email}</strong>
                </div>
              </div>

              <div className="native-account-metrics">
                <div>
                  <span>Status</span>
                  <strong>Active</strong>
                </div>
                <div>
                  <span>Terms</span>
                  <strong>Review</strong>
                </div>
                <div>
                  <span>Trade</span>
                  <strong>Electrical</strong>
                </div>
              </div>

              <div className="native-account-card native-savings-card">
                <div className="native-section-title">
                  <h2>Savings Tracker</h2>
                </div>
                <div className="native-savings-total">
                  <span>Tracked Plain Depot savings</span>
                  <strong>{money.format(accountTrackedSavings)}</strong>
                  <small>
                    {enableNativeProjects
                      ? "Based on saved project lists plus the current cart against branded markup."
                      : "Based on the current cart against branded markup."}
                  </small>
                </div>
                <div className="native-savings-bars">
                  <div>
                    <span>Current cart</span>
                    <strong>{money.format(accountCartSavings)}</strong>
                  </div>
                  {enableNativeProjects ? (
                    <>
                      <div>
                        <span>Saved lists</span>
                        <strong>{money.format(accountSavedListSavings)}</strong>
                      </div>
                      <div>
                        <span>Lists</span>
                        <strong>{projects.length}</strong>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <span>Cart items</span>
                        <strong>{cartItems.length}</strong>
                      </div>
                      <div>
                        <span>Status</span>
                        <strong>Ready</strong>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="native-account-card">
                <div className="native-section-title">
                  <h2>Account details</h2>
                </div>
                <div className="native-account-detail-list">
                  <div>
                    <span>Company</span>
                    <strong>{accountCompany}</strong>
                  </div>
                  <div>
                    <span>Account type</span>
                    <strong>Contractor</strong>
                  </div>
                  <div>
                    <span>Price access</span>
                    <strong>Pending review</strong>
                  </div>
                  <div>
                    <span>Fulfillment</span>
                    <strong>Warehouse pickup</strong>
                  </div>
                </div>
              </div>

              <div className="native-account-card">
                <div className="native-section-title">
                  <h2>Support</h2>
                </div>
                <div className="native-account-list">
                  <button type="button">
                    <ShieldCheck className="h-5 w-5" />
                    <span>Account review status</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button type="button">
                    <Truck className="h-5 w-5" />
                    <span>Pickup preferences</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={signOutAccount}>
                    <LogIn className="h-5 w-5" />
                    <span>Sign out</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {loginStatus && <div className="native-login-message">{loginStatus}</div>}
              {loginError && <div className="native-login-message error">{loginError}</div>}
            </>
          ) : (
            <div className="native-account-card">
              <div className="native-account-avatar">
                <User className="h-8 w-8" />
              </div>
              <p className="native-kicker">Account</p>
              <h1>Login</h1>
              <p className="native-account-copy">
                Sign in with the same account you use on the website or create a new contractor account.
              </p>
              <form className="native-login-form native-account-login" onSubmit={submitAccountLogin}>
                <label>
                  <span>Email</span>
                  <input
                    autoComplete="email"
                    inputMode="email"
                    onChange={(event) => updateLoginField("email", event.target.value)}
                    placeholder="you@company.com"
                    type="email"
                    value={loginForm.email}
                  />
                </label>
                <label>
                  <span>Password</span>
                  <input
                    autoComplete="current-password"
                    onChange={(event) => updateLoginField("password", event.target.value)}
                    placeholder="Password"
                    type="password"
                    value={loginForm.password}
                  />
                </label>
                <button className="native-welcome-primary" disabled={isLoggingIn} type="submit">
                  {isLoggingIn ? "Signing in..." : "Login"}
                </button>
                <button
                  className="native-welcome-secondary"
                  onClick={restartNativeWelcome}
                  type="button"
                >
                  Create account
                </button>
              </form>
              {loginStatus && <div className="native-login-message">{loginStatus}</div>}
              {loginError && <div className="native-login-message error">{loginError}</div>}
            </div>
          )}
        </div>
      </section>
    );
  }

  if (accountUser) {
    return (
      <section className="section">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.55fr)] lg:items-start">
            <div className="space-y-5">
              <div className="account-intro-panel panel overflow-hidden p-6 sm:p-8 lg:p-9">
                <div className="relative z-10">
                  <p className="account-eyebrow">Contractor account</p>
                  <h1 className="mt-4 max-w-2xl text-4xl font-black leading-tight tracking-normal sm:text-5xl">
                    {accountDisplayName}
                  </h1>
                  <p className="mt-4 max-w-2xl text-base leading-8 text-black/60 dark:text-white/60">
                    Your Plain Depot contractor profile is signed in and connected for website and mobile ordering.
                  </p>
                  <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                    <button className="btn-primary h-12 px-6" onClick={() => navigate("shop")}>
                      Browse catalog
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    <button className="btn-secondary h-12 px-6" onClick={signOutAccount}>
                      Sign out
                    </button>
                  </div>
                </div>
              </div>

              <div className="panel p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="account-eyebrow">Profile details</p>
                    <h2 className="mt-2 text-2xl font-black">Account information</h2>
                  </div>
                  <span className="account-badge">
                    {contractorProfile?.status || "Active"}
                  </span>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {webAccountDetails.map(([label, value]) => (
                    <div
                      className="rounded-2xl border border-black/10 bg-black/[0.03] p-4 dark:border-white/10 dark:bg-white/[0.04]"
                      key={label}
                    >
                      <span className="input-label">{label}</span>
                      <strong className="mt-1 block break-words text-base font-black">
                        {value}
                      </strong>
                    </div>
                  ))}
                </div>
                {contractorProfile?.notes && (
                  <div className="mt-3 rounded-2xl border border-black/10 bg-black/[0.03] p-4 dark:border-white/10 dark:bg-white/[0.04]">
                    <span className="input-label">Notes</span>
                    <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-black/65 dark:text-white/65">
                      {contractorProfile.notes}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <aside className="space-y-4 lg:sticky lg:top-28">
              <div className="panel p-5 sm:p-7">
                <div className="flex items-start gap-4">
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-electric-500 text-lg font-black text-white">
                    {accountInitials}
                  </div>
                  <div className="min-w-0">
                    <p className="account-eyebrow">Signed in</p>
                    <h2 className="mt-1 break-words text-2xl font-black">{accountDisplayName}</h2>
                    <p className="mt-1 break-words text-sm font-bold text-black/55 dark:text-white/55">
                      {accountUser.email}
                    </p>
                  </div>
                </div>
              </div>

              <div className="panel p-5 sm:p-7">
                <p className="account-eyebrow">Ordering</p>
                <h2 className="mt-2 text-2xl font-black">Current cart</h2>
                <div className="mt-5 grid gap-3">
                  <SummaryLine label="Items" value={cartItems.length.toString()} />
                  <SummaryLine label="Cart total" value={money.format(accountCartTotal)} />
                  <SummaryLine label="Tracked savings" value={money.format(accountCartSavings)} />
                </div>
                <button className="btn-primary mt-5 h-12 w-full" onClick={() => navigate(cartItems.length ? "cart" : "shop")}>
                  {cartItems.length ? "Review cart" : "Start order"}
                </button>
              </div>

              {loginStatus && (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm font-bold text-emerald-600 dark:text-emerald-300">
                  {loginStatus}
                </div>
              )}
              {loginError && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm font-bold text-red-500">
                  {loginError}
                </div>
              )}
            </aside>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.86fr)_minmax(420px,1fr)] lg:items-start">
          <div className="space-y-5">
            <div className="account-intro-panel panel overflow-hidden p-6 sm:p-8 lg:p-9">
              <div className="relative z-10">
                <p className="account-eyebrow">
                  Contractor account
                </p>
                <h1 className="mt-4 max-w-xl text-4xl font-black leading-tight tracking-normal sm:text-5xl">
                  Create your trade account
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-8 text-black/60 dark:text-white/60">
                  Apply for a Plain Depot contractor account with a secure login,
                  company profile, and account review details in one clean setup.
                </p>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <button className="btn-primary h-12 px-6" onClick={() => navigate("shop")}>
                    Browse catalog
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <span className="account-badge">
                    Review within 24 hours
                  </span>
                </div>
              </div>
            </div>

            <div className="panel p-5 sm:p-6">
              <h2 className="section-card-title">Account setup</h2>
              <div className="mt-5 grid gap-3">
                {accountSteps.map(({ copy, icon: Icon, title }) => (
                  <div className="account-step" key={title}>
                    <span className="account-step-icon">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h3>{title}</h3>
                      <p>{copy}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="lg:sticky lg:top-28">
            <div className="panel mb-4 p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="account-eyebrow">Shared login</p>
                  <h2 className="mt-2 text-2xl font-black">
                    {accountUser ? "Account signed in" : "Login"}
                  </h2>
                </div>
                <LogIn className="h-6 w-6 text-electric-500" />
              </div>
              {accountUser ? (
                <div className="mt-5">
                  <p className="rounded-2xl bg-electric-500/10 p-4 text-sm font-black text-electric-600 dark:text-electric-300">
                    {accountUser.email}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-black/60 dark:text-white/60">
                    This same account can be used in the website and the mobile app.
                  </p>
                  <button className="btn-secondary mt-4 h-12 w-full" onClick={signOutAccount}>
                    Sign out
                  </button>
                </div>
              ) : (
                <form className="mt-5 grid gap-3" onSubmit={submitAccountLogin}>
                  <label>
                    <span className="input-label">Email</span>
                    <input
                      autoComplete="email"
                      className="input-control mt-2"
                      inputMode="email"
                      onChange={(event) => updateLoginField("email", event.target.value)}
                      placeholder="you@company.com"
                      type="email"
                      value={loginForm.email}
                    />
                  </label>
                  <label>
                    <span className="input-label">Password</span>
                    <input
                      autoComplete="current-password"
                      className="input-control mt-2"
                      onChange={(event) => updateLoginField("password", event.target.value)}
                      placeholder="Password"
                      type="password"
                      value={loginForm.password}
                    />
                  </label>
                  <button className="btn-primary h-12" disabled={isLoggingIn} type="submit">
                    {isLoggingIn ? "Signing in..." : "Login"}
                  </button>
                </form>
              )}
              {loginStatus && (
                <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm font-bold text-emerald-600 dark:text-emerald-300">
                  {loginStatus}
                </div>
              )}
              {loginError && (
                <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm font-bold text-red-500">
                  {loginError}
                </div>
              )}
            </div>

            <form className="panel p-5 sm:p-7" onSubmit={submitContractorProfile}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="account-eyebrow">
                    Secure signup
                  </p>
                  <h2 className="mt-2 text-2xl font-black">Create account</h2>
                </div>
                <ShieldCheck className="h-6 w-6 text-electric-500" />
              </div>
              <p className="mt-2 text-sm leading-6 text-black/60 dark:text-white/60">
                Create a secure login and contractor profile for account review.
              </p>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <label>
                  <span className="input-label">Full name</span>
                  <input
                    className="input-control mt-2"
                    autoComplete="name"
                    onChange={(event) => updateProfileField("name", event.target.value)}
                    placeholder="First and last name"
                    required
                    value={profileForm.name}
                  />
                </label>
                <label>
                  <span className="input-label">Company</span>
                  <input
                    className="input-control mt-2"
                    autoComplete="organization"
                    onChange={(event) => updateProfileField("company", event.target.value)}
                    placeholder="Business name"
                    required
                    value={profileForm.company}
                  />
                </label>
                <label>
                  <span className="input-label">Work email</span>
                  <input
                    className="input-control mt-2"
                    autoComplete="email"
                    onChange={(event) => updateProfileField("email", event.target.value)}
                    placeholder="orders@company.com"
                    required
                    type="email"
                    value={profileForm.email}
                  />
                </label>
                <label>
                  <span className="input-label">Phone</span>
                  <input
                    className="input-control mt-2"
                    autoComplete="tel"
                    onChange={(event) => updateProfileField("phone", event.target.value)}
                    placeholder="(555) 000-0000"
                    value={profileForm.phone}
                  />
                </label>
                <label>
                  <span className="input-label">Password</span>
                  <input
                    className="input-control mt-2"
                    autoComplete="new-password"
                    minLength={8}
                    onChange={(event) => updateProfileField("password", event.target.value)}
                    placeholder="8+ characters"
                    required
                    type="password"
                    value={profileForm.password}
                  />
                </label>
                <label>
                  <span className="input-label">Confirm password</span>
                  <input
                    className="input-control mt-2"
                    autoComplete="new-password"
                    minLength={8}
                    onChange={(event) => updateProfileField("confirmPassword", event.target.value)}
                    placeholder="Repeat password"
                    required
                    type="password"
                    value={profileForm.confirmPassword}
                  />
                </label>
                <label>
                  <span className="input-label">Default ZIP</span>
                  <input
                    className="input-control mt-2"
                    autoComplete="postal-code"
                    onChange={(event) => updateProfileField("zip", event.target.value)}
                    placeholder="60607"
                    value={profileForm.zip}
                  />
                </label>
                <label>
                  <span className="input-label">Project type</span>
                  <select
                    className="input-control mt-2"
                    onChange={(event) => updateProfileField("projectType", event.target.value)}
                    value={profileForm.projectType}
                  >
                    <option>Commercial trim-out</option>
                    <option>Multifamily renovation</option>
                    <option>Service work</option>
                    <option>Property management</option>
                  </select>
                </label>
                <label className="md:col-span-2">
                  <span className="input-label">Monthly material volume</span>
                  <select
                    className="input-control mt-2"
                    onChange={(event) => updateProfileField("monthlyVolume", event.target.value)}
                    value={profileForm.monthlyVolume}
                  >
                    <option>Under $2,500</option>
                    <option>$2,500 - $10,000</option>
                    <option>$10,000 - $50,000</option>
                    <option>$50,000+</option>
                  </select>
                </label>
                <label className="md:col-span-2">
                  <span className="input-label">Notes</span>
                  <textarea
                    className="input-control mt-2 min-h-24"
                    onChange={(event) => updateProfileField("notes", event.target.value)}
                    placeholder="Preferred pickup window, job-site notes, or quote needs"
                    value={profileForm.notes}
                  />
                </label>
                <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:col-span-2">
                  <input
                    className="mt-1 h-4 w-4 accent-electric-500"
                    checked={profileForm.termsAccepted}
                    onChange={(event) => updateProfileField("termsAccepted", event.target.checked)}
                    required
                    type="checkbox"
                  />
                  <span className="text-sm font-semibold leading-6 text-white/65">
                    I agree that The Plain Depot may review this account request,
                    contact me about trade terms, and save this company profile.
                  </span>
                </label>
              </div>
              <button
                className="btn-primary mt-5 h-12 w-full disabled:cursor-not-allowed disabled:opacity-55"
                disabled={isSavingProfile}
                type="submit"
              >
                {isSavingProfile ? "Creating account..." : "Create contractor account"}
              </button>
              {profileStatus && (
                <p className="mt-3 rounded-2xl bg-emerald-500/10 p-3 text-sm font-bold text-emerald-500">
                  {profileStatus}
                </p>
              )}
              {profileError && (
                <p className="mt-3 rounded-2xl bg-red-500/10 p-3 text-sm font-bold text-red-500">
                  {profileError}
                </p>
              )}
            </form>
          </aside>
        </div>
      </div>
    </section>
  );
}

function ProductCard({ addToCart, openProduct, product, showQuickOrder = true, wide = false }) {
  const limitedAvailability = product.stockStatus === "limited";

  return (
    <motion.article
      className={`product-card ${wide ? "min-w-[320px] sm:min-w-[380px]" : ""}`}
      whileTap={{ scale: 0.985 }}
      whileHover={{ y: -3 }}
      transition={{ damping: 28, stiffness: 320, type: "spring" }}
    >
      <button className="product-card-main" onClick={() => openProduct(product)}>
        <div className="product-stage p-5">
          <ProductVisual product={product} />
        </div>
        <div className="product-card-summary">
          <div className="min-w-0">
            <p className="product-card-category text-xs font-black uppercase tracking-[0.18em] text-electric-500">
              {product.categoryName}
            </p>
            <h3 className="product-card-title" title={product.name}>{product.name}</h3>
          </div>
          <span className="product-rating-pill">
            {product.rating}
          </span>
        </div>
      </button>

      <div className="product-card-footer">
        <div className="product-card-price-row">
          <div className="min-w-0">
            <p className="product-card-price text-2xl font-black">{money.format(product.price)}</p>
            <p className="product-card-sku text-xs font-bold text-black/50 dark:text-white/50">
              SKU {product.id}
            </p>
          </div>
          <span
            className={`product-stock-pill ${
              limitedAvailability
                ? "bg-red-500/10 text-red-500"
                : "bg-emerald-500/10 text-emerald-500"
            }`}
          >
            {product.availabilityLabel}
          </span>
        </div>
        <div className={`product-card-actions ${showQuickOrder ? "" : "single-action"}`}>
          <button className="product-card-add-button btn-primary h-11" onClick={() => addToCart(product, 1)}>
            <ShoppingCart className="h-4 w-4" />
            Add to cart
          </button>
          {showQuickOrder && (
            <button className="btn-secondary h-11" onClick={() => addToCart(product, 24)}>
              Quick Order
            </button>
          )}
        </div>
      </div>
    </motion.article>
  );
}

function ProductVisual({ imageUrl: imageUrlOverride = "", large = false, product, small = false }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageFit, setImageFit] = useState("is-square");
  const imageUrl = String(imageUrlOverride || product.imageUrl || "").trim();
  const showImage = imageUrl && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
    setImageFit("is-square");
  }, [imageUrl]);

  return (
    <div
      className={`product-visual ${large ? "large" : ""} ${small ? "small" : ""}`}
      style={{ "--product-accent": product.accent }}
    >
      {showImage ? (
        <img
          alt={product.name}
          className={`product-image ${imageFit}`}
          loading="lazy"
          onError={() => setImageFailed(true)}
          onLoad={(event) => {
            const { naturalHeight, naturalWidth } = event.currentTarget;
            if (!naturalHeight || !naturalWidth) return;
            const ratio = naturalWidth / naturalHeight;
            const nextFit = ratio < 0.82 ? "is-portrait" : ratio > 1.18 ? "is-landscape" : "is-square";
            setImageFit((currentFit) => (currentFit === nextFit ? currentFit : nextFit));
          }}
          src={imageUrl}
        />
      ) : (
        <div className={`device-render ${product.imageType}`}>
          <span className="device-glow" />
          <span className="device-screw top" />
          <span className="device-screw bottom" />
          <span className="device-face upper" />
          <span className="device-face lower" />
          <span className="device-switch" />
          <span className="connector-bars" />
          <span className="plate-opening" />
          <span className="jobpack-lines" />
        </div>
      )}
    </div>
  );
}

function EmptyState({ copy, title }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="panel p-8 text-center">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-electric-500">
          Storefront
        </p>
        <h3 className="mt-3 text-2xl font-black">{title}</h3>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-black/60 dark:text-white/60">
          {copy}
        </p>
      </div>
    </div>
  );
}

function EmptyCatalogPage({ navigate }) {
  return (
    <section className="section">
      <div className="mx-auto w-full max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <div className="panel p-8 sm:p-10">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-electric-500">
            Product catalog
          </p>
          <h1 className="mt-3 text-4xl font-black">No live product selected</h1>
          <p className="mx-auto mt-4 max-w-2xl leading-7 text-black/60 dark:text-white/60">
            Product details are temporarily unavailable. Return to the shop or request a quote.
          </p>
          <button className="btn-primary mt-6" onClick={() => navigate("shop")}>
            Back to shop
          </button>
        </div>
      </div>
    </section>
  );
}

function InventoryBar({ compact = false, product }) {
  const percent = product.stock;
  const limitedAvailability = product.stockStatus === "limited";

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className={`${compact ? "text-xs" : "text-sm"} font-black`}>{product.name}</p>
        <p
          className={`${compact ? "text-xs" : "text-sm"} font-black ${
            limitedAvailability ? "text-red-400" : "text-emerald-400"
          }`}
        >
          {product.availabilityLabel}
        </p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div
          className={`h-full rounded-full ${limitedAvailability ? "bg-red-400" : "bg-electric-500"}`}
          style={{ width: `${Math.max(6, percent)}%` }}
        />
      </div>
      {!compact && limitedAvailability && (
        <p className="mt-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-red-500">
          <AlertTriangle className="h-3.5 w-3.5" />
          {product.availabilityLabel}
        </p>
      )}
    </div>
  );
}

function SectionHeading({ copy, eyebrow, title }) {
  return (
    <div className="mx-auto mb-10 grid w-full max-w-7xl gap-5 px-4 sm:px-6 lg:grid-cols-[0.86fr_0.55fr] lg:items-end lg:px-8">
      <div>
        <p className="text-sm font-black uppercase tracking-[0.22em] text-electric-600 dark:text-electric-300">
          {eyebrow}
        </p>
        <h2 className="mt-4 text-4xl font-black leading-tight tracking-normal sm:text-5xl">
          {title}
        </h2>
      </div>
      <p className="text-base leading-8 text-black/60 dark:text-white/60">{copy}</p>
    </div>
  );
}

function QuantityStepper({ compact = false, quantity, setQuantity }) {
  const [draftQuantity, setDraftQuantity] = useState(String(quantity));

  useEffect(() => {
    setDraftQuantity(String(quantity));
  }, [quantity]);

  function updateQuantity(value) {
    const numericValue = Number.parseInt(String(value), 10);
    const nextQuantity = Number.isFinite(numericValue) ? Math.max(1, numericValue) : 1;
    setQuantity(nextQuantity);
    setDraftQuantity(String(nextQuantity));
  }

  function handleQuantityInput(event) {
    const nextDraft = event.target.value.replace(/\D/g, "");
    setDraftQuantity(nextDraft);
    if (nextDraft) {
      setQuantity(Math.max(1, Number.parseInt(nextDraft, 10)));
    }
  }

  return (
    <div className={`quantity-stepper ${compact ? "compact" : ""}`}>
      <button type="button" onClick={() => updateQuantity(quantity - 1)}>
        <Minus className="h-4 w-4" />
      </button>
      <input
        aria-label="Quantity"
        inputMode="numeric"
        min="1"
        onBlur={() => updateQuantity(draftQuantity)}
        onChange={handleQuantityInput}
        type="number"
        value={draftQuantity}
      />
      <button type="button" onClick={() => updateQuantity(quantity + 1)}>
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

function MetricPill({ icon: Icon, label, value }) {
  return (
    <div className="metric-pill">
      <Icon className="h-4 w-4 text-electric-500" />
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function SummaryLine({ label, large = false, value }) {
  return (
    <div className={`flex items-center justify-between ${large ? "pt-3 text-lg" : ""}`}>
      <span className="font-semibold text-black/50 dark:text-white/50">{label}</span>
      <span className="font-black">{value}</span>
    </div>
  );
}

function Footer({ navigate }) {
  const adminUrl =
    import.meta.env.VITE_ADMIN_URL ||
    "/inventory.html";
  const footerLinks = [
    { id: "shop", label: "Shop" },
    { id: "account", label: "Account" },
  ];

  return (
    <footer className="border-t border-black/10 bg-white py-10 dark:border-white/10 dark:bg-carbon">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>
          <img
            alt="The Plain Depot Material Supply"
            className="footer-logo"
            src="/plain-depot-logo-website.png"
          />
          <p className="mt-1 text-sm font-semibold text-black/50 dark:text-white/50">
            Direct-source electrical supply from manufacturer networks, without brand markup.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {footerLinks.map((page) => (
            <button
              className="rounded-full border border-black/10 px-4 py-2 text-sm font-black text-black/60 transition hover:text-ink dark:border-white/10 dark:text-white/60 dark:hover:text-white"
              key={page.id}
              onClick={() => navigate(page.id)}
            >
              {page.label}
            </button>
          ))}
          <button
            className="rounded-full border border-electric-500/30 bg-electric-500/10 px-4 py-2 text-sm font-black text-electric-600 transition hover:border-electric-500 hover:bg-electric-500 hover:text-white dark:text-electric-300"
            onClick={() => window.location.assign(adminUrl)}
          >
            Admin
          </button>
        </div>
      </div>
    </footer>
  );
}

export default App;
