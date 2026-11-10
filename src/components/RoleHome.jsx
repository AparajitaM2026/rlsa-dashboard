import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { isAdminLevel } from '@/lib/roles';

export default function RoleHome() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <Navigate to={isAdminLevel(user) ? '/all-labels-overview' : '/dashboard'} replace />
  );
}