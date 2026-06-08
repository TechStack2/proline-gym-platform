'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Phone, Mail, Calendar, Search } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import type { Lead, LeadStatus, Discipline, StatusFilter } from './leads-types';
import { LEAD_STATUSES } from './leads-types';
import { leadStatusUpdateSchema } from '@/lib/validators/leads.schema';

type Props = {
  leads: Lead[];
  disciplines: Discipline[];
  gymId: string;
  locale: string;
  statusColors: Record<string, string>;
  sourceIcons: Record<string, string>;
};

const TRANSLATED_STATUS_MAP = {
  new: 'status.new',
  contacted: 'status.contacted',
  trial_scheduled: 'status.trial_scheduled',
  trial_completed: 'status.trial_completed',
  converted: 'status.converted',
  lost: 'status.lost',
} as const satisfies Record<LeadStatus, string>;

export function LeadsClient({
  leads: initialLeads,
  disciplines,
  gymId,
  locale,
  statusColors,
  sourceIcons,
}: Props) {
  const t = useTranslations('leads');
  const supabase = createClient();
  const isRTL = locale === 'ar';

  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedLead, setExpandedLead] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 300);
  const prevDebouncedSearch = useRef(debouncedSearch);
  const prevStatusFilter = useRef(statusFilter);
  const isInitialMount = useRef(true);

  // Sync initialLeads when server re-fetches (e.g., URL search params change)
  useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  // Debounced server-side search with .ilike()
  useEffect(() => {
    // Skip the initial mount fetch — data already comes from the server
    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevDebouncedSearch.current = debouncedSearch;
      prevStatusFilter.current = statusFilter;
      return;
    }

    // Skip if nothing changed
    if (
      debouncedSearch === prevDebouncedSearch.current &&
      statusFilter === prevStatusFilter.current
    ) {
      return;
    }

    prevDebouncedSearch.current = debouncedSearch;
    prevStatusFilter.current = statusFilter;

    async function fetchFiltered() {
      let query = supabase
        .from('leads')
        .select('*')
        .eq('gym_id', gymId)
        .order('created_at', { ascending: false });

      if (debouncedSearch) {
        const term = `%${debouncedSearch}%`;
        query = query.or(
          `first_name.ilike.${term},last_name.ilike.${term},phone.ilike.${term},email.ilike.${term}`,
        );
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data } = await query;
      if (data) setLeads(data as Lead[]);
    }

    fetchFiltered();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, statusFilter]);

  // ── Status change with optimistic UI, try/catch, toast, single .update() ──
  const handleStatusChange = useCallback(
    async (leadId: string, newStatus: LeadStatus) => {
      // Zod validation before proceeding
      const statusPayload = {
        id: leadId,
        status: newStatus,
        converted_at:
          newStatus === 'converted' ? new Date().toISOString() : undefined,
      };

      const parsed = leadStatusUpdateSchema.safeParse(statusPayload);
      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0];
        toast.error(firstIssue?.message || t('toast.status_error'));
        return;
      }

      const previousLeads = [...leads];

      // Optimistic update
      setLeads((prev) =>
        prev.map((l) => {
          if (l.id !== leadId) return l;
          return {
            ...l,
            status: newStatus,
            ...(newStatus === 'converted'
              ? { converted_at: new Date().toISOString() }
              : {}),
          };
        }),
      );

      try {
        // Single .update() call — merge converted_at when converting
        const updateData: Record<string, string> = { status: newStatus };
        if (newStatus === 'converted') {
          updateData.converted_at = new Date().toISOString();
        }

        const { error } = await supabase
          .from('leads')
          .update(updateData)
          .eq('id', leadId);

        if (error) throw error;
        toast.success(t('toast.status_updated'));
      } catch {
        // Rollback on error
        setLeads(previousLeads);
        toast.error(t('toast.status_error'));
      }
    },
    [leads, supabase, t],
  );

  // Resolve translated status label for display
  const statusDisplay = (s: LeadStatus): string => {
    return t(TRANSLATED_STATUS_MAP[s] as Parameters<typeof t>[0]);
  };

  // Resolve discipline name by locale
  const disciplineName = (disc: Discipline): string => {
    if (isRTL) return disc.name_ar;
    if (locale === 'fr') return disc.name_fr;
    return disc.name_en;
  };

  return (
    <div className="space-y-4">
      {/* Search + Filter Bar */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search
            className={cn(
              'absolute top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400',
              isRTL ? 'right-3' : 'left-3',
            )}
          />
          <input
            type="text"
            className={cn(
              'w-full py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500',
              isRTL ? 'pr-9 pl-4 text-right' : 'pl-9 pr-4',
            )}
            placeholder={t('search_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="px-3 py-2 text-sm border rounded-lg bg-white focus:ring-2 focus:ring-primary-500"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        >
          <option value="all">{t('all_statuses')}</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusDisplay(s)}
            </option>
          ))}
        </select>
      </div>

      {/* Lead Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {leads.map((lead) => {
          const disc = disciplines.find(
            (d) => d.id === lead.interested_discipline_id,
          );
          const isExpanded = expandedLead === lead.id;

          return (
            <Card key={lead.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {lead.first_name} {lead.last_name}
                    </h3>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-xs">
                        {sourceIcons[lead.source] || '📋'}
                      </span>
                      <span className="text-xs text-gray-400 capitalize">
                        {lead.source}
                      </span>
                    </div>
                  </div>
                  {/* Status Dropdown */}
                  <select
                    className={cn(
                      'text-xs px-2 py-1 rounded-full border font-medium',
                      statusColors[lead.status] || 'bg-gray-100',
                    )}
                    value={lead.status}
                    onChange={(e) =>
                      handleStatusChange(lead.id, e.target.value as LeadStatus)
                    }
                  >
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {statusDisplay(s)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1 text-sm">
                  {lead.phone && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Phone className="h-3.5 w-3.5 text-gray-400" />
                      <a
                        href={`tel:${lead.phone}`}
                        className="hover:text-primary-600"
                      >
                        {lead.phone}
                      </a>
                    </div>
                  )}
                  {lead.email && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Mail className="h-3.5 w-3.5 text-gray-400" />
                      <a
                        href={`mailto:${lead.email}`}
                        className="hover:text-primary-600 text-xs"
                      >
                        {lead.email}
                      </a>
                    </div>
                  )}
                  {disc && (
                    <p className="text-gray-500">{disciplineName(disc)}</p>
                  )}
                </div>

                {lead.notes && (
                  <p className="text-xs text-gray-400 italic bg-gray-50 p-2 rounded">
                    {lead.notes}
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t">
                  <button
                    onClick={() =>
                      setExpandedLead(isExpanded ? null : lead.id)
                    }
                    className="flex-1 h-8 text-xs border rounded-lg hover:bg-gray-50 font-medium"
                  >
                    <Calendar className="inline h-3 w-3 mr-1" />
                    {t('schedule_trial')}
                  </button>
                  {lead.status !== 'converted' &&
                    lead.status !== 'lost' && (
                      <button
                        onClick={() =>
                          handleStatusChange(lead.id, 'converted')
                        }
                        className="flex-1 h-8 text-xs bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 font-medium"
                      >
                        {t('convert')}
                      </button>
                    )}
                </div>

                {/* Expanded Trial Scheduling */}
                {isExpanded && (
                  <div className="pt-2 border-t space-y-2">
                    <p className="text-xs font-medium text-gray-700">
                      {t('schedule_trial_session')}
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        className="flex-1 px-2 py-1 text-xs border rounded"
                      />
                      <select className="px-2 py-1 text-xs border rounded">
                        <option>09:00</option>
                        <option>10:00</option>
                        <option>11:00</option>
                        <option>16:00</option>
                        <option>17:00</option>
                        <option>18:00</option>
                      </select>
                    </div>
                    <button
                      className="w-full py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                      onClick={() => {
                        handleStatusChange(lead.id, 'trial_scheduled');
                        setExpandedLead(null);
                      }}
                    >
                      {t('confirm_trial')}
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {leads.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-500">{t('no_leads_found')}</p>
        </div>
      )}
    </div>
  );
}
