import React, { useEffect, useState } from 'react';
import { useConversionStore } from '../../store/conversionStore';
import { X, Minimize2, Maximize2, RefreshCw, XCircle, CheckCircle, Clock, Loader2, AlertCircle } from 'lucide-react';

interface ConversionJobTrackerProps {
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  autoHide?: boolean;
}

const ConversionJobTracker: React.FC<ConversionJobTrackerProps> = ({
  position = 'bottom-right',
  autoHide = true,
}) => {
  const { jobs, loadJobs, cancelJob, clearCompletedJobs } = useConversionStore();
  const [isMinimized, setIsMinimized] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  // Poll for job updates every 2 seconds
  useEffect(() => {
    loadJobs();
    const interval = setInterval(() => {
      loadJobs();
    }, 2000);

    return () => clearInterval(interval);
  }, [loadJobs]);

  // Auto-hide when no jobs and autoHide is enabled
  useEffect(() => {
    if (autoHide) {
      setIsVisible(jobs.length > 0);
    }
  }, [jobs.length, autoHide]);

  // Check if there are any active jobs
  const activeJobs = jobs.filter(
    (job) => job.status === 'Queued' || job.status === 'Processing'
  );
  const hasActiveJobs = activeJobs.length > 0;

  // Get position classes
  const getPositionClasses = () => {
    switch (position) {
      case 'bottom-right':
        return 'bottom-4 right-4';
      case 'bottom-left':
        return 'bottom-4 left-4';
      case 'top-right':
        return 'top-4 right-4';
      case 'top-left':
        return 'top-4 left-4';
      default:
        return 'bottom-4 right-4';
    }
  };

  // Get status icon and color
  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'Queued':
        return {
          icon: <Clock className="w-4 h-4" />,
          color: 'text-blue-500',
          bgColor: 'bg-blue-500/10',
          label: 'Queued',
        };
      case 'Processing':
        return {
          icon: <Loader2 className="w-4 h-4 animate-spin" />,
          color: 'text-yellow-500',
          bgColor: 'bg-yellow-500/10',
          label: 'Processing',
        };
      case 'Completed':
        return {
          icon: <CheckCircle className="w-4 h-4" />,
          color: 'text-green-500',
          bgColor: 'bg-green-500/10',
          label: 'Complete',
        };
      case 'Failed':
        return {
          icon: <AlertCircle className="w-4 h-4" />,
          color: 'text-red-500',
          bgColor: 'bg-red-500/10',
          label: 'Failed',
        };
      case 'Cancelled':
        return {
          icon: <XCircle className="w-4 h-4" />,
          color: 'text-gray-500',
          bgColor: 'bg-gray-500/10',
          label: 'Cancelled',
        };
      default:
        return {
          icon: <Clock className="w-4 h-4" />,
          color: 'text-gray-500',
          bgColor: 'bg-gray-500/10',
          label: status,
        };
    }
  };

  // Handle cancel job
  const handleCancelJob = async (jobId: string) => {
    try {
      await cancelJob(jobId);
    } catch (error) {
      console.error('Failed to cancel job:', error);
    }
  };

  // Handle clear completed
  const handleClearCompleted = async () => {
    try {
      await clearCompletedJobs();
    } catch (error) {
      console.error('Failed to clear completed jobs:', error);
    }
  };

  // Handle refresh
  const handleRefresh = () => {
    loadJobs();
  };

  if (!isVisible) return null;

  return (
    <div
      className={`fixed ${getPositionClasses()} z-50 w-96 max-h-[600px] flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 transition-all duration-200`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-t-lg">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Loader2 className={`w-5 h-5 ${hasActiveJobs ? 'animate-spin text-blue-500' : 'text-gray-400'}`} />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              Conversions
            </h3>
          </div>
          <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full">
            {jobs.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title={isMinimized ? 'Maximize' : 'Minimize'}
          >
            {isMinimized ? (
              <Maximize2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            ) : (
              <Minimize2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            )}
          </button>
          <button
            onClick={() => setIsVisible(false)}
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title="Close"
          >
            <X className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      </div>

      {/* Content */}
      {!isMinimized && (
        <>
          {/* Job List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[450px]">
            {jobs.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Loader2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No conversion jobs</p>
              </div>
            ) : (
              jobs.map((job) => {
                const statusDisplay = getStatusDisplay(job.status);
                return (
                  <div
                    key={job.id}
                    className={`p-3 rounded-lg border ${statusDisplay.bgColor} border-gray-200 dark:border-gray-700 transition-all`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className={statusDisplay.color}>{statusDisplay.icon}</span>
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                          {job.source_path.split('/').pop() || 'Unknown file'}
                        </span>
                      </div>
                      {(job.status === 'Queued' || job.status === 'Processing') && (
                        <button
                          onClick={() => handleCancelJob(job.id)}
                          className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors flex-shrink-0"
                          title="Cancel"
                        >
                          <XCircle className="w-4 h-4 text-red-500" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-2">
                      <span>→ {job.target_format.toUpperCase()}</span>
                      <span className={`px-2 py-0.5 rounded-full ${statusDisplay.bgColor} ${statusDisplay.color} font-medium`}>
                        {statusDisplay.label}
                      </span>
                    </div>

                    {/* Progress Bar (for processing jobs) */}
                    {job.status === 'Processing' && (
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-2 overflow-hidden">
                        <div className="bg-gradient-to-r from-blue-500 to-purple-500 h-full rounded-full animate-pulse w-2/3"></div>
                      </div>
                    )}

                    {/* Error Message */}
                    {job.status === 'Failed' && job.error && (
                      <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-400">
                        {job.error}
                      </div>
                    )}

                    {/* Output Path (for completed jobs) */}
                    {job.status === 'Completed' && job.target_path && (
                      <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
                        <p className="text-xs text-green-700 dark:text-green-400 truncate" title={job.target_path}>
                          {job.target_path}
                        </p>
                      </div>
                    )}

                    {/* Timestamps */}
                    {job.created_at && (
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                        Started: {new Date(job.created_at).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Actions */}
          {jobs.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-lg">
              <button
                onClick={handleClearCompleted}
                disabled={!jobs.some((j) => j.status === 'Completed' || j.status === 'Failed' || j.status === 'Cancelled')}
                className="w-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Clear Completed
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ConversionJobTracker;
