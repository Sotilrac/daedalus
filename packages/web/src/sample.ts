// Starter D2 written into a freshly-created project. Demonstrates classes for
// nodes/edges, three nodes, and a couple of edges so the user has something
// to drag around immediately. Class application is in block form everywhere
// (`{ class: ... }`) since D2's parser is most consistent that way.
export const SAMPLE_D2 = `classes: {
  service: {
    style.fill: "#dbeafe"
    style.stroke: "#1e40af"
  }
  store: {
    shape: cylinder
    style.fill: "#fef3c7"
    style.stroke: "#b45309"
  }
  sync: {
    style.stroke: "#cbd5e1"
    style.stroke-width: 2
  }
  async: {
    style.stroke: "#cbd5e1"
    style.stroke-dash: 4
  }
}

api: API {class: service}
worker: Worker {class: service}
db: Postgres {class: store}

api -> worker: enqueue {class: async}
api -> db: read/write {class: sync}
worker -> db: write {class: sync}
`;
