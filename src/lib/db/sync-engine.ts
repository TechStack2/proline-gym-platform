// ============================================================
// D2: Sync Engine — Push Queue + Pull Sync + Conflict Resolution
// PRO LINE Gym Platform — Phase D Offline Sync & PWA
// ============================================================
// Architecture:
//   Outbox Pattern: Local writes → sync_queue table → flush to Supabase
//   Pull Sync:     Cursor-based (updated_at > last_synced_at)
//   Conflict:      Last-Write-Wins (LWW) at field level
//   Network:       navigator.onLine + periodic health checks
// ============================================================

import { createClient } from '@/lib/supabase/client';
import { getOfflineDB } from '@/lib/db/schema';
import type {
  SyncQueueItem,
  SyncMetadata,
  OfflineAttendanceRecord,
  OfflinePayment,
} from '@/lib/db/schema';

// ─── Types ───────────────────────────────────────────────────────────

export type SyncStatus = 'idle' | 'syncing' | 'online' | 'offline' | 'error';

export interface SyncProgress {
  phase: 'push' | 'pull' | 'complete';
  current: number;
  total: number;
  table_name: string;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: string[];
  duration_ms: number;
}

type SyncListener = (status: SyncStatus, progress?: SyncProgress) => void;

// Tables that support offline writes (marked with _is_dirty / _sync_status)
const OFFLINE_WRITABLE_TABLES = [
  'attendance_records',
  'payments',
] as const;

// All tables that participate in pull sync (download server → local)
const PULL_SYNC_TABLES = [
  'gyms',
  'profiles',
  'students',
  'coaches',
  'disciplines',
  'belt_hierarchies',
  'belt_promotions',
  'classes',
  'class_schedules',
  'class_enrollments',
  'attendance_records',
  'membership_plans',
  'student_memberships',
  'invoices',
  'payments',
  'pt_packages',
  'pt_assignments',
  'pt_sessions',
  'leads',
  'camps',
  'camp_registrations',
] as const;

// Max records per pull batch (prevents memory issues)
const PULL_BATCH_SIZE = 500;

// ─── Network Detection ───────────────────────────────────────────────

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

// ─── Sync Engine ─────────────────────────────────────────────────────

export class SyncEngine {
  private supabase = createClient();
  private db = getOfflineDB();
  private listeners: Set<SyncListener> = new Set();
  private _status: SyncStatus = 'idle';
  private syncing = false;
  private unsubscribeNetwork: (() => void) | null = null;

  constructor() {
    this.setupNetworkListeners();
  }

  get status(): SyncStatus {
    return this._status;
  }

  // ─── Event System ────────────────────────────────────────────────

