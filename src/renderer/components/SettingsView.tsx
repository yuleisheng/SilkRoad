import { CheckCircle2, Save, ShieldCheck, XCircle } from "lucide-react";
import { useState } from "react";
import { APP_LANGUAGES, getTranslator, type AppLanguage } from "../../shared/i18n";
import type { AppSettings, ProviderHealth, ProviderKind } from "../../shared/types";

interface SettingsViewProps {
  settings: AppSettings;
  onSettingsChange(settings: AppSettings): void;
  onClose(): void;
}

const PROVIDER_ORDER: ProviderKind[] = [
  "openrouter",
  "openai-compatible",
  "ollama-cloud"
];

export function SettingsView({
  settings,
  onSettingsChange,
  onClose
}: SettingsViewProps) {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [health, setHealth] = useState<Partial<Record<ProviderKind, ProviderHealth>>>({});
  const [saving, setSaving] = useState(false);
  const [checkingProvider, setCheckingProvider] = useState<ProviderKind | null>(null);
  const t = getTranslator(draft.appLanguage);
  const selectedProviderId = draft.defaultChatProvider;
  const selectedProvider = draft.providers[selectedProviderId];
  const selectedProviderHealth = health[selectedProviderId];

  function updateProvider(providerId: ProviderKind, patch: Record<string, unknown>) {
    setDraft((current) => ({
      ...current,
      providers: {
        ...current.providers,
        [providerId]: {
          ...current.providers[providerId],
          ...patch
        }
      }
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const saved = await window.silkroad.settings.update(draft);
      setDraft(saved);
      onSettingsChange(saved);
    } finally {
      setSaving(false);
    }
  }

  async function validate(providerId: ProviderKind) {
    setCheckingProvider(providerId);
    try {
      const saved = await window.silkroad.settings.update(draft);
      setDraft(saved);
      onSettingsChange(saved);
      const result = await window.silkroad.settings.validate(providerId);
      setHealth((current) => ({ ...current, [providerId]: result }));
    } finally {
      setCheckingProvider(null);
    }
  }

  return (
    <section className="settings-view">
      <header className="topbar">
        <div>
          <h1>{t("settings.title")}</h1>
          <p>{t("settings.subtitle")}</p>
        </div>
        <div className="topbar-actions">
          <button className="secondary-button" onClick={onClose}>
            {t("settings.back")}
          </button>
          <button className="primary-button" onClick={() => void save()} disabled={saving}>
            <Save size={17} />
            {t("settings.save")}
          </button>
        </div>
      </header>

      <div className="settings-layout">
        <section className="settings-band">
          <label>
            {t("settings.language")}
            <select
              value={draft.appLanguage}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  appLanguage: event.target.value as AppLanguage
                }))
              }
            >
              {APP_LANGUAGES.map((language) => (
                <option key={language.id} value={language.id}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t("settings.defaultChatProvider")}
            <select
              value={draft.defaultChatProvider}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  defaultChatProvider: event.target.value as ProviderKind
                }))
              }
            >
              {PROVIDER_ORDER.map((providerId) => (
                <option key={providerId} value={providerId}>
                  {draft.providers[providerId].label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="provider-list">
          <article className="provider-card" key={selectedProviderId}>
            <div className="provider-header">
              <div>
                <h2>{selectedProvider.label}</h2>
              </div>
            </div>

            <div className="provider-fields">
              <label>
                {t("settings.baseUrl")}
                <input
                  value={selectedProvider.baseUrl ?? ""}
                  onChange={(event) =>
                    updateProvider(selectedProviderId, { baseUrl: event.target.value })
                  }
                />
              </label>

              <label>
                {t("settings.model")}
                <input
                  value={selectedProvider.model}
                  placeholder={t("settings.modelPlaceholder")}
                  onChange={(event) =>
                    updateProvider(selectedProviderId, { model: event.target.value })
                  }
                />
              </label>

              <label>
                {t("settings.apiKey")}
                <input
                  type="password"
                  placeholder={
                    selectedProvider.apiKeyStored
                      ? t("settings.apiKeyMasked")
                      : t("settings.apiKeyMissing")
                  }
                  onChange={(event) =>
                    updateProvider(selectedProviderId, {
                      apiKey: event.target.value,
                      clearApiKey: false
                    })
                  }
                />
                {selectedProvider.apiKeyError ? (
                  <span className="field-error">{selectedProvider.apiKeyError}</span>
                ) : null}
              </label>
            </div>

            <div className="provider-actions">
              <button
                className="secondary-button"
                onClick={() => void validate(selectedProviderId)}
                disabled={checkingProvider === selectedProviderId}
              >
                <ShieldCheck size={16} />
                {checkingProvider === selectedProviderId
                  ? t("settings.checking")
                  : t("settings.check")}
              </button>
              {selectedProviderHealth ? (
                <span className={selectedProviderHealth.ok ? "health ok" : "health fail"}>
                  {selectedProviderHealth.ok ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <XCircle size={16} />
                  )}
                  {selectedProviderHealth.message}
                </span>
              ) : null}
            </div>
          </article>
        </section>
      </div>
    </section>
  );
}
