import { Calendar, ClipboardCheck, Users, Dumbbell, User, CalendarClock } from 'lucide-react';
import type { TabItem } from '@/components/native';

export const COACH_TABS: TabItem[] = [
  { key: 'schedule', icon: Calendar, path: '/coach' },
  { key: 'attendance', icon: ClipboardCheck, path: '/coach/attendance' },
  { key: 'students', icon: Users, path: '/coach/students' },
  { key: 'trials', icon: CalendarClock, path: '/coach/trials' },
  { key: 'pt', icon: Dumbbell, path: '/coach/pt', label: 'PT' },
  { key: 'profile', icon: User, path: '/coach/profile' },
];

export const COACH_BASE_PATH = '/coach';
