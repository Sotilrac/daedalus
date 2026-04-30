import type { JSONSchemaType } from 'ajv';
import Ajv from 'ajv';
import type { Layout, NodeLayout, EdgeLayout } from '../model/types.js';

export const SIDECAR_FILENAME = '.daedalus.json';

const nodeSchema: JSONSchemaType<NodeLayout> = {
  type: 'object',
  properties: {
    x: { type: 'number' },
    y: { type: 'number' },
    w: { type: 'number' },
    h: { type: 'number' },
    connections: {
      type: 'object',
      properties: {
        top: { type: 'array', items: { type: 'string' } },
        right: { type: 'array', items: { type: 'string' } },
        bottom: { type: 'array', items: { type: 'string' } },
        left: { type: 'array', items: { type: 'string' } },
      },
      required: ['top', 'right', 'bottom', 'left'],
      additionalProperties: false,
    },
  },
  required: ['x', 'y', 'w', 'h', 'connections'],
  additionalProperties: false,
};

const edgeSchema: JSONSchemaType<EdgeLayout> = {
  type: 'object',
  properties: {
    fromSide: { type: 'string', enum: ['top', 'right', 'bottom', 'left'] },
    toSide: { type: 'string', enum: ['top', 'right', 'bottom', 'left'] },
    labelT: { type: 'number', nullable: true, minimum: 0, maximum: 1 },
  },
  required: ['fromSide', 'toSide'],
  additionalProperties: false,
};

export const sidecarSchema: JSONSchemaType<{ entries: Record<string, Layout> }> = {
  type: 'object',
  properties: {
    entries: {
      type: 'object',
      required: [],
      additionalProperties: {
        type: 'object',
        properties: {
          version: { type: 'integer', const: 1 },
          grid: {
            type: 'object',
            properties: {
              size: { type: 'number' },
              cols: { type: 'integer' },
              rows: { type: 'integer' },
            },
            required: ['size', 'cols', 'rows'],
            additionalProperties: false,
          },
          viewport: {
            type: 'object',
            properties: {
              zoom: { type: 'number' },
              panX: { type: 'number' },
              panY: { type: 'number' },
              theme: { type: 'string', enum: ['slate', 'paper'] },
            },
            required: ['zoom', 'panX', 'panY', 'theme'],
            additionalProperties: false,
          },
          settings: {
            type: 'object',
            properties: {
              routing: {
                type: 'object',
                properties: {
                  shapeBuffer: { type: 'number' },
                  leadOut: { type: 'number' },
                  nudging: { type: 'number' },
                },
                required: ['shapeBuffer', 'leadOut', 'nudging'],
                additionalProperties: false,
              },
              export: {
                type: 'object',
                properties: {
                  margin: { type: 'number' },
                  showGrid: { type: 'boolean' },
                },
                required: ['margin', 'showGrid'],
                additionalProperties: false,
              },
            },
            required: ['routing', 'export'],
            additionalProperties: false,
          },
          nodes: { type: 'object', required: [], additionalProperties: nodeSchema },
          edges: { type: 'object', required: [], additionalProperties: edgeSchema },
          unplaced: { type: 'array', items: { type: 'string' } },
        },
        required: ['version', 'grid', 'viewport', 'settings', 'nodes', 'edges', 'unplaced'],
        additionalProperties: false,
      },
    },
  },
  required: ['entries'],
  additionalProperties: false,
};

const ajv = new Ajv({ allErrors: true });
export const validateSidecar = ajv.compile(sidecarSchema);
