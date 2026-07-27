'use client';

import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';
import type { JobStatus } from '@/adapters/types';

type JobAction =
  | { type: 'ADD_JOB'; job: JobStatus }
  | { type: 'UPDATE_JOB'; job: JobStatus }
  | { type: 'SET_JOBS'; jobs: JobStatus[] };

function jobReducer(state: JobStatus[], action: JobAction): JobStatus[] {
  switch (action.type) {
    case 'ADD_JOB':
      return [action.job, ...state.filter((j) => j.jobId !== action.job.jobId)];
    case 'UPDATE_JOB':
      return state.map((j) => (j.jobId === action.job.jobId ? action.job : j));
    case 'SET_JOBS':
      return action.jobs;
    default:
      return state;
  }
}

const JobContext = createContext<{
  jobs: JobStatus[];
  dispatch: React.Dispatch<JobAction>;
} | null>(null);

export function JobProvider({ children }: { children: ReactNode }) {
  const [jobs, dispatch] = useReducer(jobReducer, []);
  const value = useMemo(() => ({ jobs, dispatch }), [jobs]);
  return <JobContext.Provider value={value}>{children}</JobContext.Provider>;
}

export function useJobs() {
  const ctx = useContext(JobContext);
  if (!ctx) throw new Error('useJobs must be used within JobProvider');
  return ctx;
}
