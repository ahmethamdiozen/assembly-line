import { useId } from 'react'
import type { ReactNode } from 'react'

/**
 * TM50 iki zamanlı 4 silindirli (boxer) motorun önden görünüşü (R-013, AC-03).
 * Motor hatta ilerledikçe parça parça "büyür": çıplak bloktan pervane flanşlı, egzozlu motora.
 * Hangi parçanın görüneceği, motorun sırasıyla bitirdiği operasyon sayısından (`completed`) gelir;
 * şu an yapılan operasyonun parçası (`active`) soluk çizilir.
 */

/** Ana hat sırası (OP005 … OP110) → o operasyonda eklenen parçalar */
const PARTS_BY_STEP: Part[][] = [
  ['idtag'], // OP005 motor bilgileri (palet kimlik etiketi)
  ['block', 'crank'], // OP010 motor bloğu + krank
  ['sealant'], // OP015 gasket sealant
  ['cover'], // OP020 blok kapatma
  ['mounts'], // OP030 askı grubu
  [], // OP040 döndürme
  ['cylinders'], // OP050 silindir bloğu
  ['throttles'], // OP060 hava emiş / gaz kelebeği
  ['electrics'], // OP070 kablo + alternatör
  ['flange'], // OP080 marş motoru + pervane flanşı
  ['exhaust'], // OP090 egzoz
  ['qc'], // OP100 kalite
  [], // OP110 indirme
]

type Part = 'idtag' | 'block' | 'crank' | 'sealant' | 'cover' | 'mounts' | 'cylinders' | 'throttles' | 'electrics' | 'flange' | 'exhaust' | 'qc'

interface Props {
  /** Sırasıyla tamamlanan ana hat operasyonu sayısı (0–13) */
  completed: number
  /** Şu an çalışılan operasyon (sıra indeksi, 0'dan); parçaları soluk çizilir */
  active?: number | null
  width?: number
  pallet?: boolean
  className?: string
  title?: string
}

