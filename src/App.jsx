import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import RoleHome from '@/components/RoleHome';
import UserManagement from '@/pages/admin/UserManagement';
import PartyUserManagement from '@/pages/admin/PartyUserManagement';
import ResourceUpload from '@/pages/admin/ResourceUpload';
import LabelMapping from '@/pages/admin/LabelMapping';

import AllLabelsOverview from '@/pages/admin/AllLabelsOverview';
import CatalogManager from '@/pages/admin/CatalogManager';
import HouseImprintDetail from '@/pages/admin/HouseImprintDetail';
import HouseCatalogDetails from '@/pages/admin/HouseCatalogDetails';
import Dashboard from '@/pages/client/Dashboard';
import Revenue from '@/pages/client/Revenue';
import TrackRevenue from '@/pages/client/TrackRevenue';
import CountryRevenue from '@/pages/client/CountryRevenue';
import StoreRevenue from '@/pages/client/StoreRevenue';
import Repertoire from '@/pages/client/Repertoire';
import Payouts from '@/pages/client/Payouts';
import Settings from '@/pages/client/Settings';
import ClientProfile from '@/pages/admin/ClientProfile';
import UnmappedData from '@/pages/admin/UnmappedData';
import ActivityLogs from '@/pages/admin/ActivityLogs';
import PayoutExports from '@/pages/admin/PayoutExports';
import FxRates from '@/pages/admin/FxRates';
import Releases from '@/pages/admin/Releases';
import Parties from '@/pages/admin/Parties';
import RepertoireUpload from '@/pages/client/RepertoireUpload';
import SubLabels from '@/pages/client/SubLabels';
import Support from '@/pages/Support';
import Otp from '@/pages/Otp';
import ResetPassword from '@/pages/ResetPassword';
import { ClientPreviewProvider } from '@/lib/ClientContext';
import { LanguageProvider } from '@/lib/i18n';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      {/* Public authentication pages */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/otp" element={<Otp />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/confirm-password" element={<ResetPassword />} />

      {/* Protected internal routes */}
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<Layout />}>
          <Route path="/" element={<RoleHome />} />
          {/* Admin (OTT Staff) */}
          <Route path="/user-management" element={<UserManagement />} />
          <Route path="/admin/party-users" element={<PartyUserManagement />} />
          <Route path="/resource-upload" element={<ResourceUpload />} />
          <Route path="/label-mapping" element={<LabelMapping />} />

          <Route path="/all-labels-overview" element={<AllLabelsOverview />} />
          <Route path="/admin/catalog-manager" element={<CatalogManager />} />
          <Route path="/admin/house-imprint" element={<HouseImprintDetail />} />
          <Route path="/admin/house-catalog-details" element={<HouseCatalogDetails />} />
          <Route path="/admin/client-profile" element={<ClientProfile />} />
          <Route path="/admin/unmapped-data" element={<UnmappedData />} />
          <Route path="/admin/activity-logs" element={<ActivityLogs />} />
          <Route path="/admin/payout-exports" element={<PayoutExports />} />
          <Route path="/admin/fx-rates" element={<FxRates />} />
          <Route path="/admin/releases" element={<Releases />} />
          <Route path="/admin/parties" element={<Parties />} />
          {/* Label Client */}
          <Route element={<ClientPreviewProvider />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/revenue" element={<Revenue />} />
            <Route path="/revenue/tracks" element={<TrackRevenue />} />
            <Route path="/revenue/countries" element={<CountryRevenue />} />
            <Route path="/revenue/stores" element={<StoreRevenue />} />
            <Route path="/repertoire" element={<Repertoire />} />
            <Route path="/client/repertoire" element={<Repertoire />} />
            <Route path="/client/payouts" element={<Payouts />} />
            <Route path="/client/settings" element={<Settings />} />
            <Route path="/client/repertoire/upload" element={<RepertoireUpload />} />
            <Route path="/client/sub-labels" element={<SubLabels />} />
          </Route>
          <Route path="/support" element={<Support />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <LanguageProvider>
          <Router>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
        </LanguageProvider>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App