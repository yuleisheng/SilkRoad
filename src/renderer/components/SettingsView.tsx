import { CheckCircle2, Save, ShieldCheck, XCircle } from "lucide-react";
import { useState } from "react";
import type { AppSettings, ProviderHealth, ProviderKind } from "../../shared/types";

interface SettingsViewProps {
  settings: AppSettings;
  onSettingsChange(settings: AppSettings): void;
  onClose(): void;
}

const PROVIDER_ORDER: ProviderKind[] = [
  "openrouter",
  "openai-compatible",
  "ollama-cloud",
  "codex-subscription"
];

export function SettingsView({
  settings,
  onSettingsChange,
  onClose
}: SettingsViewProps) {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [health, setHealth] = useState<Partial<Record<ProviderKind, ProviderHealth>>>({});
  const [saving, setSaving] = useState(false);

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
    const saved = await window.silkroad.settings.update(draft);
    setDraft(saved);
    onSettingsChange(saved);
    const result = await window.silkroad.settings.validate(providerId);
    setHealth((current) => ({ ...current, [providerId]: result }));
  }

  return (
    <section className="settings-view">
      <header className="topbar">
        <div>
          <h1>设置</h1>
          <p>模型和联网搜索</p>
        </div>
        <div className="topbar-actions">
          <button className="secondary-button" onClick={onClose}>
            返回
          </button>
          <button className="primary-button" onClick={() => void save()} disabled={saving}>
            <Save size={17} />
            保存
          </button>
        </div>
      </header>

      <div className="settings-layout">
        <section className="settings-band">
          <label>
            默认聊天 Provider
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

          <label>
            默认搜索 Provider
            <select
              value={draft.defaultSearchProvider}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  defaultSearchProvider: event.target.value as ProviderKind
                }))
              }
            >
              {PROVIDER_ORDER.filter((providerId) =>
                ["openrouter", "ollama-cloud"].includes(providerId)
              ).map((providerId) => (
                <option key={providerId} value={providerId}>
                  {draft.providers[providerId].label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="provider-list">
          {PROVIDER_ORDER.map((providerId) => {
            const provider = draft.providers[providerId];
            const providerHealth = health[providerId];

            return (
              <article className="provider-card" key={providerId}>
                <div className="provider-header">
                  <div>
                    <h2>{provider.label}</h2>
                    {provider.experimental ? <span className="tag">Experimental</span> : null}
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={provider.enabled}
                      onChange={(event) =>
                        updateProvider(providerId, { enabled: event.target.checked })
                      }
                    />
                    <span />
                  </label>
                </div>

                <div className="provider-fields">
                  {providerId !== "codex-subscription" ? (
                    <label>
                      Base URL
                      <input
                        value={provider.baseUrl ?? ""}
                        onChange={(event) =>
                          updateProvider(providerId, { baseUrl: event.target.value })
                        }
                      />
                    </label>
                  ) : null}

                  <label>
                    Model
                    <input
                      value={provider.model}
                      placeholder={providerId === "codex-subscription" ? "可留空" : "model id"}
                      onChange={(event) =>
                        updateProvider(providerId, { model: event.target.value })
                      }
                    />
                  </label>

                  {providerId !== "codex-subscription" ? (
                    <label>
                      API Key
                      <input
                        type="password"
                        placeholder={provider.apiKeyStored ? "已保存" : "未设置"}
                        onChange={(event) =>
                          updateProvider(providerId, {
                            apiKey: event.target.value,
                            clearApiKey: false
                          })
                        }
                      />
                    </label>
                  ) : null}

                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={Boolean(provider.webSearchEnabled)}
                      disabled={providerId === "codex-subscription"}
                      onChange={(event) =>
                        updateProvider(providerId, {
                          webSearchEnabled: event.target.checked
                        })
                      }
                    />
                    Web search
                  </label>
                </div>

                <div className="provider-actions">
                  <button
                    className="secondary-button"
                    onClick={() => void validate(providerId)}
                  >
                    <ShieldCheck size={16} />
                    检查
                  </button>
                  {providerHealth ? (
                    <span className={providerHealth.ok ? "health ok" : "health fail"}>
                      {providerHealth.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                      {providerHealth.message}
                    </span>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </section>
  );
}
