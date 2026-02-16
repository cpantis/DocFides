'use client';

import useSWR from 'swr';

interface UserStats {
  credits: {
    total: number;
    used: number;
    percentUsed: number;
  };
  projectsThisMonth: number;
  avgCostPerDoc: number;
  timeSavedHours: number;
  recentActivity: {
    type: string;
    projectName: string;
    timestamp: string;
  }[];
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useUserStats() {
  const { data, error, isLoading } = useSWR<{ data: UserStats }>(
    '/api/user/stats',
    fetcher,
    {
      refreshInterval: 15 * 60 * 1000, // 15 min cache
      revalidateOnFocus: false,
    }
  );

  return {
    stats: data?.data,
    isLoading,
    isError: !!error,
  };
}

export type { UserStats };
