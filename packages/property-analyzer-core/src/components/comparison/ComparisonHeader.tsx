import { ArrowLeft, Share2, Download, Save, Printer } from 'lucide-react';

interface Props {
  propertyCount: number;
  onBack: () => void;
  onShare: () => void;
  onExportPdf?: () => void;
  onPrint: () => void;
  onSave?: () => void;
  exporting: boolean;
  saving: boolean;
  saved: boolean;
}

export default function ComparisonHeader({
  propertyCount, onBack, onShare, onExportPdf, onPrint, onSave, exporting, saving, saved,
}: Props) {
  return (
    <div className="comparison-dashboard__header">
      <button className="btn btn--ghost" onClick={onBack}>
        <ArrowLeft size={18} /> Back
      </button>
      <h2 className="comparison-dashboard__title">
        Comparing {propertyCount} Properties
      </h2>
      <div className="comparison-dashboard__actions no-print">
        {onSave && (
          <button
            className="btn btn--outline"
            onClick={onSave}
            disabled={saving || saved}
            title={saved ? 'Comparison saved' : 'Save this comparison'}
          >
            {saving ? <span className="analyzer-spinner analyzer-spinner--sm" /> : <Save size={16} />}
            {saved ? 'Saved' : saving ? 'Saving...' : 'Save'}
          </button>
        )}
        <button className="btn btn--outline" onClick={onShare} title="Copy shareable link">
          <Share2 size={16} /> Share
        </button>
        {onExportPdf && (
          <button
            className="btn btn--outline"
            onClick={onExportPdf}
            disabled={exporting}
            title="Download as PDF"
          >
            {exporting ? <span className="analyzer-spinner analyzer-spinner--sm" /> : <Download size={16} />}
            {exporting ? 'Exporting...' : 'PDF'}
          </button>
        )}
        <button className="btn btn--outline" onClick={onPrint} title="Print comparison">
          <Printer size={16} /> Print
        </button>
      </div>
    </div>
  );
}
