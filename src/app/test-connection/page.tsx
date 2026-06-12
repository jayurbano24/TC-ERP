"use client";

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Card, Badge, Button, Spinner } from '@/components/ui';
import { Database, CheckCircle2, XCircle, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function TestConnectionPage() {
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const testConnection = async () => {
    setStatus('testing');
    setError(null);
    setDetails(null);

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setStatus('error');
      setError('Supabase client not configured. Check your .env.local variables.');
      return;
    }

    try {
      // Test 1: Fetch version or a simple table
      const { data, error: queryError } = await supabase
        .from('profiles') // Table defined in our schema
        .select('*')
        .limit(1);

      if (queryError) {
        throw queryError;
      }

      setStatus('success');
      setDetails(data);
    } catch (err: any) {
      console.error('Supabase test error:', err);
      setStatus('error');
      setError(err.message || 'Unknown error occurred during connection test.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
      <Card className="max-w-2xl w-full p-12 shadow-2xl">
        <div className="space-y-10">
          {/* Header */}
          <div className="flex items-center gap-4">
            <div className="bg-[#181c3a] p-4 rounded-2xl shadow-lg shadow-[#181c3a]/20">
              <Database className="w-8 h-8 text-[#2ec4f1]" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-[#181c3a] tracking-tight">Supabase Connection Test</h1>
              <p className="text-slate-500 text-sm font-medium">Verifying database connectivity and configuration.</p>
            </div>
          </div>

          {/* Status Display */}
          <div className="bg-slate-50 border border-slate-200 rounded-[2rem] p-8 space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Current Status</span>
              {status === 'idle' && <Badge variant="slate">Ready to test</Badge>}
              {status === 'testing' && <Badge variant="blue">Testing...</Badge>}
              {status === 'success' && <Badge variant="green">Connected</Badge>}
              {status === 'error' && <Badge variant="red">Failed</Badge>}
            </div>

            <div className="flex flex-col items-center justify-center py-10 gap-6">
              {status === 'idle' && (
                <div className="text-center space-y-3 opacity-40">
                  <ShieldCheck className="w-16 h-16 mx-auto text-slate-300" />
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Waiting to initiate test</p>
                </div>
              )}

              {status === 'testing' && (
                <div className="flex flex-col items-center gap-4">
                  <Spinner size="lg" />
                  <p className="text-sm font-black text-[#181c3a] uppercase tracking-widest animate-pulse">Communicating with Supabase...</p>
                </div>
              )}

              {status === 'success' && (
                <div className="text-center space-y-4">
                  <div className="bg-emerald-500 text-white p-6 rounded-full inline-block shadow-xl shadow-emerald-500/20">
                    <CheckCircle2 className="w-12 h-12" />
                  </div>
                  <h2 className="text-xl font-black text-emerald-600">Connection Successful!</h2>
                  <p className="text-sm text-slate-500 font-medium max-w-xs mx-auto">
                    The system can now read and write data to your Supabase instance.
                  </p>
                </div>
              )}

              {status === 'error' && (
                <div className="text-center space-y-4 w-full">
                  <div className="bg-rose-500 text-white p-6 rounded-full inline-block shadow-xl shadow-rose-500/20">
                    <XCircle className="w-12 h-12" />
                  </div>
                  <h2 className="text-xl font-black text-rose-600">Connection Failed</h2>
                  <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl text-left">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-rose-500" />
                      <span className="text-[10px] font-black uppercase text-rose-500">Error Details</span>
                    </div>
                    <p className="text-xs font-mono font-bold text-rose-900 break-words">{error}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action */}
          <div className="flex gap-4">
            <Button 
              className="flex-1 h-14 rounded-2xl" 
              onClick={testConnection}
              disabled={status === 'testing'}
            >
              {status === 'idle' ? 'Start Connection Test' : 'Retry Test'}
            </Button>
            <Button variant="outline" className="h-14 px-8 rounded-2xl" onClick={() => window.location.href = '/'}>
              Back to Home
            </Button>
          </div>

          {/* Technical Info */}
          {status === 'success' && details && (
            <div className="pt-6 border-t border-slate-100">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Sample Data (Profiles)</h3>
              <pre className="bg-slate-900 text-emerald-400 p-4 rounded-xl text-xs font-mono overflow-auto max-h-40">
                {JSON.stringify(details, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
