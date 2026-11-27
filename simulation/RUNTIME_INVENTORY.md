# Runtime inventory — 2026-11-27

| Item | Verified value |
|---|---|
| Compose project | `energy-lab` |
| Node-RED | `everest-nodered`, Node-RED 4.0.5, EVerest demo image `2025.6.1-dt-esdp` |
| Vendor flow | 142 nodes, active file `/config/config-sil-two-evse-flow.json` |
| Custom flow | stable tab `sim_orchestrator_v1`; merge verification preserves all vendor nodes |
| MQTT | shared config node `fc8686af.48d178`, `mqtt-server:1883` |
| EVerest | station `cp001`, two EVSEs; MQTT native car simulator and periodic API session state |
| CitrineOS | v2.1 lab; OCPP 1.6 SAP on port 8081 and EVerest OCPP 2.x; GraphQL on internal `graphql-engine:8080` |
| SAP simulator | v5.0.1 checkout, 200/200 connected and BootNotification Accepted |
| OpenEMS | Edge 2026.1; `simulateConsumption`, `meterSimulation`, REST controller on internal port 8084 |
| Historical EMS | native `Timedata.InfluxDB` component, bucket `openems`, measurement `data` |
| Networks | Node-RED requires `everest`, `ems` and `default` via `compose.simulation.yaml` |
| Persistent state | host `simulation/.runtime/node-red/simulation`, container `/data/simulation` |

Observed native mappings:

- SAP UI: `/ui/0.0.1/listChargingStations`, `startTransaction`, `stopTransaction`, `authorize`, `statusNotification`.
- EVerest start: `everest_external/nodered/{1,2}/carsim/cmd/execute_charging_session`.
- EVerest RFID: `everest_api/dummy_token_provider/cmd/provide` with hexadecimal ISO14443 token `A1B2C3D4`.
- EVerest state: `everest_api/evse_manager_{1,2}/var/session_info`; CSMS connectivity: `everest_api/ocpp/var/connection_status`.
- OpenEMS write: `simulateConsumption/Data`; verified read-back: `meterSimulation/ActivePower` and `_sum/ConsumptionActivePower`.

Operational finding: a Node-RED container created from the base Compose file at 03:34 UTC had no mounts or simulation environment and loaded only the 142 vendor nodes. Use both Compose files for every recreate.
