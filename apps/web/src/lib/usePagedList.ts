"use client";

import { useEffect, useMemo, useState } from "react";

export const MEMORY_LIST_PAGE_SIZE = 10;

const EMPTY_ITEMS: unknown[] = [];

/** 列表前端分页：每页默认 10 条，总数变化时自动夹紧页码；resetKey 变化时回到第 1 页 */
export function usePagedList<T>(
  items: T[],
  pageSize = MEMORY_LIST_PAGE_SIZE,
  resetKey?: string | number
) {
  const [page, setPage] = useState(1);
  const list = items.length === 0 ? (EMPTY_ITEMS as T[]) : items;
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return list.slice(start, start + pageSize);
  }, [list, page, pageSize]);

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return {
    page,
    setPage,
    pageItems,
    total,
    totalPages,
    pageSize,
    rangeStart,
    rangeEnd,
    resetPage: () => setPage(1),
  };
}
