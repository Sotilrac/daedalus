import { describe, expect, it } from 'vitest';
import { diagramToModel } from '../src/d2/diagram.js';
import type { D2Diagram } from '../src/d2/types.js';

function asDiagram(d: Partial<D2Diagram>): D2Diagram {
  return d as D2Diagram;
}

describe('diagramToModel', () => {
  it('maps flat node fields onto NodeStyle', () => {
    const diagram = asDiagram({
      shapes: [
        {
          id: 'a',
          type: 'rectangle',
          width: 96,
          height: 64,
          fill: '#ff0',
          stroke: '#000',
          strokeWidth: 2,
          strokeDash: 4,
          bold: true,
          italic: true,
          shadow: true,
          opacity: 0.5,
          fontColor: '#222',
          label: 'A',
        },
      ] as unknown as D2Diagram['shapes'],
      connections: [],
    });
    const m = diagramToModel(diagram);
    expect(m.nodes.a).toMatchObject({
      label: 'A',
      shape: 'rectangle',
      rawWidth: 96,
      rawHeight: 64,
      style: {
        fill: '#ff0',
        stroke: '#000',
        strokeWidth: 2,
        strokeDash: 4,
        bold: true,
        italic: true,
        shadow: true,
        opacity: 0.5,
        fontColor: '#222',
      },
    });
  });

  it('falls back to rectangle for unknown shape kinds', () => {
    const diagram = asDiagram({
      shapes: [{ id: 'a', type: 'wat' }] as unknown as D2Diagram['shapes'],
      connections: [],
    });
    expect(diagramToModel(diagram).nodes.a?.shape).toBe('rectangle');
  });

  it('uses the id as label when label is missing', () => {
    const diagram = asDiagram({
      shapes: [{ id: 'naked' }] as unknown as D2Diagram['shapes'],
      connections: [],
    });
    expect(diagramToModel(diagram).nodes.naked?.label).toBe('naked');
  });

  it('drops fontColor that is just D2 default `color` echo on connections', () => {
    // When `fontColor` is unset on a connection, our adapter should leave it
    // out (theme provides it), even though the engine fills `color`.
    const diagram = asDiagram({
      shapes: [{ id: 'a' }, { id: 'b' }] as unknown as D2Diagram['shapes'],
      connections: [{ src: 'a', dst: 'b', color: '#000' }] as unknown as D2Diagram['connections'],
    });
    const m = diagramToModel(diagram);
    const e = Object.values(m.edges)[0];
    expect(e?.style.fontColor).toBeUndefined();
  });

  it('keeps explicit fontColor on connections', () => {
    const diagram = asDiagram({
      shapes: [{ id: 'a' }, { id: 'b' }] as unknown as D2Diagram['shapes'],
      connections: [
        { src: 'a', dst: 'b', fontColor: '#abc' },
      ] as unknown as D2Diagram['connections'],
    });
    const m = diagramToModel(diagram);
    expect(Object.values(m.edges)[0]?.style.fontColor).toBe('#abc');
  });

  it('maps known arrowheads and ignores unknown ones', () => {
    const diagram = asDiagram({
      shapes: [{ id: 'a' }, { id: 'b' }] as unknown as D2Diagram['shapes'],
      connections: [
        { src: 'a', dst: 'b', srcArrow: 'cf-many', dstArrow: 'wat' },
      ] as unknown as D2Diagram['connections'],
    });
    const e = Object.values(diagramToModel(diagram).edges)[0];
    expect(e?.srcArrow).toBe('cf-many');
    expect(e?.dstArrow).toBeUndefined();
  });

  it('maps fontSize on a node so D2 `style.font-size: NN` reaches the renderer', () => {
    const diagram = asDiagram({
      shapes: [
        { id: 'title', type: 'text', fontSize: 60, label: 'Title' },
      ] as unknown as D2Diagram['shapes'],
      connections: [],
    });
    expect(diagramToModel(diagram).nodes.title?.style.fontSize).toBe(60);
  });

  it('drops zero or missing fontSize', () => {
    const diagram = asDiagram({
      shapes: [{ id: 'a' }, { id: 'b', fontSize: 0 }] as unknown as D2Diagram['shapes'],
      connections: [],
    });
    const m = diagramToModel(diagram);
    expect(m.nodes.a?.style.fontSize).toBeUndefined();
    expect(m.nodes.b?.style.fontSize).toBeUndefined();
  });

  it('counts repeated edges with monotonic indices', () => {
    const diagram = asDiagram({
      shapes: [{ id: 'a' }, { id: 'b' }] as unknown as D2Diagram['shapes'],
      connections: [
        { src: 'a', dst: 'b' },
        { src: 'a', dst: 'b' },
        { src: 'a', dst: 'b' },
      ] as unknown as D2Diagram['connections'],
    });
    const ids = Object.keys(diagramToModel(diagram).edges).sort();
    expect(ids).toEqual(['a->b#0', 'a->b#1', 'a->b#2']);
  });
});
