import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/i18n';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { base44 } from '@/api/base44Client';
import {
  Disc3,
  Users,
  UploadCloud,
  Network,
  BarChart3,
  UserCog,
  LayoutDashboard,
  TrendingUp,
  Music,
  Globe2,
  Store as StoreIcon,
  Wallet,
  Settings,
  LogOut,
  Menu,
  ShieldAlert,
  History,
  FileDown,
  LifeBuoy,
  FolderSearch,
  Home,
  DollarSign,
  Album,
  Layers,
  Building2
} from 'lucide-react';
import { PeriodFilterProvider } from '@/lib/PeriodFilterContext';
import { isSuperAdmin, isPartyAdmin, getAccessRole, getPartyId } from '@/lib/roles';
import CatalogSearchStatus from '@/components/catalog/CatalogSearchStatus';
import BrandLogo from '@/components/branding/BrandLogo';
import LogoUploadDialog from '@/components/branding/LogoUploadDialog';

const adminNav = [
  { to: '/admin/parties', tKey: 'nav.parties', icon: Building2 },
  { to: '/user-management', tKey: 'nav.user_management', icon: Users },
  { to: '/resource-upload', tKey: 'nav.resource_upload', icon: UploadCloud },
  { to: '/label-mapping', tKey: 'nav.label_mapping', icon: Network },
  { to: '/all-labels-overview', tKey: 'nav.all_labels_overview', icon: BarChart3 },
  { to: '/admin/catalog-manager', tKey: 'nav.catalog_manager', icon: FolderSearch },
  { to: '/admin/house-catalog-details', tKey: 'nav.house_catalog_details', icon: Home },
  { to: '/admin/client-profile', tKey: 'nav.client_profile', icon: UserCog },
  { to: '/admin/unmapped-data', tKey: 'nav.unmapped_data', icon: ShieldAlert },
  { to: '/admin/activity-logs', tKey: 'nav.activity_logs', icon: History },
  { to: '/admin/payout-exports', tKey: 'nav.payout_exports', icon: FileDown },
  { to: '/admin/fx-rates', tKey: 'nav.fx_rates', icon: DollarSign },
  { to: '/admin/releases', tKey: 'nav.releases', icon: Album },
  { to: '/support', tKey: 'nav.support', icon: LifeBuoy },
  { to: '/dashboard', tKey: 'nav.client_preview', icon: LayoutDashboard }
];

const clientNav = [
  { to: '/dashboard', tKey: 'nav.dashboard', icon: LayoutDashboard },
  { to: '/revenue', tKey: 'nav.revenue_analytics', icon: TrendingUp },
  { to: '/revenue/tracks', tKey: 'nav.track_breakdown', icon: Music },
  { to: '/revenue/countries', tKey: 'nav.country_breakdown', icon: Globe2 },
  { to: '/revenue/stores', tKey: 'nav.store_breakdown', icon: StoreIcon },
  { to: '/repertoire', tKey: 'nav.repertoire', icon: Music },
  { to: '/client/sub-labels', tKey: 'nav.sub_labels', icon: Layers },
  { to: '/client/payouts', tKey: 'nav.payout_history', icon: Wallet },
  { to: '/client/settings', tKey: 'nav.settings', icon: Settings },
  { to: '/support', tKey: 'nav.support', icon: LifeBuoy }
];

const partyAdminNav = [
  { to: '/admin/party-users', tKey: 'nav.party_users', icon: Users },
  { to: '/dashboard', tKey: 'nav.dashboard', icon: LayoutDashboard },
  { to: '/revenue', tKey: 'nav.revenue_analytics', icon: TrendingUp },
  { to: '/revenue/tracks', tKey: 'nav.track_breakdown', icon: Music },
  { to: '/revenue/countries', tKey: 'nav.country_breakdown', icon: Globe2 },
  { to: '/revenue/stores', tKey: 'nav.store_breakdown', icon: StoreIcon },
  { to: '/repertoire', tKey: 'nav.repertoire', icon: Music },
  { to: '/client/repertoire/upload', tKey: 'nav.repertoire_upload', icon: UploadCloud },
  { to: '/client/sub-labels', tKey: 'nav.sub_labels', icon: Layers },
  { to: '/client/payouts', tKey: 'nav.payout_history', icon: Wallet },
  { to: '/client/settings', tKey: 'nav.settings', icon: Settings },
  { to: '/label-mapping', tKey: 'nav.label_mapping', icon: Network },
  { to: '/admin/payout-exports', tKey: 'nav.payout_exports', icon: FileDown },
  { to: '/support', tKey: 'nav.support', icon: LifeBuoy }
];

