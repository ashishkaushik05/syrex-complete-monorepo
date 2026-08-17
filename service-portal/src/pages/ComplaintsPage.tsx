import { useInfiniteQuery } from '@tanstack/react-query'
import { ArrowRight, ClipboardList, Plus, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { apiErrorMessage, portalApi } from '../lib/api'
import { StatusBadge } from '../components/StatusBadge'

export function ComplaintsPage() {
  const query = useInfiniteQuery({
    queryKey: ['complaints'],
    queryFn: ({ pageParam }) => portalApi.listComplaints({ limit: 12, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  })
  const complaints = query.data?.pages.flatMap((page) => page.items) || []

  return (
    <section>
      <div className="page-heading">
        <div><p className="eyebrow">Service history</p><h1>My complaints</h1><p>Track your submitted complaints and warranty progress.</p></div>
        <div className="heading-actions">
          <button className="secondary-button" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw size={17} /> Refresh</button>
          <Link className="primary-button link-button" to="/complaints/new"><Plus size={17} /> Raise complaint</Link>
        </div>
      </div>

      {query.isLoading && <div className="page-state">Loading your complaints...</div>}
      {query.isError && <div className="empty-card"><h2>We could not load your complaints</h2><p>{apiErrorMessage(query.error)}</p><button className="secondary-button" onClick={() => query.refetch()}>Try again</button></div>}
      {!query.isLoading && !query.isError && complaints.length === 0 && (
        <div className="empty-card">
          <span className="empty-icon"><ClipboardList /></span>
          <h2>No complaints yet</h2>
          <p>When a battery needs attention, raise a complaint here and follow its progress.</p>
          <Link className="primary-button link-button" to="/complaints/new">Raise your first complaint</Link>
        </div>
      )}
      {complaints.length > 0 && (
        <div className="complaint-grid">
          {complaints.map((complaint) => (
            <Link key={complaint.id} to={`/complaints/${complaint.id}`} className="complaint-card">
              <div className="card-top"><span className="complaint-number">{complaint.complaintNumber}</span><StatusBadge status={complaint.status} /></div>
              <h2>{complaint.title || complaint.issueCategory}</h2>
              <dl className="card-details">
                <div><dt>Serial number</dt><dd>{complaint.serialNumber}</dd></div>
                <div><dt>Raised</dt><dd>{new Date(complaint.createdAt).toLocaleDateString()}</dd></div>
              </dl>
              <span className="card-link">View details <ArrowRight size={16} /></span>
            </Link>
          ))}
        </div>
      )}
      {query.hasNextPage && (
        <div className="load-more"><button className="secondary-button" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? 'Loading...' : 'Load more'}</button></div>
      )}
    </section>
  )
}
