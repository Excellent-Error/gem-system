import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Spinner, ToastProvider } from './components/ui';
import { api } from './api/client';
import CustomerForm from './pages/CustomerForm';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import EnquiryDetail from './pages/EnquiryDetail';
import Settings from './pages/Settings';
import Profile from './pages/Profile';

function ProtectedRoute() {
  const { admin, loading } = useAuth();
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400"><Spinner className="h-6 w-6" /></div>;
  }
  return admin ? <Outlet /> : <Navigate to="/login" replace />;
}

function AdminLayout() {
  const { admin, logout } = useAuth();
  const [business, setBusiness] = useState(null);
  useEffect(() => { api('/api/business-config').then(setBusiness).catch(() => {}); }, []);
  const navigate = useNavigate();
  const navCls = ({ isActive }) =>
    `block rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`;

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <div className="mb-6 px-2">
          <p className="truncate text-base font-semibold text-slate-900">{business?.business_name || 'Enquiry Desk'}</p>
          <p className="text-xs text-slate-400">Enquiry management</p>
        </div>
        <nav className="flex-1 space-y-1">
          <NavLink to="/admin" end className={navCls}>Enquiries</NavLink>
          <NavLink to="/admin/profile" className={navCls}>Profile</NavLink>
          <NavLink to="/admin/settings" className={navCls}>Settings</NavLink>
          <NavLink to="/" className={navCls}>Public form ↗</NavLink>
        </nav>
        <div className="border-t border-slate-100 pt-3">
          <NavLink to="/admin/profile" className="block rounded-lg px-2 py-2 hover:bg-slate-50">
            <p className="truncate text-sm font-medium text-slate-700">{admin?.name}</p>
            <p className="truncate text-xs text-slate-400">{admin?.email}</p>
          </NavLink>
          <button className="btn-secondary mt-3 w-full" onClick={async () => { await logout(); navigate('/login'); }}>
            Sign out
          </button>
        </div>
      </aside>
      <div className="md:pl-60">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <p className="font-semibold text-slate-900">{business?.business_name || 'Enquiry Desk'}</p>
          <button className="btn-secondary !px-3 !py-1" onClick={async () => { await logout(); navigate('/login'); }}>
            Sign out
          </button>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<CustomerForm />} />
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="enquiries/:id" element={<EnquiryDetail />} />
                <Route path="profile" element={<Profile />} />
                <Route path="settings" element={<Settings />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
