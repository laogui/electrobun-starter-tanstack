import type { LocaleSetting } from '@/settingsClient';

/**
 * Localized strings for the Settings window. The settings webview lives in
 * its own paraglide-free bundle (we can't share `paraglide/messages.js` here
 * without bundling the entire main view) so we keep the dictionary inline.
 */
export interface SettingsLocaleStrings {
  // ── About panel ─────────────────────────────────────────────────────────
  aboutChangelog: string;
  aboutChannel: string;
  aboutCheckUpdate: string;
  aboutCheckUpdateChecking: string;
  aboutCommitHash: string;
  aboutDevChannelNote: string;
  aboutTitle: string;
  aboutUpdateAvailable: (version: string) => string;
  aboutUpdateError: string;
  aboutUpdateNoUpdate: string;
  aboutVersion: string;
  autoSave500: string;
  autoSave800: string;
  // ── General panel ───────────────────────────────────────────────────────
  autoSave2000: string;
  autoSave5000: string;
  autoSaveLabel: string;
  canvasBgDefault: string;
  canvasBgLabel: string;
  canvasBgMono: string;
  canvasBgPaper: string;
  canvasSnapLabel: string;
  canvasSnapOff: string;
  canvasSnapOn: string;
  // Trash + Cleanup
  cleanupConfirmAction: string;
  cleanupConfirmBody: (count: number) => string;
  cleanupConfirmCancel: string;
  cleanupConfirmTitle: (count: number) => string;
  cleanupCount: (count: number) => string;
  cleanupDeleteFailed: (count: number) => string;
  cleanupDeleteSelected: (count: number) => string;
  cleanupDescription: string;
  cleanupDeselectAll: string;
  cleanupEmpty: string;
  cleanupModified: (when: string) => string;
  cleanupNoId: string;
  cleanupRowCheckboxAria: (file: string) => string;
  cleanupScan: string;
  cleanupScanFailed: string;
  cleanupScanning: string;
  cleanupSelectAll: string;
  cleanupTitle: string;
  cleanupUnscanned: string;
  dark: string;
  fontLabel: string;
  fontMono: string;
  fontSerif: string;
  fontSystem: string;
  generalTitle: string;
  language: string;
  light: string;
  // ── Common errors ───────────────────────────────────────────────────────
  loadError: string;
  // ── Sidebar nav ─────────────────────────────────────────────────────────
  navAbout: string;
  navGeneral: string;
  navShortcuts: string;
  navWorkspace: string;
  purgeConfirmAction: string;
  purgeConfirmBody: (name: string) => string;
  purgeConfirmCancel: string;
  purgeConfirmTitle: string;
  saveError: string;
  // ── Shortcuts panel ─────────────────────────────────────────────────────
  shortcutAction: string;
  shortcutCopy: string;
  shortcutCut: string;
  shortcutDelete: string;
  shortcutDescription: string;
  shortcutDeselectAll: string;
  shortcutDuplicate: string;
  shortcutEdit: string;
  shortcutFocusedClose: string;
  shortcutGroup: string;
  shortcutKey: string;
  shortcutNavigate: string;
  shortcutNewMenu: string;
  shortcutOpenFocused: string;
  shortcutPaste: string;
  shortcutRedo: string;
  shortcutSearch: string;
  shortcutSection: string;
  shortcutSectionEdit: string;
  shortcutSectionNav: string;
  shortcutSectionView: string;
  shortcutSelectAll: string;
  shortcutsTitle: string;
  shortcutTypeToSearch: string;
  shortcutUndo: string;
  shortcutUngroup: string;
  shortcutZoomIn: string;
  shortcutZoomOut: string;
  shortcutZoomReset: string;
  system: string;
  theme: string;
  title: string;
  trashClearAll: string;
  trashClearAllConfirmAction: string;
  trashClearAllConfirmBody: (count: number) => string;
  trashClearAllConfirmTitle: (count: number) => string;
  trashClearAllFailed: string;
  trashClearAllSuccess: (count: number) => string;
  trashDeletedAt: (when: string) => string;
  trashEmpty: string;
  trashLoadError: string;
  trashPurgeAria: (name: string) => string;
  trashPurgeFailed: string;
  trashRestoreAria: (name: string) => string;
  trashRestoreFailed: string;
  trashTitle: string;
  // ── Workspace panel ─────────────────────────────────────────────────────
  workspaceCopyPath: string;
  workspaceCopyPathDone: string;
  workspaceDefaultIndicator: string;
  workspaceExportArchive: string;
  workspaceExportFailed: string;
  workspaceExportInProgress: string;
  workspaceExportSuccess: (path: string) => string;
  workspaceOpenInFinder: string;
  workspacePathLabel: string;
  workspaceRestartRequired: string;
  workspaceSwitch: string;
  workspaceSwitchFailed: string;
  workspaceSwitchSuccess: (path: string) => string;
  workspaceTitle: string;
}

