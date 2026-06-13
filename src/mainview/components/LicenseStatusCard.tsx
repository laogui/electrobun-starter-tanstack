import { useEffect, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import type { LicenseInfo } from '@/lib/rpc-license';
import { rpcCheckLicense } from '@/lib/rpc-license';

interface LicenseStatusCardProps {
  onActivateClick: () => void;
}

export function LicenseStatusCard({ onActivateClick }: LicenseStatusCardProps) {
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLicense();
  }, []);

  const loadLicense = async () => {
    setLoading(true);
    try {
      const status = await rpcCheckLicense();
      setLicense(status);
    } catch (error) {
      console.error('[License] Failed to load:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg animate-pulse">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2" />
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
      </div>
    );
  }

  if (license?.activated) {
    return (
      <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-lg">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 p-1.5 bg-green-100 dark:bg-green-800 rounded-full">
            <Check size={16} className="text-green-600 dark:text-green-200" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-green-900 dark:text-green-100">
                Pro License Active
              </h3>
              <Sparkles size={14} className="text-green-600 dark:text-green-400" />
            </div>
            <p className="text-sm text-green-700 dark:text-green-300 mb-2">
              Unlimited cards • All features unlocked
            </p>
            {license.activatedAt && (
              <p className="text-xs text-green-600 dark:text-green-400">
                Activated {new Date(license.activatedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 p-1.5 bg-blue-100 dark:bg-blue-800 rounded-full">
          <Sparkles size={16} className="text-blue-600 dark:text-blue-200" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
            Free Version
          </h3>
          <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
            Limited to 100 cards
          </p>
          <button
            onClick={onActivateClick}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Sparkles size={14} />
            Activate Pro License
          </button>
        </div>
      </div>
    </div>
  );
}

// 简化版组件,用于设置页面以外的地方
export function LicenseStatusBadge() {
  const [licensed, setLicensed] = useState<boolean | null>(null);

  useEffect(() => {
    rpcCheckLicense().then((status) => {
      setLicensed(status?.activated || false);
    });
  }, []);

  if (licensed === null) return null;

  if (licensed) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-full text-xs font-medium text-green-700 dark:text-green-300">
        <Check size={12} />
        Pro
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full text-xs font-medium text-gray-600 dark:text-gray-400">
      Free (100 cards max)
    </div>
  );
}
