import { useState, type FormEvent } from 'react';
import { api } from '@deal-platform/shared-auth';
import type { AdminUserBilling } from '@deal-platform/shared-types';
import '../pages/Billing.css';

const money = (cents: number) => `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;

export default function AdminCreditGrant() {
  const [userId, setUserId] = useState('');
  const [billing, setBilling] = useState<AdminUserBilling | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const lookup = async (event?: FormEvent) => {
    event?.preventDefault();
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) {
      setMessage({ kind: 'error', text: 'Enter a valid user id.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      setBilling(await api.getAdminUserBilling(id));
    } catch (err) {
      setBilling(null);
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Lookup failed.' });
    } finally {
      setBusy(false);
    }
  };

  const grant = async (event: FormEvent) => {
    event.preventDefault();
    if (!billing) return;
    const amountCents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setMessage({ kind: 'error', text: 'Enter a dollar amount greater than zero.' });
      return;
    }
    if (!reason.trim()) {
      setMessage({ kind: 'error', text: 'A reason is required.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api.grantUserCredits(billing.userId, { amountCents, reason: reason.trim() });
      setMessage({ kind: 'success', text: `Granted ${money(amountCents)} to ${billing.email}.` });
      setAmount('');
      setReason('');
      setBilling(await api.getAdminUserBilling(billing.userId));
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Grant failed.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-section admin-billing">
      <div className="admin-section__header">
        <h2>Analysis credits</h2>
      </div>
      <form className="admin-billing__lookup" onSubmit={lookup}>
        <label>
          User id
          <input value={userId} onChange={event => setUserId(event.target.value)} inputMode="numeric" placeholder="e.g. 42" />
        </label>
        <button type="submit" className="btn btn--primary" disabled={busy}>Look up</button>
      </form>

      {billing && (
        <>
          <p className="admin-billing__summary">
            <strong>{billing.email}</strong><br />
            Today: {billing.usage.today.used} analyses ({billing.usage.today.freeRemaining} of {billing.usage.today.freeLimit} free left)
            {billing.usage.exempt && ' · admin (unlimited)'}<br />
            Credit balance: <strong>{money(billing.usage.credits.balanceCents)}</strong> (≈{billing.usage.credits.runsAvailable} analyses)
          </p>
          <form className="admin-billing__grant" onSubmit={grant}>
            <label>
              Amount (USD)
              <input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" placeholder="5.00" />
            </label>
            <label>
              Reason
              <input value={reason} onChange={event => setReason(event.target.value)} maxLength={200} placeholder="Support goodwill" />
            </label>
            <button type="submit" className="btn btn--primary" disabled={busy}>Grant credits</button>
          </form>
          {billing.transactions.length > 0 && (
            <div className="billing-table-wrap">
              <table className="billing-table">
                <thead><tr><th>Date</th><th>Activity</th><th className="billing-table__amount">Amount</th></tr></thead>
                <tbody>
                  {billing.transactions.map(tx => (
                    <tr key={tx.id}>
                      <td>{new Date(tx.createdAt).toLocaleString()}</td>
                      <td>{tx.description ?? tx.type}</td>
                      <td className="billing-table__amount">{money(tx.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {message && <div className={`billing-banner billing-banner--${message.kind}`}>{message.text}</div>}
    </div>
  );
}
