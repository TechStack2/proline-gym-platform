import { Grid, Calendar, Dumbbell, CreditCard, User, Award } from 'lucide-react';
import type { TabItem } from '@/components/native';

export const PORTAL_TABS: TabItem[] = [
  { key: 'home', icon: Grid, path: '/portal', label: 'Home' },
  { key: 'schedule', icon: Calendar, path: '/portal/schedule' },
  { key: 'progress', icon: Award, path: '/portal/progress' },
  { key: 'pt', icon: Dumbbell, path: '/portal/pt', label: 'PT' },
  { key: 'billing', icon: CreditCard, path: '/portal/billing', label: 'Billing' },
  { key: 'profile', icon: User, path: '/portal/profile' },
];

export const PORTAL_BASE_PATH = '/portal';
