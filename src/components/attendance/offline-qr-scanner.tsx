// ============================================================
// D3: Offline QR Attendance Scanner
// PRO LINE Gym Platform — Phase D Offline Sync & PWA
// ============================================================
// html5-qrcode works entirely in the browser — no server needed.
// Attendance is stored locally in Dexie, then synced when online.
// ============================================================

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { getSyncEngine, isOnline } from '@/lib/db/sync-engine';
import { getOfflineDB } from '@/lib/db/schema';
import type { OfflineAttendanceRecord } from '@/lib/db/schema';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────

interface QRAttendanceProps {
  classId: string;
  scheduleId?: string;
  attendanceDate: string; // YYYY-MM-DD
  className: string;
  locale: string;
  dictionaries: {
    scanTitle: string;
    scanPrompt: string;
    scanning: string;
    present: string;
    absent: string;
    late: string;
    excused: string;
    checkIn: string;
    checkOut: string;
    studentNotFound: string;
    alreadyMarked: string;
    offlineQueued: string;
    onlineSaved: string;
    syncPending: string;
    error: string;
    cameraPermission: string;
    stopScanning: string;
    startScanning: string;
  };
}

interface AttendanceResult {
  studentId: string;
  studentName: string;
  status: 'present' | 'late';
  checkInTime: string;
  synced: boolean;
}

// ─── Component ───────────────────────────────────────────────────────

