'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/utils/fetcher';

interface UserStats {
  aiCost: {
    total: number;
    avgPerProject: number;
    projectsWithCost: number;
  };
  projectsThisMonth: number;
  timeSavedHours: number;
  recentActivity: {
    type: string;
    projectName: string;
    timestamp: string;
  }[];
}

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
