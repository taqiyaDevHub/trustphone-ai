import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Home' },
  { to: '/verify', label: 'Verify Phone' },
  { to: '/risk-check', label: 'AI Risk Check' },
  { to: '/report-stolen', label: 'Report Stolen' },
]

export default function Navigation() {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-navy/95 backdrop-blur">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <NavLink to="/" className="text-lg font-bold text-white">
            TrustPhone AI
          </NavLink>
          <nav className="hidden sm:flex sm:gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-border text-white'
                      : 'text-muted hover:bg-border hover:text-white'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-border py-2 sm:hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-border text-white'
                    : 'text-muted hover:bg-border hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  )
}
