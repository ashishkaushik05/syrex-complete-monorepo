import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function SaleReportsPage() {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle>Sale Reports</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-500">
          Sale reports are not yet available. This feature is coming soon.
        </p>
      </CardContent>
    </Card>
  )
}
