import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function SaleReportDetailPage() {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle>Sale Report</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-500">
          Sale report not found or feature not available.
        </p>
      </CardContent>
    </Card>
  )
}
