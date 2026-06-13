import { useState } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { rpcActivateLicense } from '@/lib/rpc-license';
import { mockLicenseAPI } from '@/lib/license-api-mock';

interface LicenseActivationDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function LicenseActivationDialog({
  open,
  onClose,
  onSuccess,
}: LicenseActivationDialogProps) {
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [useMock, setUseMock] = useState(false);

  const handleActivate = async () => {
    const trimmedKey = key.trim().toUpperCase();

    if (!trimmedKey) {
      toast.error('Please enter a license key');
      return;
    }

    setLoading(true);

    try {
      let result: any;

      if (useMock) {
        // 使用 Mock API 测试
        const deviceId = crypto.randomUUID();
        result = await mockLicenseAPI.activate(trimmedKey, deviceId, {
          platform: navigator.platform,
          userAgent: navigator.userAgent,
        });
      } else {
        // 使用真实 RPC
        result = await rpcActivateLicense(trimmedKey);
      }

      if (result?.success) {
        toast.success('License activated successfully!');
        setKey('');
        onSuccess?.();
        onClose();
      } else {
        toast.error(result?.error || 'Invalid license key');
      }
    } catch (error: any) {
      console.error('[License] Activation error:', error);
      toast.error(error?.message || 'Failed to activate license');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyInput = (value: string) => {
    // 自动格式化输入: GHOST-XXXX-XXXX-XXXX-XXXX
    const cleaned = value.replace(/[^A-F0-9-]/gi, '').toUpperCase();
    setKey(cleaned);
  };

  const showTestKeys = () => {
    const testKeys = mockLicenseAPI.getTestLicenses();
    toast.success(
      <div>
        <div className="font-bold mb-1">Test License Keys:</div>
        {testKeys.map((k, i) => (
          <div key={i} className="text-xs font-mono">
            {k}
          </div>
        ))}
      </div>,
      { duration: 10000 }
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Activate License
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Enter your license key to unlock unlimited cards and premium features.
          </p>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              License Key
            </label>
            <input
              type="text"
              value={key}
              onChange={(e) => handleKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
              placeholder="GHOST-XXXX-XXXX-XXXX-XXXX"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={29}
              autoFocus
            />
          </div>

          {/* Mock Mode Toggle (Dev Only) */}
          {import.meta.env.DEV && (
            <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={useMock}
                  onChange={(e) => setUseMock(e.target.checked)}
                  className="rounded"
                />
                <span className="text-yellow-800 dark:text-yellow-200">
                  Use Mock API (Testing)
                </span>
              </label>
              {useMock && (
                <button
                  onClick={showTestKeys}
                  className="mt-2 text-xs text-yellow-700 dark:text-yellow-300 underline"
                >
                  Show test keys
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleActivate}
            disabled={loading || !key.trim()}
            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Activating...' : 'Activate'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
