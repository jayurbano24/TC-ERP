import { ShieldCheck } from 'lucide-react';

export function LoginFooter() {
  return (
    <div className="mt-8 space-y-4 text-center sm:mt-10">
      <div className="inline-flex items-center justify-center gap-2 text-xs font-medium text-muted">
        <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
        Acceso Seguro con Encriptación End-to-End
      </div>
      <p className="text-[11px] font-semibold tracking-wide text-muted/80 uppercase">
        © 2026 Tech Corps Multimedia · v2.4.0
      </p>
    </div>
  );
}
