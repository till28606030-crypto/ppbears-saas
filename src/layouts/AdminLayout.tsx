import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ShoppingBag, Image as ImageIcon, LayoutDashboard, LogOut, Menu, X, ArrowLeft, Palette, Shapes, Settings, FolderTree } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { USE_PRODUCTS_V2 } from '@/config';

export default function AdminLayout() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const location = useLocation();
  const path = location.pathname;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Determine active tab based on path
  const getActiveTab = () => {
    if (path.includes('/seller/frames') || path.includes('/seller/frame')) return 'frames';
    if (path.includes('/seller/products-v2')) return 'seller-v2';
    if (path.includes('/seller/products')) return 'seller';
    if (path.includes('/admin/categories')) return 'categories';
    if (path.includes('/admin/assets')) return 'assets';
    if (path.includes('/admin/designs')) return 'designs';
    if (path.includes('/admin/media')) return 'media';
    if (path.includes('/admin/settings')) return 'settings';
    return 'orders'; // Default or /admin/orders
  };

  const activeTab = getActiveTab();

  const handleNavigation = (path: string) => {
    navigate(path);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans text-gray-900 overflow-hidden">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white font-bold">
            A
          </div>
          <span className="font-semibold text-lg">管理後台</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg">
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar (Desktop: Fixed, Mobile: Drawer) */}
      <aside className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col transition-transform duration-300 ease-in-out
          md:static md:translate-x-0
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white font-bold mr-3">
            A
          </div>
          <span className="font-semibold text-lg">管理後台</span>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <button
            onClick={() => handleNavigation('/admin/orders')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'orders' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <ShoppingBag className="w-5 h-5" />
            訂單管理
          </button>

          <button
            onClick={() => handleNavigation('/admin/categories')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'categories' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <FolderTree className="w-5 h-5" />
            產品類別
          </button>

          {USE_PRODUCTS_V2 ? (
            <button
              onClick={() => handleNavigation('/seller/products-v2')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'seller-v2' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <LayoutDashboard className="w-5 h-5" />
              產品模板
            </button>
          ) : (
            <button
              onClick={() => handleNavigation('/seller/products')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'seller' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <LayoutDashboard className="w-5 h-5" />
              產品模板
            </button>
          )}

          <button
            onClick={() => handleNavigation('/admin/options')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${location.pathname.includes('/admin/options') ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Settings className="w-5 h-5" />
            購物車商品
          </button>
          <button
            onClick={() => handleNavigation('/admin/assets')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'assets' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <ImageIcon className="w-5 h-5" />
            素材庫
          </button>
          <button
            onClick={() => handleNavigation('/admin/designs')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'designs' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Palette className="w-5 h-5" />
            設計款模板
          </button>

          <button
            onClick={() => handleNavigation('/seller/frames')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'frames' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Shapes className="w-5 h-5" />
            相框設計
          </button>

          {/* NEW: Media Library */}
          <button
            onClick={() => handleNavigation('/admin/media')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'media' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <ImageIcon className="w-5 h-5" />
            媒體庫 (全域儲存空間)
          </button>

          {/* NEW: System Settings */}
          <button
            onClick={() => handleNavigation('/admin/settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'settings' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Settings className="w-5 h-5" />
            系統設定 (空間清理)
          </button>
        </nav>

        <div className="p-4 border-t border-gray-200 space-y-2">
          <button
            onClick={() => handleNavigation('/')}
            className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-lg font-medium transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            返回前台
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-red-50 hover:text-red-600 rounded-lg font-medium transition-colors"
          >
            <LogOut className="w-5 h-5" />
            登出
          </button>
        </div>
      </aside>

      {/* Overlay for Mobile Sidebar */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        ></div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-gray-50 pt-16 md:pt-0 w-full relative">
        <Outlet />
      </main>
    </div>
  );
}
