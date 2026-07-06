import { useQuery } from '@tanstack/react-query';
import { Check, Sparkles } from 'lucide-react';
import { formatLicenseActivationDate } from '@/lib/licenseDates';
import { refreshLicense } from '@/lib/rpc-license';

interface LicenseStatusCardProps {
  onActivateClick: () => void;
}

export function LicenseStatusCard({ onActivateClick }: LicenseStatusCardProps) {
  const { data: license, isLoading } = useQuery({
    queryKey: ['license-status'],
    queryFn: refreshLicense,
  });

  if (isLoading) {
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
                Activated {formatLicenseActivationDate(license.activatedAt)}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-accent-soft bg-accent-softer p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-accent-soft p-1.5">
          <Sparkles className="text-accent-strong" size={16} />
        </div>
        <div className="flex-1">
          <h3 className="mb-1 font-semibold text-accent-strong">
            Free Version
          </h3>
          <p className="mb-3 text-accent-strong text-sm">
            Limited to 100 cards
          </p>
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 font-medium text-accent-foreground text-sm transition-colors hover:bg-accent-strong dark:hover:bg-accent"
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
  const { data: license, isLoading } = useQuery({
    queryKey: ['license-status'],
    queryFn: refreshLicense,
  });

  if (isLoading) {
    return null;
  }

  if (license?.activated) {
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
