import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Filter, X } from 'lucide-react';

export interface RentalCompsColumn<T> {
  key: string;
  label: string;
  type: 'text' | 'number';
  value: (row: T) => string | number | null | undefined;
  format?: (value: string | number) => string;
  emphasis?: boolean;
}

interface Props<T> {
  label: string;
  rows: T[];
  columns: RentalCompsColumn<T>[];
}

interface ColumnFilter {
  text?: string;
  min?: string;
  max?: string;
}

const PAGE_SIZE = 8;

export default function RentalCompsTable<T>({ label, rows, columns }: Props<T>) {
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [filters, setFilters] = useState<Record<string, ColumnFilter>>({});
  const [page, setPage] = useState(1);
  const [filterKey, setFilterKey] = useState<string | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const activeColumn = columns.find(column => column.key === filterKey);

  function closeFilter() {
    setFilterKey(null);
    triggerRef.current?.focus();
  }

  useLayoutEffect(() => {
    if (!filterKey) return;
    function reposition() {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!trigger || !popover) return;
      const rect = trigger.getBoundingClientRect();
      const { width, height } = popover.getBoundingClientRect();
      setPosition({
        left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
        top: Math.max(8, rect.bottom + height + 8 <= window.innerHeight
          ? rect.bottom + 8 : rect.top - height - 8),
      });
    }
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [filterKey]);

  useEffect(() => {
    if (!filterKey) return;
    function onOutsideClick(event: PointerEvent) {
      if (event.target instanceof Node && !popoverRef.current?.contains(event.target)
        && !triggerRef.current?.contains(event.target)) setFilterKey(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setFilterKey(null);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onOutsideClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onOutsideClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [filterKey]);

  const filteredRows = useMemo(() => {
    const filtered = rows.filter(row => columns.every(column => {
      const filter = filters[column.key];
      if (!filter) return true;
      const value = column.value(row);
      if (column.type === 'text') {
        return String(value ?? '').toLocaleLowerCase().includes((filter.text ?? '').trim().toLocaleLowerCase());
      }
      const hasMin = !!filter.min;
      const hasMax = !!filter.max;
      if (!hasMin && !hasMax) return true;
      if (typeof value !== 'number' || !Number.isFinite(value)) return false;
      return (!hasMin || value >= Number(filter.min)) && (!hasMax || value <= Number(filter.max));
    }));
    const column = columns.find(candidate => candidate.key === sort?.key);
    if (!sort || !column) return filtered;
    return filtered.sort((a, b) => {
      const av = column.value(a);
      const bv = column.value(b);
      // Keep missing values last in either direction.
      if (av == null) return bv == null ? 0 : 1;
      if (bv == null) return -1;
      const comparison = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [rows, columns, filters, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const hasFilters = Object.values(filters).some(filter => filter.text || filter.min || filter.max);

  function updateFilter(key: string, field: keyof ColumnFilter, value: string) {
    setFilters(previous => ({ ...previous, [key]: { ...previous[key], [field]: value } }));
    setPage(1);
  }

  function clearFilter(key: string) {
    setFilters(previous => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
    setPage(1);
  }

  function filterSummary(column: RentalCompsColumn<T>): string | null {
    const filter = filters[column.key];
    if (!filter) return null;
    if (column.type === 'text') return filter.text?.trim() ? `${column.label}: ${filter.text.trim()}` : null;
    const format = (value: string) => column.format ? column.format(Number(value)) : value;
    if (filter.min && filter.max) return `${column.label}: ${format(filter.min)} - ${format(filter.max)}`;
    if (filter.min) return `${column.label}: Min ${format(filter.min)}`;
    if (filter.max) return `${column.label}: Max ${format(filter.max)}`;
    return null;
  }

  return (
    <section className="rental-comps" aria-label={label}>
      <div className="rental-comps__toolbar">
        <span>{rows.length} comparable properties</span>
        {columns.map(column => {
          const summary = filterSummary(column);
          return summary && (
            <button key={column.key} type="button" className="rental-comps__filter-chip"
              aria-label={`Remove ${column.label} filter`} onClick={() => clearFilter(column.key)}>
              {summary} <X size={12} />
            </button>
          );
        })}
        <button type="button" className="comps__page-btn" disabled={!hasFilters} onClick={() => {
          setFilters({});
          setPage(1);
        }}>Clear filters</button>
      </div>
      <div className="comps__table-wrap rental-comps__table-wrap">
        <table className="comps__table rental-comps__table" aria-label={label}>
          <thead>
            <tr>
              {columns.map(column => (
                <th key={column.key} scope="col" aria-sort={sort?.key === column.key
                  ? sort.direction === 'asc' ? 'ascending' : 'descending'
                  : 'none'}>
                  <div className="rental-comps__header">
                  <button type="button" className="rental-comps__sort" onClick={() => {
                    setSort(previous => ({
                      key: column.key,
                      direction: previous?.key === column.key && previous.direction === 'asc' ? 'desc' : 'asc',
                    }));
                    setPage(1);
                  }}>
                    {column.label}
                    {sort?.key !== column.key ? <ArrowUpDown size={13} />
                      : sort.direction === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                  <button type="button"
                    className={`rental-comps__filter-trigger${filterSummary(column) ? ' rental-comps__filter-trigger--active' : ''}`}
                    aria-label={`Edit ${column.label} filter`} title={`Edit ${column.label} filter`}
                    aria-haspopup="dialog" aria-expanded={filterKey === column.key}
                    aria-controls={filterKey === column.key ? popoverId : undefined}
                    onClick={event => {
                      triggerRef.current = event.currentTarget;
                      setFilterKey(previous => previous === column.key ? null : column.key);
                    }}><Filter size={14} /></button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.slice(start, start + PAGE_SIZE).map((row, index) => (
              <tr key={start + index}>
                {columns.map(column => {
                  const value = column.value(row);
                  const display = value == null ? '—' : column.format ? column.format(value) : String(value);
                  return <td key={column.key}>{column.emphasis ? <strong>{display}</strong> : display}</td>;
                })}
              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr><td colSpan={columns.length} className="rental-comps__empty">No comparable properties match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="comps__pagination rental-comps__pagination">
        <span className="comps__page-info" role="status">
          {filteredRows.length === 0 ? '0' : `${start + 1}-${Math.min(start + PAGE_SIZE, filteredRows.length)}`} of {filteredRows.length}
          {hasFilters && ` (${rows.length} total)`} &middot; Page {currentPage} of {totalPages}
        </span>
        <button type="button" className="comps__page-btn" aria-label="Previous page" disabled={currentPage === 1}
          onClick={() => setPage(currentPage - 1)}><ChevronLeft size={14} /> Previous</button>
        <button type="button" className="comps__page-btn" aria-label="Next page" disabled={currentPage === totalPages}
          onClick={() => setPage(currentPage + 1)}>Next <ChevronRight size={14} /></button>
      </div>
      {activeColumn && createPortal(
        <div key={activeColumn.key} ref={popoverRef} id={popoverId} role="dialog"
          aria-label={`${activeColumn.label} filter`} className="rental-comps__popover"
          style={{ top: position.top, left: position.left }}>
          <div className="rental-comps__popover-heading">
            <strong>Filter {activeColumn.label}</strong>
            <button type="button" className="rental-comps__filter-trigger" aria-label="Close filter editor" onClick={closeFilter}><X size={16} /></button>
          </div>
          <div className="rental-comps__filters">
            {activeColumn.type === 'text' ? (
              <label>Contains
                <input autoFocus type="search" aria-label={`Filter ${activeColumn.label}`} placeholder="Filter..."
                  value={filters[activeColumn.key]?.text ?? ''}
                  onChange={event => updateFilter(activeColumn.key, 'text', event.target.value)} />
              </label>
            ) : (
              <>
                <label>Minimum
                  <input autoFocus type="number" step="any" aria-label={`Minimum ${activeColumn.label}`} placeholder="Min"
                    value={filters[activeColumn.key]?.min ?? ''}
                    onChange={event => updateFilter(activeColumn.key, 'min', event.target.value)} />
                </label>
                <label>Maximum
                  <input type="number" step="any" aria-label={`Maximum ${activeColumn.label}`} placeholder="Max"
                    value={filters[activeColumn.key]?.max ?? ''}
                    onChange={event => updateFilter(activeColumn.key, 'max', event.target.value)} />
                </label>
              </>
            )}
          </div>
          <div className="rental-comps__popover-actions">
            <button type="button" className="comps__page-btn" onClick={() => clearFilter(activeColumn.key)}>Reset filter</button>
            <button type="button" className="comps__page-btn" onClick={closeFilter}>Done</button>
          </div>
        </div>, document.body,
      )}
    </section>
  );
}