export function OfflineQRScanner({
  classId,
  scheduleId,
  attendanceDate,
  className,
  locale,
  dictionaries: d,
}: QRAttendanceProps) {
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<AttendanceResult[]>([]);
  const [status, setStatus] = useState<'idle' | 'scanning' | 'success' | 'warning' | 'error'>(
    'idle',
  );
  const [message, setMessage] = useState(d.scanPrompt);
  const [pendingSync, setPendingSync] = useState(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerDivId = 'qr-scanner-container';

  const isAr = locale === 'ar';
  const isOnlineNow = isOnline();

  // ─── Init / Cleanup ────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Sync status check ─────────────────────────────────────────────

  useEffect(() => {
    const engine = getSyncEngine();
    const interval = setInterval(async () => {
      const stats = await engine.getQueueStats();
      setPendingSync(stats.pending);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // ─── QR Scanner ────────────────────────────────────────────────────

  const startScanner = useCallback(async () => {
    try {
      const scanner = new Html5Qrcode(scannerDivId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' }, // rear camera
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        onScanSuccess,
        undefined, // ignore scan errors
      );

      setScanning(true);
      setStatus('scanning');
      setMessage(d.scanning);
    } catch (err: any) {
      setStatus('error');
      setMessage(`${d.cameraPermission}: ${err?.message || String(err)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, scheduleId, attendanceDate, d]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch {
        // scanner may already be stopped
      }
      scannerRef.current = null;
    }
    setScanning(false);
    setStatus('idle');
    setMessage(d.scanPrompt);
  }, [d]);

  // ─── Scan Handler ──────────────────────────────────────────────────

  const onScanSuccess = useCallback(
    async (decodedText: string) => {
      // QR code format: student:<uuid>
      // Example: student:550e8400-e29b-41d4-a716-446655440000
      const match = decodedText.match(/^student:(.+)$/);
      if (!match) {
        setStatus('warning');
        setMessage(d.studentNotFound);
        setTimeout(() => {
          setStatus('scanning');
          setMessage(d.scanning);
        }, 2000);
        return;
      }

      const studentId = match[1];

      // Check if already marked today
      const alreadyMarked = results.find(
        (r) => r.studentId === studentId,
      );
      if (alreadyMarked) {
        setStatus('warning');
        setMessage(`${d.alreadyMarked}: ${alreadyMarked.studentName}`);
        setTimeout(() => {
          setStatus('scanning');
          setMessage(d.scanning);
        }, 2000);
        return;
      }

      // Look up student in local Dexie
      const db = getOfflineDB();
      const student = await db.students.get(studentId);

      const studentName = student
        ? (isAr ? student.profile_name_ar : student.profile_name_en) || 'Unknown'
        : 'Unknown';

      const now = new Date().toISOString();
      const checkInTime = new Date().toLocaleTimeString(
        isAr ? 'ar-LB-u-nu-latn' : 'en-US',
        { hour: '2-digit', minute: '2-digit' },
      );

      // Create attendance record
      const recordId = crypto.randomUUID();
      const record: OfflineAttendanceRecord & Record<string, unknown> = {
        id: recordId,
        class_id: classId,
        student_id: studentId,
        schedule_id: scheduleId || undefined,
        attendance_date: attendanceDate,
        status: 'present',
        check_in_time: now,
        updated_at: now,
        student_name_ar: student?.profile_name_ar,
        student_name_en: student?.profile_name_en,
        class_name_ar: className,
        class_name_en: className,
        _is_dirty: true,
        _sync_status: 'pending',
      };

      // Save to local Dexie
      await db.attendance_records.put(record as OfflineAttendanceRecord);

      // Try server immediately if online, otherwise queue
      const engine = getSyncEngine();
      if (isOnlineNow) {
        try {
          await engine.pushAll();
          setStatus('success');
          setMessage(`${d.onlineSaved}: ${studentName}`);
        } catch {
          await engine.enqueue('attendance_records', recordId, 'insert', record);
          setStatus('success');
          setMessage(`${d.offlineQueued}: ${studentName}`);
        }
      } else {
        await engine.enqueue('attendance_records', recordId, 'insert', record);
        setStatus('success');
        setMessage(`${d.offlineQueued}: ${studentName}`);
      }

      // Add to visible results
      setResults((prev) => [
        {
          studentId,
          studentName: studentName || 'Unknown',
          status: 'present',
          checkInTime,
          synced: isOnlineNow,
        },
        ...prev,
      ]);

      // Reset scanner message after a beat
      setTimeout(() => {
        setStatus('scanning');
        setMessage(d.scanning);
      }, 2500);
    },
    [classId, scheduleId, attendanceDate, className, d, isOnlineNow, results, isAr],
  );

  // ─── Manual Status Toggle ──────────────────────────────────────────

  const toggleStatus = useCallback(
    async (index: number, newStatus: 'present' | 'late' | 'absent' | 'excused') => {
      const updated = [...results];
      updated[index] = { ...updated[index], status: newStatus === 'late' ? 'late' : 'present' };
      setResults(updated);

      // Update in local Dexie
      const db = getOfflineDB();
      const record = results[index];
      await db.attendance_records
        .where({ student_id: record.studentId, attendance_date: attendanceDate })
        .modify({ status: newStatus, _is_dirty: true, _sync_status: 'pending' });
    },
    [results, attendanceDate],
  );

  // ─── Render ────────────────────────────────────────────────────────

  const statusColors: Record<string, string> = {
    present: 'bg-green-100 text-green-800 border-green-300',
    late: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    absent: 'bg-red-100 text-red-800 border-red-300',
    excused: 'bg-blue-100 text-blue-800 border-blue-300',
  };

  return (
    <div className={cn('space-y-6')}>
      {/* Sync Status Bar */}
      {!isOnlineNow && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-amber-800 text-sm">
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <span>
            {d.syncPending}: {pendingSync} {pendingSync === 1 ? 'record' : 'records'}
          </span>
        </div>
      )}

      {/* QR Scanner View */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div
          id={scannerDivId}
          className={cn(
            'w-full aspect-square max-w-md mx-auto',
            !scanning && 'hidden',
          )}
        />

        {!scanning && (
          <div className="flex flex-col items-center justify-center p-12 text-center gap-4">
            <div className="rounded-full bg-primary/10 p-6">
              <svg
                className="h-12 w-12 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75z"
                />
              </svg>
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground">{d.scanTitle}</p>
              <p className="text-sm text-muted-foreground mt-1">{d.scanPrompt}</p>
            </div>
            <button
              onClick={startScanner}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {d.startScanning}
            </button>
          </div>
        )}

        {scanning && (
          <div className="flex justify-center p-4">
            <button
              onClick={stopScanner}
              className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-sm hover:bg-accent transition-colors"
            >
              {d.stopScanning}
            </button>
          </div>
        )}
      </div>

      {/* Status message */}
      {message !== d.scanPrompt && message !== d.scanning && (
        <div
          className={cn(
            'rounded-lg px-4 py-3 text-sm font-medium text-center',
            status === 'success' && 'bg-green-50 text-green-700 border border-green-200',
            status === 'warning' && 'bg-amber-50 text-amber-700 border border-amber-200',
            status === 'error' && 'bg-red-50 text-red-700 border border-red-200',
          )}
        >
          {message}
        </div>
      )}

      {/* Attendance Results */}
      {results.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h3 className="font-semibold text-foreground">
              {d.checkIn} ({results.length})
            </h3>
            <span className="text-xs text-muted-foreground">
              {d.scanTitle}: {className}
            </span>
          </div>
          <div className="divide-y">
            {results.map((result, idx) => (
              <div
                key={result.studentId}
                className="flex items-center justify-between px-6 py-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                      statusColors[result.status],
                    )}
                  >
                    {result.status === 'present'
                      ? d.present
                      : result.status === 'late'
                        ? d.late
                        : result.status === 'absent'
                          ? d.absent
                          : d.excused}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {result.studentName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {result.checkInTime}
                      {!result.synced && (
                        <span className="ms-2 text-amber-600">({d.offlineQueued})</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  {(['present','late','absent','excused'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => toggleStatus(idx, s)}
                      className={cn(
                        'rounded px-2 py-1 text-xs transition-colors',
                        result.status === s
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:bg-accent',
                      )}
                    >
                      {s === 'present'
                        ? d.present
                        : s === 'late'
                          ? d.late
                          : s === 'absent'
                            ? d.absent
                            : d.excused}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
