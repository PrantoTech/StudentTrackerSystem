'use client'

import { Search } from 'lucide-react'

interface SearchFilterBarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  filterStatus: string
  onFilterChange: (status: string) => void
}

export function SearchFilterBar({
  searchQuery,
  onSearchChange,
  filterStatus,
  onFilterChange
}: SearchFilterBarProps) {
  return (
    <div className="admin-filter-bar">
      <div className="admin-search-wrapper">
        <Search className="admin-search-icon" size={20} />
        <input
          type="search"
          placeholder="Search student..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="admin-search-input"
        />
      </div>
      <select
        className="admin-select"
        value={filterStatus}
        onChange={(e) => onFilterChange(e.target.value)}
      >
        <option value="ALL">All Status</option>
        <option value="ARRIVED">Arrived</option>
        <option value="NOT_ARRIVED">Not Arrived</option>
        <option value="DEPARTED">Departed</option>
      </select>
    </div>
  )
}
