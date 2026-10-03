import { LoaderCircle } from 'lucide-react'
import { Suspense, lazy } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { NAV } from '@/components/layout/nav'
import ControlCenter from '@/pages/ControlCenter'
import Planned from '@/pages/Planned'

// Ekranlar ayrı paketlerde yüklenir; ilk açılış sadece Kontrol Merkezi'ni indirir
const MotorTrace = lazy(() => import('@/pages/MotorTrace'))
const QualityRework = lazy(() => import('@/pages/QualityRework'))
const Alarms = lazy(() => import('@/pages/Alarms'))
const Torque = lazy(() => import('@/pages/Torque'))
const Kpi = lazy(() => import('@/pages/Kpi'))
const Terminal = lazy(() => import('@/pages/Terminal'))
const Maintenance = lazy(() => import('@/pages/Maintenance'))
const Guide = lazy(() => import('@/pages/Guide'))

const BUILT = new Set(['/', '/motor', '/kalite', '/alarmlar', '/tork', '/kpi', '/terminal', '/bakim', '/rehber'])

function Loading() {
  return (
    <div className="grid h-[50vh] place-items-center text-fg-2">
      <LoaderCircle className="size-6 animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<ControlCenter />} />
            <Route path="motor" element={<MotorTrace />} />
            <Route path="motor/:sn" element={<MotorTrace />} />
            <Route path="kalite" element={<QualityRework />} />
            <Route path="alarmlar" element={<Alarms />} />
            <Route path="tork" element={<Torque />} />
            <Route path="kpi" element={<Kpi />} />
            <Route path="terminal" element={<Terminal />} />
            <Route path="terminal/:op" element={<Terminal />} />
            <Route path="bakim" element={<Maintenance />} />
            <Route path="rehber" element={<Guide />} />
            {NAV.filter((n) => !BUILT.has(n.to)).map((n) => (
              <Route key={n.to} path={`${n.to.slice(1)}/*`} element={<Planned />} />
            ))}
            <Route path="*" element={<Planned />} />
          </Route>
        </Routes>
      </Suspense>
    </HashRouter>
  )
}
