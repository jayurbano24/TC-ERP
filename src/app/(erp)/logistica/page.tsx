// Limpio para nuevo diseño
import Link from 'next/link';

export default function LogisticaPage() {
  const options = [
    {
      id: 'cac',
      title: 'Recepción CAC',
      description: 'Ingreso de guías y evidencia fotográfica.',
      stats: '46 guías hoy',
      href: '/recepcion?mode=cac',
    },
    {
      id: 'px',
      title: 'Recepción PX',
      description: 'Procesamiento de bultos desde planta externa.',
      stats: '128 bultos hoy',
      href: '/recepcion?mode=px',
    }
  ];

  const summary = [
    { label: 'Guias hoy', value: '46', tone: 'border-[#00D4FF]/20 bg-[#00D4FF]/10 text-[#8CEBFF]', strong: 'text-[#00D4FF]' },
    { label: 'Bultos PX', value: '128', tone: 'border-[#ff9f0a]/25 bg-[rgba(255,159,10,0.12)] text-[#ffb547]', strong: 'text-[#ff9f0a]' },
    { label: 'Pendientes', value: '15', tone: 'border-[#ff5c49]/25 bg-[rgba(255,92,73,0.12)] text-[#ff7c6d]', strong: 'text-[#ff5c49]' },
  ];

  return (
    <main className="space-y-5 py-2 animate-fade-in text-slate-100">
      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-lg border border-[#21262D] bg-[#161B22] p-6 md:p-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Logistica</p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.04em] text-white">Centro de ingresos operativos</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-400">
            Selecciona el flujo de recepcion que corresponde al origen de la carga para capturar guias, validar bultos y distribuir la operacion sin romper trazabilidad.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
          {summary.map((item) => (
            <div key={item.label} className={`rounded-lg border p-5 ${item.tone}`}>
              <p className={`text-3xl font-semibold leading-none ${item.strong}`}>{item.value}</p>
              <p className="mt-2 text-sm font-medium">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {options.map((opt) => (
          <Link key={opt.id} href={opt.href} className="group block">
            <div className="rounded-lg border border-[#21262D] bg-[#161B22] p-6 transition-colors hover:border-[#30363D] hover:bg-[#111827] md:p-7">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {opt.id === 'cac' ? 'Canal CAC' : 'Planta externa'}
                  </p>
                  <h2 className="text-2xl font-semibold text-white transition-colors group-hover:text-[#8CEBFF]">{opt.title}</h2>
                  <p className="max-w-md text-sm leading-6 text-slate-400">{opt.description}</p>
                </div>
                <div className="flex items-center gap-5">
                  <span className="rounded-md border border-[#30363D] bg-[#0D1117] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-slate-300">
                    {opt.stats}
                  </span>
                  <span className="text-lg text-slate-500 transition-colors group-hover:text-[#8CEBFF]">→</span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </section>

      <footer className="border-t border-[#21262D] pt-6">
        <div className="flex items-center gap-2">
           <div className="h-1.5 w-1.5 rounded-full bg-[#00D4FF]" />
           <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Sincronizacion activa</p>
        </div>
      </footer>
    </main>
  );
}
