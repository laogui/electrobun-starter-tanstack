import type { LocaleSetting } from '@/settingsClient';

import enMessages from '../../../../../messages/en.json';
import zhMessages from '../../../../../messages/zh.json';
import { formatCountMessage, formatMessage } from './format';

type MessageCatalog = Record<string, string>;

const messageCatalogs: Record<LocaleSetting, MessageCatalog> = {
  en: enMessages as MessageCatalog,
  zh: zhMessages as MessageCatalog,
};

function getMessage(catalog: MessageCatalog, key: string): string {
  const value = catalog[key];

  if (typeof value !== 'string') {
    throw new Error(`Missing settings locale message: ${key}`);
  }

  return value;
}

function createSettingsLocaleStrings(catalog: MessageCatalog) {
  const t = (key: string) => getMessage(catalog, key);
  const f = (key: string, values: Record<string, number | string>) =>
    formatMessage(t(key), values);
  const count = (oneKey: string, otherKey: string, value: number) =>
    formatCountMessage(value, t(oneKey), t(otherKey));

  return {
    title: t('settings_title'),
    loadError: t('settings_load_error'),
    saveError: t('settings_save_error'),

    navGeneral: t('settings_nav_general'),
    navWorkspace: t('settings_nav_workspace'),
    navCanvasTypes: t('settings_nav_canvas_types'),
    navPlugins: t('settings_nav_plugins'),
    navAi: t('settings_nav_ai'),
    navShortcuts: t('settings_nav_shortcuts'),
    navAbout: t('settings_nav_about'),

    generalTitle: t('settings_general_title'),
    language: t('settings_language'),
    theme: t('settings_theme'),
    system: t('theme_system'),
    light: t('theme_light'),
    dark: t('theme_dark'),
    fontLabel: t('settings_font_label'),
    fontSystem: t('settings_font_system'),
    fontSerif: t('settings_font_serif'),
    fontMono: t('settings_font_mono'),
    canvasSnapLabel: t('settings_canvas_snap_label'),
    canvasSnapOn: t('settings_canvas_snap_on'),
    canvasSnapOff: t('settings_canvas_snap_off'),
    canvasMinimapLabel: t('settings_canvas_minimap_label'),
    canvasMinimapOn: t('settings_canvas_minimap_on'),
    canvasMinimapOff: t('settings_canvas_minimap_off'),
    autoSaveLabel: t('settings_auto_save_label'),
    autoSave500: t('settings_auto_save_500'),
    autoSave800: t('settings_auto_save_800'),
    autoSave2000: t('settings_auto_save_2000'),
    autoSave5000: t('settings_auto_save_5000'),

    aiTitle: t('settings_ai_title'),
    aiDescription: t('settings_ai_description'),
    aiEnabledLabel: t('settings_ai_enabled_label'),
    aiEnabledOn: t('settings_ai_enabled_on'),
    aiEnabledOff: t('settings_ai_enabled_off'),
    aiProviderLabel: t('settings_ai_provider_label'),
    aiProviderOpenai: t('settings_ai_provider_openai'),
    aiProviderAnthropic: t('settings_ai_provider_anthropic'),
    aiProviderOllama: t('settings_ai_provider_ollama'),
    aiProviderCustom: t('settings_ai_provider_custom'),
    aiModelLabel: t('settings_ai_model_label'),
    aiModelPlaceholder: t('settings_ai_model_placeholder'),
    aiBaseUrlLabel: t('settings_ai_base_url_label'),
    aiBaseUrlPlaceholder: t('settings_ai_base_url_placeholder'),
    aiBaseUrlHint: t('settings_ai_base_url_hint'),
    aiApiKeyLabel: t('settings_ai_api_key_label'),
    aiApiKeyPlaceholder: t('settings_ai_api_key_placeholder'),
    aiApiKeyConfigured: t('settings_ai_api_key_configured'),
    aiApiKeyNotConfigured: t('settings_ai_api_key_not_configured'),
    aiApiKeySave: t('settings_ai_api_key_save'),
    aiApiKeyClear: t('settings_ai_api_key_clear'),
    aiApiKeySaved: t('settings_ai_api_key_saved'),
    aiApiKeyCleared: t('settings_ai_api_key_cleared'),
    aiApiKeySaveFailed: t('settings_ai_api_key_save_failed'),
    aiReloadHint: t('settings_ai_reload_hint'),

    workspaceTitle: t('settings_workspace_title'),
    workspacePathLabel: t('settings_workspace_path_label'),
    workspaceDefaultIndicator: t('settings_workspace_default_indicator'),
    workspaceOpenInFinder: t('settings_workspace_open_in_finder'),
    workspaceCopyPath: t('settings_workspace_copy_path'),
    workspaceCopyPathDone: t('toast_copied'),
    workspaceSwitch: t('settings_workspace_switch'),
    workspaceSwitchSuccess: (path: string) =>
      f('settings_workspace_switch_success', { path }),
    workspaceSwitchFailed: t('settings_workspace_switch_failed'),
    workspaceRestartRequired: t('settings_workspace_restart_required'),
    workspaceExportArchive: t('settings_workspace_export_archive'),
    workspaceExportInProgress: t('settings_workspace_export_in_progress'),
    workspaceExportSuccess: (path: string) =>
      f('settings_workspace_export_success', { path }),
    workspaceExportFailed: t('settings_workspace_export_failed'),

    canvasTypesTitle: t('settings_canvas_types_title'),
    canvasTypesDescription: t('settings_canvas_types_description'),
    canvasTypesEmpty: t('settings_canvas_types_empty'),
    canvasTypesEnabled: t('settings_canvas_types_enabled'),
    canvasTypesDisabled: t('settings_canvas_types_disabled'),
    canvasTypesInstanceCount: (value: number) =>
      f('settings_canvas_types_instance_count', { count: value }),
    canvasTypesClear: t('settings_canvas_types_clear'),
    canvasTypesClearConfirm: (count: number, name: string) =>
      f('settings_canvas_types_clear_confirm', { count, name }),
    canvasTypesClearFailed: t('settings_canvas_types_clear_failed'),

    pluginsTitle: t('settings_plugins_title'),
    pluginsCapabilities: t('settings_plugins_capabilities'),
    pluginsNoCapabilities: t('settings_plugins_no_capabilities'),
    pluginsSignatureUnverified: t('settings_plugins_signature_unverified'),
    pluginsNoUpdateSource: t('settings_plugins_no_update_source'),
    pluginsUpdateSource: (source: string) =>
      f('settings_plugins_update_source', { source }),
    pluginsLegacy: t('settings_plugins_legacy'),
    pluginsDescription: t('settings_plugins_description'),
    pluginsRuntimeNotice: t('settings_plugins_runtime_notice'),
    pluginsInstallTitle: t('settings_plugins_install_title'),
    pluginsChooseFile: t('settings_plugins_choose_file'),
    pluginsChooseDirectory: t('settings_plugins_choose_directory'),
    pluginsDevelopmentNotice: t('settings_plugins_development_notice'),
    pluginsDirectoryPreview: t('settings_plugins_directory_preview'),
    pluginsConfirmDirectory: t('settings_plugins_confirm_directory'),
    pluginsDirectoryFingerprint: (digest: string) =>
      f('settings_plugins_directory_fingerprint', { digest }),
    pluginsDevelopmentSource: (source: string) =>
      f('settings_plugins_development_source', { source }),
    pluginsUrlLabel: t('settings_plugins_url_label'),
    pluginsUrlPlaceholder: t('settings_plugins_url_placeholder'),
    pluginsInspectUrl: t('settings_plugins_inspect_url'),
    pluginsInspecting: t('settings_plugins_inspecting'),
    pluginsUrlRequired: t('settings_plugins_url_required'),
    pluginsPreviewTitle: t('settings_plugins_preview_title'),
    pluginsPreviewDescription: t('settings_plugins_preview_description'),
    pluginsPreviewSource: (source: string) =>
      f('settings_plugins_preview_source', { source }),
    pluginsPreviewDigest: (digest: string) =>
      f('settings_plugins_preview_digest', { digest }),
    pluginsConfirmInstall: t('settings_plugins_confirm_install'),
    pluginsCancelInstall: t('settings_plugins_cancel_install'),
    pluginsInstalling: t('settings_plugins_installing'),
    pluginsInstallSuccess: (name: string) =>
      f('settings_plugins_install_success', { name }),
    pluginsInstalledTitle: t('settings_plugins_installed_title'),
    pluginsEmpty: t('settings_plugins_empty'),
    pluginsStored: t('settings_plugins_stored'),
    pluginsEnabled: t('settings_plugins_enabled'),
    pluginsEnable: t('settings_plugins_enable'),
    pluginsDisable: t('settings_plugins_disable'),
    pluginsEnableReviewTitle: (name: string) =>
      f('settings_plugins_enable_review_title', { name }),
    pluginsEnableReviewDescription: t(
      'settings_plugins_enable_review_description'
    ),
    pluginsConfirmEnable: t('settings_plugins_confirm_enable'),
    pluginsCancelEnable: t('settings_plugins_cancel_enable'),
    pluginsEnabling: t('settings_plugins_enabling'),
    pluginsDisabling: t('settings_plugins_disabling'),
    pluginsEnableSuccess: (name: string) =>
      f('settings_plugins_enable_success', { name }),
    pluginsDisableSuccess: (name: string) =>
      f('settings_plugins_disable_success', { name }),
    pluginsInvalid: t('settings_plugins_invalid'),
    pluginsUnavailable: t('settings_plugins_unavailable'),
    pluginsUnknownError: t('settings_plugins_unknown_error'),

    cleanupTitle: t('settings_cleanup_title'),
    cleanupDescription: t('settings_cleanup_description'),
    cleanupScan: t('settings_cleanup_scan'),
    cleanupScanning: t('settings_cleanup_scanning'),
    cleanupUnscanned: t('settings_cleanup_unscanned'),
    cleanupEmpty: t('settings_cleanup_empty'),
    cleanupCount: (value: number) =>
      count(
        'settings_cleanup_count_one',
        'settings_cleanup_count_other',
        value
      ),
    cleanupSelectAll: t('settings_cleanup_select_all'),
    cleanupDeselectAll: t('settings_cleanup_deselect_all'),
    cleanupDeleteSelected: (value: number) =>
      count(
        'settings_cleanup_delete_selected_one',
        'settings_cleanup_delete_selected_other',
        value
      ),
    cleanupRowCheckboxAria: (file: string) =>
      f('settings_cleanup_row_checkbox_aria', { file }),
    cleanupNoId: t('settings_cleanup_no_id'),
    cleanupModified: (when: string) => f('settings_cleanup_modified', { when }),
    cleanupScanFailed: t('settings_cleanup_scan_failed'),
    cleanupDeleteFailed: (value: number) =>
      count(
        'settings_cleanup_delete_failed_one',
        'settings_cleanup_delete_failed_other',
        value
      ),
    cleanupConfirmTitle: (value: number) =>
      count(
        'settings_cleanup_confirm_title_one',
        'settings_cleanup_confirm_title_other',
        value
      ),
    cleanupConfirmBody: (value: number) =>
      count(
        'settings_cleanup_confirm_body_one',
        'settings_cleanup_confirm_body_other',
        value
      ),
    cleanupConfirmCancel: t('settings_action_cancel'),
    cleanupConfirmAction: t('settings_cleanup_confirm_action'),

    trashTitle: t('settings_trash_title'),
    trashEmpty: t('settings_trash_empty'),
    trashDeletedAt: (when: string) => f('settings_trash_deleted_at', { when }),
    trashRestoreAria: (name: string) =>
      f('settings_trash_restore_aria', { name }),
    trashPurgeAria: (name: string) => f('settings_trash_purge_aria', { name }),
    trashLoadError: t('settings_trash_load_error'),
    trashRestoreFailed: t('settings_trash_restore_failed'),
    trashPurgeFailed: t('settings_trash_purge_failed'),
    trashClearAll: t('settings_trash_clear_all'),
    trashClearAllConfirmTitle: (value: number) =>
      count(
        'settings_trash_clear_all_confirm_title_one',
        'settings_trash_clear_all_confirm_title_other',
        value
      ),
    trashClearAllConfirmBody: (value: number) =>
      count(
        'settings_trash_clear_all_confirm_body_one',
        'settings_trash_clear_all_confirm_body_other',
        value
      ),
    trashClearAllConfirmAction: t('settings_action_delete_forever'),
    trashClearAllSuccess: (value: number) =>
      count(
        'settings_trash_clear_all_success_one',
        'settings_trash_clear_all_success_other',
        value
      ),
    trashClearAllFailed: t('settings_trash_clear_all_failed'),
    purgeConfirmTitle: t('settings_purge_confirm_title'),
    purgeConfirmBody: (name: string) =>
      f('settings_purge_confirm_body', { name }),
    purgeConfirmCancel: t('settings_action_cancel'),
    purgeConfirmAction: t('settings_action_delete_forever'),

    shortcutsTitle: t('settings_shortcuts_title'),
    shortcutDescription: t('settings_shortcut_description'),
    shortcutKey: t('settings_shortcut_key'),
    shortcutAction: t('settings_shortcut_action'),
    shortcutSection: t('settings_shortcut_section'),
    shortcutSectionEdit: t('settings_shortcut_section_edit'),
    shortcutSectionNav: t('settings_shortcut_section_nav'),
    shortcutSectionView: t('settings_shortcut_section_view'),
    shortcutSearch: t('settings_shortcut_search'),
    shortcutNewMenu: t('settings_shortcut_new_menu'),
    shortcutEdit: t('settings_shortcut_edit'),
    shortcutUndo: t('settings_shortcut_undo'),
    shortcutRedo: t('settings_shortcut_redo'),
    shortcutCopy: t('settings_shortcut_copy'),
    shortcutCut: t('settings_shortcut_cut'),
    shortcutPaste: t('settings_shortcut_paste'),
    shortcutDuplicate: t('settings_shortcut_duplicate'),
    shortcutDelete: t('settings_shortcut_delete'),
    shortcutSelectAll: t('settings_shortcut_select_all'),
    shortcutDeselectAll: t('settings_shortcut_deselect_all'),
    shortcutGroup: t('settings_shortcut_group'),
    shortcutUngroup: t('settings_shortcut_ungroup'),
    shortcutZoomIn: t('settings_shortcut_zoom_in'),
    shortcutZoomOut: t('settings_shortcut_zoom_out'),
    shortcutZoomReset: t('settings_shortcut_zoom_reset'),
    shortcutNavigate: t('settings_shortcut_navigate'),
    shortcutOpenFocused: t('settings_shortcut_open_focused'),
    shortcutFocusedClose: t('settings_shortcut_focused_close'),
    shortcutTypeToSearch: t('settings_shortcut_type_to_search'),

    aboutTitle: t('settings_about_title'),
    aboutVersion: t('settings_about_version'),
    aboutCommitHash: t('settings_about_commit_hash'),
    aboutChannel: t('settings_about_channel'),
    aboutCheckUpdate: t('settings_about_check_update'),
    aboutCheckUpdateChecking: t('settings_about_check_update_checking'),
    aboutUpdateAvailable: (version: string) =>
      f('settings_about_update_available', { version }),
    aboutUpdateNoUpdate: t('settings_about_update_no_update'),
    aboutUpdateError: t('settings_about_update_error'),
    aboutDevChannelNote: t('settings_about_dev_channel_note'),
    aboutChangelog: t('settings_about_changelog'),
  };
}

export type SettingsLocaleStrings = ReturnType<
  typeof createSettingsLocaleStrings
>;

export function getLocaleStrings(locale: LocaleSetting): SettingsLocaleStrings {
  return createSettingsLocaleStrings(messageCatalogs[locale]);
}
