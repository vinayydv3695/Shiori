import React, { useState, useEffect } from 'react';
import { sanitizeSVG } from '@/lib/sanitize';
import { useShareStore, Share, ShareResponse } from '../../store/shareStore';
import { Share2, Copy, QrCode, X, Lock, Clock, Download, Trash2, Power, CheckCircle, AlertCircle } from 'lucide-react';

interface ShareBookDialogProps {
  isOpen: boolean;
  onClose: () => void;
  bookId: number;
  bookTitle: string;
}

const ShareBookDialog: React.FC<ShareBookDialogProps> = ({ isOpen, onClose, bookId, bookTitle }) => {
  const { shares, serverRunning, isLoading, createShare, revokeShare, loadShares, startServer, stopServer, checkServerStatus } = useShareStore();
  
  // Form state
  const [password, setPassword] = useState('');
  const [expiresIn, setExpiresIn] = useState(24); // Default 24 hours
  const [maxDownloads, setMaxDownloads] = useState<number | undefined>(undefined);
  const [usePassword, setUsePassword] = useState(false);
  const [useMaxDownloads, setUseMaxDownloads] = useState(false);
  
  // UI state
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [activeShare, setActiveShare] = useState<Share | null>(null);
  const [activeShareResponse, setActiveShareResponse] = useState<ShareResponse | null>(null);

  // Load shares and check server status when dialog opens
  useEffect(() => {
    if (isOpen) {
      checkServerStatus();
      loadShares(bookId);
    }
  }, [isOpen, bookId, checkServerStatus, loadShares]);

  const handleCreateShare = async () => {
    setError(null);
    setIsCreating(true);

    try {
      // Ensure server is running
      if (!serverRunning) {
        await startServer();
      }

      const response = await createShare(
        bookId,
        usePassword ? password : undefined,
        expiresIn,
        useMaxDownloads ? maxDownloads : undefined
      );

      // Save the response for QR code display
      setActiveShareResponse(response);

      // Load the shares list
      await loadShares(bookId);

      // Reset form
      setPassword('');
      setUsePassword(false);
      setUseMaxDownloads(false);
      setMaxDownloads(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create share');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevokeShare = async (token: string) => {
    if (confirm('Are you sure you want to revoke this share?')) {
      try {
        await revokeShare(token);
        await loadShares(bookId);
        if (activeShare?.token === token) {
          setActiveShare(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to revoke share');
      }
    }
  };

  const handleCopyUrl = (token: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleToggleServer = async () => {
    try {
      if (serverRunning) {
        await stopServer();
      } else {
        await startServer();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle server');
    }
  };

  const formatExpiration = (expiresAt: string) => {
    const date = new Date(expiresAt);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMs < 0) return 'Expired';
    if (diffHours < 1) return 'Less than 1 hour';
    if (diffHours < 24) return `${diffHours}h remaining`;
    return `${diffDays}d remaining`;
  };

  const getShareUrl = (token: string) => {
    return `http://localhost:8080/share/${token}`;
  };

  const bookShares = shares.filter(s => s.book_id === bookId);
  const activeShares = bookShares.filter(s => new Date(s.expires_at) > new Date() && s.is_active);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Share2 className="w-5 h-5" />
              Share Book
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{bookTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Server Status */}
          <div className={`p-4 rounded-lg border ${
            serverRunning
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Power className={`w-5 h-5 ${
                  serverRunning ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'
                }`} />
                <span className={`font-medium ${
                  serverRunning ? 'text-green-900 dark:text-green-100' : 'text-yellow-900 dark:text-yellow-100'
                }`}>
                  Share Server {serverRunning ? 'Running' : 'Stopped'}
                </span>
              </div>
              <button
                onClick={handleToggleServer}
                disabled={isLoading}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  serverRunning
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50'
                    : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50'
                }`}
              >
                {serverRunning ? 'Stop Server' : 'Start Server'}
              </button>
            </div>
            {!serverRunning && (
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-2">
                Server must be running to create and access shares
              </p>
            )}
          </div>

          {/* Create New Share */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Create New Share
            </h3>

            <div className="space-y-4">
              {/* Expiration */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Expires In
                </label>
                <select
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value={1}>1 hour</option>
                  <option value={6}>6 hours</option>
                  <option value={24}>24 hours</option>
                  <option value={168}>7 days</option>
                  <option value={720}>30 days</option>
                </select>
              </div>

              {/* Password Protection */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <input
                    type="checkbox"
                    checked={usePassword}
                    onChange={(e) => setUsePassword(e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  Password Protection
                </label>
                {usePassword && (
                  <input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                )}
              </div>

              {/* Max Downloads */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <input
                    type="checkbox"
                    checked={useMaxDownloads}
                    onChange={(e) => setUseMaxDownloads(e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  Limit Downloads
                </label>
                {useMaxDownloads && (
                  <input
                    type="number"
                    value={maxDownloads || ''}
                    onChange={(e) => setMaxDownloads(parseInt(e.target.value) || undefined)}
                    placeholder="Max downloads"
                    min="1"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                )}
              </div>

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                onClick={handleCreateShare}
                disabled={isCreating || !serverRunning}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Share2 className="w-4 h-4" />
                {isCreating ? 'Creating...' : 'Create Share Link'}
              </button>
            </div>
          </div>

          {/* Active Shares */}
          {bookShares.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Existing Shares ({activeShares.length} active)
              </h3>
              <div className="space-y-3">
                {bookShares.map((share) => {
                  const isExpired = new Date(share.expires_at) < new Date();
                  const url = getShareUrl(share.token);
                  const isCopied = copiedToken === share.token;

                  return (
                    <div
                      key={share.id}
                      className={`p-4 rounded-lg border ${
                        isExpired || !share.is_active
                          ? 'bg-gray-50 dark:bg-gray-900/50 border-gray-300 dark:border-gray-700 opacity-60'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <code className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                              {share.token}
                            </code>
                            {share.password_hash && (
                              <Lock className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                            )}
                            {!share.is_active && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">
                                Revoked
                              </span>
                            )}
                            {isExpired && share.is_active && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                                Expired
                              </span>
                            )}
                          </div>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate block"
                          >
                            {url}
                          </a>
                        </div>
                        {!isExpired && share.is_active && (
                          <button
                            onClick={() => handleRevokeShare(share.token)}
                            className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors flex-shrink-0"
                            title="Revoke"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-3">
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          <span>{formatExpiration(share.expires_at)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Download className="w-4 h-4" />
                          <span>
                            {share.download_count}
                            {share.max_downloads && ` / ${share.max_downloads}`} downloads
                          </span>
                        </div>
                      </div>

                      {!isExpired && share.is_active && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleCopyUrl(share.token, url)}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                          >
                            {isCopied ? (
                              <>
                                <CheckCircle className="w-4 h-4 text-green-600" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4" />
                                Copy URL
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* QR Code Display */}
          {activeShareResponse && (
            <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">QR Code</h3>
                <button
                  onClick={() => setActiveShareResponse(null)}
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                >
                  Hide
                </button>
              </div>
              <div className="flex items-center justify-center p-6 bg-white rounded-lg">
                {activeShareResponse.qr_code_svg && (
                  <div dangerouslySetInnerHTML={{
                    __html: sanitizeSVG(activeShareResponse.qr_code_svg)
                  }} />
                )}
              </div>
              <p className="text-sm text-center text-gray-600 dark:text-gray-400 mt-4">
                Scan this QR code to access the shared book
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareBookDialog;