export default function Layout() {
  const { user } = useAuth();
  const { t, isRTL } = useLanguage();
  const [open, setOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [brandName, setBrandName] = useState('Mayra Music');
  const [logoOpen, setLogoOpen] = useState(false);
  const nav = isSuperAdmin(user) ? adminNav : isPartyAdmin(user) ? partyAdminNav : clientNav;
  // Only the Super Admin and a Party Admin may replace the logo; everyone else
  // (sub-labels, client users) simply sees the logo of their own party.
  const canEditLogo = isSuperAdmin(user) || isPartyAdmin(user);
  const partyId = getPartyId(user) || user?.party_id || (isSuperAdmin(user) ? 'party_ott_solutions_01' : null);

  useEffect(() => {
    if (!partyId) {
      setLogoUrl('');
      return;
    }
    let active = true;
    base44.entities.Party
      .get(partyId)
      .then((party) => {
        if (active) {
          setLogoUrl(party?.logo_url || '');
          if (party?.name) setBrandName(party.name);
        }
      })
      .catch(() => {
        if (active) setLogoUrl('');
      });
    return () => {
      active = false;
    };
  }, [partyId]);

  const handleLogout = () => {
    base44.auth.logout(window.location.origin + '/login');
  };

  return (
    <PeriodFilterProvider>
      <LogoUploadDialog 
        open={logoOpen} 
        onOpenChange={setLogoOpen} 
        onSaved={({ logoUrl: newLogo, name: newName }) => {
          if (newLogo !== undefined) setLogoUrl(newLogo);
          if (newName) setBrandName(newName);
        }} 
        currentLogoUrl={logoUrl}
        currentBrandName={brandName}
        partyId={partyId} 
      />
      <div className="min-h-screen flex bg-background text-foreground">
        <aside
          className={`fixed lg:static z-40 inset-y-0 ${isRTL ? 'right-0' : 'left-0'} w-64 bg-sidebar text-sidebar-foreground border-e border-sidebar-border flex flex-col transition-transform duration-200 ${
            open ? 'translate-x-0' : isRTL ? 'translate-x-full' : '-translate-x-full'
          } lg:translate-x-0`}
        >
          <div className="flex items-center gap-2 px-6 h-16 border-b border-sidebar-border">
            <BrandLogo
              logoUrl={logoUrl}
              brandName={brandName}
              canEdit={canEditLogo}
              onClick={() => setLogoOpen(true)}
              variant="dark"
            />
          </div>
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  }`
                }
              >
                <item.icon className="w-4 h-4" />
                {t(item.tKey)}
              </NavLink>
            ))}
          </nav>
          <CatalogSearchStatus />
          <div className="p-3 border-t border-sidebar-border">
            <div className="px-1 pb-2">
              <LanguageSwitcher variant="dark" placement="up" />
            </div>
            <div className="px-3 py-2 text-xs">
              <p className="text-muted-foreground truncate">{user?.email}</p>
              <span className="inline-block mt-1 text-[10px] uppercase tracking-wide bg-sidebar-accent text-sidebar-foreground px-2 py-0.5 rounded">
                {getAccessRole(user) || user?.role}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LogOut className="w-4 h-4" /> {t('nav.sign_out')}
            </button>
          </div>
        </aside>

        {open && (
          <div
            className="fixed inset-0 bg-black/40 z-30 lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}

        <div className="flex-1 flex flex-col min-w-0">
          <header className="lg:hidden flex items-center gap-3 h-14 px-4 bg-card border-b border-border">
            <button onClick={() => setOpen(true)}>
              <Menu className="w-5 h-5" />
            </button>
            <BrandLogo
              logoUrl={logoUrl}
              canEdit={canEditLogo}
              onClick={() => setLogoOpen(true)}
              variant="light"
            />
            <div className={isRTL ? 'mr-auto' : 'ml-auto'}>
              <LanguageSwitcher variant="light" placement="down" />
            </div>
          </header>
          <main className="flex-1 p-6 lg:p-8 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </PeriodFilterProvider>
  );
}