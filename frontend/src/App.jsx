import { Routes, Route, useLocation } from 'react-router-dom'
import Navigation from './components/Navigation'
import Home from './pages/Home'
import VerifyPhone from './pages/VerifyPhone'
import ScanImei from './pages/ScanImei'
import RiskCheck from './pages/RiskCheck'
import ReportStolen from './pages/ReportStolen'

export default function App() {
  // Keying the wrapper by pathname gives each route a light fade-in
  // transition without any router changes.
  const location = useLocation()

  return (
    <div className="flex min-h-screen flex-col">
      <Navigation />
      <main className="flex-1">
        <div key={location.pathname} className="animate-fade-in">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/verify" element={<VerifyPhone />} />
            <Route path="/scan-imei" element={<ScanImei />} />
            <Route path="/risk-check" element={<RiskCheck />} />
            <Route path="/report-stolen" element={<ReportStolen />} />
          </Routes>
        </div>
      </main>
      <footer className="border-t border-line bg-white/60">
        <div className="mx-auto w-full max-w-5xl px-4 py-8 text-center sm:px-6 lg:px-8">
          <p className="text-sm font-semibold text-ink">
            TrustPhone AI — Check Before You Buy.
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-ink-faint">
            Hackathon prototype using demo and synthetic data. Not connected to
            government, police, or live national databases.
          </p>
        </div>
      </footer>
      {/* Spacer so the fixed mobile tab bar never covers page content */}
      <div className="h-16 md:hidden" aria-hidden="true" />
    </div>
  )
}
