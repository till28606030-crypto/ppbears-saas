import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { USE_PRODUCTS_V2 } from "./config";
import Home from "@/pages/Home";
import Login from "@/pages/auth/Login";
import Register from "@/pages/auth/Register";
import AdminLayout from "@/layouts/AdminLayout";
import AdminOrders from "@/pages/admin/Orders";
import AdminAssets from "@/pages/admin/Assets";
import AdminDesigns from "@/pages/admin/Designs";
import AdminOptionManager from "@/pages/admin/AdminOptionManager";
import ModelDetail from "@/pages/admin/ModelDetail";
import AdminCategories from "@/pages/admin/Categories";
import ProductListV2 from "@/pages/seller/products-v2/ProductList";
import ProductEditorV2 from "@/pages/seller/products-v2/ProductEditor";
import FrameList from "@/pages/seller/FrameList";
import FrameEditor from "@/pages/seller/FrameEditor";
import SellerShop from "@/pages/shop/SellerShop";
import PublicTemplate from "@/pages/public/PublicTemplate";
import { AuthProvider, useAuth } from "@/context/AuthContext";

// Protected Route Component
const ProtectedRoute = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default function App() {
  return (
    <AuthProvider>
      <Router basename={import.meta.env.VITE_BASE_PATH || '/'}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/t/:slug" element={<PublicTemplate />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected Admin/Seller Routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<Navigate to="/admin/orders" replace />} />
              <Route path="/admin/orders" element={<AdminOrders />} />
              <Route path="/admin/assets" element={<AdminAssets />} />
              <Route path="/admin/designs" element={<AdminDesigns />} />
              <Route path="/admin/options" element={<AdminOptionManager />} />
              <Route path="/admin/categories" element={<AdminCategories />} />

              {/* Model Detail Route (Requested Feature) */}
              <Route path="/admin/models/:id" element={<ModelDetail />} />

              {/* Seller Center Routes */}
              <Route path="/seller" element={<Navigate to="/seller/products-v2" replace />} />
              <Route path="/seller/profile" element={<Navigate to="/seller/products-v2" replace />} />

              {/* Redirect V1 routes to V2 */}
              <Route path="/seller/products" element={<Navigate to="/seller/products-v2" replace />} />
              <Route path="/seller/product/new" element={<Navigate to="/seller/products-v2" replace />} />
              <Route path="/seller/product/:id" element={<Navigate to="/seller/products-v2" replace />} />

              {/* Products V2 Routes */}
              <Route path="/seller/products-v2" element={<ProductListV2 />} />
              <Route path="/seller/products-v2/:id" element={<ProductEditorV2 />} />


              {/* Frame Editor Routes */}
              <Route path="/seller/frames" element={<FrameList />} />
              <Route path="/seller/frame/new" element={<FrameEditor />} />
              <Route path="/seller/frame/:id" element={<FrameEditor />} />
            </Route>
          </Route>

          {/* Buyer Shop Routes */}
          <Route path="/shop" element={<SellerShop />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
