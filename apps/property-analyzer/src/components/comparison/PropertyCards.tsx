import type { PropertyAnalysis } from '@deal-platform/shared-types';
import { MapPin, Bed, Bath, Ruler, DollarSign, TrendingUp, Calendar, Trophy } from 'lucide-react';
import { fmt, shortAddr } from '../../utils/comparisonUtils.js';
import { PROPERTY_COLORS } from '../ComparisonSelector.js';

interface Props {
  properties: PropertyAnalysis[];
  topPickIdx: number;
}

export default function PropertyCards({ properties, topPickIdx }: Props) {
  return (
    <div className="comparison-dashboard__cards">
      {properties.map((p, i) => {
        const prop = p.property_data;
        const photo = prop.photos?.[0];
        const isTopPick = topPickIdx === i;
        return (
          <div
            key={p.id}
            className={`comparison-dashboard__card${isTopPick ? ' comparison-dashboard__card--top-pick' : ''}`}
            style={{ borderTopColor: PROPERTY_COLORS[i] }}
          >
            {isTopPick && (
              <div className="comparison-dashboard__top-pick-badge">
                <Trophy size={12} /> Top Pick
              </div>
            )}
            {photo && (
              <div className="comparison-dashboard__card-img">
                <img src={photo} alt={prop.address} loading="lazy" />
              </div>
            )}
            <div className="comparison-dashboard__card-body">
              <div
                className="comparison-dashboard__card-color"
                style={{ background: PROPERTY_COLORS[i] }}
              />
              <h4 className="comparison-dashboard__card-address">
                {shortAddr(prop.address)}
              </h4>
              <p className="comparison-dashboard__card-location">
                <MapPin size={12} /> {[prop.city, prop.state].filter(Boolean).join(', ')}
              </p>
              <div className="comparison-dashboard__card-price">
                <DollarSign size={14} />{fmt(prop.price)}
              </div>
              <div className="comparison-dashboard__card-details">
                <span><Bed size={12} /> {prop.bedrooms}</span>
                <span><Bath size={12} /> {prop.bathrooms}</span>
                <span><Ruler size={12} /> {(prop.sqft || 0).toLocaleString()} sqft</span>
                {prop.yearBuilt && <span><Calendar size={12} /> {prop.yearBuilt}</span>}
              </div>
              {p.analysis_results?.cashFlow && (
                <div className={`comparison-dashboard__card-cashflow ${
                  p.analysis_results.cashFlow.monthlyCashFlow >= 0 ? 'text--positive' : 'text--negative'
                }`}>
                  <TrendingUp size={12} />
                  {fmt(p.analysis_results.cashFlow.monthlyCashFlow)}/mo
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
