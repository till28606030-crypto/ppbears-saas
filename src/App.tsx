import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Suspense, lazy } from "react";
import Home from "@/pages/Home";
import Login from "@/pages/auth/Login";
import Register from "@/pages/auth/Register";
import SellerShop from "@/pages/shop/SellerShop";
import PublicTemplate from "@/pages/public/PublicTemplate";
import DesignLookup from "@/pages/public/DesignLookup";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import TrackingProvider from "@/components/TrackingProvider";

// ── Lazy-loaded: Admin / Seller routes ──────────────────
// These are only downloaded when the user navigates to a protected route.
const AdminLayout     = lazy(() => import("@/layouts/AdminLayout"));
const AdminOrders     = lazy(() => import("@/pages/admin/Orders"));
const AdminAssets     = lazy(() => import("@/pages/admin/Assets"));
const AdminDesigns    = lazy(() => import("@/pages/admin/Designs"));
const AdminOptionManager = lazy(() => import("@/pages/admin/AdminOptionManager"));
const ModelDetail     = lazy(() => import("@/pages/admin/ModelDetail"));
const AdminCategories = lazy(() => import("@/pages/admin/Categories"));
const MediaLibrary    = lazy(() => import("@/pages/admin/MediaLibrary"));
const SystemSettings  = lazy(() => import("@/pages/admin/SystemSettings"));
const AiStylePresets  = lazy(() => import("@/pages/admin/AiStylePresets"));
const ToolbarSettings = lazy(() => import("@/pages/admin/ToolbarSettings"));
const ProductListV2   = lazy(() => import("@/pages/seller/products-v2/ProductList"));
const ProductEditorV2 = lazy(() => import("@/pages/seller/products-v2/ProductEditor"));
const FrameList       = lazy(() => import("@/pages/seller/FrameList"));
const FrameEditor     = lazy(() => import("@/pages/seller/FrameEditor"));

// Full-screen loading fallback used by Suspense
const PageLoader = () => (
  <div className="flex items-center justify-center h-screen bg-gray-50">
    <Loader2 className="w-8 h-8 animate-spin text-red-600" />
  </div>
);

// Protected Route Component
const ProtectedRoute = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return <Outlet />;
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <TrackingProvider>
          <Router basename={import.meta.env.VITE_BASE_PATH || '/'}>
            <Routes>
              {/* Public routes — statically imported for instant first paint */}
              <Route path="/" element={<ErrorBoundary inline><Home /></ErrorBoundary>} />
              <Route path="/t/:slug" element={<PublicTemplate />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/shop" element={<SellerShop />} />
              <Route path="/lookup" element={<DesignLookup />} />

              {/* Protected Admin/Seller Routes — lazy-loaded on demand */}
              <Route element={<ProtectedRoute />}>
                <Route element={
                  <Suspense fallback={<PageLoader />}>
                    <AdminLayout />
                  </Suspense>
                }>
                  <Route path="/admin" element={<Navigate to="/admin/orders" replace />} />
                  <Route path="/admin/orders"    element={<Suspense fallback={<PageLoader />}><ErrorBoundary inline><AdminOrders /></ErrorBoundary></Suspense>} />
                  <Route path="/admin/assets"    element={<Suspense fallback={<PageLoader />}><ErrorBoundary inline><AdminAssets /></ErrorBoundary></Suspense>} />
                  <Route path="/admin/designs"   element={<Suspense fallback={<PageLoader />}><ErrorBoundary inline><AdminDesigns /></ErrorBoundary></Suspense>} />
                  <Route path="/admin/options"   element={<Suspense fallback={<PageLoader />}><ErrorBoundary inline><AdminOptionManager /></ErrorBoundary></Suspense>} />
                  <Route path="/admin/categories" element={<Suspense fallback={<PageLoader />}><ErrorBoundary inline><AdminCategories /></ErrorBoundary></Suspense>} />
                  <Route path="/admin/media"     element={<Suspense fallback={<PageLoader />}><ErrorBoundary inline><MediaLibrary /></ErrorBoundary></Suspense>} />
                  <Route path="/admin/settings"  element={<Suspense fallback={<PageLoader />}><ErrorBoundary inline><SystemSettings /></ErrorBoundary></Suspense>} />
                  <Route path="/admin/ai-styles" element={<Suspense fallback={<PageLoader />}><ErrorBoundary inline><AiStylePresets /></ErrorBoundary></Suspense>} />
                  <Route path="/admin/toolbar-settings" element={<Suspense fallback={<PageLoader />}><ErrorBoundary inline><ToolbarSettings /></ErrorBoundary></Suspense>} />
                  <Route path="/admin/models/:id" element={<Suspense fallback={<PageLoader />}><ErrorBoundary inline><ModelDetail /></ErrorBoundary></Suspense>} />

                  {/* Seller Center */}
                  <Route path="/seller" element={<Navigate to="/seller/products-v2" replace />} />
                  <Route path="/seller/profile" element={<Navigate to="/seller/products-v2" replace />} />
                  <Route path="/seller/products" element={<Navigate to="/seller/products-v2" replace />} />
                  <Route path="/seller/product/new" element={<Navigate to="/seller/products-v2" replace />} />
                  <Route path="/seller/product/:id" element={<Navigate to="/seller/products-v2" replace />} />
                  <Route path="/seller/products-v2" element={<Suspense fallback={<PageLoader />}><ErrorBoundary inline><ProductListV2 /></ErrorBoundary></Suspense>} />
                  <Route path="/seller/products-v2/:id" element={<Suspense fallback={<PageLoader />}><ErrorBoundary inline><ProductEditorV2 /></ErrorBoundary></Suspense>} />
                  <Route path="/seller/frames" element={<Suspense fallback={<PageLoader />}><ErrorBoundary inline><FrameList /></ErrorBoundary></Suspense>} />
                  <Route path="/seller/frame/new" element={<Suspense fallback={<PageLoader />}><ErrorBoundary inline><FrameEditor /></ErrorBoundary></Suspense>} />
                  <Route path="/seller/frame/:id" element={<Suspense fallback={<PageLoader />}><ErrorBoundary inline><FrameEditor /></ErrorBoundary></Suspense>} />
                </Route>
              </Route>
            </Routes>
          </Router>
        </TrackingProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
