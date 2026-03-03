import { buildAppUrl } from '@deal-platform/shared-auth';
import { Search, Lock, TrendingUp, DollarSign, BarChart3 } from 'lucide-react';

export default function LoginGate() {
  const loginUrl = buildAppUrl('/') + (buildAppUrl('/').includes('?') ? '&' : '?') + 'redirect=login';

  return (
    <div className="login-gate">
      <div className="login-gate__card">
        <div className="login-gate__icon">
          <Lock size={48} />
        </div>
        <h1 className="login-gate__title">Property Analyzer</h1>
        <p className="login-gate__subtitle">
          Paste a Zillow link and get comprehensive investment analysis in seconds
        </p>

        <div className="login-gate__features">
          <div className="login-gate__feature">
            <Search size={20} />
            <span>Instant property data lookup</span>
          </div>
          <div className="login-gate__feature">
            <DollarSign size={20} />
            <span>Cash flow & ROI projections</span>
          </div>
          <div className="login-gate__feature">
            <BarChart3 size={20} />
            <span>Rental comps & estimates</span>
          </div>
          <div className="login-gate__feature">
            <TrendingUp size={20} />
            <span>Cost segregation tax savings</span>
          </div>
        </div>

        <a href={loginUrl} className="btn btn--primary btn--lg login-gate__btn">
          Sign In to Get Started
        </a>
        <p className="login-gate__note">
          Free for all Passive Income Club members
        </p>
      </div>
    </div>
  );
}