const localeStrings: Record<LocaleSetting, SettingsLocaleStrings> = {
  en: {
    title: 'Settings',
    loadError: 'Unable to load settings.',
    saveError: 'Unable to save settings.',

    navGeneral: 'General',
    navWorkspace: 'Workspace',
    navShortcuts: 'Shortcuts',
    navAbout: 'About',

    generalTitle: 'General',
    language: 'Language',
    theme: 'Theme',
    system: 'System',
    light: 'Light',
    dark: 'Dark',
    fontLabel: 'Interface font',
    fontSystem: 'System default',
    fontSerif: 'Serif',
    fontMono: 'Monospace',
    canvasBgLabel: 'Canvas background',
    canvasBgDefault: 'Default (cool gray)',
    canvasBgPaper: 'Paper (warm)',
    canvasBgMono: 'Mono (neutral)',
    canvasSnapLabel: 'Snap to grid',
    canvasSnapOn: 'On',
    canvasSnapOff: 'Off',
    autoSaveLabel: 'Auto-save interval',
    autoSave500: 'Fast (0.5s)',
    autoSave800: 'Default (0.8s)',
    autoSave2000: 'Relaxed (2s)',
    autoSave5000: 'Battery saver (5s)',

    workspaceTitle: 'Workspace',
    workspacePathLabel: 'Workspace folder',
    workspaceDefaultIndicator: 'Default location',
    workspaceOpenInFinder: 'Reveal in Finder',
    workspaceCopyPath: 'Copy path',
    workspaceCopyPathDone: 'Copied',
    workspaceSwitch: 'Change workspace…',
    workspaceSwitchSuccess: (path) => `Switched workspace to ${path}.`,
    workspaceSwitchFailed: 'Could not switch workspace.',
    workspaceRestartRequired:
      'Restart GhostBoard for the new workspace to take effect.',
    workspaceExportArchive: 'Export workspace as ZIP…',
    workspaceExportInProgress: 'Compressing workspace…',
    workspaceExportSuccess: (path) => `Exported workspace to ${path}.`,
    workspaceExportFailed: 'Workspace export failed.',

    cleanupTitle: 'Unlinked Files',
    cleanupDescription:
      'Markdown files in content/ that are not referenced by any canvas (including trashed canvases).',
    cleanupScan: 'Scan',
    cleanupScanning: 'Scanning…',
    cleanupUnscanned: 'Click Scan to find unlinked files.',
    cleanupEmpty: 'All files are linked. Nothing to clean up.',
    cleanupCount: (count) =>
      count === 1 ? '1 unlinked file' : `${count} unlinked files`,
    cleanupSelectAll: 'Select all',
    cleanupDeselectAll: 'Deselect all',
    cleanupDeleteSelected: (count) =>
      count === 1 ? 'Move 1 to Trash' : `Move ${count} to Trash`,
    cleanupRowCheckboxAria: (file) => `Select ${file}`,
    cleanupNoId: 'No frontmatter id',
    cleanupModified: (when) => `Modified ${when}`,
    cleanupScanFailed: 'Unable to scan content directory.',
    cleanupDeleteFailed: (count) =>
      count === 1
        ? '1 file could not be moved to Trash.'
        : `${count} files could not be moved to Trash.`,
    cleanupConfirmTitle: (count) =>
      count === 1 ? 'Move 1 file to Trash?' : `Move ${count} files to Trash?`,
    cleanupConfirmBody: (count) =>
      count === 1
        ? '1 file will be moved to the system Trash. You can restore it from the Trash.'
        : `${count} files will be moved to the system Trash. You can restore them from the Trash.`,
    cleanupConfirmCancel: 'Cancel',
    cleanupConfirmAction: 'Move to Trash',

    trashTitle: 'Deleted Canvases',
    trashEmpty: 'No deleted canvases.',
    trashDeletedAt: (when) => `Deleted ${when}`,
    trashRestoreAria: (name) => `Restore ${name}`,
    trashPurgeAria: (name) => `Permanently delete ${name}`,
    trashLoadError: 'Unable to load deleted canvases.',
    trashRestoreFailed: 'Unable to restore canvas.',
    trashPurgeFailed: 'Unable to permanently delete canvas.',
    trashClearAll: 'Empty all',
    trashClearAllConfirmTitle: (count) =>
      count === 1
        ? 'Permanently delete 1 canvas?'
        : `Permanently delete all ${count} canvases?`,
    trashClearAllConfirmBody: (count) =>
      count === 1
        ? '1 canvas will be permanently deleted. This cannot be undone.'
        : `${count} canvases will be permanently deleted. This cannot be undone.`,
    trashClearAllConfirmAction: 'Delete Forever',
    trashClearAllSuccess: (count) =>
      count === 1
        ? '1 canvas permanently deleted.'
        : `${count} canvases permanently deleted.`,
    trashClearAllFailed: 'Unable to empty trash.',
    purgeConfirmTitle: 'Permanently delete canvas?',
    purgeConfirmBody: (name) =>
      `"${name}" will be permanently deleted. This cannot be undone.`,
    purgeConfirmCancel: 'Cancel',
    purgeConfirmAction: 'Delete Forever',

    shortcutsTitle: 'Keyboard Shortcuts',
    shortcutDescription:
      'Cheatsheet of every shortcut available on the canvas. Use ⌘ on macOS, Ctrl on Windows/Linux.',
    shortcutKey: 'Shortcut',
    shortcutAction: 'Action',
    shortcutSection: 'Section',
    shortcutSectionEdit: 'Edit',
    shortcutSectionNav: 'Navigation',
    shortcutSectionView: 'View',
    shortcutSearch: 'Open search',
    shortcutNewMenu: 'Open create menu',
    shortcutEdit: 'Edit',
    shortcutUndo: 'Undo',
    shortcutRedo: 'Redo',
    shortcutCopy: 'Copy',
    shortcutCut: 'Cut',
    shortcutPaste: 'Paste',
    shortcutDuplicate: 'Duplicate',
    shortcutDelete: 'Delete selected',
    shortcutSelectAll: 'Select all',
    shortcutDeselectAll: 'Deselect all',
    shortcutGroup: 'Group selected',
    shortcutUngroup: 'Ungroup',
    shortcutZoomIn: 'Zoom in',
    shortcutZoomOut: 'Zoom out',
    shortcutZoomReset: 'Reset zoom',
    shortcutNavigate: 'Move selection',
    shortcutOpenFocused: 'Open focused view',
    shortcutFocusedClose: 'Close focused view / dialog',
    shortcutTypeToSearch: 'Type to search',

    aboutTitle: 'About',
    aboutVersion: 'Version',
    aboutCommitHash: 'Build',
    aboutChannel: 'Channel',
    aboutCheckUpdate: 'Check for updates',
    aboutCheckUpdateChecking: 'Checking…',
    aboutUpdateAvailable: (version) =>
      `Update available — version ${version} is ready to install.`,
    aboutUpdateNoUpdate: 'You are on the latest version.',
    aboutUpdateError: 'Could not check for updates.',
    aboutDevChannelNote:
      'Updates are disabled on the dev channel. Use a release build to receive automatic updates.',
    aboutChangelog: 'View release notes',
  },
  zh: {
    title: '设置',
    loadError: '无法加载设置。',
    saveError: '无法保存设置。',

    navGeneral: '通用',
    navWorkspace: '工作区',
    navShortcuts: '快捷键',
    navAbout: '关于',

    generalTitle: '通用',
    language: '语言',
    theme: '主题',
    system: '跟随系统',
    light: '浅色',
    dark: '深色',
    fontLabel: '界面字体',
    fontSystem: '系统默认',
    fontSerif: '衬线体',
    fontMono: '等宽字体',
    canvasBgLabel: '画布背景',
    canvasBgDefault: '默认（冷灰）',
    canvasBgPaper: '纸感（暖色）',
    canvasBgMono: '中性灰',
    canvasSnapLabel: '吸附网格',
    canvasSnapOn: '开启',
    canvasSnapOff: '关闭',
    autoSaveLabel: '自动保存间隔',
    autoSave500: '快速（0.5 秒）',
    autoSave800: '默认（0.8 秒）',
    autoSave2000: '舒缓（2 秒）',
    autoSave5000: '省电（5 秒）',

    workspaceTitle: '工作区',
    workspacePathLabel: '工作区文件夹',
    workspaceDefaultIndicator: '默认位置',
    workspaceOpenInFinder: '在 Finder 中显示',
    workspaceCopyPath: '复制路径',
    workspaceCopyPathDone: '已复制',
    workspaceSwitch: '切换工作区…',
    workspaceSwitchSuccess: (path) => `已切换工作区到 ${path}。`,
    workspaceSwitchFailed: '无法切换工作区。',
    workspaceRestartRequired: '请重新启动 GhostBoard 让新工作区生效。',
    workspaceExportArchive: '导出工作区为 ZIP…',
    workspaceExportInProgress: '正在压缩工作区…',
    workspaceExportSuccess: (path) => `工作区已导出到 ${path}。`,
    workspaceExportFailed: '工作区导出失败。',

    cleanupTitle: '未关联文件',
    cleanupDescription:
      'content/ 中未被任何画布（含回收站中的画布）引用的 Markdown 文件。',
    cleanupScan: '扫描',
    cleanupScanning: '扫描中…',
    cleanupUnscanned: '点击「扫描」查找未关联的文件。',
    cleanupEmpty: '所有文件均有关联，无需清理。',
    cleanupCount: (count) => `${count} 个未关联文件`,
    cleanupSelectAll: '全选',
    cleanupDeselectAll: '取消全选',
    cleanupDeleteSelected: (count) => `把选中的 ${count} 项移到废纸篓`,
    cleanupRowCheckboxAria: (file) => `选择 ${file}`,
    cleanupNoId: '没有 frontmatter id',
    cleanupModified: (when) => `修改于 ${when}`,
    cleanupScanFailed: '无法扫描 content 目录。',
    cleanupDeleteFailed: (count) => `${count} 个文件未能移到废纸篓。`,
    cleanupConfirmTitle: (count) => `把 ${count} 个文件移到废纸篓？`,
    cleanupConfirmBody: (count) =>
      `${count} 个文件将被移到系统废纸篓，可在废纸篓中恢复。`,
    cleanupConfirmCancel: '取消',
    cleanupConfirmAction: '移到废纸篓',

    trashTitle: '已删除的画布',
    trashEmpty: '没有已删除的画布。',
    trashDeletedAt: (when) => `删除于 ${when}`,
    trashRestoreAria: (name) => `恢复 ${name}`,
    trashPurgeAria: (name) => `永久删除 ${name}`,
    trashLoadError: '无法加载已删除的画布。',
    trashRestoreFailed: '无法恢复画布。',
    trashPurgeFailed: '无法永久删除画布。',
    trashClearAll: '清空全部',
    trashClearAllConfirmTitle: (count) =>
      count === 1 ? '永久删除 1 个画布？' : `永久删除全部 ${count} 个画布？`,
    trashClearAllConfirmBody: (count) =>
      count === 1
        ? '1 个画布将被永久删除，无法恢复。'
        : `${count} 个画布将被永久删除，无法恢复。`,
    trashClearAllConfirmAction: '永久删除',
    trashClearAllSuccess: (count) => `已永久删除 ${count} 个画布。`,
    trashClearAllFailed: '清空回收站失败。',
    purgeConfirmTitle: '永久删除画布？',
    purgeConfirmBody: (name) => `「${name}」将被永久删除，无法恢复。`,
    purgeConfirmCancel: '取消',
    purgeConfirmAction: '永久删除',

    shortcutsTitle: '键盘快捷键',
    shortcutDescription:
      '画布上所有可用的快捷键速查表。macOS 上是 ⌘，Windows/Linux 上是 Ctrl。',
    shortcutKey: '快捷键',
    shortcutAction: '操作',
    shortcutSection: '分组',
    shortcutSectionEdit: '编辑',
    shortcutSectionNav: '导航',
    shortcutSectionView: '视图',
    shortcutSearch: '打开搜索',
    shortcutNewMenu: '打开新建菜单',
    shortcutEdit: '编辑',
    shortcutUndo: '撤销',
    shortcutRedo: '重做',
    shortcutCopy: '复制',
    shortcutCut: '剪切',
    shortcutPaste: '粘贴',
    shortcutDuplicate: '生成副本',
    shortcutDelete: '删除选中',
    shortcutSelectAll: '全选',
    shortcutDeselectAll: '取消全选',
    shortcutGroup: '组合选中',
    shortcutUngroup: '取消组合',
    shortcutZoomIn: '放大',
    shortcutZoomOut: '缩小',
    shortcutZoomReset: '重置缩放',
    shortcutNavigate: '移动选中节点',
    shortcutOpenFocused: '打开聚焦视图',
    shortcutFocusedClose: '关闭聚焦视图 / 对话框',
    shortcutTypeToSearch: '直接输入即可搜索',

    aboutTitle: '关于',
    aboutVersion: '版本',
    aboutCommitHash: '构建',
    aboutChannel: '通道',
    aboutCheckUpdate: '检查更新',
    aboutCheckUpdateChecking: '检查中…',
    aboutUpdateAvailable: (version) => `有新版本——${version} 已就绪可安装。`,
    aboutUpdateNoUpdate: '已经是最新版本。',
    aboutUpdateError: '无法检查更新。',
    aboutDevChannelNote: '开发通道不支持自动更新，请使用正式版本以接收更新。',
    aboutChangelog: '查看更新日志',
  },
};

export function getLocaleStrings(locale: LocaleSetting): SettingsLocaleStrings {
  return localeStrings[locale];
}
