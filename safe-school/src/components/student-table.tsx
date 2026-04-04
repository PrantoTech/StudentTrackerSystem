'use client'

import { useEffect, useMemo, useState } from 'react'
import { LogOut, RotateCcw } from 'lucide-react'

interface Student {
  id: string
  name: string
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
}

interface StudentTableProps {
  students: Student[]
  onForceDepart: (studentId: string) => void
  onReset: (studentId: string) => void
  onSetFaceProfile: (student: Student) => void
  onClearFaceProfile: (studentId: string) => void
  forceDepartLoadingId: string | null
  resetStudentLoadingId: string | null
  faceProfileLoadingId: string | null
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
  onSetFaceProfile,
  onClearFaceProfile,
  forceDepartLoadingId,
  resetStudentLoadingId,
  faceProfileLoadingId,
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

  const isFaceProfileVerified = (student: Student) => {
    return Boolean(
      student.face_verified ||
      student.faceVerified ||
      student.is_face_verified ||
      student.isFaceVerified ||
      student.face_verified_at ||
      student.faceVerifiedAt ||
      student.face_profile_verified_at ||
      student.faceProfileVerifiedAt
    )
  }

  const getFaceProfileUrl = (student: Student) => {
    const keys: Array<keyof Student> = [
      'face_image_url',
      'face_url',
      'faceImageUrl',
      'face_photo_url',
      'photo_url',
      'profile_image_url',
      'avatar_url',
      'image_url',
      'photo',
      'image',
    ]
    for (const key of keys) {
      const value = student[key]
      if (typeof value === 'string' && value.trim() !== '') return value.trim()
    }
    return ''
  }

  return (
    <div>
      <div className="table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Arrival Time</th>
              <th>Departure Time</th>
              <th>Verification Type</th>
              <th>Face Profile</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageStudents.map((student) => (
              <tr key={student.id}>
                <td className="admin-student-name">{student.name}</td>
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
                    const faceUrl = getFaceProfileUrl(student)
                    const verified = isFaceProfileVerified(student)
                    return (
                      <span className={`admin-badge ${verified ? 'badge-arrived' : faceUrl ? 'badge-pin' : 'badge-not_arrived'}`}>
                        {verified ? 'Verified' : faceUrl ? 'Registered' : 'Missing'}
                      </span>
                    )
                  })()}
                </td>
                <td>
                  <div className="admin-tbl-actions">
                    <button
                      className="btn-reset"
                      onClick={() => onSetFaceProfile(student)}
                      title="Set Face Profile"
                      disabled={
                        faceProfileLoadingId === student.id ||
                        forceDepartLoadingId === student.id ||
                        resetStudentLoadingId === student.id
                      }
                    >
                      {faceProfileLoadingId === student.id ? 'Working…' : 'Upload Face'}
                    </button>
                    <button
                      className="btn-reset"
                      onClick={() => onClearFaceProfile(student.id)}
                      title="Clear Face Profile"
                      disabled={
                        faceProfileLoadingId === student.id ||
                        forceDepartLoadingId === student.id ||
                        resetStudentLoadingId === student.id
                      }
                    >
                      {faceProfileLoadingId === student.id ? 'Working…' : 'Clear Face'}
                    </button>
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
                      title="Reset"
                      disabled={forceDepartLoadingId === student.id || resetStudentLoadingId === student.id}
                    >
                      <RotateCcw size={14} />
                      {resetStudentLoadingId === student.id ? 'Working…' : 'Reset'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: '#6b7280' }}>
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
