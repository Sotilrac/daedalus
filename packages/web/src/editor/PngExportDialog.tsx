import { useState, type FormEvent } from 'react';

export interface PngExportDialogProps {
  // Source dimensions (1× output size in px). The dialog captures the
  // aspect ratio at mount and locks the inputs to it; changing one
  // dimension recomputes the other.
  defaultWidth: number;
  defaultHeight: number;
  onExport: (width: number, height: number) => void;
}

export function PngExportDialog({
  defaultWidth,
  defaultHeight,
  onExport,
}: PngExportDialogProps): JSX.Element {
  const [width, setWidth] = useState(defaultWidth);
  const [height, setHeight] = useState(defaultHeight);
  const aspect = defaultHeight === 0 ? 1 : defaultWidth / defaultHeight;

  const updateFromWidth = (raw: string): void => {
    const v = Number(raw);
    if (!Number.isFinite(v) || v <= 0) return;
    const w = Math.round(v);
    setWidth(w);
    setHeight(Math.max(1, Math.round(w / aspect)));
  };
  const updateFromHeight = (raw: string): void => {
    const v = Number(raw);
    if (!Number.isFinite(v) || v <= 0) return;
    const h = Math.round(v);
    setHeight(h);
    setWidth(Math.max(1, Math.round(h * aspect)));
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    onExport(width, height);
  };

  // Round to 2 decimals; defaultWidth is always > 0 in practice (button is
  // disabled when layout is null), so division here is safe.
  const scale = defaultWidth === 0 ? 1 : width / defaultWidth;

  return (
    <form
      className="png-export-dialog"
      role="dialog"
      aria-label="Export PNG size"
      onSubmit={onSubmit}
    >
      <h3>Export PNG</h3>
      <label className="row" title="Output width in pixels">
        <span>Width</span>
        <input
          type="number"
          min={1}
          value={width}
          autoFocus
          onChange={(e) => updateFromWidth(e.target.value)}
        />
      </label>
      <label className="row" title="Output height in pixels (locked to aspect ratio)">
        <span>Height</span>
        <input
          type="number"
          min={1}
          value={height}
          onChange={(e) => updateFromHeight(e.target.value)}
        />
      </label>
      <div className="row hint" aria-hidden>
        Source: {defaultWidth} × {defaultHeight} ({scale.toFixed(2)}×)
      </div>
      <button type="submit" className="primary">
        Export
      </button>
    </form>
  );
}
