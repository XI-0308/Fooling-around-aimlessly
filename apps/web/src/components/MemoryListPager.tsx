"use client";

interface MemoryListPagerProps {
  page: number;
  totalPages: number;
  total: number;
  rangeStart: number;
  rangeEnd: number;
  unit?: string;
  onPageChange: (page: number) => void;
}

/** 记忆库列表翻页条 */
export default function MemoryListPager({
  page,
  totalPages,
  total,
  rangeStart,
  rangeEnd,
  unit = "条",
  onPageChange,
}: MemoryListPagerProps) {
  if (total <= 0) return null;

  return (
    <div className="memory-list-pager">
      <span className="hint memory-list-pager-meta">
        共 {total} {unit} · 显示第 {rangeStart}–{rangeEnd} {unit}
        {totalPages > 1 ? ` · 第 ${page}/${totalPages} 页` : ""}
      </span>
      {totalPages > 1 && (
        <div className="memory-list-pager-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            上一页
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
