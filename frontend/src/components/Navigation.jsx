import { NavLink } from 'react-router-dom'
import {
  HomeIcon,
  ShieldCheckIcon,
  ScanLineIcon,
  GaugeIcon,
  FlagIcon,
} from './icons'

const navItems = [
  { to: '/', label: 'Home', short: 'Home', Icon: HomeIcon },
  { to: '/verify', label: 'Verify Phone', short: 'Verify', Icon: ShieldCheckIcon },
  { to: '/scan-imei', label: 'Scan IMEI', short: 'Scan', Icon: ScanLineIcon },
  { to: '/risk-check', label: 'AI Risk Check', short: 'Risk', Icon: GaugeIcon },
  { to: '/report-stolen', label: 'Report Stolen', short: 'Report', Icon: FlagIcon },
]

export default function Navigation() {
  return (
    <>
      {/* ---- Desktop / tablet header ---- */}
      <header className="sticky top-0 z-40 border-b border-line/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <NavLink
            to="/"
            className="flex items-center gap-2.5 rounded-lg"
            aria-label="TrustPhone AI — home"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-teal-500 text-white shadow-sm shadow-primary-600/30">
              <ShieldCheckIcon className="h-5 w-5" />
            </span>
            <span className="text-[17px] font-bold tracking-tight text-ink">
              TrustPhone&nbsp;<span className="text-primary-600">AI</span>
            </span>
          </NavLink>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {navItems.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `nav-link ${isActive ? 'nav-link-active' : ''}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* ---- Mobile bottom tab bar ---- */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur-md md:hidden"
        aria-label="Primary mobile"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5 pb-[env(safe-area-inset-bottom)]">
          {navItems.map(({ to, short, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className="relative flex min-w-0 flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[11px] font-medium"
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute top-0 h-0.5 w-8 rounded-full bg-primary-600"
                    />
                  )}
                  <Icon
                    className={`h-[22px] w-[22px] ${
                      isActive ? 'text-primary-600' : 'text-ink-faint'
                    }`}
                  />
                  <span className={isActive ? 'font-semibold text-primary-600' : 'text-ink-muted'}>
                    {short}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  )
}
