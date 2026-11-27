# Implementation evidence — 2026-11-27

## Verified outcomes

- 200 SAP EVSEs registered and online in CitrineOS, attached 50 each to four Simulation Site locations.
- Fleet power mix: 40 AC 7 kW, 40 AC 22 kW, 80 DC 60 kW and 40 DC 120 kW.
- A manual SAP transaction completed with 0.204 kWh and nine CSMS MeterValue records.
- An EVerest transaction completed in CitrineOS with 0.088 kWh and three MeterValue records.
- OpenEMS REST write/read-back returned 120,000 W on both the simulated grid meter and `_sum/ConsumptionActivePower`.
- Dry run generated exactly 100 deterministic arrivals without transport output.
- The first 100-car live commissioning burst intentionally exposed CitrineOS PostgreSQL pool exhaustion: 34 confirmed starts, 34 reconciled completions and 66 failed starts. The reconciler released all held reservations without replaying a start.
- The next run uses bounded arrival spread and a maximum of two in-flight native requests. No new Sequelize connection-acquire timeout was observed during the bounded run.

## Test scope

The automated suite covers deterministic generation, timezone/catch-up, exact fleet and S01 totals, S02-S06 anchors, validation and allowlists, FIFO/exclusive reservation, dry-run isolation, crash quarantine, transaction mismatch, stop acknowledgement, SoC stop, behavior adapters, OpenEMS read-back, in-flight limits, flow ownership, Function-node compilation, redeploy initialization and path traversal rejection.

Detailed runtime evidence, credentials, backups and CSV rows are ignored under `simulation/.runtime/`. Committed summaries contain no credentials.

## Known boundary

OpenEMS currently simulates and records the facility load. The optional V3 closed-loop controller that curtails individual charging stations from an EMS power budget is not part of this implementation. S02-S06 and the six-profile hourly mix contain explicit proposed values because the backlog supplied only representative anchors.
