interface Props {
  color: string;
  className?: string;
}

export default function PropertyDot({ color, className = '' }: Props) {
  return (
    <span
      className={`comparison-dashboard__table-dot ${className}`}
      style={{ background: color }}
    />
  );
}
