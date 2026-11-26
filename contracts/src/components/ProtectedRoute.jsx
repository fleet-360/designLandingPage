import { Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { t } from '@/i18n';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

const NotConfigured = () => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
    <h1 className="text-2xl font-semibold">{t("המערכת לא מוגדרת בשרת הזה")}</h1>
    <p className="text-sm text-muted-foreground">{t("חסרים פרטי ההתחברות או החיבור לדאטהבייס.")}</p>
  </div>
);

export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement }) {
  const { isAuthenticated, isLoadingAuth, authChecked, authError } = useAuth();

  if (isLoadingAuth || !authChecked) return fallback;
  if (authError?.type === 'not_configured') return <NotConfigured />;
  if (!isAuthenticated) return unauthenticatedElement;
  return <Outlet />;
}
