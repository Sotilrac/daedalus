import { useGraphStore } from '../store/graphStore.js';

export interface SettingsPanelProps {
  autoReload: boolean;
  onAutoReloadChange: (v: boolean) => void;
  allowContextMenu: boolean;
  onAllowContextMenuChange: (v: boolean) => void;
  showGrid: boolean;
  onShowGridChange: (v: boolean) => void;
}

export function SettingsPanel({
  autoReload,
  onAutoReloadChange,
  allowContextMenu,
  onAllowContextMenuChange,
  showGrid,
  onShowGridChange,
}: SettingsPanelProps): JSX.Element | null {
  const layout = useGraphStore((s) => s.layout);
  const updateSettings = useGraphStore((s) => s.updateSettings);
  if (!layout) return null;
  const { routing, export: ex } = layout.settings;

  return (
    <div className="settings-panel" role="dialog" aria-label="Settings">
      <section>
        <h3>Display</h3>
        <label className="row checkbox" title="Toggle the dot grid in the editor.">
          <input
            type="checkbox"
            checked={showGrid}
            onChange={(e) => onShowGridChange(e.target.checked)}
          />
          <span>Show grid</span>
        </label>
      </section>
      <section>
        <h3>Source</h3>
        <label
          className="row checkbox"
          title="Reload the graph automatically when D2 files change."
        >
          <input
            type="checkbox"
            checked={autoReload}
            onChange={(e) => onAutoReloadChange(e.target.checked)}
          />
          <span>Auto-reload on D2 change</span>
        </label>
      </section>
      <section>
        <h3>Routing</h3>
        <NumberRow
          label="Shape buffer"
          help="Clearance kept around each shape."
          value={routing.shapeBuffer}
          min={0}
          max={64}
          onChange={(v) => void updateSettings({ routing: { shapeBuffer: v } })}
        />
        <NumberRow
          label="Lead-out"
          help="How far edges leave a side perpendicular before bending."
          value={routing.leadOut}
          min={0}
          max={64}
          onChange={(v) => void updateSettings({ routing: { leadOut: v } })}
        />
        <NumberRow
          label="Nudging"
          help="Ideal gap between parallel edge segments."
          value={routing.nudging}
          min={0}
          max={64}
          onChange={(v) => void updateSettings({ routing: { nudging: v } })}
        />
      </section>
      <section>
        <h3>Export</h3>
        <NumberRow
          label="Margin"
          help="Padding around the diagram bounding box."
          value={ex.margin}
          min={0}
          max={200}
          onChange={(v) => void updateSettings({ export: { margin: v } })}
        />
        <label className="row checkbox">
          <input
            type="checkbox"
            checked={ex.showGrid}
            onChange={(e) => void updateSettings({ export: { showGrid: e.target.checked } })}
          />
          <span>Include grid</span>
        </label>
      </section>
      <section>
        <h3>Developer</h3>
        <label
          className="row checkbox"
          title="Re-enable the browser context menu on the canvas (for inspecting elements while developing)."
        >
          <input
            type="checkbox"
            checked={allowContextMenu}
            onChange={(e) => onAllowContextMenuChange(e.target.checked)}
          />
          <span>Allow right-click on canvas</span>
        </label>
      </section>
    </div>
  );
}

interface NumberRowProps {
  label: string;
  help?: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}

function NumberRow({ label, help, value, min, max, onChange }: NumberRowProps): JSX.Element {
  return (
    <label className="row" title={help}>
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
      />
    </label>
  );
}
