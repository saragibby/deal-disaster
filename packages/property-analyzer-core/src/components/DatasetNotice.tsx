import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  message: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  error?: string | null;
}

/** Explains a provider dataset that is missing from an analysis, with an optional targeted refresh. */
export default function DatasetNotice({ message, onRefresh, refreshing, error }: Props) {
  return (
    <div className="dataset-notice" role="status">
      <AlertTriangle size={16} className="dataset-notice__icon" aria-hidden="true" />
      <div className="dataset-notice__body">
        <p className="dataset-notice__message">{message}</p>
        {error && <p className="dataset-notice__error">{error}</p>}
      </div>
      {onRefresh && (
        <button
          type="button"
          className="dataset-notice__button"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw size={14} className={refreshing ? 'dataset-notice__spin' : undefined} aria-hidden="true" />
          {refreshing ? 'Refreshing…' : 'Refresh missing data'}
        </button>
      )}
    </div>
  );
}
