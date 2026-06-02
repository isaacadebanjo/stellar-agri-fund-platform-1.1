import React, { useState } from 'react';
import { api } from '../api.js';

export default function DownloadStatementButton({ investorId, investorName = 'Investor' }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function downloadStatement() {
    try {
      setLoading(true);
      setError(null);

      // Routed through api.js so it uses VITE_API_BASE_URL and the shared 401
      // handling, consistent with every other API call.
      const blob = await api.statements.downloadPdf(investorId);

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Statement-${investorName.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err.message || 'Failed to download statement');
      console.error('Download error:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={downloadStatement}
        disabled={loading}
        className="btn btn-primary flex items-center gap-2"
      >
        <IconDownload className="h-4 w-4" />
        {loading ? 'Generating...' : 'Download Statement'}
      </button>
      {error && (
        <div className="mt-2 text-xs text-rose-600">
          {error}
        </div>
      )}
    </div>
  );
}

function IconDownload(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
         strokeLinecap="round" strokeLinejoin="round" {...props} aria-hidden="true">
      <path d="M12 2v12M7 15l5 5 5-5M4 20h16" />
    </svg>
  );
}
