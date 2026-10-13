import { useRef, useState } from "react";
import { WidgetFrame } from "../../../components/WidgetFrame";
import { ModeSwitch } from "../../../components/ModeSwitch";
import { updateWidgetSettings, WidgetInstance } from "../../../storage/widgetInstances";
import { BlockWidget } from "../BlockWidget/BlockWidget";
import { CodeableWidget } from "./CodeableWidget";
import {
  parseCustomWidgetSettings,
  serializeCustomWidgetSettings,
  type BlockWidgetConfig,
  type CustomWidgetCode,
  type CustomWidgetMode,
  type CustomWidgetSettings,
} from "./settings";
import "./CustomWidget.css";

const MODE_OPTIONS = [
  { value: "code", label: "Codeable Widget" },
  { value: "block", label: "Block Widget" },
] as const;

const FALLBACK_TITLE = "Custom Widget";

interface CustomWidgetProps {
  instance: WidgetInstance;
  /** Lets WidgetGrid keep its copy of `instance.settings` in sync after a save. */
  onSaved?: (settings: string) => void;
}

/**
 * The Custom Widget: one widget, two ways to build it. A sliding switch at
 * the top picks between
 *  - Codeable Widget — hand-written HTML/CSS/JS in a sandboxed iframe, and
 *  - Block Widget — a program built in the 🧩 Block Builder, run live.
 * Each mode's setup is stored separately (see settings.ts), so switching
 * modes never loses work.
 */
export function CustomWidget({ instance, onSaved }: CustomWidgetProps) {
  const [settings, setSettings] = useState<CustomWidgetSettings>(() => parseCustomWidgetSettings(instance.settings));
  const [programName, setProgramName] = useState<string | null>(null);
  // Async saves read the latest settings from here, so a save that finishes
  // after a mode switch can't write back the old mode.
  const latest = useRef(settings);

  async function persist(next: CustomWidgetSettings) {
    latest.current = next;
    setSettings(next);
    const json = serializeCustomWidgetSettings(next);
    await updateWidgetSettings(instance.id, json);
    onSaved?.(json);
  }

  function switchMode(mode: CustomWidgetMode) {
    if (mode === latest.current.mode) return;
    persist({ ...latest.current, mode }).catch((err) => console.error("failed to save custom widget mode", err));
  }

  const saveCode = (code: CustomWidgetCode) => persist({ ...latest.current, code });
  const saveBlock = (block: BlockWidgetConfig) => persist({ ...latest.current, block });

  const title =
    settings.mode === "code" ? (settings.code?.title ?? FALLBACK_TITLE) : (programName ?? FALLBACK_TITLE);

  return (
    <WidgetFrame title={title}>
      <div className="custom-widget-host">
        <ModeSwitch label="Widget type" options={MODE_OPTIONS} value={settings.mode} onChange={switchMode} />
        <div className="custom-widget-host__body">
          {settings.mode === "code" ? (
            <CodeableWidget key="code" instanceId={instance.id} code={settings.code} onSave={saveCode} />
          ) : (
            <BlockWidget key="block" config={settings.block} onSave={saveBlock} onProgramName={setProgramName} />
          )}
        </div>
      </div>
    </WidgetFrame>
  );
}
