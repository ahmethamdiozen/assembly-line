import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { StateBadge } from '@/components/status/StateBadge'
import { Card } from '@/components/ui/card'
import { POLL_MS, backend } from '@/data/app'
import { requiredQualifications } from '@/domain/qualifications'
import { shiftHours } from '@/domain/shifts'
import { REWORK_STATE_LABEL } from '@/domain/types'
import type { AlarmSource, Severity } from '@/domain/types'
import { minutes, num } from '@/lib/format'

/**
 * Metrik Rehberi (R-045–R-047): KPI'ların nasıl hesaplandığı, durum ve alarm kuralları, varsayımlar.
 * Sayılar ana veriden (takt, eşikler, vardiyalar, alarm kuralları) okunur; admin değiştirince rehber de değişir.
 * Ayrıntılı metin: docs/kpi-tanimlari.md ve docs/acik-konular.md.
 */

const SECTIONS = [
  { id: 'kpi', title: "Üretim KPI'ları" },
  { id: 'cevrim', title: 'Çevrim, takt ve darboğaz' },
  { id: 'durum', title: 'İstasyon durumları' },
  { id: 'veri', title: 'Veri tazeliği' },
  { id: 'alarm', title: 'Alarm kuralları' },
  { id: 'rework', title: 'Rework akışı' },
  { id: 'vardiya', title: 'Vardiyalar ve üretim günü' },
  { id: 'yetkinlik', title: 'İstasyon girişi ve yetkinlik' },
  { id: 'varsayim', title: 'Varsayımlar' },
] as const

const SOURCE_LABEL: Record<AlarmSource, string> = { PLC: 'PLC', Cycle: 'Çevrim', Torque: 'Tork', Vision: 'Vision', Material: 'Malzeme', Operator: 'Operatör / Andon', System: 'Sistem' }
const SEVERITY_LABEL: Record<Severity, string> = { critical: 'Kritik', warning: 'Uyarı', info: 'Bilgi' }

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-4">
      <Card className="px-6 py-5">
        <h2 id={`${id}-h`} className="text-[17px] font-semibold tracking-tight">
          {title}
        </h2>
        <div className="mt-3 space-y-3 text-[14px] leading-relaxed [&_p]:max-w-[78ch]">{children}</div>
      </Card>
    </section>
  )
}

