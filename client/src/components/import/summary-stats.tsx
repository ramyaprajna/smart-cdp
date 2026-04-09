import React from 'react';
import { ImportSummaryStats } from '../../types/import';

interface SummaryStatsProps {
  stats: ImportSummaryStats;
}

export const SummaryStats: React.FC<SummaryStatsProps> = ({ stats }) => {
  const statItems = [
    {
      value: stats.total,
      label: 'Total Imports',
      colorClass: 'text-primary',
    },
    {
      value: stats.successful,
      label: 'Successful',
      colorClass: 'text-green-600',
    },
    {
      value: stats.failed,
      label: 'Failed',
      colorClass: 'text-red-600',
    },
    {
      value: stats.recordsProcessed.toLocaleString(),
      label: 'Records Processed',
      colorClass: 'text-blue-600',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
      {statItems.map((item, index) => (
        <div key={index} className="text-center">
          <p className={`text-2xl font-bold ${item.colorClass}`}>
            {item.value}
          </p>
          <p className="text-sm text-muted-foreground">
            {item.label}
          </p>
        </div>
      ))}
    </div>
  );
};