'use client'

import { useEffect, useMemo, useState } from 'react'
import { LogOut, RotateCcw } from 'lucide-react'

interface Student {
  id: string
  name: string
  parent_id?: string | null
  parent_name?: string | null
  status: 'NOT_ARRIVED' | 'ARRIVED' | 'DEPARTED'
  arrived_at?: string | null
  departed_at?: string | null
  token?: string | null
  pickup_pin?: string | number | null
  verification_type?: string | null
  face_image_url?: string | null
  face_url?: string | null
  faceImageUrl?: string | null
  face_photo_url?: string | null
  photo_url?: string | null
  profile_image_url?: string | null
  avatar_url?: string | null
  image_url?: string | null
  photo?: string | null
  image?: string | null
  face_verified?: boolean | null
  faceVerified?: boolean | null
  is_face_verified?: boolean | null
  isFaceVerified?: boolean | null
  face_verified_at?: string | null
  faceVerifiedAt?: string | null
  face_profile_verified_at?: string | null
  faceProfileVerifiedAt?: string | null
  parent_2fa_enabled?: boolean | null
  parentId2faEnabled?: boolean | null
}

interface StudentTableProps {
  students: Student[]
  onForceDepart: (studentId: string) => void
  onReset: (studentId: string) => void
  onToggleParent2fa: (studentId: string, enabled: boolean) => void
  forceDepartLoadingId: string | null
  resetStudentLoadingId: string | null
  toggleParent2faLoadingId: string | null
  pageSize?: number
}

const statusBadgeConfig = {
  NOT_ARRIVED: { label: 'Not Arrived', className: 'badge-not_arrived' },
  ARRIVED: { label: 'Arrived', className: 'badge-arrived' },
  DEPARTED: { label: 'Departed', className: 'badge-departed' }
}

const verificationBadgeConfig = {
  QR: { label: 'QR', className: 'badge-qr' },
  PIN: { label: 'PIN', className: 'badge-pin' },
  FACE: { label: 'Face', className: 'badge-face' },
  Unknown: { label: 'Unknown', className: 'badge-unknown' },
}

export function StudentTable({
  students,
  onForceDepart,
  onReset,
  onToggleParent2fa,
  forceDepartLoadingId,
  resetStudentLoadingId,
  toggleParent2faLoadingId,
  pageSize = 8,
}: StudentTableProps) {
  const [page, setPage] = useState(1)

  const totalPages = useMemo(() => {
    if (pageSize <= 0) return 1
    return Math.max(1, Math.ceil(students.length / pageSize))
  }, [students.length, pageSize])

  useEffect(() => {
    setPage(1)
  }, [students.length, pageSize])

  const pageStudents = useMemo(() => {
    const start = (page - 1) * pageSize
    const end = start + pageSize
    return students.slice(start, end)
  }, [students, page, pageSize])

  const formatTime = (iso?: string | null) => {
    if (!iso) return '-'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '-'
    return d.toLocaleTimeString()
  }

  const getVerificationType = (student: Student): keyof typeof verificationBadgeConfig => {
    if (String(student.verification_type || '').toUpperCase() === 'FACE') return 'FACE'
    if (student.token != null && String(student.token).trim() !== '') return 'QR'
    if (student.pickup_pin != null && String(student.pickup_pin).trim() !== '') return 'PIN'
    return 'Unknown'
  }

  return (
    <div>
      <div className="table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Student ID</th>
              <th>Parent ID</th>
              <th>Status</th>
              <th>Arrival Time</th>
              <th>Departure Time</th>
              <th>Verification Type</th>
              <th>Parent ID 2FA</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageStudents.map((student) => (
              <tr key={student.id}>
                <td className="admin-student-name">{student.name}</td>
                <td>{student.id}</td>
                <td>{student.parent_id || '-'}</td>
                <td>
                  <span className={`admin-badge ${statusBadgeConfig[student.status].className}`}>
                    {statusBadgeConfig[student.status].label}
                  </span>
                </td>
                <td>{formatTime(student.arrived_at)}</td>
                <td>{formatTime(student.departed_at)}</td>
                <td>
                  {(() => {
                    const v = getVerificationType(student)
                    return (
                      <span className={`admin-badge ${verificationBadgeConfig[v].className}`}>
                        {verificationBadgeConfig[v].label}
                      </span>
                    )
                  })()}
                </td>
                <td>
                  {(() => {
                    const isEnabled = Boolean(student.parent_2fa_enabled ?? student.parentId2faEnabled)
                    const isBusy = toggleParent2faLoadingId === student.id
                    return (
                      <button
                        className={isEnabled ? 'btn-depart' : 'btn-reset'}
                        onClick={() => onToggleParent2fa(student.id, !isEnabled)}
                        disabled={isBusy || forceDepartLoadingId === student.id || resetStudentLoadingId === student.id}
                        title={isEnabled ? 'Disable parent ID 2FA for departure' : 'Enable parent ID 2FA for departure'}
                      >
                        {isBusy ? 'Working…' : isEnabled ? 'Disable 2FA' : 'Enable 2FA'}
                      </button>
                    )
                  })()}
              </td>
              <td>
                  <div className="admin-tbl-actions">
                    <button
                      className="btn-depart"
                      onClick={() => onForceDepart(student.id)}
                      title="Force Depart"
                      disabled={forceDepartLoadingId === student.id || resetStudentLoadingId === student.id}
                    >
                      <LogOut size={14} />
                      {forceDepartLoadingId === student.id ? 'Working…' : 'Force Depart'}
                    </button>
                    <button
                      className="btn-reset"
                      onClick={() => onReset(student.id)}
                      title={student.status === 'DEPARTED' ? 'Start new arrival/departure cycle' : 'Reset student'}
                      disabled={forceDepartLoadingId === student.id || resetStudentLoadingId === student.id}
                    >
                      <RotateCcw size={14} />
                      {resetStudentLoadingId === student.id
                        ? 'Working…'
                        : student.status === 'DEPARTED'
                          ? 'New Cycle'
                          : 'Reset'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', color: '#6b7280' }}>
                  No students found matching current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {students.length > pageSize ? (
        <div className="admin-pagination" aria-label="Student table pagination">
          <button
            className="admin-pagination-btn"
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Previous
          </button>
          <div className="admin-pagination-info">
            Page {page} of {totalPages}
          </div>
          <button
            className="admin-pagination-btn"
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  )
}
