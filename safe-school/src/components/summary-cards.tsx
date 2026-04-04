'use client'

import { Users, UserX, LogOut, Clock } from 'lucide-react'

interface SummaryCardsProps {
  stats: {
    arrived: number
    notArrived: number
    departed: number
    pendingPickup: number
  }
}

export function SummaryCards({ stats }: SummaryCardsProps) {
  const cards = [
    {
      label: 'Total Arrived',
      value: stats.arrived,
      icon: Users,
      iconClass: 'icon-arrived'
    },
    {
      label: 'Not Arrived',
      value: stats.notArrived,
      icon: UserX,
      iconClass: 'icon-not-arrived'
    },
    {
      label: 'Departed',
      value: stats.departed,
      icon: LogOut,
      iconClass: 'icon-departed'
    },
    {
      label: 'Pending Pickup',
      value: stats.pendingPickup,
      icon: Clock,
      iconClass: 'icon-pending'
    }
  ]

  return (
    <div className="admin-summary-grid">
      {cards.map((card) => {
        const IconComponent = card.icon
        return (
          <div key={card.label} className="admin-card admin-summary-card">
            <div>
              <p className="admin-summary-label">{card.label}</p>
              <p className="admin-summary-value">{card.value}</p>
            </div>
            <div className={`admin-icon ${card.iconClass}`}>
              <IconComponent size={24} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
