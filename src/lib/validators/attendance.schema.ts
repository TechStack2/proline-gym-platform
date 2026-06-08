import { z } from 'zod';

// ─── Attendance Status Enum ─────────────────────────────────────────
export const ATTENDANCE_STATUS_VALUES = ['present', 'absent', 'late', 'excused'] as const;
export const attendanceStatusEnum = z.enum(ATTENDANCE_STATUS_VALUES);
export type AttendanceStatus = z.infer<typeof attendanceStatusEnum>;

// ─── Attendance Record Schema ───────────────────────────────────────
// Validates a single attendance record before upsert to attendance_records
export const attendanceRecordSchema = z.object({
  class_schedule_id: z.string().uuid('Invalid class schedule ID'),
  student_id: z.string().uuid('Invalid student ID'),
  status: attendanceStatusEnum,
  date: z.string().min(1, 'Date is required'),
});

export type AttendanceRecord = z.infer<typeof attendanceRecordSchema>;