export function Tm50Engine({ completed, active = null, width = 96, pallet = true, className, title }: Props) {
  const uid = useId().replace(/:/g, '')
  const id = (n: string) => `${uid}-${n}`
  const done = new Set<Part>(PARTS_BY_STEP.slice(0, completed).flat())
  const doing = new Set<Part>(active !== null && active >= completed ? PARTS_BY_STEP[active] : [])
  const show = (p: Part, node: ReactNode) => (done.has(p) ? node : doing.has(p) ? <g opacity={0.35}>{node}</g> : null)
  const height = (width * 86) / 120
  const label = title ?? `TM50 motoru, ${completed}/13 operasyon tamamlandı`

  return (
    <svg viewBox="0 0 120 86" width={width} height={height} role="img" aria-label={label} className={className}>
      <title>{label}</title>
      <defs>
        <linearGradient id={id('alu')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#dfe5ea" />
          <stop offset="1" stopColor="#97a3ad" />
        </linearGradient>
        <linearGradient id={id('steel')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#eef2f5" />
          <stop offset="1" stopColor="#a7b2bb" />
        </linearGradient>
        <linearGradient id={id('brass')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3e7bf" />
          <stop offset="0.55" stopColor="#d8bf7c" />
          <stop offset="1" stopColor="#a88947" />
        </linearGradient>
        <linearGradient id={id('fin')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5d6871" />
          <stop offset="1" stopColor="#2f383f" />
        </linearGradient>
        <pattern id={id('fins')} width="2.6" height="4" patternUnits="userSpaceOnUse">
          <rect width="1.3" height="4" fill="#232b31" opacity="0.55" />
        </pattern>
      </defs>

      {pallet && (
        <g>
          <rect x="16" y="79" width="88" height="5" rx="1.5" fill="#b9c4cc" stroke="#8796a3" strokeWidth="0.6" />
          <rect x="22" y="76.5" width="10" height="3" rx="0.8" fill="#8796a3" />
          <rect x="88" y="76.5" width="10" height="3" rx="0.8" fill="#8796a3" />
        </g>
      )}

      {show(
        'idtag',
        <g>
          <rect x="51" y="69.5" width="18" height="8" rx="1.5" fill="#ffffff" stroke="#3d8db8" strokeWidth="0.8" />
          <path d="M54 72.2 H66 M54 74.8 H62" stroke="#3d8db8" strokeWidth="0.9" />
        </g>,
      )}

      {/* Arka silindir çifti */}
      {show(
        'cylinders',
        <g>
          <Cylinder x={21} y={27} w={23} h={15} head="left" fillId={id('fin')} finsId={id('fins')} dim />
          <Cylinder x={76} y={27} w={23} h={15} head="right" fillId={id('fin')} finsId={id('fins')} dim />
        </g>,
      )}

      {/* Askı grubu */}
      {show(
        'mounts',
        <g>
          <path d="M47 26 L40 13 M73 26 L80 13" stroke="#46515a" strokeWidth="2.4" strokeLinecap="round" />
          {[40, 80].map((x) => (
            <g key={x}>
              <circle cx={x} cy="11.5" r="3.2" fill="#2f383f" />
              <circle cx={x} cy="11.5" r="1.2" fill="#c9d1d8" />
            </g>
          ))}
        </g>,
      )}

      {/* Motor bloğu (karter) */}
      {show(
        'block',
        <g>
          <rect x="42" y="25" width="36" height="40" rx="6" fill={`url(#${id('alu')})`} stroke="#6b7782" strokeWidth="0.8" />
          <path d="M45 33 H75 M45 57 H75" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="0.8" />
        </g>,
      )}
      {show('sealant', <path d="M43.5 45 H76.5" stroke="#2f6f93" strokeWidth="1.3" strokeLinecap="round" />)}
      {show(
        'cover',
        <g>
          <rect x="45" y="20" width="30" height="7" rx="2" fill="#a3aeb7" stroke="#6b7782" strokeWidth="0.7" />
          {[49, 56, 64, 71].map((x) => (
            <circle key={x} cx={x} cy="23.5" r="1" fill="#55606a" />
          ))}
        </g>,
      )}
      {show(
        'crank',
        <g>
          <circle cx="60" cy="47" r="5.5" fill="#6b7782" />
          <circle cx="60" cy="47" r="2.4" fill="#c9d1d8" />
        </g>,
      )}

      {/* Ön silindir çifti */}
      {show(
        'cylinders',
        <g>
          <Cylinder x={19} y={36} w={24} h={19} head="left" fillId={id('fin')} finsId={id('fins')} />
          <Cylinder x={77} y={36} w={24} h={19} head="right" fillId={id('fin')} finsId={id('fins')} />
        </g>,
      )}

      {/* Gaz kelebekleri (4 adet) ve bağlantı çubuğu */}
      {show(
        'throttles',
        <g>
          <path d="M29.5 24 V37 M38.5 24 V37 M81.5 24 V37 M90.5 24 V37" stroke="#8c98a2" strokeWidth="2.6" />
          {[26, 35, 78, 87].map((x) => (
            <g key={x}>
              <rect x={x} y="14" width="7" height="10" rx="1.5" fill={`url(#${id('steel')})`} stroke="#7d8992" strokeWidth="0.6" />
              <ellipse cx={x + 3.5} cy="14" rx="3.5" ry="1.2" fill="#55606a" />
            </g>
          ))}
          <path d="M33 20 H35 M42 20 H78 M85 20 H87" stroke="#b99a52" strokeWidth="0.9" />
        </g>,
      )}

      {/* Kablo demeti ve alternatör */}
      {show(
        'electrics',
        <g>
          <path d="M41 63 C31 62 22 60 13 53" stroke="#b5483c" strokeWidth="1.3" fill="none" />
          <path d="M79 63 C89 62 98 60 107 53" stroke="#2b333a" strokeWidth="1.3" fill="none" />
          <rect x="33" y="60" width="13" height="10" rx="4" fill={`url(#${id('steel')})`} stroke="#7d8992" strokeWidth="0.6" />
          <path d="M36 61.5 V68.5 M39.5 61.5 V68.5 M43 61.5 V68.5" stroke="#7d8992" strokeWidth="0.6" />
        </g>,
      )}

      {/* Egzoz */}
      {show(
        'exhaust',
        <g stroke="#8a6e55" strokeWidth="2.6" fill="none" strokeLinecap="round">
          <path d="M13 56 C13 68 36 72 52 74" />
          <path d="M107 56 C107 68 84 72 68 74" />
          <path d="M52 74 H68" strokeWidth="3.2" />
        </g>,
      )}

      {/* Marş motoru ve pervane flanşı (marş dişlisi) */}
      {show(
        'flange',
        <g>
          <rect x="70" y="61" width="17" height="8" rx="3" fill="#4b5560" />
          <circle cx="60" cy="47" r="16.6" fill="none" stroke="#8a7440" strokeWidth="1.6" strokeDasharray="0.9 0.9" />
          <circle cx="60" cy="47" r="16" fill={`url(#${id('brass')})`} stroke="#8a7440" strokeWidth="0.7" />
          <circle cx="60" cy="47" r="8.5" fill={`url(#${id('steel')})`} stroke="#6b7782" strokeWidth="0.7" />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <circle key={a} cx={60 + 5.6 * Math.cos((a * Math.PI) / 180)} cy={47 + 5.6 * Math.sin((a * Math.PI) / 180)} r="1" fill="#5f6b75" />
          ))}
          <circle cx="60" cy="47" r="2.2" fill="#8c98a2" />
        </g>,
      )}

      {show(
        'qc',
        <g>
          <circle cx="106" cy="13" r="6.5" fill="#43a978" stroke="#ffffff" strokeWidth="1.2" />
          <path d="M103 13.2 L105.2 15.4 L109.2 10.8" stroke="#ffffff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>,
      )}
    </svg>
  )
}

/** Kanatçıklı silindir + silindir kapağı + buji */
function Cylinder({ x, y, w, h, head, fillId, finsId, dim = false }: { x: number; y: number; w: number; h: number; head: 'left' | 'right'; fillId: string; finsId: string; dim?: boolean }) {
  const hw = 9
  const hx = head === 'left' ? x - hw + 1 : x + w - 1
  const plugX = head === 'left' ? hx - 2.5 : hx + hw
  return (
    <g opacity={dim ? 0.75 : 1}>
      <rect x={x} y={y} width={w} height={h} rx="1.5" fill={`url(#${fillId})`} />
      <rect x={x} y={y} width={w} height={h} rx="1.5" fill={`url(#${finsId})`} />
      <rect x={hx} y={y - 1.5} width={hw} height={h + 3} rx="3" fill="#3b444b" stroke="#232b31" strokeWidth="0.5" />
      <rect x={plugX} y={y + h / 2 - 1.2} width="2.5" height="2.4" rx="0.6" fill="#d8dee3" />
    </g>
  )
}
