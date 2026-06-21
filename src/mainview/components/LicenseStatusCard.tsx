import { Check, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { LicenseInfo } from '@/lib/rpc-license';
import { refreshLicense } from '@/lib/rpc-license';

interface LicenseStatusCardProps {
  onActivateClick: () => void;
}

export function LicenseStatusCard({ onActivateClick }: LicenseStatusCardProps) {
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    refreshLicense()
      .then((status) => {
        setLicense(status);
      })
      .catch((error) => {
        console.error('[License] Failed to load:', error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
        <div className="mb-2 h-4 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  if (license?.activated) {
    return (
      <div className="rounded-lg border border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 p-4 dark:border-green-800 dark:from-green-900/20 dark:to-emerald-900/20">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-green-100 p-1.5 dark:bg-green-800">
            <Check className="text-green-600 dark:text-green-200" size={16} />
          </div>
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2">
              <h3 className="font-semibold text-green-900 dark:text-green-100">
                Pro License Active
              </h3>
              <Sparkles
                className="text-green-600 dark:text-green-400"
                size={14}
              />
            </div>
            <p className="mb-2 text-green-700 text-sm dark:text-green-300">
              Unlimited cards • All features unlocked
            </p>
            {license.activatedAt && (
              <p className="text-green-600 text-xs dark:text-green-400">
                Activated {new Date(license.activatedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 dark:border-blue-800 dark:from-blue-900/20 dark:to-indigo-900/20">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-blue-100 p-1.5 dark:bg-blue-800">
          <Sparkles className="text-blue-600 dark:text-blue-200" size={16} />
        </div>
        <div className="flex-1">
          <h3 className="mb-1 font-semibold text-blue-900 dark:text-blue-100">
            Free Version
          </h3>
          <p className="mb-3 text-blue-700 text-sm dark:text-blue-300">
            Limited to 100 cards
          </p>
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-blue-600"
            onClick={onActivateClick}
            type="button"
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
    refreshLicense().then((status) => {
      setLicensed(Boolean(status?.activated));
    });
  }, []);

  if (licensed === null) {
    return null;
  }

  if (licensed) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-100 px-2 py-1 font-medium text-green-700 text-xs dark:border-green-800 dark:bg-green-900/30 dark:text-green-300">
        <Check size={12} />
        Pro
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-100 px-2 py-1 font-medium text-gray-600 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
      Free (100 cards max)
    </div>
  );
}
