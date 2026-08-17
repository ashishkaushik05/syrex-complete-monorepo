import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function SectionCard({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`border-slate-200 bg-white shadow-sm ${className}`}>
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">{children}</CardContent>
    </Card>
  )
}

export function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-sm text-slate-800">{value}</span>
    </div>
  )
}

export function VerdictBadge({ verdict }: { verdict: string }) {
  const map: Record<string, string> = {
    tested_ok:          'bg-emerald-100 text-emerald-700',
    warranty_candidate: 'bg-amber-100 text-amber-700',
    failed:             'bg-rose-100 text-rose-700',
    needs_retest:       'bg-indigo-100 text-indigo-700',
  }
  return (
    <Badge className={`${map[verdict] ?? 'bg-slate-100 text-slate-700'} border-0 text-xs`}>
      {verdict.replace(/_/g, ' ')}
    </Badge>
  )
}
