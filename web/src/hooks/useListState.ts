import { useState } from 'react'

export function useListState(defaultLimit = 20) {
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(defaultLimit)
  const [search, setSearchValue] = useState('')

  const setSearch = (value: string) => {
    setSearchValue(value)
    setPage(1)
  }

  const setLimitWithReset = (value: number) => {
    setLimit(value)
    setPage(1)
  }

  return {
    page,
    setPage,
    limit,
    setLimit: setLimitWithReset,
    search,
    setSearch,
  }
}
