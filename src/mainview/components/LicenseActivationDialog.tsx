import { X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { mockLicenseAPI } from '@/lib/license-api-mock';
import { rpcActivateLicense } from '@/lib/rpc-license';

interface LicenseActivationDialogProps {
  onClose: () => void;
  onSuccess?: () => void;
  open: boolean;
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
        <div className="mb-1 font-bold">Test License Keys:</div>
        {testKeys.map((k, i) => (
          <div className="font-mono text-xs" key={i}>
            {k}
          </div>
        ))}
      </div>,
      { duration: 10_000 }
    );
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white shadow-xl dark:bg-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between border-gray-200 border-b p-6 dark:border-gray-700">
          <h2 className="font-bold text-gray-900 text-xl dark:text-white">
            Activate License
          </h2>
          <button
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="mb-4 text-gray-600 text-sm dark:text-gray-400">
            Enter your license key to unlock unlimited cards and premium
            features.
          </p>

          <div className="mb-4">
            <label
              className="mb-2 block font-medium text-gray-700 text-sm dark:text-gray-300"
              htmlFor="license-key"
            >
              License Key
            </label>
            <input
              autoFocus
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              id="license-key"
              maxLength={29}
              onChange={(e) => handleKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
              placeholder="GHOST-XXXX-XXXX-XXXX-XXXX"
              type="text"
              value={key}
            />
          </div>

          {/* Mock Mode Toggle (Dev Only) */}
          {import.meta.env.DEV && (
            <div className="mb-4 rounded-lg bg-yellow-50 p-3 dark:bg-yellow-900/20">
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={useMock}
                  className="rounded"
                  onChange={(e) => setUseMock(e.target.checked)}
                  type="checkbox"
                />
                <span className="text-yellow-800 dark:text-yellow-200">
                  Use Mock API (Testing)
                </span>
              </label>
              {useMock && (
                <button
                  className="mt-2 text-xs text-yellow-700 underline dark:text-yellow-300"
                  onClick={showTestKeys}
                  type="button"
                >
                  Show test keys
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-gray-200 border-t p-6 dark:border-gray-700">
          <button
            className="flex-1 rounded-lg bg-blue-500 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={loading || !key.trim()}
            onClick={handleActivate}
            type="button"
          >
            {loading ? 'Activating...' : 'Activate'}
          </button>
          <button
            className="rounded-lg border border-gray-300 px-4 py-2 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