  onSync(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(status: SyncStatus, progress?: SyncProgress): void {
    this._status = status;
    for (const fn of this.listeners) {
      try {
        fn(status, progress);
      } catch {
        // swallow listener errors — don't break sync
      }
    }
  }

  // ─── Network Detection ───────────────────────────────────────────

  private setupNetworkListeners(): void {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      this.emit('online');
      // Auto-sync when coming back online
      this.syncAll().catch(() => {
        /* errors captured in syncAll */
      });
    };

    const handleOffline = () => {
      this.emit('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    this.unsubscribeNetwork = () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };

    // Set initial status
    if (!navigator.onLine) {
      this._status = 'offline';
    }
  }

  destroy(): void {
    this.unsubscribeNetwork?.();
    this.listeners.clear();
  }

  // ─── Enqueue Local Write ─────────────────────────────────────────

  /**
   * Queue a local mutation for later push to the server.
   * Used by offline-first components when navigator.onLine === false.
   */
  async enqueue(
    table_name: string,
    record_id: string,
    operation: SyncQueueItem['operation'],
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.db.sync_queue.add({
      table_name,
      record_id,
      operation,
      payload,
      created_at: new Date().toISOString(),
      retry_count: 0,
    });

    // Mark the local record as dirty if it exists in a writable table
    if (
      OFFLINE_WRITABLE_TABLES.includes(table_name as (typeof OFFLINE_WRITABLE_TABLES)[number])
    ) {
      try {
        await (this.db as any)[table_name].update(record_id, {
          _is_dirty: true,
          _sync_status: 'pending',
        });
      } catch {
        // Record may not exist locally yet (insert case)
      }
    }
  }

  // ─── Push: Flush Local Queue → Supabase ──────────────────────────

  /**
   * Push all pending local changes to Supabase.
   * Returns count of successfully pushed items.
   */
  async pushAll(): Promise<{ pushed: number; errors: string[] }> {
    if (this.syncing) return { pushed: 0, errors: ['Sync already in progress'] };
    this.syncing = true;

    const errors: string[] = [];
    let pushed = 0;

    try {
      const queue = await this.db.sync_queue.orderBy('created_at').toArray();

      if (queue.length === 0) {
        this.emit('online');
        return { pushed: 0, errors: [] };
      }

      this.emit('syncing', {
        phase: 'push',
        current: 0,
        total: queue.length,
        table_name: 'sync_queue',
      });

      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        try {
          await this.pushItem(item);
          await this.db.sync_queue.delete(item.id!);
          pushed++;

          this.emit('syncing', {
            phase: 'push',
            current: i + 1,
            total: queue.length,
            table_name: item.table_name,
          });
        } catch (err: any) {
          // Increment retry count; if > 5, log and skip
          const retry_count = (item.retry_count || 0) + 1;
          const errorMsg = err?.message || String(err);

          if (retry_count > 5) {
            errors.push(
              `[${item.table_name}:${item.record_id}] Failed after 5 retries: ${errorMsg}`,
            );
            await this.db.sync_queue.delete(item.id!);
          } else {
            await this.db.sync_queue.update(item.id!, {
              retry_count,
              last_error: errorMsg,
            });
          }
        }
      }
    } finally {
      this.syncing = false;
    }

    return { pushed, errors };
  }

  /**
   * Push a single queue item to Supabase.
   */
  private async pushItem(item: SyncQueueItem): Promise<void> {
    const { table_name, record_id, operation, payload } = item;

    switch (operation) {
      case 'insert': {
        const { error } = await this.supabase
          .from(table_name)
          .insert({ ...payload, id: record_id });

        if (error) throw new Error(`Insert failed: ${error.message} (${error.code})`);
        break;
      }

      case 'update': {
        // Remove local-only fields before sending to server
        const clean = { ...payload };
        delete clean._is_dirty;
        delete clean._sync_status;

        const { error } = await this.supabase
          .from(table_name)
          .update(clean)
          .eq('id', record_id);

        if (error) throw new Error(`Update failed: ${error.message} (${error.code})`);
        break;
      }

      case 'delete': {
        const { error } = await this.supabase
          .from(table_name)
          .delete()
          .eq('id', record_id);

        if (error) throw new Error(`Delete failed: ${error.message} (${error.code})`);
        break;
      }

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    // After successful push, mark local record as synced
    if (OFFLINE_WRITABLE_TABLES.includes(table_name as any)) {
      try {
        await (this.db as any)[table_name].update(record_id, {
          _is_dirty: false,
          _sync_status: 'synced',
        });
      } catch {
        // Record may not exist locally
      }
    }
  }

  // ─── Pull: Download Server Data → Dexie ──────────────────────────

  /**
   * Pull all server changes since last sync into local Dexie.
   * Uses updated_at cursor for efficient incremental sync.
   */
  async pullAll(opts?: { full?: boolean }): Promise<{ pulled: number; errors: string[] }> {
    if (this.syncing) return { pulled: 0, errors: ['Sync already in progress'] };
    this.syncing = true;

    const errors: string[] = [];
    let totalPulled = 0;

    try {
      this.emit('syncing', {
        phase: 'pull',
        current: 0,
        total: PULL_SYNC_TABLES.length,
        table_name: 'starting',
      });

      for (let i = 0; i < PULL_SYNC_TABLES.length; i++) {
        const table_name = PULL_SYNC_TABLES[i];

        this.emit('syncing', {
          phase: 'pull',
          current: i + 1,
          total: PULL_SYNC_TABLES.length,
          table_name,
        });

        try {
          const pulled = await this.pullTable(table_name, opts?.full);
          totalPulled += pulled;
        } catch (err: any) {
          errors.push(
            `[${table_name}] Pull failed: ${err?.message || String(err)}`,
          );
        }
      }
    } finally {
      this.syncing = false;
    }

    // Terminal signal so subscribers (the OFF-2 offline desk) re-read the mirror.
    this.emit(errors.length ? 'error' : 'online');
    return { pulled: totalPulled, errors };
  }

  /**
   * Pull a single table from Supabase into Dexie using cursor pagination.
   */
  private async pullTable(table_name: string, full = false): Promise<number> {
    const meta = await this.db.sync_metadata.get(table_name);
    // `full` (OFF-2 prime) forces a full re-pull — necessary for tables without
    // an `updated_at` column (class_enrollments, belt_hierarchies, …), whose
    // incremental cursor query would 42703 and never refresh.
    const cursor = full ? null : (meta?.last_cursor || meta?.last_synced_at);
    let pulled = 0;

    // First sync: download all records
    if (!cursor) {
      pulled = await this.fullTableSync(table_name);
      await this.db.sync_metadata.put({
        table_name,
        last_synced_at: new Date().toISOString(),
        record_count: pulled,
      });
      return pulled;
    }

    // Incremental sync: fetch records updated after cursor
    let hasMore = true;
    let lastId: string | null = null;

    while (hasMore) {
      let query = this.supabase
        .from(table_name)
        .select('*')
        .gt('updated_at', cursor)
        .order('updated_at', { ascending: true })
        .limit(PULL_BATCH_SIZE);

      // Cursor pagination: use id as secondary cursor for stability
      if (lastId) {
        query = query.gt('id', lastId);
      }

      const { data, error } = await query;

      if (error) throw new Error(`Supabase query failed: ${error.message}`);

      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      // Upsert records into Dexie (with conflict check)
      for (const record of data) {
        await this.upsertLocal(table_name, record);
        pulled++;
        lastId = record.id;
      }

      if (data.length < PULL_BATCH_SIZE) {
        hasMore = false;
      }
    }

    // Update sync metadata
    await this.db.sync_metadata.put({
      table_name,
      last_synced_at: new Date().toISOString(),
      last_cursor: cursor,
      record_count:
        (meta?.record_count || 0) + pulled,
    });

    return pulled;
  }

  /**
   * Full table download (first sync). Uses pagination.
   */
  private async fullTableSync(table_name: string): Promise<number> {
    let pulled = 0;
    let page = 0;

    while (true) {
      const from = page * PULL_BATCH_SIZE;
      const to = from + PULL_BATCH_SIZE - 1;

      // Order by `id` (every table has it) — NOT `updated_at`, which several
      // mirrored tables (class_enrollments, belt_hierarchies, …) don't have.
      const { data, error } = await this.supabase
        .from(table_name)
        .select('*')
        .order('id', { ascending: true })
        .range(from, to);

      if (error) throw new Error(`Full sync failed: ${error.message}`);

      if (!data || data.length === 0) break;

      await (this.db as any)[table_name].bulkPut(data);
      pulled += data.length;

      if (data.length < PULL_BATCH_SIZE) break;
      page++;
    }

    return pulled;
  }

  /**
   * Upsert a server record into local Dexie.
   * Implements Last-Write-Wins (LWW) conflict resolution.
   */
  private async upsertLocal(
    table_name: string,
    serverRecord: Record<string, unknown>,
  ): Promise<void> {
    const table = (this.db as any)[table_name];
    const existing = await table.get(serverRecord.id);

    if (!existing) {
      // No local copy — just insert
      await table.put(serverRecord);
      return;
    }

    // Check if local has dirty changes
    const isDirty = existing._is_dirty === true || existing._sync_status === 'pending';

    if (!isDirty) {
      // No local changes — server wins
      await table.put(serverRecord);
      return;
    }

    // Both modified → LWW by updated_at timestamp
    const localTime = new Date(existing.updated_at || 0).getTime();
    const serverTime = new Date((serverRecord.updated_at as string) || 0).getTime();

    if (serverTime >= localTime) {
      // Server wins: overwrite local, mark clean
      await table.put({
        ...serverRecord,
        _is_dirty: false,
        _sync_status: 'synced',
      });
    } else {
      // Local wins: keep local, mark as conflict for UI resolution
      await table.update(serverRecord.id as string, {
        _sync_status: 'conflict',
      });
    }
  }

  // ─── Full Sync Cycle ──────────────────────────────────────────────

  /**
   * Execute a full sync cycle: push local changes → pull server changes.
   * Push always happens first to avoid losing offline work.
   */
  async syncAll(): Promise<SyncResult> {
    const start = performance.now();

    if (!isOnline()) {
      return {
        pushed: 0,
        pulled: 0,
        conflicts: 0,
        errors: ['Device is offline'],
        duration_ms: 0,
      };
    }

    // Push local changes first (don't lose offline work)
    const pushResult = await this.pushAll();

    // Then pull server changes
    const pullResult = await this.pullAll();

    // Count conflicts
    let conflicts = 0;
    for (const table_name of OFFLINE_WRITABLE_TABLES) {
      try {
        const dirty = await (this.db as any)[table_name]
          .where('_sync_status')
          .equals('conflict')
          .count();
        conflicts += dirty;
      } catch {
        // table may not have _sync_status index
      }
    }

    const duration_ms = Math.round(performance.now() - start);
    const allErrors = [...pushResult.errors, ...pullResult.errors];

    if (allErrors.length > 0) {
      this.emit('error');
    } else {
      this.emit('online');
    }

    return {
      pushed: pushResult.pushed,
      pulled: pullResult.pulled,
      conflicts,
      errors: allErrors,
      duration_ms,
    };
  }

  // ─── Local CRUD Helpers (Offline-First) ──────────────────────────

  /**
   * Create a record locally. If online, also push to server immediately.
   * If offline, queues for later sync.
   */
  async createOffline(
    table_name: string,
    record: Record<string, unknown>,
  ): Promise<string> {
    // Always write to local Dexie first
    const id = (record.id as string) || crypto.randomUUID();
    const localRecord = {
      ...record,
      id,
      _is_dirty: true,
      _sync_status: 'pending' as const,
      updated_at: new Date().toISOString(),
    };

    await (this.db as any)[table_name].put(localRecord);

    if (isOnline()) {
      // Try server immediately; if it fails, queue for later
      try {
        const { error } = await this.supabase.from(table_name).insert(record);
        if (error) throw error;
        // Success: mark clean
        await (this.db as any)[table_name].update(id, {
          _is_dirty: false,
          _sync_status: 'synced',
        });
      } catch {
        // Queue for later sync
        await this.enqueue(table_name, id, 'insert', record);
      }
    } else {
      await this.enqueue(table_name, id, 'insert', record);
    }

    return id;
  }

  /**
   * Update a record locally. Queues server push.
   */
  async updateOffline(
    table_name: string,
    id: string,
    changes: Record<string, unknown>,
  ): Promise<void> {
    const merged = {
      ...changes,
      _is_dirty: true,
      _sync_status: 'pending' as const,
      updated_at: new Date().toISOString(),
    };

    await (this.db as any)[table_name].update(id, merged);
    await this.enqueue(table_name, id, 'update', merged);
  }

  /**
   * Delete a record locally. Queues server delete.
   */
  async deleteOffline(table_name: string, id: string): Promise<void> {
    await (this.db as any)[table_name].delete(id);
    await this.enqueue(table_name, id, 'delete', { id });
  }

  // ─── Health / Diagnostics ─────────────────────────────────────────

  async getQueueStats(): Promise<{
    pending: number;
    tables: Record<string, number>;
  }> {
    const all = await this.db.sync_queue.toArray();
    const tables: Record<string, number> = {};

    for (const item of all) {
      tables[item.table_name] = (tables[item.table_name] || 0) + 1;
    }

    return { pending: all.length, tables };
  }

  async getSyncMetadata(): Promise<SyncMetadata[]> {
    return this.db.sync_metadata.toArray();
  }
}

// ─── Singleton ───────────────────────────────────────────────────────

let engineInstance: SyncEngine | null = null;

export function getSyncEngine(): SyncEngine {
  if (!engineInstance) {
    engineInstance = new SyncEngine();
  }
  return engineInstance;
}

export default getSyncEngine;