function Formula({ rows }: { rows: [string, ReactNode, ReactNode?][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13.5px]">
        <thead className="text-left text-[12px] text-fg-2">
          <tr className="border-b">
            <th className="w-[190px] py-1.5 font-medium">Gösterge</th>
            <th className="py-1.5 font-medium">Hesap</th>
            <th className="py-1.5 font-medium">Not</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, f, n]) => (
            <tr key={k} className="border-b align-top last:border-0">
              <td className="py-2 pr-4 font-semibold">{k}</td>
              <td className="py-2 pr-4">{f}</td>
              <td className="py-2 text-fg-2">{n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Guide() {
  const m = backend.master
  const cfg = m.config
  const takt = cfg.taktSec / 60
  const main = m.stations.filter((s) => s.line === 'main')
  const ideal = main.reduce((a, s) => (s.targetCycleSec > a.targetCycleSec ? s : a), main[0])
  const shiftTarget = Math.floor((cfg.shifts[0].lengthH * 3600) / cfg.taktSec)
  const manual = main.filter((s) => s.type === 'manual')
  return (
    <div className="mx-auto grid max-w-[1400px] items-start gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Rehber bölümleri" className="top-0 lg:sticky">
        <Card className="px-3 py-3">
          <p className="px-2 pb-1 text-[12px] text-fg-2">Bu sayfada</p>
          <ol className="space-y-0.5 text-[13px]">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  onClick={(e) => {
                    // HashRouter: adres çubuğundaki rotayı bozmadan bölüme kaydır
                    e.preventDefault()
                    document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' })
                  }}
                  className="block rounded-md px-2 py-1 text-fg-2 hover:bg-wash hover:text-fg"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </Card>
      </nav>

      <div className="space-y-4">
        <p className="max-w-[78ch] text-[14px] leading-relaxed text-fg-2">
          URS bu hesapların formüllerini tanımlamıyor. Aşağıdaki tanımlar varsayımdır ve proje başında müşteriyle netleştirilecek. Sayılar şu anki ana veriden okunuyor; admin bir değeri değiştirince bu sayfa da değişir.
        </p>

        <Section id="kpi" title="Üretim KPI'ları (R-045)">
          <Formula
            rows={[
              ['Planlı süre', 'Seçilen pencerenin süresi (vardiya başı → şimdi ya da vardiya sonu)', 'Mola ve planlı duruş tanımı yok'],
              ['Arıza süresi', "Ana hat istasyonlarının FAULT aralıklarının birleşimi", 'Seri hatta bir istasyon durursa akış durur; çakışan arızalar bir kez sayılır'],
              ['Availability (A)', '(planlı süre − arıza süresi) / planlı süre', null],
              ['Performance (P)', <>çıkış × ideal çevrim / çalışma süresi</>, <>İdeal çevrim = ana hattaki en uzun hedef çevrim ({ideal.op}, {minutes(ideal.targetCycleSec / 60)})</>],
              ['FPY (Quality)', "OP100'den ilk denemede OK geçen / OP100'e ilk kez gelen", 'Re-QC denemeleri FPY’ye girmez'],
              ['OEE', 'A × P × FPY', null],
              ['Çıkış', "OP110'dan OK çıkan motor sayısı", null],
              ['Çıkış / saat', 'çıkış / planlı saat', null],
              ['Plan gerçekleşme', 'çıkış / (planlı süre / takt)', `Vardiya hedefi = ${cfg.shifts[0].lengthH} sa / takt = ${shiftTarget} motor`],
            ]}
          />
          <p className="text-[13px] text-fg-2">
            KPI'lar Kontrol Merkezi'nde süren vardiya için, <Link to="/kpi" className="text-info-text hover:underline">KPI & Raporlar</Link>'da seçilen gün ve vardiya için hesaplanır. Hesap kodu: <code className="rounded bg-wash px-1">src/domain/kpi.ts</code>.
          </p>
        </Section>

        <Section id="cevrim" title="Çevrim, takt ve darboğaz (R-046, R-047)">
          <p>
            <b>Takt {minutes(takt)}</b>: müşteri talebine göre hattan her takt süresinde bir motor çıkmalı. <b>Çevrim süresi</b>, motorun istasyondaki net işleme süresidir (operasyon başı → bitişi); bekleme (boş, bloke) çevrime girmez, çevrim içindeki arıza girer.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Süren çevrim {minutes((cfg.taktSec * cfg.warnRatio) / 60, 2)} sınırını (takt × %{num(cfg.warnRatio * 100)}) geçince istasyon <b>Warning / Takt riski</b> olur.
            </li>
            <li>
              Biten çevrim {minutes((cfg.taktSec * cfg.alarmRatio) / 60, 2)} sınırını (takt × %{num(cfg.alarmRatio * 100)}) geçtiyse <b>CYC-TAKT</b> alarmı açılır.
            </li>
            <li>Kontrol Merkezi'nde istasyon istatistiği son 8 çevrimden, raporlarda seçilen penceredeki tüm çevrimlerden hesaplanır.</li>
            <li>
              <b>Darboğaz</b>: ortalama çevrimi en yüksek istasyon. Ortalama takt'ı aşıyorsa hat bu istasyonun hızında akar.
            </li>
          </ul>
        </Section>

        <Section id="durum" title="İstasyon durumları (R-015)">
          <p>Öncelik sırasıyla değerlendirilir. Renk tek başına anlam taşımaz; her durum ikon ve metinle birlikte gösterilir.</p>
          <ul className="space-y-2">
            <li className="flex items-start gap-3">
              <StateBadge state="offline" long className="mt-0.5 w-[150px] shrink-0 justify-center" />
              <span>İstasyon PLC'sinin heartbeat'i yok: cihaz offline bildirdi ya da {cfg.heartbeatTimeoutSec} sn'dir sessiz.</span>
            </li>
            <li className="flex items-start gap-3">
              <StateBadge state="fault" long className="mt-0.5 w-[150px] shrink-0 justify-center" />
              <span>İstasyon FAULT durumunda ya da üzerindeki motorun açık tork NOK / operasyon NOK alarmı var.</span>
            </li>
            <li className="flex items-start gap-3">
              <StateBadge state="warning" long className="mt-0.5 w-[150px] shrink-0 justify-center" />
              <span>Süren çevrim {minutes((cfg.taktSec * cfg.warnRatio) / 60, 2)} sınırını (takt × %{num(cfg.warnRatio * 100)}) geçti.</span>
            </li>
            <li className="flex items-start gap-3">
              <StateBadge state="running" long className="mt-0.5 w-[150px] shrink-0 justify-center" />
              <span>Diğer durumlar. Alt durum metinle yazılır: çalışıyor, boş (motor bekliyor), ön montaj kiti bekliyor, bloke (sonraki istasyon dolu), durdu.</span>
            </li>
          </ul>
          <p className="text-[13px] text-fg-2">Ön montaj hücresi, buffer minimum seviyenin altına düştüğünde ya da hücre durduğunda Warning olur. Kalan süre (hedef − geçen) tahmindir.</p>
        </Section>

        <Section id="veri" title="Veri tazeliği (R-002, R-074)">
          <p>
            Fabrika verisi SQL Server'dan <b>{cfg.collectIntervalMin} dk'da bir</b> çekilir (3–5 dk arası ayarlanabilir). Bu yüzden ekrandaki üretim verisi en fazla bir çekme aralığı kadar geridedir; her ekranın üstünde son fabrika verisinin saati ve bir sonraki çekme görünür.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Son fabrika verisi çekme aralığının iki katından (+1 dk) eskiyse "Veri gecikiyor" uyarısı çıkar.</li>
            <li>Sunucuya ulaşılamazsa "Bağlantı yok" uyarısı çıkar; eldeki veri ekranda kalır.</li>
            <li>
              Kullanıcı aksiyonları (not, Andon, alarm onayı, rework) bu gecikmeden etkilenmez; diğer ekranlarda en geç {POLL_MS / 1000} sn'de görünür.
            </li>
          </ul>
        </Section>

        <Section id="alarm" title="Alarm kuralları (R-037–R-039, R-056)">
          <p>
            Yaşam döngüsü: <b>Detected → Acknowledged → Assigned → Closed</b>. Atama önce onay ister; atanmış alarm yeniden atanabilir. Kuraldaki süre içinde onaylanmayan alarm eskale olur. Koşulun bitmesi alarmı kapatmaz; alarmı insanlar kapatır.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-left text-[12px] text-fg-2">
                <tr className="border-b">
                  <th className="py-1.5 font-medium">Kod</th>
                  <th className="py-1.5 font-medium">Alarm</th>
                  <th className="py-1.5 font-medium">Kaynak</th>
                  <th className="py-1.5 font-medium">Önem</th>
                  <th className="py-1.5 text-right font-medium">Eskalasyon</th>
                  <th className="py-1.5 pl-4 font-medium">Varsayılan ekip</th>
                </tr>
              </thead>
              <tbody>
                {m.rules.map((r) => (
                  <tr key={r.code} className={!r.enabled ? 'text-fg-3' : ''}>
                    <td className="display py-1.5 pr-3 text-[14px]">{r.code}</td>
                    <td className="py-1.5 pr-3">
                      {r.name}
                      {!r.enabled && ' (kapalı)'}
                    </td>
                    <td className="py-1.5 pr-3">{SOURCE_LABEL[r.source]}</td>
                    <td className="py-1.5 pr-3">{SEVERITY_LABEL[r.severity]}</td>
                    <td className="py-1.5 text-right">{r.escalationMin} dk</td>
                    <td className="py-1.5 pl-4">{r.team}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="rework" title="Rework akışı (R-034–R-036)">
          <p>
            OP100'de NOK olan motor rework kuyruğuna girer:{' '}
            {(['triage', 'diagnosis', 'bench', 'ready', 'reqc'] as const).map((s, i) => (
              <span key={s}>
                {i > 0 && ' → '}
                <b>{REWORK_STATE_LABEL[s]}</b>
              </span>
            ))}
            . İlk dört adımı kullanıcılar ilerletir; tezgâha geçmeden kök neden ve rework operatörü yazılmalı. Motor OP100'e tekrar girince re-QC kendiliğinden başlar: OK çıkarsa kayıt kapanır, NOK çıkarsa yeni turla Triage'a döner.
          </p>
          <p>HOLD'daki motoru Kalite rolü serbest bırakır ya da rework'e gönderir.</p>
        </Section>

        <Section id="vardiya" title="Vardiyalar ve üretim günü (R-049)">
          <p>
            Üretim günü saat {String(cfg.dayStartHour).padStart(2, '0')}:00'da başlar; günlük sayaçlar bu saatte sıfırlanır. Raporlarda "Tüm gün" bu saatten ertesi günün aynı saatine kadardır.
          </p>
          <ul className="flex flex-wrap gap-2">
            {cfg.shifts.map((s) => (
              <li key={s.id} className="rounded-lg border px-3 py-1.5 text-[13.5px]">
                <b>{s.name}</b> <span className="text-fg-2">{shiftHours(s)}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="yetkinlik" title="İstasyon girişi ve yetkinlik (R-050–R-052)">
          <p>Teknisyen, Teknisyen Terminali'nden istasyona personel no / kart ve PIN ile girer. Giriş yapıldığı vardiyanın sonuna kadar geçerlidir; istasyonda aynı anda bir teknisyen bulunur.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              İnsanlı istasyonlar <b>{requiredQualifications(manual.find((s) => !s.tightening) ?? manual[0]).join(', ')}</b> ister; sıkma yapılan istasyonlar ({manual.filter((s) => s.tightening).map((s) => s.op).join(', ')}) ayrıca <b>Torque Qualified</b> ister. Üst seviye alt seviyeyi karşılar (Montaj L3, Montaj L2 yerine geçer).
            </li>
            <li>Eksik yetkinlikle giriş yapılamaz; deneme audit kaydına yazılır.</li>
            <li>"Operasyonu tamamla" onayı için istasyona giriş yapmış olmak ve kontrol listesini işaretlemek gerekir. Onay motorun geçmişine yazılır; fiziksel bitişi PLC bildirir.</li>
          </ul>
        </Section>

        <Section id="varsayim" title="Varsayımlar">
          <ul className="list-disc space-y-1 pl-5">
            <li>Takt, hedef süreler, Pset / tork aralıkları, vardiyalar ve buffer seviyeleri müşteri prototipinden alındı.</li>
            <li>SQL Server tablo ve kolon adları varsayımdır; gerçek şema gelince yalnızca collector'daki sorgular eşlenir.</li>
            <li>Uygulama fabrika sistemine geri yazmaz: HOLD ve "operasyonu tamamla" uygulama veritabanında kayıt ve audit olarak tutulur.</li>
            <li>Açık soruların tam listesi proje dokümanlarında: <code className="rounded bg-wash px-1">docs/acik-konular.md</code>.</li>
          </ul>
        </Section>
      </div>
    </div>
  )
}
