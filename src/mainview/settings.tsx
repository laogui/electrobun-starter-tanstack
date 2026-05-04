import ReactDOM from 'react-dom/client';

import { SettingsApp } from '@/components/settings/SettingsApp';
import { createSettingsClient } from '@/settingsClient';

import './index.css';

const rootElement = document.querySelector('#root');

if (rootElement == null) {
  throw new Error("Root element with id 'root' not found in settings.html");
}

const root = ReactDOM.createRoot(rootElement);
root.render(<SettingsApp client={createSettingsClient()} />);
