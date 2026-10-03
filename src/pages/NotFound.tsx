import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'

export default function NotFound() {
  return (
    <Card className="mx-auto max-w-xl p-6 text-center">
      <h2 className="text-base font-semibold">Sayfa bulunamadı</h2>
      <p className="mt-1 text-sm text-fg-2">Adres eksik ya da yanlış olabilir.</p>
      <Link to="/" className="mt-3 inline-block text-sm text-info-text hover:underline">
        Kontrol Merkezi'ne dön
      </Link>
    </Card>
  )
}
