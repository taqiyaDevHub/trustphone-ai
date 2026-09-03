import { Routes, Route } from 'react-router-dom'
import Navigation from './components/Navigation'
import Home from './pages/Home'
import VerifyPhone from './pages/VerifyPhone'
import ScanImei from './pages/ScanImei'
import RiskCheck from './pages/RiskCheck'
import ReportStolen from './pages/ReportStolen'

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navigation />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/verify" element={<VerifyPhone />} />
          <Route path="/scan-imei" element={<ScanImei />} />
          <Route path="/risk-check" element={<RiskCheck />} />
          <Route path="/report-stolen" element={<ReportStolen />} />
        </Routes>
      </main>
      <footer className="border-t border-border bg-panel py-6">
        <div className="mx-auto max-w-3xl px-4 text-center text-sm text-muted sm:px-6 lg:px-8">
          TrustPhone AI — Check Before You Buy.
        </div>
      </footer>
    </div>
  )
}
