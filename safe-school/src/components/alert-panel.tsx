'use client'

import { AlertCircle, AlertTriangle, Zap } from 'lucide-react'

interface Alert {
  id: string
  type: 'warning' | 'error' | 'info'
  title: string
  message: string
  timestamp?: string
}

interface AlertPanelProps {
  alerts: Alert[]
}

const alertConfig = {
  warning: {
    className: 'alert-warning',
    icon: AlertTriangle,
  },
  error: {
    className: 'alert-error',
    icon: AlertCircle,
  },
  info: {
    className: 'alert-info',
    icon: Zap,
  }
}

export function AlertPanel({ alerts }: AlertPanelProps) {
  return (
    <div>
      <h3 className="admin-alerts-header">Recent Alerts</h3>
      <div className="admin-alerts-list">
        {alerts.length === 0 ? (
          <div className="admin-empty-alerts">
            <p>No active alerts</p>
          </div>
        ) : (
          alerts.map((alert) => {
            const config = alertConfig[alert.type]
            const IconComponent = config.icon
            return (
              <div key={alert.id} className={`admin-alert ${config.className}`}>
                <div className="alert-icon">
                  <IconComponent size={16} />
                </div>
                <div className="alert-content">
                  <p className="alert-title">{alert.title}</p>
                  <p className="alert-msg">{alert.message}</p>
                  {alert.timestamp ? <p className="alert-time">{alert.timestamp}</p> : null}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
