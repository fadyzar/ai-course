'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database.types';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, CircleCheck as CheckCircle, Circle as XCircle, Clock, Play, FileText, Cpu, MessageSquare, Zap, ChevronDown, ChevronUp, TriangleAlert as AlertTriangle, Eye } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

type Job = Database['public']['Tables']['jobs']['Row'];

interface LogEntry {
  id: string;
  job_id: string;
  level: string;
  message: string;
  meta: Record<string, any>;
  created_at: string;
}

interface ProcessingStatusProps {
  courseId: string;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getElapsedTime(start: string, end?: string) {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const diff = Math.max(0, Math.round((e - s) / 1000));
  if (diff < 60) return `${diff} שניות`;
  const min = Math.floor(diff / 60);
  const sec = diff % 60;
  return `${min}:${sec.toString().padStart(2, '0')} דקות`;
}

function LogIcon({ level }: { level: string }) {
  if (level === 'error') return <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />;
  if (level === 'warning') return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
  return <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />;
}

export function ProcessingStatus({ courseId }: ProcessingStatusProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [logs, setLogs] = useState<Record<string, LogEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadJobs();

    const jobSub = supabase
      .channel(`jobs:course_id=eq.${courseId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs',
          filter: `course_id=eq.${courseId}`,
        },
        () => {
          loadJobs();
        }
      )
      .subscribe();

    const logSub = supabase
      .channel(`logs:course_jobs_${courseId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'processing_logs',
        },
        (payload) => {
          const newLog = payload.new as LogEntry;
          setLogs((prev) => {
            const jobLogs = prev[newLog.job_id] || [];
            return { ...prev, [newLog.job_id]: [...jobLogs, newLog] };
          });
        }
      )
      .subscribe();

    return () => {
      jobSub.unsubscribe();
      logSub.unsubscribe();
    };
  }, [courseId]);

  useEffect(() => {
    const processingJob = jobs.find((j) => j.status === 'processing');
    if (!processingJob) return;

    const interval = setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [jobs]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const loadJobs = async () => {
    try {
      const { data, error } = await (supabase
        .from('jobs') as any)
        .select('*')
        .eq('course_id', courseId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const jobsData = (data || []) as Job[];
      setJobs(jobsData);

      for (const job of jobsData) {
        if (job.status === 'processing' || job.status === 'completed' || job.status === 'failed') {
          loadLogsForJob(job.id);
          if (!expandedJob) setExpandedJob(job.id);
        }
      }
    } catch (error) {
      console.error('Error loading jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadLogsForJob = async (jobId: string) => {
    const { data } = await (supabase
      .from('processing_logs') as any)
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });

    if (data) {
      setLogs((prev) => ({ ...prev, [jobId]: data as LogEntry[] }));
    }
  };

  const triggerWorker = async () => {
    setTriggering(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('לא מחובר למערכת');

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) throw new Error('משתני סביבה חסרים');

      fetch(`${supabaseUrl}/functions/v1/worker-process-jobs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json',
        },
      }).catch(() => {});

      toast.success('עיבוד הקורס התחיל');
    } catch (error: any) {
      toast.error('שגיאה בהפעלת עיבוד: ' + error.message);
    } finally {
      setTriggering(false);
    }
  };

  if (loading) return null;
  if (jobs.length === 0) return null;

  const queuedJobs = jobs.filter((j) => j.status === 'queued');
  const processingJob = jobs.find((j) => j.status === 'processing');
  const hasQueuedJobs = queuedJobs.length > 0;

  return (
    <div className="space-y-4">
      {hasQueuedJobs && (
        <Card className="border-2 border-amber-200 bg-gradient-to-l from-amber-50 to-white overflow-hidden">
          <CardContent className="p-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="bg-amber-100 rounded-xl p-2.5 mt-0.5">
                  <Zap className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    {queuedJobs.length} {queuedJobs.length === 1 ? 'משימה ממתינה' : 'משימות ממתינות'} לעיבוד
                  </p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    לחץ על "התחל עיבוד" כדי להתחיל לבנות את הקורס
                  </p>
                </div>
              </div>
              <Button
                onClick={triggerWorker}
                disabled={triggering}
                className="bg-emerald-600 hover:bg-emerald-700 shadow-sm w-full sm:w-auto"
              >
                {triggering ? (
                  <RefreshCw className="h-4 w-4 ml-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 ml-2" />
                )}
                התחל עיבוד
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {jobs.map((job) => {
        const jobLogs = logs[job.id] || [];
        const isExpanded = expandedJob === job.id;
        const isActive = job.status === 'processing';
        const isDone = job.status === 'completed';
        const isFailed = job.status === 'failed';
        const isQueued = job.status === 'queued';
        const progress = (job as any).progress || 0;
        const metadata = (job as any).metadata || {};

        return (
          <Card
            key={job.id}
            className={`overflow-hidden transition-all duration-300 ${
              isActive
                ? 'border-2 border-blue-300 shadow-lg shadow-blue-100'
                : isDone
                  ? 'border border-emerald-200'
                  : isFailed
                    ? 'border border-red-200'
                    : 'border border-slate-200'
            }`}
          >
            <div
              className={`px-5 py-4 cursor-pointer transition-colors ${
                isActive
                  ? 'bg-gradient-to-l from-blue-50 to-white'
                  : isDone
                    ? 'bg-gradient-to-l from-emerald-50 to-white'
                    : isFailed
                      ? 'bg-gradient-to-l from-red-50 to-white'
                      : 'bg-white'
              }`}
              onClick={() => setExpandedJob(isExpanded ? null : job.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`rounded-xl p-2.5 ${
                    isActive
                      ? 'bg-blue-100'
                      : isDone
                        ? 'bg-emerald-100'
                        : isFailed
                          ? 'bg-red-100'
                          : 'bg-slate-100'
                  }`}>
                    {isActive && <Cpu className="h-5 w-5 text-blue-600 animate-pulse" />}
                    {isDone && <CheckCircle className="h-5 w-5 text-emerald-600" />}
                    {isFailed && <XCircle className="h-5 w-5 text-red-600" />}
                    {isQueued && <Clock className="h-5 w-5 text-slate-500" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {(job.type === 'rebuild_course' || job.type === 'process_course') ? 'בניית קורס' : job.type}
                      </span>
                      <Badge
                        variant="secondary"
                        className={`text-xs font-medium ${
                          isActive
                            ? 'bg-blue-100 text-blue-700'
                            : isDone
                              ? 'bg-emerald-100 text-emerald-700'
                              : isFailed
                                ? 'bg-red-100 text-red-700'
                                : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {isActive ? 'מעבד' : isDone ? 'הושלם' : isFailed ? 'נכשל' : 'בתור'}
                      </Badge>
                    </div>
                    {isActive && metadata.current_step && (
                      <p className="text-sm text-blue-600 mt-0.5 font-medium">
                        {metadata.current_step}
                      </p>
                    )}
                    {isDone && (
                      <p className="text-sm text-emerald-600 mt-0.5">
                        הסתיים בהצלחה | {getElapsedTime(job.created_at, job.updated_at)}
                      </p>
                    )}
                    {isFailed && (
                      <p className="text-sm text-red-600 mt-0.5">{job.error}</p>
                    )}
                    {isQueued && (
                      <p className="text-sm text-slate-500 mt-0.5">ממתין לתחילת עיבוד</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {isActive && (
                    <span className="text-sm font-mono font-bold text-blue-700 tabular-nums">
                      {progress}%
                    </span>
                  )}
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  )}
                </div>
              </div>

              {isActive && (
                <div className="mt-3">
                  <div className="relative h-2 bg-blue-100 rounded-full overflow-hidden">
                    <div
                      className="absolute inset-y-0 right-0 bg-gradient-to-l from-blue-500 to-blue-600 rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                    <div
                      className="absolute inset-y-0 right-0 bg-gradient-to-l from-blue-400 to-transparent rounded-full animate-pulse opacity-50"
                      style={{ width: `${Math.min(progress + 5, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {isExpanded && jobLogs.length > 0 && (
              <div className="border-t border-slate-100">
                <div className="px-5 py-3 bg-slate-50/50">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                    יומן עיבוד ({jobLogs.length} רשומות)
                  </p>
                </div>
                <div className="max-h-64 overflow-y-auto px-5 pb-4">
                  <div className="relative">
                    <div className="absolute top-0 bottom-0 right-[7px] w-px bg-slate-200" />
                    <div className="space-y-2.5 pt-2">
                      {jobLogs.map((log, idx) => (
                        <div key={log.id || idx} className="flex items-start gap-3 relative">
                          <div className="relative z-10 bg-white rounded-full p-0.5">
                            <LogIcon level={log.level} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm leading-snug ${
                              log.level === 'error'
                                ? 'text-red-700 font-medium'
                                : log.level === 'warning'
                                  ? 'text-amber-700'
                                  : 'text-slate-700'
                            }`}>
                              {log.message}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5 font-mono tabular-nums">
                              {formatTime(log.created_at)}
                              {log.meta?.progress !== undefined && (
                                <span className="mr-2 text-slate-500">
                                  {log.meta.progress}%
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      ))}
                      <div ref={logsEndRef} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isExpanded && jobLogs.length === 0 && !isQueued && (
              <div className="border-t border-slate-100 px-5 py-6 text-center">
                <p className="text-sm text-slate-400">אין רשומות יומן עדיין</p>
              </div>
            )}

            {isDone && (
              <div className="border-t border-emerald-100 bg-gradient-to-l from-emerald-50/50 to-white px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-emerald-600" />
                    <p className="text-sm font-medium text-emerald-900">
                      העיבוד הושלם בהצלחה! הקורס מוכן לצפייה
                    </p>
                  </div>
                  <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                    <Link href={`/course/${courseId}/view`}>
                      <Eye className="h-4 w-4 ml-2" />
                      צפה בקורס
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
