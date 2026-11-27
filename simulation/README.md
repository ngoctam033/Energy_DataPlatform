# Energy Lab Simulation

This directory implements the Node-RED simulation orchestrator described in the two backlog specifications. Node-RED schedules only; SAP Charging Stations Simulator, EVerest, CitrineOS and OpenEMS remain the systems that simulate devices, OCPP and electrical measurements.

## Topology

- 200 SAP OCPP 1.6 EVSEs across four CitrineOS locations.
- Per site: 10 AC 7 kW, 10 AC 22 kW, 20 DC 60 kW and 10 DC 120 kW.
- Two EVerest SIL EVSEs on `cp001` for the native MQTT path.
- Four OpenEMS Edge instances, one per physical site, connected to one OpenEMS Backend.
- Per Edge: grid meter, base-load meter and EV-charging-load meter configured through the native JSON-RPC APIs.
- Node-RED owns one tab, `Simulation Orchestrator`; vendor tabs and the shared MQTT broker node are preserved.

## Daily scenarios

`S01` is the documented 1,395-arrival working day. `S02` through `S06` retain every documented anchor and fill missing hours using rounded linear interpolation. New daily scenarios are disabled until selected. Six customer intents describe battery size, initial/target SoC and AC/DC preference. SAP independently selects the physical battery profile; planned intent and measured SoC are deliberately stored separately.

Select exactly one daily demand profile and the factory load profile:

```bash
node simulation/scripts/scenario-control.mjs daily s01
node simulation/scripts/scenario-control.mjs status
```

Use `s02` through `s06` to select weekend, fleet, holiday/travel, low demand or unexpected surge. Pause new dispatch without interrupting confirmed sessions:

```bash
node simulation/scripts/scenario-control.mjs pause
```

## Commissioning and evidence

```bash
npm --prefix simulation test
node simulation/scripts/manage.mjs validate
node simulation/scripts/scenario-control.mjs smoke 100 dry
node simulation/scripts/scenario-control.mjs smoke 100 live
node simulation/scripts/report.mjs '<exact-run-id>'
```

The report writes a committed summary under `simulation/reports/` and detailed JSON/CSV under ignored `.runtime/reports/`. A live report checks CSMS transaction completion, meter count, monotonic energy, SoC range/order, station power limit and a duration-based energy bound.

`control.json` limits new SAP operations in flight. A submitted start is never replayed after an uncertain response. Unknown work keeps its EVSE reserved until the explicit `reconcile.mjs --apply` workflow proves the native target is idle and records a backup/report.

## Deployment and recovery

### OpenEMS four-site deployment

The committed source of truth is `config/openems/deployment.json`. It declares all four sites, their 200-EVSE inventory, native OpenEMS Apps/components, channel mapping and Backend connection. Passwords and Backend API keys are generated once under ignored `.runtime/openems/`; reports are kept under `reports/` with secret values redacted.

Prepare and inspect without changing a running OpenEMS service:

```bash
node simulation/scripts/openems.mjs validate
node simulation/scripts/openems.mjs prepare-secrets
node simulation/scripts/openems.mjs render-backend-metadata
node simulation/scripts/openems.mjs plan --edge site01
docker compose -f docker-compose.yml -f compose.simulation.yaml -f compose.openems-sites.yaml config --quiet
```

After the Backend has loaded the rendered metadata and all Edge services are available, apply the manifest through App Manager and Component Manager JSON-RPC:

```bash
node simulation/scripts/openems.mjs apply --edge all
node simulation/scripts/openems.mjs verify --edge all
```

The CLI is idempotent and never deletes components outside its manifest. It stores before/after runtime snapshots in ignored `.runtime/openems/<edge>/` and writes redacted plan/apply/verify reports to `reports/`. `compose.openems-sites.yaml` adds sites 02-04 and mounts the rendered Metadata.File input into Backend; always include it when managing the four-site stack.

Always include the additive Compose file when recreating Node-RED or SAP:

```bash
docker compose -f docker-compose.yml -f compose.simulation.yaml config
docker compose -f docker-compose.yml -f compose.simulation.yaml up -d everest-nodered sap-charging-simulator
```

Running `docker compose up` without `compose.simulation.yaml` recreates Node-RED without the simulation mounts and environment. Scenario JSON changes are hot-reloaded and do not require a restart.

Build/deploy is deterministic and preserves every unowned node:

```bash
node simulation/scripts/build-flows.mjs
node simulation/scripts/manage.mjs deploy
node simulation/scripts/manage.mjs deploy --apply
```

Deployment with `--apply` requires `control.enabled=false` and zero reservations. Runtime secrets, ledgers, backups and detailed evidence live under ignored `simulation/.runtime/`.
