import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import type { ToasterProps } from 'sonner';
import { Toaster as Sonner } from 'sonner';

type AppToasterProps = Pick<ToasterProps, 'richColors'>;

export const Toaster = ({ richColors }: AppToasterProps) => (
  <Sonner
    className="group"
    icons={{
      success: <CircleCheckIcon className="size-4" />,
      info: <InfoIcon className="size-4" />,
      warning: <TriangleAlertIcon className="size-4" />,
      error: <OctagonXIcon className="size-4" />,
      loading: <Loader2Icon className="size-4 animate-spin" />,
    }}
    mobileOffset={{ bottom: 80, left: 16, right: 16 }}
    offset={{ bottom: 80, right: 24 }}
    richColors={richColors}
    style={
      {
        '--normal-bg': 'var(--popover)',
        '--normal-text': 'var(--popover-foreground)',
        '--normal-border': 'var(--border)',
        '--border-radius': 'var(--radius)',
      } as React.CSSProperties
    }
    theme="system"
    toastOptions={{
      classNames: {
        toast: 'cn-toast',
      },
    }}
  />
);
